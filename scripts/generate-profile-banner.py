#!/usr/bin/env python3
"""Generate the animated terminal banners used by the profile README."""

from __future__ import annotations

import argparse
import html
from pathlib import Path
from typing import Final

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_PORTRAIT: Final = ROOT / "assets" / "profile-avatar-source.png"
PORTRAIT_WIDTH: Final = 470
PORTRAIT_HEIGHT: Final = 410

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


def portrait_to_scanline_paths(
    path: Path,
    width: int = PORTRAIT_WIDTH,
    height: int = PORTRAIT_HEIGHT,
) -> str:
    """Convert the GitHub avatar into CSP-safe vector scanlines."""

    with Image.open(path) as source:
        grayscale = ImageOps.exif_transpose(source).convert("L")
        source_width, source_height = grayscale.size
        grayscale = grayscale.crop(
            (
                round(source_width * 0.04),
                0,
                round(source_width * 0.98),
                round(source_height * 0.80),
            )
        )
        crop_width, crop_height = grayscale.size

        subject_mask = Image.new("L", grayscale.size, 0)
        subject_draw = ImageDraw.Draw(subject_mask)

        def point(x: float, y: float) -> tuple[int, int]:
            return round(crop_width * x), round(crop_height * y)

        subject_draw.polygon(
            tuple(
                point(x, y)
                for x, y in (
                    (0.23, 0.18),
                    (0.31, 0.06),
                    (0.42, 0.02),
                    (0.60, 0.03),
                    (0.70, 0.10),
                    (0.74, 0.22),
                    (0.79, 0.35),
                    (0.77, 0.49),
                    (0.70, 0.62),
                    (0.59, 0.69),
                    (0.45, 0.66),
                    (0.34, 0.58),
                    (0.27, 0.46),
                    (0.23, 0.32),
                )
            ),
            fill=255,
        )
        subject_draw.polygon(
            tuple(
                point(x, y)
                for x, y in (
                    (0.22, 0.55),
                    (0.39, 0.61),
                    (0.63, 0.58),
                    (0.77, 0.60),
                    (0.90, 0.72),
                    (1.00, 1.00),
                    (0.00, 1.00),
                    (0.03, 0.80),
                    (0.10, 0.67),
                )
            ),
            fill=255,
        )
        subject_mask = subject_mask.filter(
            ImageFilter.GaussianBlur(max(crop_width, crop_height) * 0.006)
        )

        grayscale = grayscale.resize(
            (width, height),
            resample=Image.Resampling.LANCZOS,
        )
        subject_mask = subject_mask.resize(
            (width, height),
            resample=Image.Resampling.LANCZOS,
        )
        grayscale = ImageOps.autocontrast(grayscale, cutoff=1)
        grayscale = ImageEnhance.Contrast(grayscale).enhance(1.22)
        grayscale = grayscale.filter(
            ImageFilter.UnsharpMask(radius=1.4, percent=170, threshold=2)
        )

        density = ImageOps.invert(grayscale)
        edges = grayscale.filter(ImageFilter.FIND_EDGES)
        edges = ImageOps.autocontrast(edges, cutoff=1)
        edges = ImageEnhance.Contrast(edges).enhance(2.3)
        edges = edges.point(
            lambda value: 0 if value < 28 else min(255, (value - 28) * 3)
        )
        density = density.point(lambda value: round(value * 0.86))
        density = ImageChops.lighter(density, edges)
        subject_floor = subject_mask.point(
            lambda value: round(value * 0.14)
        )
        density = ImageChops.lighter(density, subject_floor)
        alpha = ImageChops.multiply(density, subject_mask)
        alpha = alpha.filter(ImageFilter.GaussianBlur(0.22))
        alpha_pixels = alpha.load()

    opacities = (0.22, 0.34, 0.50, 0.72, 0.96)
    thresholds = (20, 55, 95, 145, 200)
    commands: list[list[str]] = [[] for _ in opacities]

    def density_level(value: int) -> int | None:
        selected: int | None = None
        for index, threshold in enumerate(thresholds):
            if value < threshold:
                break
            selected = index
        return selected

    x_step = 2
    y_step = 4
    for y in range(1, height, y_step):
        current_level: int | None = None
        run_start = 0
        for x in range(0, width, x_step):
            sample = max(
                alpha_pixels[x, y],
                alpha_pixels[min(x + 1, width - 1), y],
                alpha_pixels[x, min(y + 1, height - 1)],
            )
            level = density_level(sample)
            if level == current_level:
                continue
            if current_level is not None:
                commands[current_level].append(
                    f"M{run_start} {y}h{x - run_start}"
                )
            current_level = level
            run_start = x
        if current_level is not None:
            commands[current_level].append(
                f"M{run_start} {y}h{width - run_start}"
            )

    paths: list[str] = []
    for opacity, path_commands in zip(opacities, commands, strict=True):
        if not path_commands:
            continue
        paths.append(
            f'<path d="{"".join(path_commands)}" '
            'fill="none" stroke="url(#portrait-neon)" '
            f'stroke-width="1.45" stroke-linecap="round" opacity="{opacity}"/>'
        )
    return "".join(paths)


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


def build_svg(theme_name: str, portrait_paths: str) -> str:
    theme = THEMES[theme_name]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="560" viewBox="0 0 1180 560" role="img" aria-labelledby="title desc">
  <title id="title">Perfil de Almir Neto em um terminal animado</title>
  <desc id="desc">Foto de perfil de Almir Neto convertida em linhas neon e informações profissionais em um terminal.</desc>
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
    <filter id="portrait-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.7" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="portrait-clip">
      <rect x="34" y="94" width="470" height="410" rx="12"/>
    </clipPath>
    <mask id="portrait-reveal">
      <rect x="0" y="0" width="520" height="470" fill="white">
        <animate attributeName="height" values="0;0;470" keyTimes="0;0.06;1" dur="2.55s" begin="0s" fill="freeze"/>
      </rect>
    </mask>
    <g id="portrait-lines">{portrait_paths}</g>
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

  <g mask="url(#portrait-reveal)" clip-path="url(#portrait-clip)" filter="url(#portrait-glow)">
    <use href="#portrait-lines" x="34" y="94">
      <animate attributeName="opacity" values="0.78;1;0.86;1;0.78" dur="3.8s" repeatCount="indefinite"/>
    </use>
    <use href="#portrait-lines" x="34" y="94" opacity="0.13">
      <animateTransform attributeName="transform" type="translate" values="2 0;0 0;3 0;0 0;2 0" dur="0.72s" repeatCount="indefinite"/>
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
    portrait_paths = portrait_to_scanline_paths(portrait)

    for theme_name in THEMES:
        output = output_dir / f"profile-terminal-avatar-{theme_name}.svg"
        output.write_text(
            build_svg(theme_name, portrait_paths),
            encoding="utf-8",
        )
        print(f"Generated {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
