#!/usr/bin/env python3
"""Generate the animated terminal banners used by the profile README."""

from __future__ import annotations

import argparse
import html
from pathlib import Path
from typing import Final

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_PORTRAIT: Final = ROOT / "assets" / "profile-avatar-source.png"
DOT_GRID_SIZE: Final = 106
DOT_CANVAS_SIZE: Final = 410
DOT_PALETTE: Final = (
    "#0D2638",
    "#12384D",
    "#174E66",
    "#166A82",
    "#1687A2",
    "#21ABC4",
    "#5FD3E4",
    "#D7F6FA",
)
DOT_RADII: Final = (0.62, 0.72, 0.82, 0.94, 1.06, 1.18, 1.30, 1.42)

THEMES: Final = {
    "dark": {
        "background": "#050816",
        "panel": "#0B1120",
        "visual_panel": "#07111F",
        "panel_opacity": "0.56",
        "text": "#E2E8F0",
        "muted": "#64748B",
        "line": "#1E293B",
        "cyan": "#22D3EE",
        "purple": "#8B5CF6",
        "portrait_cyan": "#22D3EE",
        "portrait_purple": "#8B5CF6",
        "green": "#10B981",
        "scan": "#67E8F9",
    },
    "light": {
        "background": "#F8FAFC",
        "panel": "#FFFFFF",
        "visual_panel": "#07111F",
        "panel_opacity": "0.82",
        "text": "#0F172A",
        "muted": "#64748B",
        "line": "#CBD5E1",
        "cyan": "#0891B2",
        "purple": "#7C3AED",
        "portrait_cyan": "#22D3EE",
        "portrait_purple": "#A78BFA",
        "green": "#059669",
        "scan": "#06B6D4",
    },
}

PROFILE_LINES: Final = (
    ("section", "SYSTEM.INFO", ""),
    ("field", "Subject", "Almir Pereira Duarte Neto"),
    ("field", "Role", "Backend Developer · Ciência da Computação"),
    ("field", "Location", "Ubá · MG · Brasil"),
    ("field", "Status", "Building · Learning · Shipping"),
    ("spacer", "", ""),
    ("section", "CORE.STACK", ""),
    ("field", "Language", "Go · JavaScript · Python"),
    ("field", "Backend", "Node.js · FastAPI · REST APIs"),
    ("field", "Education", "UNIFAGOC · Alura"),
    ("field", "Tools", "Git · GitHub · Swagger"),
    ("spacer", "", ""),
    ("section", "CONTACT.LINKS", ""),
    ("field", "Website", "almirneto.com"),
    ("field", "GitHub", "@almirneto5"),
    ("spacer", "", ""),
    ("ready", "SYSTEM", "Ready. Open to challenges."),
)


def portrait_to_dot_matrix(
    path: Path,
    grid_size: int = DOT_GRID_SIZE,
    canvas_size: int = DOT_CANVAS_SIZE,
) -> str:
    """Rebuild the complete GitHub avatar as crisp vector dots."""

    with Image.open(path) as source:
        grayscale = ImageOps.fit(
            ImageOps.exif_transpose(source).convert("L"),
            (grid_size, grid_size),
            method=Image.Resampling.LANCZOS,
        )
        grayscale = ImageOps.autocontrast(grayscale, cutoff=1)
        grayscale = ImageEnhance.Contrast(grayscale).enhance(1.08)
        grayscale = grayscale.filter(
            ImageFilter.UnsharpMask(radius=0.65, percent=125, threshold=1)
        )
        pixels = list(grayscale.get_flattened_data())

    spacing = canvas_size / grid_size
    dots_by_level: list[list[str]] = [[] for _ in DOT_PALETTE]
    max_level = len(DOT_PALETTE) - 1
    for row in range(grid_size):
        cy = (row + 0.5) * spacing
        row_offset = row * grid_size
        for column in range(grid_size):
            luminance = pixels[row_offset + column] / 255
            level = min(max_level, round((luminance**0.55) * max_level))
            cx = (column + 0.5) * spacing
            dots_by_level[level].append(
                f'<circle cx="{cx:.2f}" cy="{cy:.2f}" '
                f'r="{DOT_RADII[level]:.2f}"/>'
            )

    groups: list[str] = []
    for color, dots in zip(DOT_PALETTE, dots_by_level, strict=True):
        groups.append(f'<g fill="{color}">{"".join(dots)}</g>')
    return "".join(groups)


def line_clip_paths() -> str:
    clips: list[str] = []
    for index, _ in enumerate(PROFILE_LINES):
        begin = 0.62 + index * 0.115
        duration = begin + 0.42
        hold = begin / duration
        clips.append(
            f'<clipPath id="line-{index}">'
            f'<rect x="548" y="{87 + index * 24}" width="600" height="23">'
            f'<animate attributeName="width" values="0;0;600" '
            f'keyTimes="0;{hold:.4f};1" dur="{duration:.2f}s" begin="0s" fill="freeze"/>'
            "</rect></clipPath>"
        )
    return "".join(clips)


def render_profile_lines(theme: dict[str, str]) -> str:
    lines: list[str] = []
    for index, (kind, label, value) in enumerate(PROFILE_LINES):
        y = 104 + index * 24
        clip = f'clip-path="url(#line-{index})"'
        if kind == "spacer":
            continue
        if kind == "section":
            lines.append(
                f'<g {clip}><text x="548" y="{y}" class="section">{html.escape(label)}</text>'
                f'<line x1="665" y1="{y - 5}" x2="1138" y2="{y - 5}" '
                f'stroke="{theme["line"]}" stroke-width="1"/></g>'
            )
            continue

        label_class = "ready-label" if kind == "ready" else "key"
        value_class = "ready-value" if kind == "ready" else "value"
        lines.append(
            f'<g {clip}><text x="548" y="{y}">'
            f'<tspan class="{label_class}">{html.escape(label):<10}</tspan>'
            f'<tspan class="dots">  ··········  </tspan>'
            f'<tspan class="{value_class}">{html.escape(value)}</tspan>'
            "</text></g>"
        )
    return "".join(lines)


def build_svg(theme_name: str, portrait_dots: str) -> str:
    theme = THEMES[theme_name]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="560" viewBox="0 0 1180 560" role="img" aria-labelledby="title desc">
  <title id="title">Perfil de Almir Neto em um terminal animado</title>
  <desc id="desc">Foto de perfil de Almir Neto reconstruída por pontos claros e escuros em um terminal.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{theme["background"]}"/>
      <stop offset="0.55" stop-color="{theme["panel"]}"/>
      <stop offset="1" stop-color="{theme["background"]}"/>
    </linearGradient>
    <linearGradient id="neon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{theme["cyan"]}">
        <animate attributeName="stop-color" values="{theme["cyan"]};{theme["purple"]};{theme["green"]};{theme["cyan"]}" dur="8s" repeatCount="indefinite"/>
      </stop>
      <stop offset="1" stop-color="{theme["purple"]}">
        <animate attributeName="stop-color" values="{theme["purple"]};{theme["green"]};{theme["cyan"]};{theme["purple"]}" dur="8s" repeatCount="indefinite"/>
      </stop>
    </linearGradient>
    <linearGradient id="portrait-neon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{theme["portrait_cyan"]}">
        <animate attributeName="stop-color" values="{theme["portrait_cyan"]};{theme["portrait_purple"]};{theme["portrait_cyan"]}" dur="6.4s" repeatCount="indefinite"/>
      </stop>
      <stop offset="1" stop-color="{theme["portrait_purple"]}">
        <animate attributeName="stop-color" values="{theme["portrait_purple"]};{theme["portrait_cyan"]};{theme["portrait_purple"]}" dur="6.4s" repeatCount="indefinite"/>
      </stop>
    </linearGradient>
    <linearGradient id="scan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{theme["scan"]}" stop-opacity="0"/>
      <stop offset="0.46" stop-color="{theme["scan"]}" stop-opacity="0.02"/>
      <stop offset="0.5" stop-color="{theme["scan"]}" stop-opacity="0.32"/>
      <stop offset="0.54" stop-color="{theme["scan"]}" stop-opacity="0.02"/>
      <stop offset="1" stop-color="{theme["scan"]}" stop-opacity="0"/>
    </linearGradient>
    <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="1" fill="{theme["cyan"]}" opacity="0.035"/>
    </pattern>
    <clipPath id="portrait-clip">
      <rect x="34" y="94" width="470" height="410" rx="12"/>
    </clipPath>
    <mask id="portrait-reveal" maskUnits="userSpaceOnUse" x="34" y="94" width="470" height="410">
      <rect x="34" y="94" width="470" height="410" fill="white">
        <animate attributeName="height" values="0;0;410" keyTimes="0;0.06;1" dur="2.55s" begin="0s" fill="freeze"/>
      </rect>
    </mask>
    <g id="portrait-dots">{portrait_dots}</g>
    {line_clip_paths()}
    <style>
      text, tspan {{ white-space: pre; }}
      .terminal {{ font: 12px "Courier New", Consolas, monospace; fill: {theme["muted"]}; }}
      .panel-title {{ font: 700 11px "Courier New", Consolas, monospace; fill: {theme["cyan"]}; letter-spacing: 2px; }}
      .visual-title {{ font: 700 11px "Courier New", Consolas, monospace; fill: {theme["portrait_cyan"]}; letter-spacing: 2px; }}
      .section {{ font: 700 12px "Courier New", Consolas, monospace; fill: {theme["purple"]}; letter-spacing: 1.4px; }}
      .key {{ font: 700 14px "Courier New", Consolas, monospace; fill: {theme["cyan"]}; }}
      .value {{ font: 14px "Courier New", Consolas, monospace; fill: {theme["text"]}; }}
      .dots {{ font: 14px "Courier New", Consolas, monospace; fill: {theme["muted"]}; opacity: 0.72; }}
      .ready-label {{ font: 700 14px "Courier New", Consolas, monospace; fill: {theme["green"]}; }}
      .ready-value {{ font: 700 14px "Courier New", Consolas, monospace; fill: {theme["green"]}; }}
    </style>
  </defs>

  <rect width="1180" height="560" rx="18" fill="url(#background)"/>
  <rect width="1180" height="560" rx="18" fill="url(#scanlines)"/>

  <g>
    <rect x="3" y="3" width="1174" height="38" rx="15" fill="{theme["panel"]}" opacity="0.9"/>
    <circle cx="24" cy="21" r="5" fill="#EF4444"/>
    <circle cx="43" cy="21" r="5" fill="#F59E0B"/>
    <circle cx="62" cy="21" r="5" fill="#10B981"/>
    <text x="590" y="26" text-anchor="middle" class="terminal">almir@github ~ % ./profile --live</text>
    <circle cx="1087" cy="21" r="4" fill="{theme["green"]}">
      <animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/>
    </circle>
    <text x="1098" y="25" class="terminal">ONLINE</text>
  </g>

  <rect x="16" y="58" width="506" height="476" rx="14" fill="{theme["visual_panel"]}" stroke="{theme["portrait_cyan"]}" stroke-opacity="0.18"/>
  <rect x="530" y="58" width="634" height="476" rx="14" fill="{theme["panel"]}" opacity="{theme["panel_opacity"]}" stroke="{theme["line"]}"/>
  <text x="34" y="79" class="visual-title">PROFILE.PICTURE // LIVE</text>
  <text x="548" y="79" class="panel-title">PROFILE.DATA</text>

  <g mask="url(#portrait-reveal)" clip-path="url(#portrait-clip)">
    <use href="#portrait-dots" x="64" y="94">
      <animate attributeName="opacity" values="0.92;1;0.96;1;0.92" dur="3.8s" repeatCount="indefinite"/>
    </use>
  </g>
  <rect x="34" y="94" width="470" height="410" rx="12" fill="none" stroke="url(#portrait-neon)" stroke-width="1.5" opacity="0.62"/>
  {render_profile_lines(theme)}

  <rect x="548" y="505" width="9" height="17" rx="1" fill="{theme["cyan"]}" opacity="0">
    <animate attributeName="opacity" values="0;1;0;1;0" dur="1.1s" begin="2.7s" repeatCount="indefinite"/>
  </rect>

  <rect x="0" y="-85" width="1180" height="85" fill="url(#scan)" opacity="0.75">
    <animateTransform attributeName="transform" type="translate" from="0 0" to="0 650" dur="4.6s" repeatCount="indefinite"/>
  </rect>

  <rect x="3" y="3" width="1174" height="554" rx="16" fill="none" stroke="url(#neon)" stroke-width="2" opacity="0.75">
    <animate attributeName="opacity" values="0.45;0.9;0.45" dur="3.4s" repeatCount="indefinite"/>
  </rect>
</svg>
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--portrait",
        "--avatar",
        dest="portrait",
        type=Path,
        default=DEFAULT_PORTRAIT,
    )
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets")
    args = parser.parse_args()

    portrait = args.portrait.resolve()
    if not portrait.is_file():
        raise SystemExit(f"Portrait not found: {portrait}")

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    portrait_dots = portrait_to_dot_matrix(portrait)

    for theme_name in THEMES:
        output = output_dir / f"profile-terminal-london-dots-{theme_name}.svg"
        output.write_text(
            build_svg(theme_name, portrait_dots),
            encoding="utf-8",
        )
        print(f"Generated {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
