import { Platform, requireApiVersion } from "obsidian";

const EXTERNAL_FILES_MIN_APP_VERSION = "1.14.2";

export function supportsExternalFileHandling(): boolean {
  return Platform.isDesktopApp && typeof requireApiVersion === "function" && requireApiVersion(EXTERNAL_FILES_MIN_APP_VERSION);
}
