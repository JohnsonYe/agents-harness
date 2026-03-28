import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { detectRepoType, discoverWorkspaces } from "./stack-detector.js";
import { loadConfig, loadCriteria } from "./config-loader.js";
import type { ProjectContext } from "../core/types.js";

/**
 * Read the root-level CLAUDE.md for the project.
 * Checks `.claude/CLAUDE.md` first, then `CLAUDE.md` at the root.
 */
function readRootClaudeMd(root: string): string | null {
  const dotClaudePath = join(root, ".claude", "CLAUDE.md");
  if (existsSync(dotClaudePath)) {
    try {
      return readFileSync(dotClaudePath, "utf-8");
    } catch {
      // fall through
    }
  }

  const rootPath = join(root, "CLAUDE.md");
  if (existsSync(rootPath)) {
    try {
      return readFileSync(rootPath, "utf-8");
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Build a complete ProjectContext by composing all discovery functions.
 *
 * 1. Detect repo type (single vs monorepo)
 * 2. Discover workspaces with their stacks and per-workspace CLAUDE.md
 * 3. Read root CLAUDE.md (.claude/CLAUDE.md or CLAUDE.md)
 * 4. Load .harness/config.yaml
 * 5. Load .harness/criteria.md
 * 6. Pass scope through
 */
export function buildProjectContext(
  root: string,
  scope: string[] | null
): ProjectContext {
  const repoType = detectRepoType(root);
  const workspaces = discoverWorkspaces(root);
  const rootClaudeMd = readRootClaudeMd(root);
  const config = loadConfig(root);
  const criteria = loadCriteria(root);

  return {
    repoType,
    workspaces,
    rootClaudeMd,
    config,
    criteria,
    scope,
    root,
  };
}
