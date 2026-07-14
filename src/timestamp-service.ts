import { App, Notice, TAbstractFile, TFile, TFolder } from "obsidian";
import {
  applyTimestampPlan,
  fixMalformedDatetimeQuoteLiteral,
  isMalformedDatetimeQuoteLiteral,
  planTimestampChanges,
  TimestampChange
} from "./frontmatter";
import { formatTimestampForPropertyType } from "./format";
import { isMarkdownFile, shouldProcessFile } from "./filters";
import type { TimestampPluginSettings } from "./settings";

type Timer = ReturnType<typeof setTimeout>;
export type TimestampPropertyKind = "created" | "updated";

export interface TimestampRenameRequest {
  oldName: string;
  newName: string;
  propertyKind: TimestampPropertyKind;
}

interface TimestampUpdateResult {
  checked: number;
  changed: number;
  skipped: number;
  changes: Array<{ path: string; changes: TimestampChange[] }>;
}

export interface BatchMutationResult {
  cancelled: boolean;
  changed: number;
  skipped: number;
  failed: number;
  reasons: string[];
}

interface RenamePreviewEntry {
  file: TFile;
  path: string;
  status: "changed" | "skipped";
  reason: string;
}

interface MalformedDatetimeCleanupEntry {
  file: TFile;
  fields: string[];
}

export class TimestampService {
  private app: App;
  private getSettings: () => TimestampPluginSettings;
  private debounceTimers = new Map<string, Timer>();
  private selfWrites = new Set<string>();
  private lastAutomaticUpdatedWrite = new Map<string, number>();
  private isBulkRenaming = false;

  constructor(app: App, getSettings: () => TimestampPluginSettings) {
    this.app = app;
    this.getSettings = getSettings;
  }

  destroy(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.selfWrites.clear();
  }

  async handleCreate(file: TAbstractFile): Promise<void> {
    if (!isMarkdownFile(file) || !shouldProcessFile(file, this.getSettings())) {
      return;
    }

    await this.writeTimestamps(file, {
      includeCreated: true,
      forceCreated: false,
      includeUpdated: false,
      automatic: true
    });
  }

  handleModify(file: TAbstractFile): void {
    if (!isMarkdownFile(file) || !shouldProcessFile(file, this.getSettings())) {
      return;
    }

    if (this.selfWrites.has(file.path)) {
      this.selfWrites.delete(file.path);
      return;
    }

    if (this.isBulkRenaming) {
      return;
    }

    const settings = this.getSettings();
    const previousWrite = this.lastAutomaticUpdatedWrite.get(file.path) ?? 0;
    if (Date.now() - previousWrite < settings.minUpdateIntervalMs) {
      return;
    }

    const existingTimer = this.debounceTimers.get(file.path);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(file.path);
      void this.writeTimestamps(file, {
        includeCreated: true,
        forceCreated: false,
        includeUpdated: true,
        automatic: true
      });
    }, settings.debounceMs);

    this.debounceTimers.set(file.path, timer);
  }

  async updateCurrentFile(forceCreated: boolean): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) {
      new Notice("No active Markdown file.");
      return;
    }

    const changed = await this.writeTimestamps(file, {
      includeCreated: true,
      forceCreated,
      includeUpdated: true,
      automatic: false
    });

    new Notice(changed ? "Updated timestamps for current file." : "Current file timestamps are already up to date.");
  }

  async addMissingCreatedToCurrentFile(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) {
      new Notice("No active Markdown file.");
      return;
    }

    const changed = await this.writeTimestamps(file, {
      includeCreated: true,
      forceCreated: false,
      includeUpdated: false,
      automatic: false
    });

    new Notice(changed ? "Added missing created timestamp." : "Created timestamp already exists.");
  }

  async updateCurrentFolderTimestamps(previewOnly: boolean): Promise<void> {
    const activeFile = this.getActiveMarkdownFile();
    if (!activeFile) {
      new Notice("No active Markdown file.");
      return;
    }

    const folder = activeFile.parent;
    if (!folder) {
      new Notice("No current folder.");
      return;
    }

    const result = await this.updateFolderTimestamps(folder, previewOnly);
    if (previewOnly) {
      this.showPreviewResult(result);
    } else {
      new Notice(`Updated timestamp values in ${result.changed} of ${result.checked} Markdown files.`);
    }
  }

  async updateVaultTimestamps(previewOnly: boolean): Promise<void> {
    const result = await this.updateFolderTimestamps(this.app.vault.getRoot(), previewOnly);
    if (previewOnly) {
      this.showPreviewResult(result);
    } else {
      new Notice(`Updated timestamp values in ${result.changed} of ${result.checked} Markdown files in the vault.`);
    }
  }

  async renameFrontmatterPropertyInVault(request: TimestampRenameRequest): Promise<BatchMutationResult> {
    const oldName = request.oldName.trim();
    const newName = request.newName.trim();
    const result = this.emptyBatchResult();

    if (!oldName || !newName || oldName === newName) {
      result.skipped = 0;
      return result;
    }

    const previewEntries = this.previewRenameFrontmatterProperty(oldName, newName);
    const changedEntries = previewEntries.filter((entry) => entry.status === "changed");
    const skippedEntries = previewEntries.filter((entry) => entry.status === "skipped");
    result.skipped = skippedEntries.length;
    result.reasons.push(...skippedEntries.map((entry) => `${entry.path}: ${entry.reason}`));

    const filesToChange = changedEntries.slice(0, 12).map((entry) => entry.path).join("\n");
    const skippedExamples = result.reasons.slice(0, 8).join("\n");
    const message = [
      `Rename ${request.propertyKind} timestamp property ${oldName} to ${newName}?`,
      "",
      `Changed if applied: ${changedEntries.length}. Skipped: ${result.skipped}. Failed: 0.`,
      filesToChange ? `\nFiles to change:\n${filesToChange}` : "",
      skippedExamples ? `\nSkipped examples:\n${skippedExamples}` : ""
    ].join("\n");

    if (!window.confirm(message)) {
      return { ...result, cancelled: true };
    }

    this.isBulkRenaming = true;
    try {
      for (const entry of changedEntries) {
        let fileChanged = false;
        let skipReason = "";
        this.selfWrites.add(entry.file.path);

        try {
          await this.app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
            const hasOld = Object.prototype.hasOwnProperty.call(frontmatter, oldName);
            const hasNew = Object.prototype.hasOwnProperty.call(frontmatter, newName);
            if (!hasOld) {
              skipReason = `${oldName} disappeared before apply`;
              return;
            }
            if (hasNew) {
              skipReason = `${newName} appeared before apply`;
              return;
            }

            frontmatter[newName] = frontmatter[oldName];
            delete frontmatter[oldName];
            fileChanged = true;
          });

          if (fileChanged) {
            result.changed += 1;
          } else {
            result.skipped += 1;
            result.reasons.push(`${entry.path}: ${skipReason || "No change was needed"}`);
          }
        } catch (error) {
          result.failed += 1;
          result.reasons.push(`${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
          this.selfWrites.delete(entry.file.path);
        } finally {
          if (!fileChanged) {
            this.selfWrites.delete(entry.file.path);
          }
        }
      }
    } finally {
      this.isBulkRenaming = false;
    }

    new Notice(`Rename complete. Changed: ${result.changed}. Skipped: ${result.skipped}. Failed: ${result.failed}.`);
    if (result.reasons.length > 0) {
      console.info("Frontmatter Timestamps rename details", result.reasons);
    }
    return result;
  }

  async fixMalformedDatetimeQuoteLiterals(): Promise<BatchMutationResult> {
    const settings = this.getSettings();
    const fields = [settings.createdField, settings.updatedField].map((field) => field.trim()).filter(Boolean);
    const result = this.emptyBatchResult();
    const entries: MalformedDatetimeCleanupEntry[] = [];

    for (const file of this.collectVisibleMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter ?? {};
      const matchingFields = fields.filter((field) => isMalformedDatetimeQuoteLiteral(frontmatter[field]));

      if (matchingFields.length > 0) {
        entries.push({ file, fields: matchingFields });
      } else {
        result.skipped += 1;
      }
    }

    if (entries.length === 0) {
      new Notice(`Malformed datetime cleanup complete. Changed: 0. Skipped: ${result.skipped}. Failed: 0.`);
      return result;
    }

    if (!window.confirm(`Fix malformed datetime quote literals in ${entries.length} Markdown file(s)?`)) {
      return { ...result, cancelled: true };
    }

    for (const entry of entries) {
      let fileChanged = false;
      this.selfWrites.add(entry.file.path);

      try {
        await this.app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
          for (const field of entry.fields) {
            if (isMalformedDatetimeQuoteLiteral(frontmatter[field])) {
              frontmatter[field] = fixMalformedDatetimeQuoteLiteral(frontmatter[field]);
              fileChanged = true;
            }
          }
        });

        if (fileChanged) {
          result.changed += 1;
        } else {
          result.skipped += 1;
          result.reasons.push(`${entry.file.path}: No matching malformed timestamp remained`);
        }
      } catch (error) {
        result.failed += 1;
        result.reasons.push(`${entry.file.path}: ${error instanceof Error ? error.message : String(error)}`);
        console.error("Frontmatter Timestamps malformed datetime cleanup failed", entry.file.path, error);
        this.selfWrites.delete(entry.file.path);
      } finally {
        if (!fileChanged) {
          this.selfWrites.delete(entry.file.path);
        }
      }
    }

    new Notice(`Malformed datetime cleanup complete. Changed: ${result.changed}. Skipped: ${result.skipped}. Failed: ${result.failed}.`);
    if (result.reasons.length > 0) {
      console.info("Frontmatter Timestamps malformed datetime cleanup details", result.reasons);
    }
    return result;
  }

  private async updateFolderTimestamps(folder: TFolder, previewOnly: boolean): Promise<TimestampUpdateResult> {
    const files = this.collectMarkdownFiles(folder).filter((file) => shouldProcessFile(file, this.getSettings()));
    const result: TimestampUpdateResult = {
      checked: files.length,
      changed: 0,
      skipped: 0,
      changes: []
    };

    for (const file of files) {
      const changes = await this.getPlannedChanges(file, true, false, true);
      if (changes.length === 0) {
        result.skipped += 1;
        continue;
      }

      result.changed += 1;
      result.changes.push({ path: file.path, changes });

      if (!previewOnly) {
        await this.writeTimestamps(file, {
          includeCreated: true,
          forceCreated: false,
          includeUpdated: true,
          automatic: false
        });
      }
    }

    return result;
  }

  private async writeTimestamps(
    file: TFile,
    options: {
      includeCreated: boolean;
      forceCreated: boolean;
      includeUpdated: boolean;
      automatic: boolean;
    }
  ): Promise<boolean> {
    const settings = this.getSettings();
    if (!shouldProcessFile(file, settings)) {
      return false;
    }

    const timestamp = formatTimestampForPropertyType(new Date(), settings.timestampPropertyType, settings.dateFormat);
    let changed = false;

    this.selfWrites.add(file.path);
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const plan = planTimestampChanges(frontmatter, file, timestamp, settings, options);
        if (plan.changes.length === 0) {
          return;
        }

        applyTimestampPlan(frontmatter, plan);
        changed = true;
      });
    } finally {
      if (!changed) {
        this.selfWrites.delete(file.path);
      }
    }

    if (changed && options.automatic && options.includeUpdated) {
      this.lastAutomaticUpdatedWrite.set(file.path, Date.now());
    }

    return changed;
  }

  private async getPlannedChanges(
    file: TFile,
    includeCreated: boolean,
    forceCreated: boolean,
    includeUpdated: boolean
  ): Promise<TimestampChange[]> {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = { ...(cache?.frontmatter ?? {}) };
    const settings = this.getSettings();
    const timestamp = formatTimestampForPropertyType(new Date(), settings.timestampPropertyType, settings.dateFormat);
    return planTimestampChanges(frontmatter, file, timestamp, settings, {
      includeCreated,
      forceCreated,
      includeUpdated
    }).changes;
  }

  private collectMarkdownFiles(folder: TFolder): TFile[] {
    const files: TFile[] = [];

    for (const child of folder.children) {
      if (child instanceof TFolder) {
        files.push(...this.collectMarkdownFiles(child));
      } else if (isMarkdownFile(child)) {
        files.push(child);
      }
    }

    return files;
  }

  private collectVisibleMarkdownFiles(): TFile[] {
    return this.collectMarkdownFiles(this.app.vault.getRoot()).filter(
      (file) => shouldProcessFile(file, this.getSettings()) && !this.hasHiddenPathSegment(file)
    );
  }

  private previewRenameFrontmatterProperty(oldName: string, newName: string): RenamePreviewEntry[] {
    return this.collectVisibleMarkdownFiles().map((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter ?? {};
      const hasOld = Object.prototype.hasOwnProperty.call(frontmatter, oldName);
      const hasNew = Object.prototype.hasOwnProperty.call(frontmatter, newName);

      if (!hasOld) {
        return { file, path: file.path, status: "skipped", reason: `${oldName} does not exist` };
      }

      if (hasNew) {
        return { file, path: file.path, status: "skipped", reason: `${newName} already exists` };
      }

      return { file, path: file.path, status: "changed", reason: "Will rename property" };
    });
  }

  private hasHiddenPathSegment(file: TFile): boolean {
    return file.path.split("/").some((segment) => segment.startsWith(".") && segment.length > 1);
  }

  private emptyBatchResult(): BatchMutationResult {
    return {
      cancelled: false,
      changed: 0,
      skipped: 0,
      failed: 0,
      reasons: []
    };
  }

  private getActiveMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    if (!file || !shouldProcessFile(file, this.getSettings())) {
      return null;
    }

    return file;
  }

  private showPreviewResult(result: TimestampUpdateResult): void {
    if (result.changes.length === 0) {
      new Notice(`Preview: no timestamp updates needed across ${result.checked} Markdown files.`, 7000);
      return;
    }

    const preview = result.changes
      .slice(0, 5)
      .map(({ path, changes }) => `${path}: ${changes.map((change) => change.field).join(", ")}`)
      .join("\n");

    new Notice(`Preview: ${result.changed} of ${result.checked} files would update.\n${preview}`, 12000);
    console.info("Frontmatter Timestamps preview", result.changes);
  }
}
