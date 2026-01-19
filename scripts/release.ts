#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type PackageJson = {
  version: string;
};

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");

const run = (command: string): void => {
  execSync(command, { stdio: "inherit", cwd: root });
};

const execText = (command: string): string =>
  execSync(command, { encoding: "utf8", cwd: root }).trim();

const ensureCleanTree = (): void => {
  const status = execText("git status --porcelain");
  if (status) {
    throw new Error("Working tree is not clean. Commit or stash changes first.");
  }
};

const ensureMainBranch = (): void => {
  const branch = execText("git rev-parse --abbrev-ref HEAD");
  if (branch !== "main") {
    throw new Error(`Release must run on main (current: ${branch}).`);
  }
};

const bumpMinor = (version: string): string => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]) + 1;
  return `${major}.${minor}.0`;
};

const release = (): void => {
  ensureCleanTree();
  ensureMainBranch();

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;
  const next = bumpMinor(pkg.version);
  pkg.version = next;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  run("git add package.json");
  run(`git commit -m "chore: release v${next}"`);
  run("git push origin main");
  run("gh workflow run CI -f publish=true --ref main");
};

try {
  release();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
