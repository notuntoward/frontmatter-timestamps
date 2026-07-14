import { App, normalizePath } from "obsidian";
import { TimestampPluginSettings } from "./settings";

interface ObsidianTypesFile {
  types?: Record<string, string>;
}

export async function ensureTimestampPropertyTypes(app: App, settings: TimestampPluginSettings): Promise<void> {
  const propertyNames = getTimestampPropertyNames(settings);
  if (propertyNames.length === 0) {
    return;
  }

  const data = await readTypesFile(app);
  data.types = data.types ?? {};

  let changed = false;
  for (const propertyName of propertyNames) {
    if (data.types[propertyName] !== settings.timestampPropertyType) {
      data.types[propertyName] = settings.timestampPropertyType;
      changed = true;
    }
  }

  if (changed) {
    await app.vault.adapter.write(getTypesPath(app), `${JSON.stringify(data, null, 2)}\n`);
  }
}

export async function renameTimestampPropertyType(
  app: App,
  oldPropertyName: string,
  newPropertyName: string,
  settings: TimestampPluginSettings
): Promise<void> {
  const oldName = oldPropertyName.trim();
  const newName = newPropertyName.trim();
  if (!oldName || !newName || oldName === newName) {
    await ensureTimestampPropertyTypes(app, settings);
    return;
  }

  const data = await readTypesFile(app);
  data.types = data.types ?? {};

  if (data.types[oldName] !== undefined) {
    data.types[newName] = settings.timestampPropertyType;
    delete data.types[oldName];
    await app.vault.adapter.write(getTypesPath(app), `${JSON.stringify(data, null, 2)}\n`);
  }

  await ensureTimestampPropertyTypes(app, settings);
}

function getTimestampPropertyNames(settings: TimestampPluginSettings): string[] {
  return [settings.createdField, settings.updatedField]
    .map((field) => field.trim())
    .filter(Boolean);
}

async function readTypesFile(app: App): Promise<ObsidianTypesFile> {
  const typesPath = getTypesPath(app);
  if (!(await app.vault.adapter.exists(typesPath))) {
    return { types: {} };
  }

  try {
    return JSON.parse(await app.vault.adapter.read(typesPath)) as ObsidianTypesFile;
  } catch (error) {
    console.error("Frontmatter Timestamps: failed to read Obsidian property types.", error);
    return { types: {} };
  }
}

function getTypesPath(app: App): string {
  return normalizePath(`${app.vault.configDir}/types.json`);
}
