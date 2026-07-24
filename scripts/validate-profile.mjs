#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = path.join(root, "README.md");
const readme = fs.readFileSync(readmePath, "utf8");

assert(!/YOUR_|TODO|example\.com/i.test(readme), "README contains a placeholder");

const expectedAssets = [
  "assets/profile-terminal-dark.svg",
  "assets/profile-terminal-light.svg",
  "assets/contribution-game.svg",
];

for (const asset of expectedAssets) {
  const absolutePath = path.join(root, asset);
  assert(fs.existsSync(absolutePath), `Missing ${asset}`);
  const svg = fs.readFileSync(absolutePath, "utf8");
  assert(svg.startsWith("<svg"), `${asset} must start with <svg`);
  assert(svg.trimEnd().endsWith("</svg>"), `${asset} must end with </svg>`);
  assert(!/<script\b|javascript:/i.test(svg), `${asset} contains active script`);
  assert(svg.length < 1_000_000, `${asset} is unexpectedly large`);

  const rawUrl =
    `https://raw.githubusercontent.com/almirneto5/almirneto5/main/${asset}`;
  assert(readme.includes(rawUrl), `README does not reference ${asset}`);
}

const workflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "update-contribution-game.yml"),
  "utf8",
);
assert(
  /permissions:\s*\r?\n\s+contents:\s+write/.test(workflow),
  "Workflow must declare its write permission explicitly",
);
assert(
  !/ghp_|github_pat_/i.test(workflow),
  "Workflow must not contain a personal token",
);

console.log("Profile validation passed");
