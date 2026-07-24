#!/usr/bin/env python3
"""Generate the animated holographic portrait used by the profile banner."""

from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Final

from PIL import (
    Image,
    ImageColor,
    ImageDraw,
    ImageEnhance,
    ImageFilter,
    ImageFont,
    ImageOps,
)


ROOT: Final = Path(__file__).resolve().parents[1]
ASSETS: Final = ROOT / "assets"
PORTRAIT_PATH: Final = ASSETS / "portrait-london.png"
PHOTO_ORIGIN: Final = (34, 94)
PHOTO_SIZE: Final = (470, 410)
PHOTO_RADIUS: Final = 12

THEMES: Final = {
    "dark": {
        "accent": "#22D3EE",
        "secondary": "#8B5CF6",
        "edge_dark": "#06111F",
        "label_background": "#050816",
        "label_text": "#E2E8F0",
    },
    "light": {
        "accent": "#0891B2",
        "secondary": "#7C3AED",
        "edge_dark": "#071827",
        "label_background": "#FFFFFF",
        "label_text": "#0F172A",
    },
}


def load_font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    """Use a local monospace font when available and keep a portable fallback."""

    candidates = (
        Path("C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf")
        if bold
        else Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def build_rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size[0] - 1, size[1] - 1),
        radius=radius,
        fill=255,
    )
    return mask


def build_hologram(portrait: Image.Image, accent: str) -> Image.Image:
    """Create a cyan digital version without destroying recognizable features."""

    grayscale = ImageOps.autocontrast(ImageOps.grayscale(portrait), cutoff=1)
    grayscale = ImageEnhance.Contrast(grayscale).enhance(1.28)
    hologram = ImageOps.colorize(
        grayscale,
        black="#020817",
        white=accent,
    ).convert("RGBA")

    edges = grayscale.filter(ImageFilter.FIND_EDGES)
    edges = ImageEnhance.Contrast(edges).enhance(2.4)
    edge_alpha = edges.point(lambda value: max(0, min(150, (value - 26) * 3)))
    edge_layer = Image.new("RGBA", portrait.size, ImageColor.getrgb(accent) + (0,))
    edge_layer.putalpha(edge_alpha)
    hologram = Image.alpha_composite(hologram, edge_layer)

    scanlines = Image.new("RGBA", portrait.size, (0, 0, 0, 0))
    scanline_draw = ImageDraw.Draw(scanlines)
    for y in range(1, portrait.height, 4):
        scanline_draw.line((0, y, portrait.width, y), fill=(2, 8, 23, 66), width=1)
    return Image.alpha_composite(hologram, scanlines)


def build_band_mask(width: int, height: int, center_x: float) -> Image.Image:
    half_width = 74
    values: list[int] = []
    for x in range(width):
        distance = abs(x - center_x)
        strength = max(0.0, 1.0 - distance / half_width)
        values.append(round((strength**1.65) * 232))

    row = Image.new("L", (width, 1))
    row.putdata(values)
    return row.resize((width, height))


def draw_scanner_effect(
    portrait: Image.Image,
    hologram: Image.Image,
    frame_index: int,
    frame_count: int,
    theme: dict[str, str],
) -> Image.Image:
    width, height = portrait.size
    phase = frame_index / frame_count
    travel = 0.5 - 0.5 * math.cos(phase * math.tau)
    scanner_x = -58 + travel * (width + 116)
    accent_rgb = ImageColor.getrgb(theme["accent"])
    secondary_rgb = ImageColor.getrgb(theme["secondary"])

    frame = Image.composite(
        hologram,
        portrait.convert("RGBA"),
        build_band_mask(width, height, scanner_x),
    )

    overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    scanner_position = round(scanner_x)

    glow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.rectangle(
        (scanner_position - 16, 0, scanner_position + 16, height),
        fill=accent_rgb + (70,),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(14))
    overlay = Image.alpha_composite(overlay, glow)
    draw = ImageDraw.Draw(overlay)
    draw.line(
        (scanner_position, 0, scanner_position, height),
        fill=accent_rgb + (230,),
        width=2,
    )
    draw.line(
        (scanner_position + 3, 0, scanner_position + 3, height),
        fill=secondary_rgb + (105,),
        width=1,
    )

    # Deterministic digital fragments follow the scanner without obscuring the face.
    for index in range(13):
        fragment_x = scanner_position + ((index * 37 + frame_index * 11) % 70) - 35
        fragment_y = (index * 67 + frame_index * 19) % height
        fragment_width = 2 + (index % 3) * 2
        draw.rectangle(
            (
                fragment_x,
                fragment_y,
                fragment_x + fragment_width,
                fragment_y + 2,
            ),
            fill=accent_rgb + (105 + (index % 3) * 32,),
        )

    # Small RGB split bands give motion without turning the portrait into a blur.
    split_source = Image.alpha_composite(frame, overlay)
    for index, color in enumerate((accent_rgb, secondary_rgb)):
        band_y = (frame_index * (17 + index * 6) + 92 + index * 113) % (height - 8)
        band = split_source.crop((0, band_y, width, band_y + 4))
        tint = Image.new("RGBA", band.size, color + (0,))
        tint.putalpha(50)
        band = Image.alpha_composite(band, tint)
        split_source.alpha_composite(band, (4 if index == 0 else -4, band_y))

    overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    pulse = 150 + round((0.5 + 0.5 * math.sin(phase * math.tau * 2)) * 90)

    # Face-tracking HUD corners.
    left, top, right, bottom = 190, 42, 318, 176
    bracket = 20
    lines = (
        (left, top, left + bracket, top),
        (left, top, left, top + bracket),
        (right - bracket, top, right, top),
        (right, top, right, top + bracket),
        (left, bottom, left + bracket, bottom),
        (left, bottom - bracket, left, bottom),
        (right - bracket, bottom, right, bottom),
        (right, bottom - bracket, right, bottom),
    )
    for coordinates in lines:
        draw.line(coordinates, fill=accent_rgb + (pulse,), width=2)

    label_font = load_font(11, bold=True)
    draw.rounded_rectangle((13, 12, 190, 35), radius=5, fill=(2, 8, 23, 178))
    draw.ellipse((21, 20, 27, 26), fill=accent_rgb + (235,))
    draw.text(
        (34, 17),
        "IDENTITY_SCAN // LIVE",
        font=label_font,
        fill=(226, 232, 240, 238),
    )

    # Preserve the location label from the original banner.
    draw.rounded_rectangle((13, 370, 144, 396), radius=6, fill=(2, 8, 23, 190))
    draw.text(
        (24, 378),
        "LONDON · 2026",
        font=label_font,
        fill=(248, 250, 252, 245),
    )

    return Image.alpha_composite(split_source, overlay)


def build_frames(
    base: Image.Image,
    portrait: Image.Image,
    theme: dict[str, str],
    frame_count: int,
) -> list[Image.Image]:
    rounded_mask = build_rounded_mask(PHOTO_SIZE, PHOTO_RADIUS)
    hologram = build_hologram(portrait, theme["accent"])
    frames: list[Image.Image] = []

    for frame_index in range(frame_count):
        photo_frame = draw_scanner_effect(
            portrait,
            hologram,
            frame_index,
            frame_count,
            theme,
        )
        banner = base.convert("RGBA")
        banner.paste(photo_frame, PHOTO_ORIGIN, rounded_mask)

        banner_overlay = Image.new("RGBA", banner.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(banner_overlay)
        accent_rgb = ImageColor.getrgb(theme["accent"])
        pulse = 105 + round(
            (0.5 + 0.5 * math.sin((frame_index / frame_count) * math.tau * 2))
            * 90
        )
        draw.rounded_rectangle(
            (
                PHOTO_ORIGIN[0],
                PHOTO_ORIGIN[1],
                PHOTO_ORIGIN[0] + PHOTO_SIZE[0] - 1,
                PHOTO_ORIGIN[1] + PHOTO_SIZE[1] - 1,
            ),
            radius=PHOTO_RADIUS,
            outline=accent_rgb + (pulse,),
            width=2,
        )
        frames.append(Image.alpha_composite(banner, banner_overlay).convert("RGB"))

    return frames


def generate_theme(
    theme_name: str,
    portrait: Image.Image,
    *,
    frame_count: int,
    duration_ms: int,
    quality: int,
) -> tuple[Path, Path]:
    base_path = ASSETS / f"profile-terminal-base-{theme_name}.jpg"
    if not base_path.is_file():
        raise FileNotFoundError(f"Missing base banner: {base_path}")

    with Image.open(base_path) as source:
        base = ImageOps.exif_transpose(source).convert("RGB")

    frames = build_frames(base, portrait, THEMES[theme_name], frame_count)
    webp_path = ASSETS / f"profile-terminal-photo-{theme_name}.webp"
    fallback_path = ASSETS / f"profile-terminal-photo-{theme_name}.jpg"
    frames[0].save(
        webp_path,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        quality=quality,
        method=6,
        minimize_size=True,
    )
    fallback_frame = frames[frame_count // 4]
    fallback_frame.save(
        fallback_path,
        format="JPEG",
        quality=91,
        optimize=True,
        progressive=False,
        subsampling=1,
    )
    return webp_path, fallback_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames", type=int, default=24)
    parser.add_argument("--duration-ms", type=int, default=115)
    parser.add_argument("--quality", type=int, default=86)
    args = parser.parse_args()

    if not 12 <= args.frames <= 48:
        raise SystemExit("--frames must be between 12 and 48")
    if not 60 <= args.duration_ms <= 250:
        raise SystemExit("--duration-ms must be between 60 and 250")
    if not 70 <= args.quality <= 95:
        raise SystemExit("--quality must be between 70 and 95")
    if not PORTRAIT_PATH.is_file():
        raise SystemExit(f"Missing portrait: {PORTRAIT_PATH}")

    with Image.open(PORTRAIT_PATH) as source:
        portrait = ImageOps.exif_transpose(source).convert("RGB")
    if portrait.size != PHOTO_SIZE:
        portrait = ImageOps.fit(
            portrait,
            PHOTO_SIZE,
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.4),
        )

    for theme_name in THEMES:
        webp_path, fallback_path = generate_theme(
            theme_name,
            portrait,
            frame_count=args.frames,
            duration_ms=args.duration_ms,
            quality=args.quality,
        )
        print(
            f"Generated {webp_path.relative_to(ROOT)} "
            f"and {fallback_path.relative_to(ROOT)}"
        )


if __name__ == "__main__":
    main()
