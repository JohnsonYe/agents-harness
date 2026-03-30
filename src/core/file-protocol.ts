import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as toYaml, parse as parseYaml } from "yaml";
import type { Progress, EvalResult, EvalDimension, DimensionScore } from "./types.js";

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

  parseEvaluation(knownDimensions?: EvalDimension[]): EvalResult {
    const content = this.readFile("evaluation.md");
    if (content === null) {
      return {
        passed: false,
        critique: "No evaluation file found",
        failedCriteria: [],
        passedCriteria: [],
      };
    }

    if (content.includes("## Dimensions")) {
      return this.parseScoredEvaluation(content, knownDimensions);
    }
    return this.parseLegacyEvaluation(content);
  }

  private parseScoredEvaluation(content: string, knownDimensions?: EvalDimension[]): EvalResult {
    const thresholdMap = new Map<string, number>();
    if (knownDimensions) {
      for (const dim of knownDimensions) {
        thresholdMap.set(dim.name.toLowerCase(), dim.threshold);
      }
    }

    // Parse overall score from header — handles **bold** markdown
    let overallScore = 0;
    const scoreMatch = content.match(/^(?:\*\*)?Score:?\s*\*?\*?\s*([\d.]+)\s*\/\s*10/m);
    if (scoreMatch) {
      overallScore = parseFloat(scoreMatch[1]);
    }

    // Extract critique section
    let critique = "";
    const critiqueMatch = content.match(/## Critique\s*\n([\s\S]*?)$/);
    if (critiqueMatch) {
      critique = critiqueMatch[1].trim();
    }

    // Parse dimensions — split by ### headers within ## Dimensions section
    const dimensionsSection = content.match(/## Dimensions\s*\n([\s\S]*?)(?=## Critique|$)/);
    const dimensions: DimensionScore[] = [];

    if (dimensionsSection) {
      const dimBlocks = dimensionsSection[1].split(/^### /m).filter(Boolean);
      for (const block of dimBlocks) {
        const nameMatch = block.match(/^(.+?)$/m);
        if (!nameMatch) continue;
        const name = nameMatch[1].trim();

        // Handle **Score: N/10** with optional bold markdown and trailing text
        const dimScoreMatch = block.match(/\*?\*?Score:?\s*\*?\*?\s*(\d+)\s*\/\s*10/m);
        const score = dimScoreMatch ? parseInt(dimScoreMatch[1], 10) : 0;

        // Rationale may start with bold or be on same/next line
        const rationaleMatch = block.match(/(?:\*?\*?)?Rationale:?\s*\*?\*?\s*([\s\S]*?)(?=\n\n|\n### |$)/m);
        const rationale = rationaleMatch ? rationaleMatch[1].trim() : "";

        const threshold = thresholdMap.get(name.toLowerCase()) ?? 5;
        dimensions.push({
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""),
          name,
          score,
          threshold,
          passed: score >= threshold,
          rationale,
        });
      }
    }

    // Recompute passed from dimension scores — don't trust agent's "Overall:" line
    const passed = dimensions.length > 0 && dimensions.every(d => d.passed);

    // Derive backward-compat criteria lists
    const passedCriteria = dimensions
      .filter(d => d.passed)
      .map(d => `${d.name}: ${d.score}/10`);
    const failedCriteria = dimensions
      .filter(d => !d.passed)
      .map(d => `${d.name}: ${d.score}/10 (min: ${d.threshold})`);

    return {
      passed,
      critique,
      failedCriteria,
      passedCriteria,
      overallScore,
      dimensions,
    };
  }

  private parseLegacyEvaluation(content: string): EvalResult {
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
