import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as toYaml, parse as parseYaml } from "yaml";
import type { Progress, EvalResult } from "./types.js";

const EPHEMERAL_FILES = ["contract.md", "evaluation.md", "handoff.md", "sprints.md", "events.json"];

const GITIGNORE_ENTRIES = [
  "# agents-harness (ephemeral files)",
  ".harness/spec.md",
  ".harness/sprints.md",
  ".harness/contract.md",
  ".harness/evaluation.md",
  ".harness/handoff.md",
  ".harness/progress.md",
  ".harness/summary.md",
  ".harness/events.json",
];

export class FileProtocol {
  private harnessDir: string;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.harnessDir = join(projectRoot, ".harness");
  }

  ensureDir(): void {
    mkdirSync(this.harnessDir, { recursive: true });
  }

  writeFile(name: string, content: string): void {
    writeFileSync(join(this.harnessDir, name), content, "utf-8");
  }

  readFile(name: string): string | null {
    const filePath = join(this.harnessDir, name);
    if (!existsSync(filePath)) {
      return null;
    }
    return readFileSync(filePath, "utf-8");
  }

  writeProgress(progress: Progress): void {
    const yaml = toYaml(progress);
    this.writeFile("progress.md", yaml);
  }

  readProgress(): Progress | null {
    const content = this.readFile("progress.md");
    if (content === null) {
      return null;
    }
    return parseYaml(content) as Progress;
  }

  parseEvaluation(): EvalResult {
    const content = this.readFile("evaluation.md");
    if (content === null) {
      return {
        passed: false,
        critique: "No evaluation file found",
        failedCriteria: [],
        passedCriteria: [],
      };
    }

    const lines = content.split("\n");
    let passed = false;
    const failedCriteria: string[] = [];
    const passedCriteria: string[] = [];
    const critiqueLines: string[] = [];

    type Section = "none" | "passed" | "failed" | "critique";
    let currentSection: Section = "none";

    for (const line of lines) {
      if (line.startsWith("Status:")) {
        const status = line.replace("Status:", "").trim();
        passed = status === "PASS";
        continue;
      }

      if (line.startsWith("Passed criteria:")) {
        currentSection = "passed";
        continue;
      }

      if (line.startsWith("Failed criteria:")) {
        currentSection = "failed";
        continue;
      }

      if (line.startsWith("Critique:")) {
        currentSection = "critique";
        continue;
      }

      if (currentSection === "passed" && line.startsWith("- ")) {
        passedCriteria.push(line.slice(2));
      } else if (currentSection === "failed" && line.startsWith("- ")) {
        failedCriteria.push(line.slice(2));
      } else if (currentSection === "critique") {
        critiqueLines.push(line);
      }
    }

    return {
      passed,
      critique: critiqueLines.join("\n").trim(),
      failedCriteria,
      passedCriteria,
    };
  }

  ensureGitignore(): void {
    const gitignorePath = join(this.projectRoot, ".gitignore");

    if (existsSync(gitignorePath)) {
      const existing = readFileSync(gitignorePath, "utf-8");
      if (existing.includes("agents-harness")) {
        return;
      }
      appendFileSync(gitignorePath, "\n" + GITIGNORE_ENTRIES.join("\n") + "\n", "utf-8");
    } else {
      writeFileSync(gitignorePath, GITIGNORE_ENTRIES.join("\n") + "\n", "utf-8");
    }
  }

  cleanEphemeral(): void {
    for (const file of EPHEMERAL_FILES) {
      const filePath = join(this.harnessDir, file);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }
  }
}
