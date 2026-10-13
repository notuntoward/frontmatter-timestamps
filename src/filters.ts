import { FileSystemAdapter, Platform, TFile } from "obsidian";
import type { TAbstractFile, Vault } from "obsidian";
import type { TimestampPluginSettings } from "./settings";
import { classifyFileLocation, isFileInVaultIndex, isPathWithinVault, shouldProcessFilePath } from "./file-policy";
import { supportsExternalFileHandling } from "./obsidian-compat";

export { normalizeIgnoredPath } from "./file-policy";

export function isMarkdownFile(file: TAbstractFile | null): file is TFile {
  return file instanceof TFile && file.extension === "md";
}

export function shouldProcessFile(
  file: TFile,
  settings: TimestampPluginSettings,
  configDir: string,
  vault: Vault
): boolean {
  const fileLocation = getFileLocation(file, vault);
  return shouldProcessFilePath(
    file.path,
    file.extension,
    settings,
    configDir,
    fileLocation,
    supportsExternalFileHandling()
  );
}

declare const require: <T>(moduleName: string) => T;

function getFileLocation(file: TFile, vault: Vault): ReturnType<typeof classifyFileLocation> {
  const isIndexedInVault = isFileInVaultIndex(file, vault, vault.getAbstractFileByPath(file.path));
  const adapter = vault.adapter;

  if (Platform.isDesktop && Platform.isDesktopApp && adapter instanceof FileSystemAdapter) {
    try {
      // Synchronous Node APIs keep the write guard in front of the write operation.
      const pathApi = require<typeof import("node:path")>("node:path");
      const fsApi = require<typeof import("node:fs")>("node:fs");
      const filePath = pathApi.isAbsolute(file.path)
        ? file.path
        : adapter.getFullPath(file.path);
      const pathIsWithinVault = isPathWithinVault(
        adapter.getBasePath(),
        filePath,
        pathApi,
        fsApi.realpathSync
      );

      return classifyFileLocation(isIndexedInVault, true, pathIsWithinVault);
    } catch {
      return "unknown";
    }
  }

  if (!Platform.isDesktopApp) {
    return classifyFileLocation(isIndexedInVault, false, null);
  }

  return "unknown";
}