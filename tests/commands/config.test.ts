import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock os.homedir to return a temp directory
let tempHome: string;

vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return {
    ...original,
    homedir: () => tempHome,
  };
});

// Import AFTER mocking so module-level constants use the mocked homedir
const { loadGlobalConfig, saveGlobalConfig, resolveApiKey, configCommand } =
  await import("../../src/commands/config.js");

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "harness-config-test-"));
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true });
  delete process.env.ANTHROPIC_API_KEY;
});

describe("loadGlobalConfig", () => {
  it("returns empty object when no file exists", () => {
    const config = loadGlobalConfig();
    expect(config).toEqual({});
  });
});

describe("saveGlobalConfig", () => {
  it("creates the config file with correct content", () => {
    saveGlobalConfig({ api_key: "sk-saved" });

    const configPath = join(tempHome, ".agent-harness", "config.yaml");
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("api_key: sk-saved");
  });
});

describe("resolveApiKey", () => {
  it("returns env var when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-env-key";

    const key = resolveApiKey();

    expect(key).toBe("sk-env-key");
  });

  it("returns global config value when no env var is set", () => {
    const configDir = join(tempHome, ".agent-harness");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "config.yaml"),
      "api_key: sk-from-config\n",
    );

    const key = resolveApiKey();

    expect(key).toBe("sk-from-config");
  });

  it("prefers env var over global config", () => {
    process.env.ANTHROPIC_API_KEY = "sk-env-key";
    const configDir = join(tempHome, ".agent-harness");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "config.yaml"),
      "api_key: sk-from-config\n",
    );

    const key = resolveApiKey();

    expect(key).toBe("sk-env-key");
  });

  it("returns undefined when nothing is configured", () => {
    const key = resolveApiKey();

    expect(key).toBeUndefined();
  });
});

describe("configCommand", () => {
  it("set saves a value to the config file", () => {
    configCommand("set", "api-key", "sk-test-123");

    const configPath = join(tempHome, ".agent-harness", "config.yaml");
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("api_key: sk-test-123");
  });

  it("get prints a saved value", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Save a value first
    saveGlobalConfig({ api_key: "sk-get-test" });

    configCommand("get", "api-key");

    expect(logSpy).toHaveBeenCalledWith("sk-get-test");
    logSpy.mockRestore();
  });

  it("get prints not-set message for missing key", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    configCommand("get", "api-key");

    expect(logSpy).toHaveBeenCalledWith("api-key is not set.");
    logSpy.mockRestore();
  });

  it("set prints error when key or value is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    configCommand("set");

    expect(errorSpy).toHaveBeenCalledWith(
      "Usage: agent-harness config set <key> <value>",
    );
    errorSpy.mockRestore();
  });

  it("get prints error when key is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    configCommand("get");

    expect(errorSpy).toHaveBeenCalledWith(
      "Usage: agent-harness config get <key>",
    );
    errorSpy.mockRestore();
  });

  it("prints error for unknown action", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    configCommand("delete");

    expect(errorSpy).toHaveBeenCalledWith(
      'Unknown config action: delete. Use "get" or "set".',
    );
    errorSpy.mockRestore();
  });
});
