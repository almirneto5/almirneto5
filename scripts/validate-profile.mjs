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
  "assets/profile-terminal-photo-dark.svg",
  "assets/profile-terminal-photo-light.svg",
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

  if (asset.includes("profile-terminal-photo-")) {
    assert(
      /<image\b[^>]*href="data:image\/(?:jpeg|png);base64,/i.test(svg),
      `${asset} must embed the optimized portrait`,
    );
    assert(
      svg.includes("PORTRAIT.FEED"),
      `${asset} must use the photographic portrait panel`,
    );
  }
}

const readmeAssets = [
  "assets/profile-terminal-photo-dark.webp",
  "assets/profile-terminal-photo-dark.jpg",
  "assets/profile-terminal-photo-light.webp",
  "assets/profile-terminal-photo-light.jpg",
  "assets/commit-runner.svg",
];

for (const asset of readmeAssets) {
  const absolutePath = path.join(root, asset);
  assert(fs.existsSync(absolutePath), `Missing ${asset}`);
  const rawUrl =
    `https://raw.githubusercontent.com/almirneto5/almirneto5/main/${asset}`;
  assert(readme.includes(rawUrl), `README does not reference ${asset}`);
}

for (const asset of readmeAssets.filter((name) => name.endsWith(".webp"))) {
  const contents = fs.readFileSync(path.join(root, asset));
  assert.equal(contents.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(contents.subarray(8, 12).toString("ascii"), "WEBP");
  assert(contents.includes(Buffer.from("ANIM")), `${asset} must be animated`);
  assert(contents.length < 1_000_000, `${asset} is unexpectedly large`);
}

for (const asset of readmeAssets.filter((name) => name.endsWith(".jpg"))) {
  const contents = fs.readFileSync(path.join(root, asset));
  assert(
    contents.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
    `${asset} must be a JPEG`,
  );
  assert(contents.length < 1_000_000, `${asset} is unexpectedly large`);
}

const hologramSources = [
  "assets/portrait-london.png",
  "assets/profile-terminal-base-dark.jpg",
  "assets/profile-terminal-base-light.jpg",
  "scripts/generate-hologram-banner.py",
];

for (const asset of hologramSources) {
  assert(fs.existsSync(path.join(root, asset)), `Missing ${asset}`);
}

const hologramGenerator = fs.readFileSync(
  path.join(root, "scripts", "generate-hologram-banner.py"),
  "utf8",
);
assert(
  hologramGenerator.includes("IDENTITY_SCAN // LIVE"),
  "Hologram generator must keep the live identity scanner",
);
assert(
  hologramGenerator.includes("build_band_mask"),
  "Hologram generator must keep the animated scanning band",
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
