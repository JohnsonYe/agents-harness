#!/usr/bin/env node

import { Command } from "commander";
import { runCommand } from "./commands/run.js";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { resumeCommand } from "./commands/resume.js";
import { configCommand } from "./commands/config.js";

const program = new Command();

program
  .name("agents-harness")
  .description("Multi-agent orchestrator for autonomous software development")
  .version("0.1.2");

program
  .command("run")
  .description("Start a new harness run with a specification")
  .argument("<spec>", "The feature specification to implement")
  .option("-s, --scope <workspaces...>", "Limit to specific workspaces")
  .option("--max-attempts <n>", "Max attempts per sprint", parseInt)
  .option("--max-budget <n>", "Max total budget in USD", parseFloat)
  .option("--no-dashboard", "Disable live dashboard")
  .option("--port <n>", "Dashboard port", parseInt)
  .action((spec: string, options) => {
    runCommand(spec, options);
  });

program
  .command("init")
  .description("Initialize .harness/ config for the current project")
  .action(() => {
    initCommand();
  });

program
  .command("status")
  .description("Show status of the current run")
  .action(() => {
    statusCommand();
  });

program
  .command("resume")
  .description("Resume a stopped or failed run")
  .option("--max-budget <n>", "Max total budget in USD", parseFloat)
  .option("--no-dashboard", "Disable live dashboard")
  .option("--port <n>", "Dashboard port", parseInt)
  .action((options) => {
    resumeCommand(options);
  });

program
  .command("config")
  .description("Get or set global configuration")
  .argument("<action>", "Action: get or set")
  .argument("[key]", "Config key (e.g. api-key)")
  .argument("[value]", "Value to set (for set action)")
  .action((action: string, key?: string, value?: string) => {
    configCommand(action, key, value);
  });

program.parse();
