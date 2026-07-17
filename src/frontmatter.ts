import type { TFile } from "obsidian";
import { formatTimestampForPropertyType } from "./format";
import { TimestampPluginSettings } from "./settings";

export interface TimestampChange {
  field: string;
  before: unknown;
  after: string;
}

export interface TimestampPlan {
  changes: TimestampChange[];
}

export interface TimestampPlanOptions {
  includeCreated: boolean;
  forceCreated: boolean;
  includeUpdated: boolean;
}

const MALFORMED_DATETIME_QUOTE_LITERAL = /^(\d{4}-\d{2}-\d{2})'T'(\d{2}:\d{2}:\d{2}(?:\.\d{3})?)$/;

export function planTimestampChanges(
  frontmatter: Record<string, unknown>,
  file: TFile,
  timestamp: string,
  settings: TimestampPluginSettings,
  options: TimestampPlanOptions
): TimestampPlan {
  const changes: TimestampChange[] = [];
  const createdValue = timestampFromStat(file.stat.ctime, settings, timestamp);

  if (options.includeCreated) {
    addMissingOrForcedChange(changes, frontmatter, settings.createdField, createdValue, options.forceCreated);
  }

  if (options.includeUpdated) {
    addChange(changes, frontmatter, settings.updatedField, timestamp);
  }

  return { changes };
}

export function applyTimestampPlan(frontmatter: Record<string, unknown>, plan: TimestampPlan): void {
  for (const change of plan.changes) {
    frontmatter[change.field] = change.after;
  }
}

export function isMalformedDatetimeQuoteLiteral(value: unknown): value is string {
  return typeof value === "string" && MALFORMED_DATETIME_QUOTE_LITERAL.test(value);
}

export function fixMalformedDatetimeQuoteLiteral(value: string): string {
  return value.replace(MALFORMED_DATETIME_QUOTE_LITERAL, "$1T$2");
}

function addMissingOrForcedChange(
  changes: TimestampChange[],
  frontmatter: Record<string, unknown>,
  field: string,
  value: string,
  force: boolean
): void {
  if (!field) {
    return;
  }

  if (force || frontmatter[field] === undefined || frontmatter[field] === null || frontmatter[field] === "") {
    addChange(changes, frontmatter, field, value);
  }
}

function addChange(
  changes: TimestampChange[],
  frontmatter: Record<string, unknown>,
  field: string,
  value: string
): void {
  if (!field || frontmatter[field] === value) {
    return;
  }

  changes.push({
    field,
    before: frontmatter[field],
    after: value
  });
}

function timestampFromStat(_millis: number, settings: TimestampPluginSettings, fallback: string): string {
  if (!Number.isFinite(_millis) || _millis <= 0) {
    return fallback;
  }

  return formatTimestampForPropertyType(new Date(_millis), settings.timestampPropertyType, settings.dateFormat);
}
