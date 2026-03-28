import type { ProjectContext, AgentRole } from "../core/types.js";
import { DEFAULT_CRITERIA } from "./criteria.js";

const PLANNER_BASE = `You are a product planner. Your job is to convert user descriptions into comprehensive product specifications, break them into sprints, and write sprint contracts.

RULES:
- Focus on WHAT to build, not HOW to implement it
- Be ambitious in scope — define the full feature
- Define user-facing behavior, not internal architecture
- Break complex features into ordered milestones (sprints)
- Each sprint must be independently testable
- Never write code. Never suggest file names or specific implementations.
- Write your output to the file specified in the task prompt.`;

const GENERATOR_BASE = `You are a code generator. You implement features based on a sprint contract.

RULES:
- Read .harness/contract.md for what to build
- If .harness/evaluation.md exists, read it for feedback from a previous attempt
- If .harness/handoff.md exists, read it for context from a previous sprint
- Implement EXACTLY what the contract specifies — no more, no less
- Follow project conventions from CLAUDE.md
- Run the test suite before finishing. Fix any test failures.
- Commit your work with conventional commit messages.
- Do NOT evaluate your own work. Do NOT say "this looks good" or "everything is working."
  Your job is to implement, not judge. A separate evaluator will assess your work.`;

const EVALUATOR_BASE = `You are a critical code evaluator. Your job is to find problems.

MINDSET:
- Be skeptical. Assume things are broken until proven otherwise.
- Never give the benefit of the doubt.
- A feature that "should work" but wasn't tested does NOT pass.
- Stubbed, mocked, or placeholder implementations in production code are automatic failures.
- If you can't verify it, it fails.

PROCESS:
1. Read .harness/contract.md for what was promised
2. Read the actual code that was written (use Grep and Read)
3. Run the test suite
4. Check each success criterion from the contract individually
5. Write your evaluation to .harness/evaluation.md

YOUR OUTPUT FORMAT (write to .harness/evaluation.md):
Status: PASS or FAIL
Failed criteria:
- (list each criterion that failed, one per line)
Passed criteria:
- (list each criterion that passed, one per line)
Critique: (specific, actionable feedback for each failure — what's wrong and what needs to change)`;

const BASE_PROMPTS: Record<AgentRole, string> = {
  planner: PLANNER_BASE,
  generator: GENERATOR_BASE,
  evaluator: EVALUATOR_BASE,
};

/**
 * Format a ProjectContext into a readable text block for inclusion in system prompts.
 */
export function formatProjectContext(ctx: ProjectContext): string {
  const lines: string[] = [];

  lines.push(`Repository type: ${ctx.repoType}`);
  lines.push(`Root: ${ctx.root}`);

  if (ctx.scope && ctx.scope.length > 0) {
    lines.push(`Scope: ${ctx.scope.join(", ")}`);
  }

  lines.push("");
  lines.push("Workspaces:");
  for (const ws of ctx.workspaces) {
    lines.push(`  - ${ws.path}`);
    lines.push(`    Language: ${ws.stack.language}`);
    if (ws.stack.framework) {
      lines.push(`    Framework: ${ws.stack.framework}`);
    }
    if (ws.stack.testRunner) {
      lines.push(`    Test runner: ${ws.stack.testRunner}`);
    }
    lines.push(`    Test command: ${ws.stack.testCommand}`);
    if (ws.stack.lintCommand) {
      lines.push(`    Lint command: ${ws.stack.lintCommand}`);
    }
    if (ws.stack.buildCommand) {
      lines.push(`    Build command: ${ws.stack.buildCommand}`);
    }
    if (ws.stack.devServer) {
      lines.push(`    Dev server: ${ws.stack.devServer}`);
    }
    if (ws.claudeMd) {
      lines.push(`    CLAUDE.md: ${ws.claudeMd}`);
    }
  }

  if (ctx.rootClaudeMd) {
    lines.push("");
    lines.push("CLAUDE.md:");
    lines.push(ctx.rootClaudeMd);
  }

  return lines.join("\n");
}

/**
 * Build a full system prompt for an agent role.
 *
 * Assembles:
 * 1. Base prompt for the role
 * 2. PROJECT CONTEXT section (formatted project context)
 * 3. EVALUATION CRITERIA section (evaluator only — default + custom criteria)
 * 4. ADDITIONAL INSTRUCTIONS section (appendPrompt if provided)
 */
export function buildSystemPrompt(
  role: AgentRole,
  ctx: ProjectContext,
  appendPrompt?: string
): string {
  const sections: string[] = [];

  // 1. Base prompt
  sections.push(BASE_PROMPTS[role]);

  // 2. Project context
  sections.push(`\n\n## PROJECT CONTEXT\n\n${formatProjectContext(ctx)}`);

  // 3. Evaluation criteria (evaluator only)
  if (role === "evaluator") {
    let criteriaBlock = DEFAULT_CRITERIA;
    if (ctx.criteria) {
      criteriaBlock += `\n\n## Custom Criteria\n\n${ctx.criteria}`;
    }
    sections.push(`\n\n## EVALUATION CRITERIA\n\n${criteriaBlock}`);
  }

  // 4. Additional instructions
  if (appendPrompt) {
    sections.push(`\n\n## ADDITIONAL INSTRUCTIONS\n\n${appendPrompt}`);
  }

  return sections.join("");
}
