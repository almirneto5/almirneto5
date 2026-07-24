import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildSvg,
  normalizeCells,
  resolveOutputPath,
  selectTargets,
  validateUsername,
} from "../scripts/generate-contribution-game.mjs";

function fixtureWeeks() {
  return Array.from({ length: 52 }, (_, column) => ({
    contributionDays: Array.from({ length: 7 }, (_, weekday) => ({
      contributionCount: (column + weekday) % 9,
      date: `2026-01-${String((column + weekday) % 28 + 1).padStart(2, "0")}`,
      weekday,
    })),
  }));
}

test("validates GitHub usernames", () => {
  assert.equal(validateUsername("almirneto5"), "almirneto5");
  assert.throws(() => validateUsername("-invalid"), /valid GitHub login/);
  assert.throws(() => validateUsername("invalid/owner"), /valid GitHub login/);
});

test("keeps generated output inside the repository", () => {
  const root = process.cwd();
  assert.equal(
    resolveOutputPath("assets/game.svg", root),
    path.resolve(root, "assets", "game.svg"),
  );
  assert.throws(() => resolveOutputPath("../outside.svg", root), /inside/);
});

test("normalizes the calendar to a complete 52 by 7 grid", () => {
  const cells = normalizeCells(fixtureWeeks());
  assert.equal(cells.length, 52 * 7);
  assert.equal(cells[0].row, 0);
  assert.equal(cells.at(-1).row, 6);
});

test("selects only active cells and respects the limit", () => {
  const targets = selectTargets(normalizeCells(fixtureWeeks()), 6);
  assert.equal(targets.length, 6);
  assert(targets.every((target) => target.count > 0));
});

test("builds an accessible animated SVG", () => {
  const svg = buildSvg({
    username: "almirneto5",
    totalContributions: 1234,
    weeks: fixtureWeeks(),
  });
  assert.match(svg, /^<svg/);
  assert.match(svg, /aria-labelledby="title desc"/);
  assert.match(svg, /animateTransform/);
  assert.match(svg, /SCORE 1\.234/);
  assert(!svg.includes("<script"));
});
