import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";

const bundle = await build({
  bundle: true,
  entryPoints: ["tests/test-api.ts"],
  platform: "node",
  format: "cjs",
  write: false
});
const testDirectory = await fs.mkdtemp("/tmp/frontmatter-timestamps-tests-");
const bundlePath = path.join(testDirectory, "test-api.cjs");
await fs.writeFile(bundlePath, bundle.outputFiles[0].contents);
const api = createRequire(import.meta.url)(bundlePath);
const configDir = "vault-config";

const baseSettings = {
  createdField: "created",
  updatedField: "updated",
  createdPropertyEnabled: true,
  updatedPropertyEnabled: true,
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
testRenameStateAndUiInvariants();
await testImplementationSafety();
process.stdout.write("Frontmatter Timestamps tests: 5 suites passed.\n");
