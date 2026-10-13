# Frontmatter Timestamps

Frontmatter Timestamps is an Obsidian community plugin that keeps configured `created` and `updated` YAML frontmatter properties synchronized with Markdown file creation and edit activity.

## Features

- Adds a created timestamp when a Markdown note is created, or when an edited note is missing one.
- Updates an updated timestamp after Markdown content changes, using a configurable debounce and minimum update interval.
- Uses Obsidian's `app.fileManager.processFrontMatter()` for note frontmatter changes.
- Supports Date & time, Date, or Plain text timestamp property modes.
- Lets you configure created/updated property names and ignored vault paths.
- Can disable timestamp processing for Markdown files opened from outside the vault.
- Provides independent Enabled/Disabled controls for the Created and Updated properties.
- Provides preview and update commands for the current folder and entire vault.
- Provides a safe property rename workflow with preview, confirmation, conflict skipping, and changed/skipped/failed reporting.
- Includes a cleanup command for legacy malformed datetime values such as `YYYY-MM-DD'T'HH:mm:ss`.

## Important safety notes

This plugin modifies YAML frontmatter in Markdown notes. Automatic updates and bulk commands can affect many Markdown files. Before enabling the plugin in an important vault, changing property names, or running folder/vault-wide update commands, make a full vault backup or commit your vault to version control.

Use the preview commands before applying folder-wide or vault-wide updates. Verify ignored paths before running bulk operations.

## Independent timestamp controls

The Created and Updated property cards each have their own native toggle. Both are enabled by default, and existing settings without these fields migrate to the same `true`/`true` behavior. Disabling a property never deletes, clears, renames, or changes its existing frontmatter value, and it remains registered as a native Obsidian property type. Re-enabling a property affects future automatic events and explicit bulk updates only; it does not retroactively change old notes.

Automatic events and Update folder/Update vault process only enabled properties. If both properties are disabled, automatic activity produces no timestamp writes and bulk update actions return “Enable at least one timestamp property to update existing files.” When one property is enabled, bulk result notices identify the fields included in that run.

## Files outside the vault

The **Disable Frontmatter Timestamps for files outside this vault** setting is enabled by default. While enabled, Frontmatter Timestamps skips Markdown files opened from outside the current vault. Turn it off to allow this plugin to update timestamps in those files. This setting is available in Obsidian Desktop 1.14.2 and newer. Folder and vault bulk commands continue to operate only on files in the current vault.

## Installation

### From Obsidian Community Plugins

Once published in the Obsidian Community Plugin directory, install it from Obsidian's Community plugins browser.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Create this folder in your vault: `.obsidian/plugins/frontmatter-timestamps/`.
3. Place the three downloaded files in that folder.
4. Reload Obsidian and enable **Frontmatter Timestamps** in Community plugins.

## Usage

After enabling the plugin, new and modified Markdown notes in the current vault and outside ignored paths are processed automatically. Files opened from outside the vault are skipped while **Disable Frontmatter Timestamps for files outside this vault** is enabled. By default, the plugin uses:

- `created` for the created timestamp;
- `updated` for the updated timestamp;
- Date & time property mode;
- ignored paths: `Templates`, `Utility`, `Attachment`, and `Attachments`.

Date & time values are written as local timestamps in this form:

```text
YYYY-MM-DDTHH:mm:ss
```

## Commands

The plugin registers these commands:

- **Update timestamps for current file**
- **Add missing created timestamp to current file**
- **Update timestamp values in current folder**
- **Preview timestamp updates in current folder**
- **Update timestamp values in entire vault**
- **Preview timestamp updates in entire vault**
- **Fix malformed datetime quote literals**

Preview commands report what would change without modifying notes. Update commands modify frontmatter in matching Markdown notes.

## Ignored paths

Ignored paths are configured in plugin settings. A matching ignored folder or file is skipped during automatic updates and bulk commands. Obsidian's internal config folder is always ignored internally.

## Property rename workflow

Changing the created or updated property name uses an explicit rename workflow:

1. Type the new property name in settings.
2. Click **Apply rename...**.
3. Review the preview/confirmation.
4. Apply the rename.

Destination conflicts are skipped by default. The plugin does not overwrite an existing destination property and reports changed, skipped, and failed counts. Use **Revert** to discard a draft property-name change before applying it.

The rename workflow remains available for disabled properties. Applying a rename is still an explicit global operation, preserves the Enabled/Disabled state, and does not enable the renamed property. Typing in a name field or toggling a property does not rename notes.

## Property type metadata

The plugin registers configured timestamp properties with Obsidian's property type metadata so they appear using the selected native property type. It preserves unrelated property type entries.

## Development

```bash
npm ci
npm run test
npm run lint
npm run check
npm run build
```

The production build emits `main.js` from the TypeScript source.

## Runtime checklist

These checks should be performed in Obsidian after installing a release. They are not automated test results.

### Created only

1. Enable Created and disable Updated.
2. Create or modify a test note according to the current automatic triggers.
3. Confirm Created behaves normally and Updated is not added or changed.
4. Run Update folder and confirm only Created changes.

### Updated only

1. Disable Created and enable Updated.
2. Trigger the existing update behavior.
3. Confirm Updated changes and Created remains untouched.
4. Run Update vault and confirm only Updated changes.

### Both disabled

1. Disable both properties and confirm both cards show Disabled.
2. Trigger normal note activity and confirm neither timestamp changes.
3. Confirm bulk-update buttons are disabled or show the no-enabled-properties notice.
4. Confirm existing timestamp properties remain in the note.

### Persistence and rename

1. Re-enable one property, close and reopen settings, and restart Obsidian; confirm its state persists.
2. Disable Updated, change its configured name, and confirm typing alone changes no notes.
3. Apply the rename explicitly and confirm the rename works while Updated remains disabled.
4. Test light theme, dark theme, and a narrow settings or popout window.

## License

MIT License. See [LICENSE](LICENSE).
