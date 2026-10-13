import type { TimestampPluginSettings } from "./settings-model";

export interface FilePathApi {
  resolve(...paths: string[]): string;
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
  sep: string;
}

export type FileLocation = "in-vault" | "outside-vault" | "unknown";

export function isFileInVaultIndex<T extends { vault: unknown }>(
  file: T,
  vault: unknown,
  indexedFile: unknown
): boolean {
  return file.vault === vault && indexedFile === file;
}

export function classifyFileLocation(
  isIndexedInVault: boolean,
  pathCheckAvailable: boolean,
  pathIsWithinVault: boolean | null
): FileLocation {
  if (!pathCheckAvailable) {
    return isIndexedInVault ? "in-vault" : "unknown";
  }

  if (pathIsWithinVault === false) {
    return "outside-vault";
  }

  if (pathIsWithinVault === true && isIndexedInVault) {
    return "in-vault";
  }

  return "unknown";
}

export function isPathWithinVault(
  vaultRoot: string,
  filePath: string,
  pathApi: FilePathApi,
  realpath: (path: string) => string
): boolean | null {
  try {
    const canonicalRoot = realpath(pathApi.resolve(vaultRoot));
    const canonicalFile = realpath(pathApi.resolve(filePath));
    const relativePath = pathApi.relative(canonicalRoot, canonicalFile);

    return relativePath === "" || (
      relativePath !== ".." &&
      !relativePath.startsWith(`..${pathApi.sep}`) &&
      !pathApi.isAbsolute(relativePath)
    );
  } catch {
    return null;
  }
}

export function shouldProcessFilePath(
  filePath: string,
  extension: string,
  settings: TimestampPluginSettings,
  configDir: string,
  fileLocation: FileLocation,
  externalFileSupportAvailable = false
): boolean {
  if (
    extension !== "md" ||
    fileLocation === "unknown" ||
    (fileLocation === "outside-vault" && (settings.disableExternalFiles || !externalFileSupportAvailable))
  ) {
    return false;
  }

  return ![configDir, ...settings.ignoredPaths].some((ignored) => pathMatchesIgnoredPath(filePath, ignored));
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