"""Garment photo thumbnails: any photo in, one small upright WebP out.

Pure: Pillow and pillow-heif only, no FastAPI or database, so the route
(`closet_routes.py`) owns the HTTP answer and this module owns the bytes.

- **Refused before reading.** A photo over `MAX_PHOTO_BYTES` is refused from
  its declared size without a read, and a stream with no declared size is
  read to one byte past the cap and refused there, never decoded.
- **Upright.** iPhone JPEGs are stored sideways with an EXIF orientation
  tag; `ImageOps.exif_transpose` applies it, or every portrait shot of a
  shirt lies on its side.
- **Small.** `draft()` lets the JPEG decoder skip to a reduced scale, so a
  12 MP photo is never fully decoded; the long edge ends at 400px, saved as
  WebP at quality 80. A few hundred garments come to low tens of MB.
- **HEIC.** `register_heif_opener()` lets Pillow open the iPhone's default.
- **Flat.** Alpha is composited onto white: the grid draws the photo as a
  tile, and a transparent PNG would show the page through it.

Photos are processed one at a time by the caller so a decoded 12 MP HEIC
never sits beside eleven others in Render's 512 MB.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import BinaryIO

from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener()

# The importer's cap (importer.MAX_PHOTO_BYTES), repeated rather than imported
# so this module stays free of FastAPI; a test holds the two equal.
MAX_PHOTO_BYTES = 14 * 1024 * 1024
LONG_EDGE = 400
WEBP_QUALITY = 80
BACKGROUND = (255, 255, 255)


class ClosetImageError(ValueError):
    """A photo that cannot become a thumbnail. Its message is the owner's
    sentence; the route answers it with a 422."""


@dataclass(frozen=True)
class Thumbnail:
    webp: bytes
    width: int
    height: int


def _too_large() -> ClosetImageError:
    return ClosetImageError(
        f"That photo is too large: at most {MAX_PHOTO_BYTES // (1024 * 1024)} MB"
    )


def read_capped(stream: BinaryIO, declared_size: int | None = None) -> bytes:
    """Reads a photo, refusing one over the cap without decoding it.

    A declared size over the cap is refused before any read; otherwise at
    most one byte past the cap is read, so a stream that lied about its size
    (or declared none) is caught there.
    """
    if declared_size is not None and declared_size > MAX_PHOTO_BYTES:
        raise _too_large()
    data = stream.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise _too_large()
    if not data:
        raise ClosetImageError("That photo is empty")
    return data


def _flatten(image: Image.Image) -> Image.Image:
    has_alpha = image.mode in ("RGBA", "LA", "PA") or (
        image.mode == "P" and "transparency" in image.info
    )
    if not has_alpha:
        return image.convert("RGB")
    rgba = image.convert("RGBA")
    flat = Image.new("RGB", rgba.size, BACKGROUND)
    flat.paste(rgba, mask=rgba.getchannel("A"))
    return flat


def make_thumbnail(data: bytes) -> Thumbnail:
    """The photo as an upright WebP whose long edge is at most 400px."""
    if len(data) > MAX_PHOTO_BYTES:
        raise _too_large()
    try:
        with Image.open(io.BytesIO(data)) as source:
            # JPEG only (a no-op for other formats): decode at the smallest
            # scale that still covers the target on both edges.
            source.draft("RGB", (LONG_EDGE, LONG_EDGE))
            image = ImageOps.exif_transpose(source)
            image.thumbnail((LONG_EDGE, LONG_EDGE), Image.Resampling.LANCZOS)
            image = _flatten(image)
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        OSError,
        SyntaxError,
        ValueError,
    ) as error:
        raise ClosetImageError(
            "That file could not be read as a photo (JPEG, PNG, WebP or HEIC)"
        ) from error

    out = io.BytesIO()
    image.save(out, format="WEBP", quality=WEBP_QUALITY)
    return Thumbnail(webp=out.getvalue(), width=image.width, height=image.height)
