import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { HarnessConfig } from "../core/types.js";

/**
 * Map of snake_case YAML keys to their camelCase TypeScript equivalents.
 */
const SNAKE_TO_CAMEL: Record<string, string> = {
  max_turns: "maxTurns",
  system_prompt_append: "systemPromptAppend",
  max_attempts_per_sprint: "maxAttemptsPerSprint",
  max_budget_per_sprint_usd: "maxBudgetPerSprintUsd",
  max_total_budget_usd: "maxTotalBudgetUsd",
  test_command: "testCommand",
  lint_command: "lintCommand",
  build_command: "buildCommand",
  dev_server: "devServer",
};

/**
 * Recursively normalize an object's keys from snake_case to camelCase
 * using the explicit mapping. Keys not in the mapping are kept as-is.
 */
function normalizeKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(normalizeKeys);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = SNAKE_TO_CAMEL[key] ?? key;
    result[camelKey] = normalizeKeys(value);
  }
  return result;
}

/**
 * Load and parse `.harness/config.yaml` from the given root directory.
 * Returns null if the file does not exist.
 * Snake_case YAML keys are normalized to camelCase TypeScript properties.
 */
export function loadConfig(root: string): HarnessConfig | null {
  const configPath = join(root, ".harness", "config.yaml");
  if (!existsSync(configPath)) {
    return null;
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parse(raw);

  if (parsed === null || parsed === undefined || typeof parsed !== "object") {
    return null;
  }

  return normalizeKeys(parsed) as HarnessConfig;
}

/**
 * Load `.harness/criteria.md` from the given root directory.
 * Returns null if the file does not exist.
 */
export function loadCriteria(root: string): string | null {
  const criteriaPath = join(root, ".harness", "criteria.md");
  if (!existsSync(criteriaPath)) {
    return null;
  }

  return readFileSync(criteriaPath, "utf-8");
}
