import { TAbstractFile, TFile } from "obsidian";
import { TimestampPluginSettings } from "./settings";

export function isMarkdownFile(file: TAbstractFile | null): file is TFile {
  return file instanceof TFile && file.extension === "md";
}

export function shouldProcessFile(file: TFile, settings: TimestampPluginSettings, configDir: string): boolean {
  if (file.extension !== "md") {
    return false;
  }

  return ![configDir, ...settings.ignoredPaths].some((ignored) => pathMatchesIgnoredPath(file.path, ignored));
}

export function normalizeIgnoredPath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, "");
}

function pathMatchesIgnoredPath(filePath: string, ignoredPath: string): boolean {
  const normalized = normalizeIgnoredPath(ignoredPath);
  if (!normalized) {
    return false;
  }

  return filePath === normalized || filePath.startsWith(`${normalized}/`);
}
