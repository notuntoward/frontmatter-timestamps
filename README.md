# Frontmatter Timestamps

Frontmatter Timestamps is an Obsidian community plugin that keeps configured `created` and `updated` YAML frontmatter properties synchronized with Markdown file creation and edit activity.

## Features

- Adds a created timestamp when a Markdown note is created, or when an edited note is missing one.
- Updates an updated timestamp after Markdown content changes, using a configurable debounce and minimum update interval.
- Uses Obsidian's `app.fileManager.processFrontMatter()` for note frontmatter changes.
- Supports Date & time, Date, or Plain text timestamp property modes.
- Lets you configure created/updated property names and ignored vault paths.
- Provides preview and update commands for the current folder and entire vault.
- Provides a safe property rename workflow with preview, confirmation, conflict skipping, and changed/skipped/failed reporting.
- Includes a cleanup command for legacy malformed datetime values such as `YYYY-MM-DD'T'HH:mm:ss`.

## Important safety notes

This plugin modifies YAML frontmatter in Markdown notes. Automatic updates and bulk commands can affect many Markdown files. Before enabling the plugin in an important vault, changing property names, or running folder/vault-wide update commands, make a full vault backup or commit your vault to version control.

Use the preview commands before applying folder-wide or vault-wide updates. Verify ignored paths before running bulk operations.

## Installation

### From Obsidian Community Plugins

Once published in the Obsidian Community Plugin directory, install it from Obsidian's Community plugins browser.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Create this folder in your vault: `.obsidian/plugins/frontmatter-timestamps/`.
3. Place the three downloaded files in that folder.
4. Reload Obsidian and enable **Frontmatter Timestamps** in Community plugins.

## Usage

After enabling the plugin, new and modified Markdown notes outside ignored paths are processed automatically. By default, the plugin uses:

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

## Property type metadata

The plugin registers configured timestamp properties with Obsidian's property type metadata so they appear using the selected native property type. It preserves unrelated property type entries.

## Development

```bash
npm ci
npm run build
```

The production build emits `main.js` from the TypeScript source.

## License

MIT License. See [LICENSE](LICENSE).
