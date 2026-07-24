import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  aggregateMonths,
  buildSvg,
  normalizeCells,
  resolveOutputPath,
  selectTargets,
  validateUsername,
} from "../scripts/generate-contribution-game.mjs";

function fixtureWeeks() {
  const start = new Date(Date.UTC(2025, 6, 27));

  return Array.from({ length: 52 }, (_, column) => ({
    contributionDays: Array.from({ length: 7 }, (_, weekday) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + column * 7 + weekday);
      return {
        contributionCount: (column + weekday) % 9,
        date: date.toISOString().slice(0, 10),
        weekday,
      };
    }),
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

test("aggregates a complete rolling 12-month activity route", () => {
  const cells = normalizeCells(fixtureWeeks());
  const months = aggregateMonths(cells);
  const includedMonths = new Set(months.map((month) => month.key));
  assert.equal(months.length, 12);
  assert.equal(
    months.reduce((sum, month) => sum + month.contributions, 0),
    cells
      .filter((cell) => includedMonths.has(cell.date?.slice(0, 7)))
      .reduce((sum, cell) => sum + cell.count, 0),
  );
  assert(months.some((month) => month.activeDays > 0));
});

test("builds an accessible arcade SVG without copying the native grid", () => {
  const svg = buildSvg({
    username: "almirneto5",
    totalContributions: 1234,
    weeks: fixtureWeeks(),
  });
  assert.match(svg, /^<svg/);
  assert.match(svg, /aria-labelledby="title desc"/);
  assert.match(svg, /animateMotion/);
  assert.match(svg, /COMMIT RUNNER/);
  assert.match(svg, /PUBLIC XP 1\.234/);
  assert(!svg.includes("contribution-grid"));
  assert(!svg.includes("<script"));
});

test("uses a clear syncing state when no public activity is available", () => {
  const svg = buildSvg({
    username: "almirneto5",
    totalContributions: 0,
    weeks: [],
  });
  assert.match(svg, /PUBLIC XP SYNCING/);
  assert.match(svg, /AGUARDANDO ATIVIDADE PÚBLICA/);
});
