export interface TimestampPluginSettings {
  createdField: string;
  updatedField: string;
  createdPropertyEnabled: boolean;
  updatedPropertyEnabled: boolean;
  timestampPropertyType: TimestampPropertyType;
  dateFormat: string;
  ignoredPaths: string[];
  debounceMs: number;
  minUpdateIntervalMs: number;
}

export type TimestampPropertyType = "text" | "date" | "datetime";

export const DEFAULT_SETTINGS: TimestampPluginSettings = {
  createdField: "created",
  updatedField: "updated",
  createdPropertyEnabled: true,
  updatedPropertyEnabled: true,
  timestampPropertyType: "datetime",
  dateFormat: "yyyy-MM-dd HH:mm",
  ignoredPaths: ["Templates", "Utility", "Attachment", "Attachments"],
  debounceMs: 1500,
  minUpdateIntervalMs: 60000
};

export function normalizeSettings(data: unknown, configDir: string): TimestampPluginSettings {
  const raw = isRecord(data) ? data : {};
  const ignoredPaths = getIgnoredPaths(raw, configDir);

  return {
    createdField: getString(raw.createdField, DEFAULT_SETTINGS.createdField),
    updatedField: getString(raw.updatedField, DEFAULT_SETTINGS.updatedField),
    createdPropertyEnabled: getBoolean(raw.createdPropertyEnabled, DEFAULT_SETTINGS.createdPropertyEnabled),
    updatedPropertyEnabled: getBoolean(raw.updatedPropertyEnabled, DEFAULT_SETTINGS.updatedPropertyEnabled),
    timestampPropertyType: getTimestampPropertyType(raw.timestampPropertyType),
    dateFormat: getString(raw.dateFormat, DEFAULT_SETTINGS.dateFormat),
    ignoredPaths,
    debounceMs: getNonNegativeNumber(raw.debounceMs, DEFAULT_SETTINGS.debounceMs),
    minUpdateIntervalMs: getNonNegativeNumber(raw.minUpdateIntervalMs, DEFAULT_SETTINGS.minUpdateIntervalMs)
  };
}

function getIgnoredPaths(raw: Record<string, unknown>, configDir: string): string[] {
  const candidate = Array.isArray(raw.ignoredPaths)
    ? raw.ignoredPaths
    : Array.isArray(raw.ignoredFolders)
      ? raw.ignoredFolders
      : DEFAULT_SETTINGS.ignoredPaths;

  return candidate.filter((path): path is string => typeof path === "string" && path !== configDir);
}

function getString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function getBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function getNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getTimestampPropertyType(value: unknown): TimestampPropertyType {
  return value === "text" || value === "date" || value === "datetime"
    ? value
    : DEFAULT_SETTINGS.timestampPropertyType;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
