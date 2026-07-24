#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COLS = 52;
const ROWS = 7;
const CELL = 10;
const STEP = 13;
const GRID_X = 72;
const GRID_Y = 58;
const SHIP_Y = 192;
const WIDTH = 820;
const HEIGHT = 230;
const LOOP_SECONDS = 18;
const MAX_TARGETS = 10;
const DEFAULT_OUTPUT = "assets/contribution-game.svg";
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

const QUERY = `
  query ProfileContributions($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
              weekday
            }
          }
        }
      }
    }
  }
`;

export function validateUsername(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)
  ) {
    throw new Error("GH_USERNAME is missing or is not a valid GitHub login");
  }
  return value;
}

export function resolveOutputPath(value, workingDirectory = process.cwd()) {
  const root = path.resolve(workingDirectory);
  const resolved = path.resolve(root, value || DEFAULT_OUTPUT);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("OUTPUT_PATH must stay inside the repository");
  }
  return resolved;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchCalendar(username, token, fetchImpl = fetch) {
  if (!token) {
    throw new Error("GH_TOKEN or GITHUB_TOKEN is required");
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "almirneto5-profile-generator",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { login: username },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (attempt === 1 && TRANSIENT_STATUS.has(response.status)) {
        await sleep(400 + Math.floor(Math.random() * 250));
        continue;
      }
      throw new Error(`GitHub GraphQL request failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(`GitHub GraphQL error: ${payload.errors[0].message}`);
    }

    const calendar =
      payload.data?.user?.contributionsCollection?.contributionCalendar;
    if (!calendar) {
      throw new Error(`GitHub user "${username}" was not found`);
    }
    return calendar;
  }

  throw new Error("GitHub GraphQL request did not complete");
}

export function normalizeCells(weeks) {
  const recentWeeks = weeks.slice(-COLS);
  const paddedWeeks = [
    ...Array.from({ length: COLS - recentWeeks.length }, () => ({
      contributionDays: [],
    })),
    ...recentWeeks,
  ];

  const cells = [];
  for (const [column, week] of paddedWeeks.entries()) {
    const daysByWeekday = new Map(
      week.contributionDays.map((day) => [day.weekday, day]),
    );
    for (let row = 0; row < ROWS; row += 1) {
      const day = daysByWeekday.get(row);
      cells.push({
        column,
        row,
        count: day?.contributionCount ?? 0,
        date: day?.date ?? null,
        x: GRID_X + column * STEP,
        y: GRID_Y + row * STEP,
      });
    }
  }
  return cells;
}

export function selectTargets(cells, limit = MAX_TARGETS) {
  return [...cells]
    .filter((cell) => cell.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count ||
        String(right.date).localeCompare(String(left.date)),
    )
    .slice(0, limit)
    .sort(
      (left, right) =>
        left.column - right.column || left.row - right.row,
    );
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function round(value) {
  return Number(value.toFixed(4));
}

function colorForCount(count, maximum) {
  if (count === 0) return "#161B22";
  const intensity = Math.log1p(count) / Math.log1p(Math.max(1, maximum));
  if (intensity < 0.26) return "#0E4429";
  if (intensity < 0.5) return "#006D32";
  if (intensity < 0.76) return "#26A641";
  return "#39D353";
}

function eventTime(column, direction) {
  const forward = 0.035 + (column / (COLS - 1)) * 0.43;
  return direction === "forward" ? forward : 1 - forward;
}

function renderGrid(cells, targets) {
  const targetKeys = new Set(
    targets.map((target) => `${target.column}:${target.row}`),
  );
  const maximum = Math.max(1, ...cells.map((cell) => cell.count));

  return cells
    .map((cell) => {
      const color = colorForCount(cell.count, maximum);
      const target = targetKeys.has(`${cell.column}:${cell.row}`);
      const title = cell.date
        ? `${formatNumber(cell.count)} contribuições em ${cell.date}`
        : "Sem dados";

      if (!target) {
        return `<rect x="${cell.x}" y="${cell.y}" width="${CELL}" height="${CELL}" rx="2" fill="${color}"><title>${escapeXml(title)}</title></rect>`;
      }

      const first = Math.min(
        eventTime(cell.column, "forward"),
        eventTime(cell.column, "backward"),
      );
      const second = Math.max(
        eventTime(cell.column, "forward"),
        eventTime(cell.column, "backward"),
      );
      const pulse = 0.008;
      return `<rect x="${cell.x}" y="${cell.y}" width="${CELL}" height="${CELL}" rx="2" fill="${color}" filter="url(#cellGlow)">
  <title>${escapeXml(title)}</title>
  <animate attributeName="fill" dur="${LOOP_SECONDS}s" repeatCount="indefinite"
    keyTimes="0;${round(first)};${round(first + pulse)};${round(second)};${round(second + pulse)};1"
    values="${color};${color};#B7FFCE;${color};#B7FFCE;${color}"/>
</rect>`;
    })
    .join("\n");
}

function renderShots(targets) {
  const shots = [];
  for (const direction of ["forward", "backward"]) {
    const ordered =
      direction === "forward" ? targets : [...targets].reverse();
    for (const target of ordered) {
      const impact = eventTime(target.column, direction);
      const launch = impact - 0.018;
      const fade = impact + 0.012;
      const cx = target.x + CELL / 2;
      const cy = target.y + CELL / 2;

      shots.push(`<circle cx="${cx}" cy="${SHIP_Y - 12}" r="2.4" fill="#7EE787" opacity="0">
  <animate attributeName="cy" dur="${LOOP_SECONDS}s" repeatCount="indefinite"
    keyTimes="0;${round(launch)};${round(impact)};1"
    values="${SHIP_Y - 12};${SHIP_Y - 12};${cy};${cy}"/>
  <animate attributeName="opacity" dur="${LOOP_SECONDS}s" repeatCount="indefinite"
    keyTimes="0;${round(launch)};${round(impact)};${round(fade)};1"
    values="0;1;1;0;0"/>
</circle>
<circle cx="${cx}" cy="${cy}" r="0" fill="none" stroke="#56D364" stroke-width="2">
  <animate attributeName="r" dur="${LOOP_SECONDS}s" repeatCount="indefinite"
    keyTimes="0;${round(impact)};${round(fade)};1"
    values="0;0;10;10"/>
  <animate attributeName="opacity" dur="${LOOP_SECONDS}s" repeatCount="indefinite"
    keyTimes="0;${round(impact)};${round(fade)};1"
    values="0;1;0;0"/>
</circle>`);
    }
  }
  return shots.join("\n");
}

function renderStars() {
  return Array.from({ length: 34 }, (_, index) => {
    const x = 15 + ((index * 97) % (WIDTH - 30));
    const y = 46 + ((index * 43) % (HEIGHT - 58));
    const duration = 1.2 + (index % 5) * 0.37;
    return `<circle cx="${x}" cy="${y}" r="${index % 4 === 0 ? 1.3 : 0.8}" fill="#8B949E">
  <animate attributeName="opacity" values="0.15;0.9;0.15" dur="${duration.toFixed(2)}s" begin="${(index % 7) * -0.21}s" repeatCount="indefinite"/>
</circle>`;
  }).join("\n");
}

function renderShip() {
  const startX = GRID_X + CELL / 2;
  const endX = GRID_X + (COLS - 1) * STEP + CELL / 2;
  return `<g transform="translate(${startX},${SHIP_Y})" filter="url(#shipGlow)">
  <g>
    <path d="M0 -18 L8 5 L4 3 L0 8 L-4 3 L-8 5 Z" fill="#58A6FF" stroke="#79C0FF" stroke-width="1"/>
    <path d="M-8 5 L-14 11 L-4 7 Z M8 5 L14 11 L4 7 Z" fill="#388BFD"/>
    <circle cx="0" cy="-7" r="2.5" fill="#DDF4FF"/>
    <path d="M-3 8 L3 8 L0 18 Z" fill="#F0883E">
      <animate attributeName="opacity" values="0.45;1;0.55;1" dur="0.2s" repeatCount="indefinite"/>
    </path>
  </g>
  <animateTransform attributeName="transform" type="translate" dur="${LOOP_SECONDS}s" repeatCount="indefinite"
    keyTimes="0;0.5;1"
    values="${startX},${SHIP_Y};${endX},${SHIP_Y};${startX},${SHIP_Y}"/>
</g>`;
}

export function buildSvg({ username, totalContributions, weeks }) {
  const safeUsername = validateUsername(username);
  const cells = normalizeCells(weeks);
  const targets = selectTargets(cells);
  const year = new Date().getUTCFullYear();

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title desc">
  <title id="title">Contribution Rocket Game de ${escapeXml(safeUsername)}</title>
  <desc id="desc">Uma nave animada percorre o calendário público de contribuições de ${escapeXml(safeUsername)}.</desc>
  <defs>
    <linearGradient id="gameBackground" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050816"/>
      <stop offset="0.55" stop-color="#0D1117"/>
      <stop offset="1" stop-color="#07131D"/>
    </linearGradient>
    <linearGradient id="border" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22D3EE"/>
      <stop offset="0.5" stop-color="#8B5CF6"/>
      <stop offset="1" stop-color="#39D353"/>
    </linearGradient>
    <filter id="shipGlow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="2.8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="cellGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="1.8" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <style>
      .label { font: 700 11px "Courier New", Consolas, monospace; letter-spacing: 1.5px; fill: #22D3EE; }
      .status { font: 11px "Courier New", Consolas, monospace; fill: #8B949E; }
      .score { font: 700 12px "Courier New", Consolas, monospace; fill: #7EE787; }
    </style>
  </defs>

  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" rx="16" fill="url(#gameBackground)"/>
  ${renderStars()}
  <text x="24" y="27" class="label">CONTRIBUTION DEFENSE // ${year}</text>
  <circle cx="618" cy="23" r="4" fill="#39D353">
    <animate attributeName="opacity" values="1;0.2;1" dur="1.1s" repeatCount="indefinite"/>
  </circle>
  <text x="630" y="27" class="status">LIVE</text>
  <text x="796" y="27" text-anchor="end" class="score">SCORE ${escapeXml(formatNumber(totalContributions))}</text>
  <line x1="24" y1="39" x2="796" y2="39" stroke="#21262D"/>

  <g id="contribution-grid">
${renderGrid(cells, targets)}
  </g>
  <g id="shots">
${renderShots(targets)}
  </g>
  ${renderShip()}

  <text x="24" y="216" class="status">@${escapeXml(safeUsername)} · dados públicos atualizados diariamente</text>
  <text x="796" y="216" text-anchor="end" class="status">◀ AUTO PILOT ▶</text>
  <rect x="2" y="2" width="${WIDTH - 4}" height="${HEIGHT - 4}" rx="14" fill="none" stroke="url(#border)" stroke-width="2" opacity="0.75">
    <animate attributeName="opacity" values="0.45;0.9;0.45" dur="3.4s" repeatCount="indefinite"/>
  </rect>
</svg>
`;
}

export async function main() {
  const username = validateUsername(process.env.GH_USERNAME);
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const outputPath = resolveOutputPath(
    process.env.OUTPUT_PATH || DEFAULT_OUTPUT,
  );
  const calendar = await fetchCalendar(username, token);
  const svg = buildSvg({
    username,
    totalContributions: calendar.totalContributions,
    weeks: calendar.weeks,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, svg, { encoding: "utf8", flag: "w" });
  console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (path.resolve(currentFile) === invokedFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
