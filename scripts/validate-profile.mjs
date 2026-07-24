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
  "assets/profile-terminal-avatar-dark.svg",
  "assets/profile-terminal-avatar-light.svg",
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

  if (asset.includes("profile-terminal-avatar-")) {
    assert(
      /<image\b[^>]*href="data:image\/png;base64,/i.test(svg),
      `${asset} must embed the avatar rendered as scanlines`,
    );
    assert(
      svg.includes("PROFILE.PICTURE // LIVE") &&
        svg.includes('id="portrait-glow"') &&
        svg.includes('id="portrait-reveal"'),
      `${asset} must keep the animated profile-picture effect`,
    );
  }
}

const readmeAssets = [
  "assets/profile-terminal-avatar-dark.svg",
  "assets/profile-terminal-avatar-light.svg",
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
  path.join(root, "assets", "profile-avatar-source.png"),
);
assert(
  portraitSource
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "Profile portrait source must be a PNG",
);
assert(
  portraitSource.length < 1_000_000,
  "ASCII portrait source is unexpectedly large",
);

const portraitGenerator = fs.readFileSync(
  path.join(root, "scripts", "generate-profile-banner.py"),
  "utf8",
);
assert(
  portraitGenerator.includes("portrait_to_scanline_data_uri") &&
    portraitGenerator.includes("portrait-reveal"),
  "Portrait generator must keep the scanline conversion and reveal animation",
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
