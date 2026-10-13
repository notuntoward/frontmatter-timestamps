import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";

const bundle = await build({
  bundle: true,
  entryPoints: ["tests/test-api.ts"],
  platform: "node",
  format: "cjs",
  write: false
});
const testDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "frontmatter-timestamps-tests-"));
const bundlePath = path.join(testDirectory, "test-api.cjs");
await fs.writeFile(bundlePath, bundle.outputFiles[0].contents);
const api = createRequire(import.meta.url)(bundlePath);
const configDir = "vault-config";

const baseSettings = {
  createdField: "created",
  updatedField: "updated",
  createdPropertyEnabled: true,
  updatedPropertyEnabled: true,
  disableExternalFiles: true,
  timestampPropertyType: "datetime",
  dateFormat: "yyyy-MM-dd HH:mm",
  ignoredPaths: [],
  debounceMs: 1500,
  minUpdateIntervalMs: 60000
};
const file = { stat: { ctime: Date.parse("2026-07-17T10:20:30") } };
const automaticCreate = { includeCreated: true, forceCreated: false, includeUpdated: false, automatic: true };
const automaticModify = { includeCreated: true, forceCreated: false, includeUpdated: true, automatic: true };

function settings(overrides = {}) {
  return { ...baseSettings, ...overrides };
}

function plan(frontmatter, currentSettings, requestedOptions) {
  const options = api.getEnabledTimestampOptions(currentSettings, requestedOptions);
  return api.planTimestampChanges(frontmatter, file, "2026-07-17T10:20:30", currentSettings, options).changes;
}

function changedFields(changes) {
  return changes.map((change) => change.field);
}

function testMigration() {
  const legacy = {
    createdField: "made",
    updatedField: "changed",
    timestampPropertyType: "date",
    dateFormat: "yyyy/MM/dd",
    ignoredFolders: ["Archive", configDir],
    debounceMs: 250,
    minUpdateIntervalMs: 5000
  };
  const migrated = api.normalizeSettings(legacy, configDir);
  assert.equal(migrated.disableExternalFiles, true);
  assert.equal(api.normalizeSettings({ disableExternalFiles: false }, configDir).disableExternalFiles, false);
  assert.equal(api.normalizeSettings({ processExternalFiles: true }, configDir).disableExternalFiles, true);
  assert.equal(migrated.createdPropertyEnabled, true);
  assert.equal(migrated.updatedPropertyEnabled, true);
  assert.deepEqual(migrated.ignoredPaths, ["Archive"]);
  assert.equal(migrated.createdField, "made");
  assert.equal(migrated.updatedField, "changed");
  assert.equal(migrated.timestampPropertyType, "date");

  const explicitFalse = api.normalizeSettings({ ...migrated, createdPropertyEnabled: false, updatedPropertyEnabled: false }, configDir);
  assert.equal(explicitFalse.createdPropertyEnabled, false);
  assert.equal(explicitFalse.updatedPropertyEnabled, false);
  assert.deepEqual(api.normalizeSettings(explicitFalse, configDir), explicitFalse);
  assert.equal(api.normalizeSettings({ ...legacy, createdPropertyEnabled: false }, configDir).updatedPropertyEnabled, true);
}

function testAutomaticPlans() {
  const existing = { created: "old-created", updated: "old-updated", other: "unchanged" };
  assert.deepEqual(changedFields(plan({ ...existing }, settings(), automaticModify)), ["updated"]);
  assert.deepEqual(changedFields(plan({ updated: "old-updated" }, settings({ updatedPropertyEnabled: false }), automaticModify)), ["created"]);
  assert.deepEqual(changedFields(plan({ ...existing }, settings({ createdPropertyEnabled: false }), automaticModify)), ["updated"]);
  assert.deepEqual(changedFields(plan({ ...existing }, settings({ createdPropertyEnabled: false, updatedPropertyEnabled: false }), automaticModify)), []);

  for (const enabled of [true, false]) {
    const currentSettings = settings({ createdPropertyEnabled: enabled, updatedPropertyEnabled: false });
    const changes = plan({}, currentSettings, automaticCreate);
    assert.deepEqual(changedFields(changes), enabled ? ["created"] : []);
  }

  const createdOnly = plan({ updated: "keep" }, settings({ updatedPropertyEnabled: false }), automaticModify);
  assert.deepEqual(changedFields(createdOnly), ["created"]);
  const updatedOnly = plan({ created: "keep" }, settings({ createdPropertyEnabled: false }), automaticModify);
  assert.deepEqual(changedFields(updatedOnly), ["updated"]);

  const disabled = settings({ createdPropertyEnabled: false, updatedPropertyEnabled: false });
  assert.equal(api.hasEnabledTimestampProperty(disabled), false);
  assert.deepEqual(api.getEnabledTimestampOptions(disabled, automaticModify), {
    ...automaticModify,
    includeCreated: false,
    includeUpdated: false
  });
}

function testManualBulkSelectionAndSafety() {
  assert.deepEqual(api.getEnabledTimestampFields(settings()), ["created", "updated"]);
  assert.deepEqual(api.getEnabledTimestampFields(settings({ updatedPropertyEnabled: false })), ["created"]);
  assert.deepEqual(api.getEnabledTimestampFields(settings({ createdPropertyEnabled: false })), ["updated"]);
  assert.deepEqual(api.getEnabledTimestampFields(settings({ createdPropertyEnabled: false, updatedPropertyEnabled: false })), []);

  const original = { created: "keep-created", updated: "keep-updated" };
  const changes = plan({ ...original }, settings({ createdPropertyEnabled: false }), automaticModify);
  const after = { ...original };
  for (const change of changes) after[change.field] = change.after;
  assert.equal(after.created, original.created);
  assert.notEqual(after.updated, original.updated);

  const missingDisabled = plan({}, settings({ createdPropertyEnabled: false }), automaticModify);
  assert.deepEqual(changedFields(missingDisabled), ["updated"]);
}

async function testExternalFilePolicy() {
  const vault = {};
  const inVaultFile = { vault, path: "Projects/README.md" };
  const externalFile = { vault, path: "C:/outside-vault/README.md" };
  const lookup = (path) => path === externalFile.path ? externalFile : inVaultFile;

  // Index identity can succeed for an external file, so desktop also checks the real path.
  assert.equal(api.isFileInVaultIndex(inVaultFile, vault, lookup(inVaultFile.path)), true);
  assert.equal(api.isFileInVaultIndex(externalFile, vault, lookup(externalFile.path)), true);
  assert.equal(api.isFileInVaultIndex(externalFile, vault, null), false);

  const identityRealpath = (path) => path;
  assert.equal(
    api.isPathWithinVault("C:/Vault", "C:/Vault/Projects/README.md", path.win32, identityRealpath),
    true
  );
  assert.equal(
    api.isPathWithinVault("C:/Vault", externalFile.path, path.win32, identityRealpath),
    false
  );
  assert.equal(
    api.isPathWithinVault("C:/Vault", "C:/Vault-other/README.md", path.win32, identityRealpath),
    false
  );
  assert.equal(
    api.isPathWithinVault("/vault", "/vault/Projects/README.md", path.posix, identityRealpath),
    true
  );
  assert.equal(
    api.isPathWithinVault("/vault", "/outside/README.md", path.posix, identityRealpath),
    false
  );

  const resolveJunction = (candidate) => candidate.replace(
    /^C:\\Vault\\Junction\\/i,
    "C:\\Outside\\"
  );
  assert.equal(
    api.isPathWithinVault("C:/Vault", "C:/Vault/Junction/README.md", path.win32, resolveJunction),
    false
  );
  assert.equal(
    api.isPathWithinVault("/vault", "/vault/Linked/README.md", path.posix, (candidate) =>
      candidate.replace("/vault/Linked/", "/outside/")
    ),
    false
  );
  assert.equal(
    api.isPathWithinVault("/vault", "/vault/README.md", path.posix, () => {
      throw new Error("path cannot be resolved");
    }),
    null
  );

  const externalLocation = api.classifyFileLocation(
    api.isFileInVaultIndex(externalFile, vault, lookup(externalFile.path)),
    true,
    api.isPathWithinVault("C:/Vault", externalFile.path, path.win32, identityRealpath)
  );
  assert.equal(externalLocation, "outside-vault");
  assert.equal(api.classifyFileLocation(true, true, null), "unknown");
  assert.equal(api.classifyFileLocation(false, true, true), "unknown");
  assert.equal(api.classifyFileLocation(true, false, null), "in-vault");
  assert.equal(api.classifyFileLocation(false, false, null), "unknown");

  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "frontmatter-timestamps-paths-"));
  try {
    const nativeVault = path.join(testRoot, "vault");
    const outsideDirectory = path.join(testRoot, "outside");
    const linkedDirectory = path.join(nativeVault, "linked");
    const nativeVaultFile = path.join(nativeVault, "note.md");
    const outsideFile = path.join(outsideDirectory, "README.md");
    await fs.mkdir(nativeVault, { recursive: true });
    await fs.mkdir(outsideDirectory, { recursive: true });
    await fs.writeFile(nativeVaultFile, "inside\n");
    await fs.writeFile(outsideFile, "outside\n");
    await fs.symlink(outsideDirectory, linkedDirectory, process.platform === "win32" ? "junction" : "dir");

    assert.equal(api.isPathWithinVault(nativeVault, nativeVaultFile, path, fsSync.realpathSync), true);
    assert.equal(api.isPathWithinVault(nativeVault, outsideFile, path, fsSync.realpathSync), false);
    assert.equal(
      api.isPathWithinVault(nativeVault, path.join(linkedDirectory, "README.md"), path, fsSync.realpathSync),
      false
    );
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true });
  }

  const inVaultPath = inVaultFile.path;
  const externalPath = externalFile.path;
  assert.equal(api.shouldProcessFilePath(inVaultPath, "md", settings(), configDir, "in-vault"), true);
  assert.equal(api.shouldProcessFilePath(externalPath, "md", settings(), configDir, "outside-vault", true), false);
  assert.equal(
    api.shouldProcessFilePath(
      externalPath,
      "md",
      settings({ disableExternalFiles: false }),
      configDir,
      "outside-vault",
      true
    ),
    true
  );
  assert.equal(
    api.shouldProcessFilePath(
      externalPath,
      "md",
      settings({ disableExternalFiles: false }),
      configDir,
      "outside-vault",
      false
    ),
    false
  );
  assert.equal(
    api.shouldProcessFilePath(
      externalPath,
      "md",
      settings({ disableExternalFiles: false }),
      configDir,
      "unknown",
      true
    ),
    false
  );
  assert.equal(
    api.shouldProcessFilePath(inVaultPath, "md", settings({ ignoredPaths: ["Projects"] }), configDir, "in-vault"),
    false
  );
  assert.equal(api.shouldProcessFilePath(externalPath, "txt", settings(), configDir, "outside-vault", true), false);
}

function testRenameStateAndUiInvariants() {
  const disabled = settings({ createdPropertyEnabled: false, updatedPropertyEnabled: false });
  const renamed = { ...disabled, createdField: "made" };
  assert.equal(renamed.createdPropertyEnabled, false);
  assert.equal(renamed.updatedPropertyEnabled, false);
  assert.equal(renamed.createdField, "made");

  const reenabled = { ...renamed, createdPropertyEnabled: true };
  assert.equal(reenabled.createdPropertyEnabled, true);
  assert.equal(reenabled.updatedPropertyEnabled, false);
  assert.equal(reenabled.createdField, "made");
}

async function testImplementationSafety() {
  const service = await fs.readFile("src/timestamp-service.ts", "utf8");
  const settingsSource = await fs.readFile("src/settings.ts", "utf8");
  const styles = await fs.readFile("styles.css", "utf8");
  assert.match(service, /getEnabledTimestampOptions/);
  assert.match(service, /if \(!effectiveOptions\.includeCreated && !effectiveOptions\.includeUpdated\)/);
  assert.match(service, /processFrontMatter/);
  assert.doesNotMatch(service, /window\.confirm/);
  assert.doesNotMatch(service, /vault\.modify/);
  assert.match(settingsSource, /circle-check/);
  assert.match(settingsSource, /circle-off/);
  assert.match(settingsSource, /aria-label/);
  assert.match(settingsSource, /aria-hidden/);
  assert.match(settingsSource, /fmt-property-card-disabled/);
  assert.match(settingsSource, /renameTimestampField/);
  assert.match(settingsSource, /setDisabled\(!hasEnabledProperty\)/);
  assert.match(styles, /\.fmt-property-card-header\s*\{/);
  assert.match(styles, /\.fmt-property-card-disabled\s*\{/);
  assert.doesNotMatch(styles, /element\.style/);
  assert.doesNotMatch(styles, /!important/);
  assert.doesNotMatch(styles, /(^|\n)\s*(body|html|button|input|\.setting-item)\s*\{/);
}

testMigration();
testAutomaticPlans();
testManualBulkSelectionAndSafety();
await testExternalFilePolicy();
testRenameStateAndUiInvariants();
await testImplementationSafety();
process.stdout.write("Frontmatter Timestamps tests: 6 suites passed.\n");
