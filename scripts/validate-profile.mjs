#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = path.join(root, "README.md");
const readme = fs.readFileSync(readmePath, "utf8");

assert(
  !/YOUR_|\bTODO\b|example\.com/i.test(readme),
  "README contains a placeholder",
);

const svgAssets = [
  "assets/profile-terminal-ascii-dark.svg",
  "assets/profile-terminal-ascii-light.svg",
  "assets/commit-runner.svg",
];

for (const asset of svgAssets) {
  const absolutePath = path.join(root, asset);
  assert(fs.existsSync(absolutePath), `Missing ${asset}`);
  const svg = fs.readFileSync(absolutePath, "utf8");
  assert(svg.startsWith("<svg"), `${asset} must start with <svg`);
  assert(svg.trimEnd().endsWith("</svg>"), `${asset} must end with </svg>`);
  assert(!/<script\b|javascript:/i.test(svg), `${asset} contains active script`);
  assert(svg.length < 1_000_000, `${asset} is unexpectedly large`);

  if (asset.includes("profile-terminal-ascii-")) {
    assert(
      !/<image\b/i.test(svg),
      `${asset} must keep the portrait as pure vector text`,
    );
    assert(
      svg.includes("VISUAL.MAP") &&
        svg.includes('class="ascii"') &&
        svg.includes('id="portrait-reveal"'),
      `${asset} must keep the animated ASCII portrait`,
    );
  }
}

const readmeAssets = [
  "assets/profile-terminal-ascii-dark.svg",
  "assets/profile-terminal-ascii-light.svg",
  "assets/commit-runner.svg",
];

for (const asset of readmeAssets) {
  const absolutePath = path.join(root, asset);
  assert(fs.existsSync(absolutePath), `Missing ${asset}`);
  const rawUrl =
    `https://raw.githubusercontent.com/almirneto5/almirneto5/main/${asset}`;
  assert(readme.includes(rawUrl), `README does not reference ${asset}`);
}

const portraitSource = fs.readFileSync(
  path.join(root, "assets", "portrait-london-ascii-source.jpg"),
);
assert(
  portraitSource.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  "ASCII portrait source must be a JPEG",
);
assert(
  portraitSource.length < 1_000_000,
  "ASCII portrait source is unexpectedly large",
);

const asciiGenerator = fs.readFileSync(
  path.join(root, "scripts", "generate-profile-banner.py"),
  "utf8",
);
assert(
  asciiGenerator.includes("portrait_to_ascii") &&
    asciiGenerator.includes("portrait-reveal"),
  "ASCII generator must keep the portrait conversion and reveal animation",
);

const contributionGame = fs.readFileSync(
  path.join(root, "assets", "commit-runner.svg"),
  "utf8",
);
assert(
  /COMMIT RUNNER/.test(contributionGame),
  "Contribution game must use the compact arcade layout",
);
assert(
  !/contribution-grid/.test(contributionGame),
  "Contribution game must not duplicate the native calendar grid",
);

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
