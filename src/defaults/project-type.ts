import type { ProjectContext, ProjectType } from "../core/types.js";

const FRONTEND_FRAMEWORKS = new Set([
  "vite",
  "react",
  "vue",
  "svelte",
  "angular",
]);

const BACKEND_FRAMEWORKS = new Set([
  "django",
  "fastapi",
  "express",
  "flask",
  "hono",
  "gin",
  "rails",
]);

const FULLSTACK_FRAMEWORKS = new Set(["nextjs"]);

const BACKEND_LANGUAGES = new Set(["python", "go", "rust", "java", "ruby"]);

export function detectProjectType(ctx: ProjectContext): ProjectType {
  let hasFrontend = false;
  let hasBackend = false;

  for (const ws of ctx.workspaces) {
    const { framework, language, devServer } = ws.stack;

    if (framework && FULLSTACK_FRAMEWORKS.has(framework)) {
      return "fullstack";
    }

    if (framework && FRONTEND_FRAMEWORKS.has(framework)) {
      hasFrontend = true;
    } else if (framework && BACKEND_FRAMEWORKS.has(framework)) {
      hasBackend = true;
    } else if (!framework && BACKEND_LANGUAGES.has(language)) {
      hasBackend = true;
    } else if (!framework && devServer) {
      hasFrontend = true;
    }
  }

  if (hasFrontend && hasBackend) return "fullstack";
  if (hasFrontend) return "frontend";
  if (hasBackend) return "backend";
  return "universal";
}
