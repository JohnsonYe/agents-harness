import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml, stringify as toYaml } from "yaml";

function getGlobalConfigDir(): string {
  return join(homedir(), ".agents-harness");
}

function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), "config.yaml");
}

export interface GlobalConfig {
  api_key?: string;
  [key: string]: unknown;
}

/**
 * Load global config from ~/.agents-harness/config.yaml
 */
export function loadGlobalConfig(): GlobalConfig {
  if (!existsSync(getGlobalConfigPath())) {
    return {};
  }
  try {
    const content = readFileSync(getGlobalConfigPath(), "utf-8");
    return (parseYaml(content) as GlobalConfig) ?? {};
  } catch {
    return {};
  }
}

/**
 * Save global config to ~/.agents-harness/config.yaml
 */
export function saveGlobalConfig(config: GlobalConfig): void {
  mkdirSync(getGlobalConfigDir(), { recursive: true });
  writeFileSync(getGlobalConfigPath(), toYaml(config), "utf-8");
}

/**
 * Resolve the API key from (in priority order):
 * 1. ANTHROPIC_API_KEY environment variable
 * 2. Global config file (~/.agents-harness/config.yaml)
 */
export function resolveApiKey(): string | undefined {
  // Check env var first
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) return envKey;

  // Check global config
  const config = loadGlobalConfig();
  if (config.api_key) return config.api_key;

  return undefined;
}

/**
 * CLI config command handler.
 *
 * Usage:
 *   agents-harness config set api-key <value>
 *   agents-harness config get api-key
 */
export function configCommand(
  action: string,
  key?: string,
  value?: string,
): void {
  // Map CLI key names to config key names
  const keyMap: Record<string, string> = {
    "api-key": "api_key",
  };

  if (action === "set") {
    if (!key || !value) {
      console.error("Usage: agents-harness config set <key> <value>");
      return;
    }
    const configKey = keyMap[key] ?? key;
    const config = loadGlobalConfig();
    config[configKey] = value;
    saveGlobalConfig(config);
    console.log(`Set ${key} in global config.`);
  } else if (action === "get") {
    if (!key) {
      console.error("Usage: agents-harness config get <key>");
      return;
    }
    const configKey = keyMap[key] ?? key;
    const config = loadGlobalConfig();
    const val = config[configKey];
    if (val !== undefined) {
      console.log(String(val));
    } else {
      console.log(`${key} is not set.`);
    }
  } else {
    console.error(`Unknown config action: ${action}. Use "get" or "set".`);
  }
}
