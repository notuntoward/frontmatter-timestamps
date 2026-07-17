import {
  App,
  Notice,
  PluginSettingTab,
  prepareFuzzySearch,
  Setting,
  TFolder,
  setIcon,
  normalizePath
} from "obsidian";
import FrontmatterTimestampsPlugin from "./main";
import { normalizeIgnoredPath } from "./filters";
import { DEFAULT_SETTINGS } from "./settings-model";
import type { TimestampPropertyKind } from "./timestamp-service";

export { DEFAULT_SETTINGS, normalizeSettings } from "./settings-model";
export type { TimestampPluginSettings, TimestampPropertyType } from "./settings-model";
import type { TimestampPropertyType } from "./settings-model";

export class TimestampSettingTab extends PluginSettingTab {
  plugin: FrontmatterTimestampsPlugin;

  constructor(app: App, plugin: FrontmatterTimestampsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.displayTimestampFieldSetting(containerEl, "createdField", "Created property", DEFAULT_SETTINGS.createdField);
    this.displayTimestampFieldSetting(containerEl, "updatedField", "Updated property", DEFAULT_SETTINGS.updatedField);

    new Setting(containerEl)
      .setName("Timestamp property type")
      .setDesc("Controls the Obsidian property style and the timestamp value written to frontmatter.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("datetime", "Date & time")
          .addOption("date", "Date")
          .addOption("text", "Plain text")
          .setValue(this.plugin.settings.timestampPropertyType)
          .onChange(async (value: TimestampPropertyType) => {
            this.plugin.settings.timestampPropertyType = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.timestampPropertyType === "text") {
      new Setting(containerEl)
        .setName("Text date format")
        .setDesc("Used only when timestamp property type is Plain text. Supported tokens: yyyy, MM, dd, HH, mm, ss.")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.dateFormat)
            .setValue(this.plugin.settings.dateFormat)
            .onChange(async (value) => {
              this.plugin.settings.dateFormat = value.trim() || DEFAULT_SETTINGS.dateFormat;
              await this.plugin.saveSettings();
            })
        );
    }

    const hasEnabledProperty = this.plugin.settings.createdPropertyEnabled || this.plugin.settings.updatedPropertyEnabled;
    new Setting(containerEl)
      .setName("Apply settings to existing files")
      .setDesc(hasEnabledProperty
        ? "Changing property names updates existing keys automatically. Use these buttons to refresh enabled timestamp values with the current settings."
        : "Enable at least one timestamp property to update existing files.")
      .addButton((button) =>
        button
          .setButtonText("Update folder")
          .setDisabled(!hasEnabledProperty)
          .onClick(() => {
            void this.plugin.service.updateCurrentFolderTimestamps(false);
          })
      )
      .addButton((button) =>
        button
          .setButtonText("Update vault")
          .setDisabled(!hasEnabledProperty)
          .onClick(() => {
            void this.plugin.service.updateVaultTimestamps(false);
          })
      );

    this.displayIgnoredPaths(containerEl);

    new Setting(containerEl)
      .setName("Debounce delay")
      .setDesc("Milliseconds to wait after edits before updating frontmatter.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.debounceMs))
          .setValue(String(this.plugin.settings.debounceMs))
          .onChange(async (value) => {
            this.plugin.settings.debounceMs = toPositiveNumber(value, DEFAULT_SETTINGS.debounceMs);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Minimum update interval")
      .setDesc("Minimum milliseconds between automatic updated writes for the same file.")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.minUpdateIntervalMs))
          .setValue(String(this.plugin.settings.minUpdateIntervalMs))
          .onChange(async (value) => {
            this.plugin.settings.minUpdateIntervalMs = toPositiveNumber(value, DEFAULT_SETTINGS.minUpdateIntervalMs);
            await this.plugin.saveSettings();
          })
      );
  }

  private displayTimestampFieldSetting(
    containerEl: HTMLElement,
    key: "createdField" | "updatedField",
    name: string,
    fallback: string
  ): void {
    const savedName = this.plugin.settings[key];
    let draftName = savedName;
    const propertyKind: TimestampPropertyKind = key === "createdField" ? "created" : "updated";

    const enabled = key === "createdField"
      ? this.plugin.settings.createdPropertyEnabled
      : this.plugin.settings.updatedPropertyEnabled;
    const cardEl = containerEl.createDiv({ cls: "fmt-property-card" });
    if (!enabled) {
      cardEl.addClass("fmt-property-card-disabled");
    }

    const headerEl = cardEl.createDiv({ cls: "fmt-property-card-header" });

    const iconEl = headerEl.createSpan({ attr: { "aria-hidden": "true" } });
    setIcon(iconEl, key === "createdField" ? "calendar-plus" : "refresh-cw");
    headerEl.createDiv({ text: name, cls: "fmt-property-card-title" });

    const stateEl = headerEl.createDiv({ cls: "fmt-property-state" });
    const stateIconEl = stateEl.createSpan({
      cls: "fmt-property-state-icon",
      attr: { "aria-hidden": "true" }
    });
    setIcon(stateIconEl, enabled ? "circle-check" : "circle-off");
    stateEl.createSpan({
      cls: "fmt-property-state-label",
      text: enabled ? "Enabled" : "Disabled"
    });

    const toggleSetting = new Setting(stateEl).addToggle((toggle) => {
      toggle.setValue(enabled);
      toggle.toggleEl.setAttribute("aria-label", `${enabled ? "Disable" : "Enable"} ${name}`);
      toggle.setTooltip(`${enabled ? "Disable" : "Enable"} ${name}`);
      toggle.onChange(async (value) => {
        if (key === "createdField") {
          this.plugin.settings.createdPropertyEnabled = value;
        } else {
          this.plugin.settings.updatedPropertyEnabled = value;
        }
        await this.plugin.saveSettings();
        this.display();
      });
    });
    toggleSetting.settingEl.addClass("fmt-property-toggle-setting");

    cardEl.createDiv({
      cls: "fmt-property-card-description",
      text: "Renaming this property previews and applies a global frontmatter key rename. Typing does not change notes."
    });

    const inputEl = cardEl.createEl("input", {
      type: "text",
      value: draftName
    });
    inputEl.addClasses(["text-input", "fmt-property-card-input"]);
    inputEl.placeholder = fallback;
    inputEl.addEventListener("input", () => {
      draftName = inputEl.value;
    });

    const buttonsEl = cardEl.createDiv({ cls: "fmt-property-card-buttons" });

    const applyButton = buttonsEl.createEl("button", { text: "Apply rename..." });
    applyButton.addEventListener("click", async () => {
      const oldName = this.plugin.settings[key].trim();
      const newName = draftName.trim();
      const otherKey = key === "createdField" ? "updatedField" : "createdField";

      if (!newName) {
        new Notice("Property name is required.");
        return;
      }

      if (oldName === newName) {
        new Notice("No rename needed.");
        return;
      }

      if (newName === this.plugin.settings[otherKey].trim()) {
        new Notice("Created and updated property names must be different.");
        return;
      }

      const renamed = await this.plugin.renameTimestampField(key, oldName, newName);
      if (renamed) {
        this.display();
      }
    });

    const revertButton = buttonsEl.createEl("button", { text: "Revert" });
    revertButton.addEventListener("click", () => {
      draftName = this.plugin.settings[propertyKind === "created" ? "createdField" : "updatedField"];
      this.display();
    });
  }

  private displayIgnoredPaths(containerEl: HTMLElement): void {
    const setting = new Setting(containerEl)
      .setName("Ignored paths")
      .setDesc(`Add vault folders or files to skip. The active vault configuration folder (${this.app.vault.configDir}) is always ignored.`);

    setting.controlEl.addClass("frontmatter-timestamps-ignored-paths");

    const listEl = setting.controlEl.createDiv({ cls: "frontmatter-timestamps-path-list" });
    for (const path of this.plugin.settings.ignoredPaths) {
      const itemEl = listEl.createDiv({ cls: "frontmatter-timestamps-path-item" });
      itemEl.createSpan({ text: path });
      const removeButton = itemEl.createEl("button", {
        cls: "clickable-icon",
        attr: { "aria-label": `Remove ${path}` }
      });
      setIcon(removeButton, "x");
      removeButton.addEventListener("click", async () => {
        this.plugin.settings.ignoredPaths = this.plugin.settings.ignoredPaths.filter((item) => item !== path);
        await this.plugin.saveSettings();
        this.display();
      });
    }

    const suggestContainerEl = setting.controlEl.createDiv({ cls: "frontmatter-timestamps-path-suggest" });
    const inputEl = suggestContainerEl.createEl("input", {
      type: "search",
      placeholder: "Add folder or file..."
    });
    inputEl.addClass("frontmatter-timestamps-path-input");

    const addPath = async (path: string) => {
      const normalized = normalizeUserIgnoredPath(path);
      if (!normalized) {
        return;
      }

      if (normalized === normalizeIgnoredPath(this.app.vault.configDir)) {
        new Notice(`${normalized} is always ignored.`);
        inputEl.value = "";
        return;
      }

      if (this.plugin.settings.ignoredPaths.includes(normalized)) {
        new Notice(`${normalized} is already ignored.`);
        inputEl.value = "";
        return;
      }

      this.plugin.settings.ignoredPaths = [...this.plugin.settings.ignoredPaths, normalized].sort((a, b) => a.localeCompare(b));
      await this.plugin.saveSettings();
      inputEl.value = "";
      this.display();
    };

    new IgnoredPathSuggest(this.app, suggestContainerEl, inputEl, () => this.plugin.settings.ignoredPaths, addPath);
  }
}

function toPositiveNumber(value: string, fallback: number): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeUserIgnoredPath(path: string): string {
  return normalizeIgnoredPath(normalizePath(path));
}

class IgnoredPathSuggest {
  private app: App;
  private containerEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private dropdownEl: HTMLElement;
  private getIgnoredPaths: () => string[];
  private onChoosePath: (path: string) => Promise<void>;
  private suggestions: string[] = [];
  private selectedIndex = 0;
  private limit = 12;

  constructor(
    app: App,
    containerEl: HTMLElement,
    inputEl: HTMLInputElement,
    getIgnoredPaths: () => string[],
    onChoosePath: (path: string) => Promise<void>
  ) {
    this.app = app;
    this.containerEl = containerEl;
    this.inputEl = inputEl;
    this.getIgnoredPaths = getIgnoredPaths;
    this.onChoosePath = onChoosePath;
    this.dropdownEl = this.containerEl.createDiv({ cls: "frontmatter-timestamps-path-dropdown" });

    this.inputEl.addEventListener("input", () => {
      this.render();
    });

    this.inputEl.addEventListener("keydown", (event) => {
      this.handleKeydown(event);
    });

    this.inputEl.addEventListener("blur", () => {
      window.setTimeout(() => this.close(), 150);
    });
  }

  private getSuggestions(query: string): string[] {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const ignored = new Set([...this.getIgnoredPaths(), normalizeIgnoredPath(this.app.vault.configDir)]);
    const paths = this.getVaultPaths().filter((path) => !ignored.has(path));
    const fuzzySearch = prepareFuzzySearch(normalizedQuery);
    return paths.filter((path) => fuzzySearch(path)).slice(0, this.limit);
  }

  private render(): void {
    this.suggestions = this.getSuggestions(this.inputEl.value);
    this.selectedIndex = 0;
    this.dropdownEl.empty();

    if (this.suggestions.length === 0) {
      this.close();
      return;
    }

    this.fitDropdownToViewport();
    this.dropdownEl.addClass("is-visible");
    this.suggestions.forEach((path, index) => {
      const itemEl = this.dropdownEl.createDiv({ cls: "frontmatter-timestamps-path-option" });
      if (index === this.selectedIndex) {
        itemEl.addClass("is-selected");
      }

      itemEl.createDiv({ cls: "frontmatter-timestamps-path-option-title", text: path });
      itemEl.createDiv({
        cls: "frontmatter-timestamps-path-option-note",
        text: this.isFolderPath(path) ? "Folder" : "File"
      });

      itemEl.addEventListener("mousedown", (event) => {
        event.preventDefault();
        void this.choose(path);
      });
    });
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = this.suggestions[this.selectedIndex] ?? this.inputEl.value;
      void this.choose(selected);
      return;
    }

    if (event.key === "Escape") {
      this.close();
      return;
    }

    if (this.suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.suggestions.length - 1);
      this.renderSelection();
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.renderSelection();
    }
  }

  private renderSelection(): void {
    const items = this.dropdownEl.querySelectorAll(".frontmatter-timestamps-path-option");
    items.forEach((item, index) => {
      item.toggleClass("is-selected", index === this.selectedIndex);
    });
  }

  private async choose(path: string): Promise<void> {
    this.inputEl.value = path;
    await this.onChoosePath(path);
    this.close();
  }

  private close(): void {
    this.dropdownEl.removeClass("is-visible");
    this.dropdownEl.empty();
    this.dropdownEl.removeAttribute("style");
    this.suggestions = [];
    this.selectedIndex = 0;
  }

  private fitDropdownToViewport(): void {
    const inputRect = this.inputEl.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const rightPadding = 16;
    const topPadding = 24;
    const availableWidth = Math.max(160, viewportWidth - inputRect.left - rightPadding);
    const availableHeight = Math.max(120, inputRect.top - topPadding);
    const width = Math.min(inputRect.width, availableWidth);
    const height = Math.min(260, availableHeight);

    this.dropdownEl.style.width = `${width}px`;
    this.dropdownEl.style.maxWidth = `${availableWidth}px`;
    this.dropdownEl.style.maxHeight = `${height}px`;
  }

  private getVaultPaths(): string[] {
    const paths = new Set<string>();

    for (const file of this.app.vault.getAllLoadedFiles()) {
      if (file instanceof TFolder && file.path !== "/") {
        const path = normalizeUserIgnoredPath(file.path);
        if (path) {
          paths.add(path);
        }
      }
    }

    for (const file of this.app.vault.getFiles()) {
      const path = normalizeUserIgnoredPath(file.path);
      if (path) {
        paths.add(path);
      }
    }

    return [...paths].sort((a, b) => a.localeCompare(b));
  }

  private isFolderPath(path: string): boolean {
    return this.app.vault.getAbstractFileByPath(path) instanceof TFolder;
  }
}
