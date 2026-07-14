import { Notice, Plugin } from "obsidian";
import { ensureTimestampPropertyTypes, renameTimestampPropertyType } from "./property-types";
import { DEFAULT_SETTINGS, TimestampPluginSettings, TimestampSettingTab } from "./settings";
import { TimestampService } from "./timestamp-service";

export default class FrontmatterTimestampsPlugin extends Plugin {
  settings: TimestampPluginSettings;
  service: TimestampService;

  async onload(): Promise<void> {
    await this.loadSettings();
    await ensureTimestampPropertyTypes(this.app, this.settings);

    this.service = new TimestampService(this.app, () => this.settings);

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        void this.service.handleCreate(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        this.service.handleModify(file);
      })
    );

    this.addCommand({
      id: "update-current-file-timestamps",
      name: "Update timestamps for current file",
      callback: () => {
        void this.service.updateCurrentFile(true);
      }
    });

    this.addCommand({
      id: "add-missing-created-current-file",
      name: "Add missing created timestamp to current file",
      callback: () => {
        void this.service.addMissingCreatedToCurrentFile();
      }
    });

    this.addCommand({
      id: "update-current-folder-timestamps",
      name: "Update timestamp values in current folder",
      callback: () => {
        void this.service.updateCurrentFolderTimestamps(false);
      }
    });

    this.addCommand({
      id: "preview-current-folder-timestamp-updates",
      name: "Preview timestamp updates in current folder",
      callback: () => {
        void this.service.updateCurrentFolderTimestamps(true);
      }
    });

    this.addCommand({
      id: "update-vault-timestamps",
      name: "Update timestamp values in entire vault",
      callback: () => {
        void this.service.updateVaultTimestamps(false);
      }
    });

    this.addCommand({
      id: "preview-vault-timestamp-updates",
      name: "Preview timestamp updates in entire vault",
      callback: () => {
        void this.service.updateVaultTimestamps(true);
      }
    });

    this.addCommand({
      id: "fix-malformed-datetime-quote-literals",
      name: "Fix malformed datetime quote literals",
      callback: () => {
        void this.service.fixMalformedDatetimeQuoteLiterals();
      }
    });

    this.addSettingTab(new TimestampSettingTab(this.app, this));
  }

  onunload(): void {
    this.service.destroy();
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    const migratedIgnoredPaths = data?.ignoredPaths ?? data?.ignoredFolders ?? DEFAULT_SETTINGS.ignoredPaths;
    this.settings = {
      createdField: data?.createdField ?? DEFAULT_SETTINGS.createdField,
      updatedField: data?.updatedField ?? DEFAULT_SETTINGS.updatedField,
      timestampPropertyType: data?.timestampPropertyType ?? DEFAULT_SETTINGS.timestampPropertyType,
      dateFormat: data?.dateFormat ?? DEFAULT_SETTINGS.dateFormat,
      ignoredPaths: migratedIgnoredPaths.filter((path: string) => path !== ".obsidian"),
      debounceMs: data?.debounceMs ?? DEFAULT_SETTINGS.debounceMs,
      minUpdateIntervalMs: data?.minUpdateIntervalMs ?? DEFAULT_SETTINGS.minUpdateIntervalMs
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    await ensureTimestampPropertyTypes(this.app, this.settings);
  }

  async renameTimestampField(
    key: "createdField" | "updatedField",
    oldPropertyName: string,
    newPropertyName: string
  ): Promise<boolean> {
    const normalizedNewName = newPropertyName.trim() || DEFAULT_SETTINGS[key];
    const normalizedOldName = oldPropertyName.trim();

    if (!normalizedOldName || normalizedOldName === normalizedNewName) {
      return false;
    }

    if (this.service) {
      const result = await this.service.renameFrontmatterPropertyInVault({
        oldName: normalizedOldName,
        newName: normalizedNewName,
        propertyKind: key === "createdField" ? "created" : "updated"
      });

      if (result.cancelled) {
        return false;
      }

      if (result.changed === 0 && result.failed > 0) {
        new Notice(`Rename failed. Changed: 0. Skipped: ${result.skipped}. Failed: ${result.failed}.`);
        if (result.reasons.length > 0) {
          console.warn("Frontmatter Timestamps rename failure details", result.reasons);
        }
        return false;
      }

      if (result.changed > 0 && result.failed > 0) {
        new Notice(`Rename partially completed. Changed: ${result.changed}. Skipped: ${result.skipped}. Failed: ${result.failed}. Check the developer console for failed files.`);
        if (result.reasons.length > 0) {
          console.warn("Frontmatter Timestamps partial rename details", result.reasons);
        }
      }
    }

    this.settings[key] = normalizedNewName;
    try {
      await renameTimestampPropertyType(this.app, normalizedOldName, normalizedNewName, this.settings);
    } catch (error) {
      new Notice("Timestamp field was renamed, but Obsidian property type metadata could not be updated.");
      console.warn("Frontmatter Timestamps property type metadata update failed", error);
    } finally {
      await this.saveData(this.settings);
    }
    return true;
  }
}
