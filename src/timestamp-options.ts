import type { TimestampPluginSettings } from "./settings-model";

export interface TimestampUpdateOptions {
  includeCreated: boolean;
  forceCreated: boolean;
  includeUpdated: boolean;
  automatic: boolean;
}

export function getEnabledTimestampOptions(
  settings: TimestampPluginSettings,
  options: TimestampUpdateOptions
): TimestampUpdateOptions {
  return {
    ...options,
    includeCreated: options.includeCreated && settings.createdPropertyEnabled,
    includeUpdated: options.includeUpdated && settings.updatedPropertyEnabled
  };
}

export function getEnabledTimestampFields(settings: TimestampPluginSettings): string[] {
  return [
    settings.createdPropertyEnabled ? settings.createdField : "",
    settings.updatedPropertyEnabled ? settings.updatedField : ""
  ].map((field) => field.trim()).filter(Boolean);
}

export function hasEnabledTimestampProperty(settings: TimestampPluginSettings): boolean {
  return settings.createdPropertyEnabled || settings.updatedPropertyEnabled;
}
