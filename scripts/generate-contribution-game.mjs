#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COLS = 52;
const ROWS = 7;
const WIDTH = 1000;
const HEIGHT = 270;
const TRACK_START_X = 62;
const TRACK_END_X = 938;
const TRACK_WIDTH = TRACK_END_X - TRACK_START_X;
const TRACK_BASE_Y = 132;
const LOOP_SECONDS = 16;
const MAX_TARGETS = 18;
const DEFAULT_OUTPUT = "assets/commit-runner.svg";
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const MONTH_NAMES = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

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

function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function normalizeCells(weeks) {
  const safeWeeks = Array.isArray(weeks) ? weeks : [];
  const recentWeeks = safeWeeks.slice(-COLS);
  const paddedWeeks = [
    ...Array.from({ length: COLS - recentWeeks.length }, () => ({
      contributionDays: [],
    })),
    ...recentWeeks,
  ];

  const cells = [];
  for (const [column, week] of paddedWeeks.entries()) {
    const contributionDays = Array.isArray(week?.contributionDays)
      ? week.contributionDays
      : [];
    const daysByWeekday = new Map(
      contributionDays
        .filter((day) => Number.isInteger(day?.weekday))
        .map((day) => [day.weekday, day]),
    );

    for (let row = 0; row < ROWS; row += 1) {
      const day = daysByWeekday.get(row);
      cells.push({
        column,
        row,
        count: normalizeCount(day?.contributionCount),
        date: isIsoDate(day?.date) ? day.date : null,
      });
    }
  }
  return cells;
}

export function selectTargets(cells, limit = MAX_TARGETS) {
  const safeLimit = Math.max(0, Math.min(36, Math.floor(Number(limit) || 0)));
  return [...cells]
    .filter((cell) => cell.count > 0 && isIsoDate(cell.date))
    .sort(
      (left, right) =>
        right.count - left.count ||
        String(right.date).localeCompare(String(left.date)),
    )
    .slice(0, safeLimit)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthFromOffset(anchor, offset) {
  return new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + offset, 1),
  );
}

export function aggregateMonths(cells) {
  const datedCells = cells.filter((cell) => isIsoDate(cell.date));
  const latestDate = datedCells
    .map((cell) => cell.date)
    .sort()
    .at(-1);
  const anchor = latestDate
    ? new Date(`${latestDate}T00:00:00Z`)
    : new Date();

  const months = Array.from({ length: 12 }, (_, index) => {
    const date = monthFromOffset(anchor, index - 11);
    return {
      key: monthKey(date),
      label: MONTH_NAMES[date.getUTCMonth()],
      year: date.getUTCFullYear(),
      contributions: 0,
      activeDays: 0,
    };
  });
  const monthsByKey = new Map(months.map((month) => [month.key, month]));

  for (const cell of datedCells) {
    const month = monthsByKey.get(cell.date.slice(0, 7));
    if (!month) continue;
    month.contributions += cell.count;
    if (cell.count > 0) month.activeDays += 1;
  }

  return months;
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

function trackY(ratio) {
  return (
    TRACK_BASE_Y +
    Math.sin(ratio * Math.PI * 3.2) * 28 +
    Math.sin(ratio * Math.PI * 7) * 8
  );
}

function trackPoint(ratio) {
  return {
    x: TRACK_START_X + ratio * TRACK_WIDTH,
    y: trackY(ratio),
  };
}

function buildTrackPath() {
  return Array.from({ length: 81 }, (_, index) => {
    const ratio = index / 80;
    const point = trackPoint(ratio);
    return `${index === 0 ? "M" : "L"} ${round(point.x)} ${round(point.y)}`;
  }).join(" ");
}

function colorForCount(count, maximum) {
  if (count === 0) return "#30363D";
  const intensity = Math.log1p(count) / Math.log1p(Math.max(1, maximum));
  if (intensity < 0.34) return "#22D3EE";
  if (intensity < 0.67) return "#8B5CF6";
  return "#39D353";
}

function renderStars() {
  return Array.from({ length: 46 }, (_, index) => {
    const x = 18 + ((index * 137) % (WIDTH - 36));
    const y = 48 + ((index * 61) % 138);
    const duration = 1.4 + (index % 6) * 0.31;
    return `<circle cx="${x}" cy="${y}" r="${index % 5 === 0 ? 1.25 : 0.7}" fill="#8B949E">
  <animate attributeName="opacity" values="0.12;0.72;0.12" dur="${duration.toFixed(2)}s" begin="${(index % 8) * -0.19}s" repeatCount="indefinite"/>
</circle>`;
  }).join("\n");
}

function renderMonthMarkers(months) {
  const maximum = Math.max(1, ...months.map((month) => month.contributions));

  return months
    .map((month, index) => {
      const ratio = months.length === 1 ? 0.5 : index / (months.length - 1);
      const point = trackPoint(ratio);
      const color = colorForCount(month.contributions, maximum);
      const intensity =
        month.contributions > 0
          ? Math.log1p(month.contributions) / Math.log1p(maximum)
          : 0;
      const radius = round(4 + intensity * 4);
      const title = `${formatNumber(month.contributions)} contribuições públicas em ${month.label} ${month.year}`;

      return `<g>
  <title>${escapeXml(title)}</title>
  <line x1="${round(point.x)}" y1="${round(point.y + 12)}" x2="${round(point.x)}" y2="218" stroke="#30363D" stroke-width="1" stroke-dasharray="2 5"/>
  <circle cx="${round(point.x)}" cy="${round(point.y)}" r="${radius + 5}" fill="none" stroke="${color}" opacity="${month.contributions > 0 ? "0.34" : "0.12"}">
    <animate attributeName="r" values="${radius + 3};${radius + 7};${radius + 3}" dur="${(2.4 + index * 0.08).toFixed(2)}s" begin="${(index * -0.17).toFixed(2)}s" repeatCount="indefinite"/>
  </circle>
  <circle cx="${round(point.x)}" cy="${round(point.y)}" r="${radius}" fill="${color}" filter="${month.contributions > 0 ? "url(#orbGlow)" : "none"}"/>
  <text x="${round(point.x)}" y="236" text-anchor="middle" class="month">${month.label}</text>
</g>`;
    })
    .join("\n");
}

function renderTargets(targets) {
  const maximum = Math.max(1, ...targets.map((target) => target.count));

  return targets
    .map((target, index) => {
      const ordinal = target.column * ROWS + target.row;
      const ratio = ordinal / (COLS * ROWS - 1);
      const point = trackPoint(ratio);
      const yOffset = ((target.row + index) % 3 - 1) * 11;
      const y = point.y + yOffset;
      const color = colorForCount(target.count, maximum);
      const radius = round(3.2 + Math.log1p(target.count) * 0.8);
      const impact = 0.055 + ratio * 0.86;
      const fade = Math.min(0.965, impact + 0.025);
      const title = `${formatNumber(target.count)} contribuições em ${target.date}`;

      return `<g>
  <title>${escapeXml(title)}</title>
  <circle cx="${round(point.x)}" cy="${round(y)}" r="${radius + 5}" fill="${color}" opacity="0.12">
    <animate attributeName="opacity" dur="${LOOP_SECONDS}s" repeatCount="indefinite"
      keyTimes="0;${round(impact)};${round(fade)};0.98;1"
      values="0.12;0.35;0;0;0.12"/>
  </circle>
  <path d="M ${round(point.x - radius)} ${round(y)} H ${round(point.x + radius)} M ${round(point.x)} ${round(y - radius)} V ${round(y + radius)}"
    stroke="${color}" stroke-width="2" stroke-linecap="round" filter="url(#orbGlow)">
    <animate attributeName="opacity" dur="${LOOP_SECONDS}s" repeatCount="indefinite"
      keyTimes="0;${round(impact)};${round(fade)};0.98;1"
      values="1;1;0;0;1"/>
  </path>
</g>`;
    })
    .join("\n");
}

function renderShip(trackPath) {
  return `<g filter="url(#shipGlow)">
  <animateMotion dur="${LOOP_SECONDS}s" repeatCount="indefinite" rotate="auto" path="${trackPath}"/>
  <path d="M16 0 L-9 -9 L-5 -2 L-14 0 L-5 2 L-9 9 Z" fill="#58A6FF" stroke="#A5D6FF" stroke-width="1"/>
  <path d="M-7 -7 L-14 -12 L-11 -3 Z M-7 7 L-14 12 L-11 3 Z" fill="#8B5CF6"/>
  <circle cx="4" cy="0" r="2.5" fill="#E6EDF3"/>
  <path d="M-14 -3 L-24 0 L-14 3 Z" fill="#F0883E">
    <animate attributeName="opacity" values="0.45;1;0.55;1" dur="0.18s" repeatCount="indefinite"/>
  </path>
</g>`;
}

export function buildSvg({ username, totalContributions, weeks }) {
  const safeUsername = validateUsername(username);
  const cells = normalizeCells(weeks);
  const targets = selectTargets(cells);
  const months = aggregateMonths(cells);
  const trackPath = buildTrackPath();
  const contributionSum = cells.reduce((sum, cell) => sum + cell.count, 0);
  const normalizedTotal = normalizeCount(totalContributions);
  const score = normalizedTotal || contributionSum;
  const firstMonth = months[0];
  const lastMonth = months.at(-1);
  const dateRange =
    firstMonth.year === lastMonth.year
      ? `${firstMonth.label} — ${lastMonth.label} ${lastMonth.year}`
      : `${firstMonth.label} ${firstMonth.year} — ${lastMonth.label} ${lastMonth.year}`;
  const scoreLabel = score > 0 ? `PUBLIC XP ${formatNumber(score)}` : "PUBLIC XP SYNCING";
  const emptyState =
    targets.length === 0
      ? '<text x="500" y="178" text-anchor="middle" class="empty">AGUARDANDO ATIVIDADE PÚBLICA</text>'
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="title desc" data-game="commit-runner">
  <title id="title">Commit Runner de ${escapeXml(safeUsername)}</title>
  <desc id="desc">Uma nave percorre uma rota espacial criada com as contribuições públicas de ${escapeXml(safeUsername)} nos últimos doze meses.</desc>
  <defs>
    <linearGradient id="gameBackground" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#050816"/>
      <stop offset="0.52" stop-color="#0D1117"/>
      <stop offset="1" stop-color="#07131D"/>
    </linearGradient>
    <linearGradient id="border" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22D3EE"/>
      <stop offset="0.52" stop-color="#8B5CF6"/>
      <stop offset="1" stop-color="#39D353"/>
    </linearGradient>
    <linearGradient id="trackGradient" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#22D3EE"/>
      <stop offset="0.5" stop-color="#8B5CF6"/>
      <stop offset="1" stop-color="#39D353"/>
    </linearGradient>
    <filter id="shipGlow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="orbGlow" x="-140%" y="-140%" width="380%" height="380%">
      <feGaussianBlur stdDeviation="2.2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <style>
      .eyebrow { font: 700 12px "Courier New", Consolas, monospace; letter-spacing: 1.7px; fill: #22D3EE; }
      .meta { font: 11px "Courier New", Consolas, monospace; fill: #8B949E; }
      .score { font: 700 12px "Courier New", Consolas, monospace; fill: #7EE787; }
      .month { font: 700 10px "Courier New", Consolas, monospace; fill: #8B949E; letter-spacing: 0.8px; }
      .empty { font: 11px "Courier New", Consolas, monospace; fill: #6E7681; letter-spacing: 1.2px; }
    </style>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" rx="18" fill="url(#gameBackground)"/>
  ${renderStars()}

  <text x="26" y="30" class="eyebrow">COMMIT RUNNER // ${escapeXml(dateRange)}</text>
  <circle cx="778" cy="26" r="4" fill="#39D353">
    <animate attributeName="opacity" values="1;0.2;1" dur="1.1s" repeatCount="indefinite"/>
  </circle>
  <text x="790" y="30" class="meta">AUTO PLAY</text>
  <text x="974" y="30" text-anchor="end" class="score">${escapeXml(scoreLabel)}</text>
  <line x1="26" y1="43" x2="974" y2="43" stroke="#21262D"/>

  <path d="${trackPath}" fill="none" stroke="#161B22" stroke-width="10" stroke-linecap="round"/>
  <path d="${trackPath}" fill="none" stroke="url(#trackGradient)" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 8" opacity="0.72">
    <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="2.2s" repeatCount="indefinite"/>
  </path>

  <g id="month-orbits">
${renderMonthMarkers(months)}
  </g>
  <g id="public-contribution-energy">
${renderTargets(targets)}
  </g>
${emptyState}
  ${renderShip(trackPath)}

  <text x="26" y="258" class="meta">@${escapeXml(safeUsername)} · CONTRIBUIÇÕES PÚBLICAS · ATUALIZAÇÃO DIÁRIA</text>
  <text x="974" y="258" text-anchor="end" class="meta">PRIVATE ACTIVITY STAYS PRIVATE</text>
  <rect x="2" y="2" width="${WIDTH - 4}" height="${HEIGHT - 4}" rx="16" fill="none" stroke="url(#border)" stroke-width="2" opacity="0.72">
    <animate attributeName="opacity" values="0.42;0.88;0.42" dur="3.6s" repeatCount="indefinite"/>
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
