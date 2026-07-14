import { TAbstractFile, TFile } from "obsidian";
import { TimestampPluginSettings } from "./settings";

export const ALWAYS_IGNORED_PATHS = [".obsidian"];

export function isMarkdownFile(file: TAbstractFile | null): file is TFile {
  return file instanceof TFile && file.extension === "md";
}

export function shouldProcessFile(file: TFile, settings: TimestampPluginSettings): boolean {
  if (file.extension !== "md") {
    return false;
  }

  return ![...ALWAYS_IGNORED_PATHS, ...settings.ignoredPaths].some((ignored) => pathMatchesIgnoredPath(file.path, ignored));
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
