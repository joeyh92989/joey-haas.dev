"""Photo bytes: any photo in, a small upright WebP (garments, intake) or an
upright reading JPEG (intake) out.

Pure: Pillow and pillow-heif only, no FastAPI or database, so the route
(`closet_routes.py`) owns the HTTP answer and this module owns the bytes.

- **Refused before reading.** A photo over `MAX_PHOTO_BYTES` is refused from
  its declared size without a read, and a stream with no declared size is
  read to one byte past the cap and refused there, never decoded.
- **Bounded before decode.** Only JPEG, PNG, WebP and HEIF (HEIC) are
  opened, and a photo declaring more than `MAX_PIXELS` is refused from its
  header, before any pixel is decoded: a small file can declare a huge
  canvas, and Render gives the service 512 MB. Pillow's decompression-bomb
  warning is an error here too.
- **Small, then upright.** `thumbnail()` shrinks first (for a JPEG it lets
  the decoder skip to a reduced scale, so a 12 MP photo is never fully
  decoded), and only the 400px result is turned: iPhone JPEGs are stored
  sideways with an EXIF orientation tag, which `ImageOps.exif_transpose`
  applies, or every portrait shot of a shirt lies on its side. The tag
  survives `thumbnail()`, which resizes in place. Saved as WebP at quality
  80; a few hundred garments come to low tens of MB.
- **HEIC.** `register_heif_opener()` lets Pillow open the iPhone's default.
- **Flat.** Alpha is composited onto white: the grid draws the photo as a
  tile, and a transparent PNG would show the page through it.

- **Reading copy.** `make_reading_copy` is the same path at 3072px, saved as
  a JPEG at quality 90 for the intake reader; it is dropped once read.

Photos are processed one at a time by the caller so a decoded 12 MP HEIC
never sits beside eleven others in Render's 512 MB.
"""

from __future__ import annotations

import io
import warnings
from dataclasses import dataclass
from typing import BinaryIO

from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener()

# The importer's cap (importer.MAX_PHOTO_BYTES), repeated rather than imported
# so this module stays free of FastAPI; a test holds the two equal.
MAX_PHOTO_BYTES = 14 * 1024 * 1024
# A 48 MP phone photo is about 48,000,000; anything past this is refused
# from its header. Decoded RGB is 3 bytes a pixel, so 120 MB at the cap.
MAX_PIXELS = 40_000_000
OPEN_FORMATS = ("JPEG", "PNG", "WEBP", "HEIF")
LONG_EDGE = 400
WEBP_QUALITY = 80
# Intake's reading copy (make_reading_copy).
READING_LONG_EDGE = 3072
READING_JPEG_QUALITY = 90
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


def _upright(data: bytes, long_edge: int) -> Image.Image:
    """The photo shrunk to `long_edge`, turned upright and flattened onto
    white, or a `ClosetImageError` worded for the owner."""
    if len(data) > MAX_PHOTO_BYTES:
        raise _too_large()
    unreadable = ClosetImageError(
        "That file could not be read as a photo (JPEG, PNG, WebP or HEIC)"
    )
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data), formats=OPEN_FORMATS) as source:
                width, height = source.size
                if width * height > MAX_PIXELS:
                    raise ClosetImageError(
                        f"That photo is too large: at most {MAX_PIXELS // 1_000_000} "
                        "megapixels"
                    )
                # In place, and before the turn: only the small image is
                # decoded at full depth and transposed.
                source.thumbnail((long_edge, long_edge), Image.Resampling.LANCZOS)
                image = ImageOps.exif_transpose(source)
                return _flatten(image)
    except ClosetImageError:
        raise
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        SyntaxError,
        ValueError,
    ) as error:
        raise unreadable from error


def make_thumbnail(data: bytes) -> Thumbnail:
    """The photo as an upright WebP whose long edge is at most 400px."""
    image = _upright(data, LONG_EDGE)
    out = io.BytesIO()
    image.save(out, format="WEBP", quality=WEBP_QUALITY)
    return Thumbnail(webp=out.getvalue(), width=image.width, height=image.height)


def make_reading_copy(data: bytes) -> bytes:
    """The photo as an upright JPEG whose long edge is at most 3072px.

    Intake keeps this until the reader has read the photo (spec D2): 3072px
    keeps a spine's small print legible at one to two MB. The turn is in the
    pixels and no EXIF is written, so nothing downstream turns it twice.
    """
    image = _upright(data, READING_LONG_EDGE)
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=READING_JPEG_QUALITY)
    return out.getvalue()
