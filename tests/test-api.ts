export { normalizeSettings } from "../src/settings-model";
export { DEFAULT_SETTINGS } from "../src/settings-model";
export { classifyFileLocation, isFileInVaultIndex, isPathWithinVault, shouldProcessFilePath } from "../src/file-policy";
export {
  getEnabledTimestampFields,
  getEnabledTimestampOptions,
  hasEnabledTimestampProperty
} from "../src/timestamp-options";
export { applyTimestampPlan, planTimestampChanges } from "../src/frontmatter";
