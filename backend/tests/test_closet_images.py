"""closet_images: every input the phone can send comes out a small upright WebP.

Every fixture is generated here with Pillow (and pillow-heif for HEIC), so
the suite carries no binary files and each test states its input.
"""

import ast
import io
import struct
import zlib
from pathlib import Path

import pytest
from PIL import Image
from pillow_heif import from_pillow

import closet_images
import importer
from closet_images import (
    LONG_EDGE,
    MAX_PHOTO_BYTES,
    READING_LONG_EDGE,
    ClosetImageError,
    make_reading_copy,
    make_thumbnail,
    read_capped,
)

BACKEND = Path(__file__).resolve().parent.parent


def _decode(thumbnail) -> Image.Image:
    image = Image.open(io.BytesIO(thumbnail.webp))
    image.load()
    return image


def _jpeg_with_orientation(width: int, height: int, orientation: int) -> bytes:
    """A landscape JPEG, red on the left half, tagged with an orientation."""
    image = Image.new("RGB", (width, height), (0, 0, 255))
    image.paste((255, 0, 0), (0, 0, width // 2, height))
    exif = Image.Exif()
    exif[0x0112] = orientation
    out = io.BytesIO()
    image.save(out, format="JPEG", exif=exif, quality=90)
    return out.getvalue()


def test_a_sideways_iphone_jpeg_comes_out_upright():
    # Orientation 6: the stored pixels must be turned 90 degrees clockwise to
    # display. Stored 1200x800 (landscape), it displays 800x1200 (portrait),
    # and the stored left half (red) ends up on top.
    thumbnail = make_thumbnail(_jpeg_with_orientation(1200, 800, 6))
    image = _decode(thumbnail).convert("RGB")
    assert image.height > image.width
    assert (thumbnail.width, thumbnail.height) == image.size
    top = image.getpixel((image.width // 2, image.height // 8))
    bottom = image.getpixel((image.width // 2, image.height * 7 // 8))
    assert top[0] > 200 and top[2] < 60
    assert bottom[2] > 200 and bottom[0] < 60


def test_output_is_webp_with_a_long_edge_of_at_most_400():
    thumbnail = make_thumbnail(_jpeg_with_orientation(3000, 2000, 1))
    image = _decode(thumbnail)
    assert image.format == "WEBP"
    assert max(image.size) == LONG_EDGE
    assert image.size == (400, 267)


def test_a_small_photo_is_not_enlarged():
    out = io.BytesIO()
    Image.new("RGB", (120, 90), (10, 20, 30)).save(out, format="PNG")
    thumbnail = make_thumbnail(out.getvalue())
    assert (thumbnail.width, thumbnail.height) == (120, 90)


def test_a_heic_from_the_phone_decodes():
    image = Image.new("RGB", (640, 480), (0, 160, 0))
    out = io.BytesIO()
    from_pillow(image).save(out, quality=80)
    thumbnail = make_thumbnail(out.getvalue())
    decoded = _decode(thumbnail).convert("RGB")
    assert decoded.size == (400, 300)
    red, green, blue = decoded.getpixel((200, 150))
    assert green > 120 and red < 60 and blue < 60


def test_a_png_with_alpha_is_flattened_onto_white():
    image = Image.new("RGBA", (200, 100), (0, 0, 0, 0))
    image.paste((0, 0, 0, 255), (100, 0, 200, 100))
    out = io.BytesIO()
    image.save(out, format="PNG")
    decoded = _decode(make_thumbnail(out.getvalue()))
    assert decoded.mode == "RGB"
    assert decoded.getpixel((20, 50)) == pytest.approx((255, 255, 255), abs=4)
    assert max(decoded.getpixel((180, 50))) < 20


class _ExplodingStream:
    def read(self, *_):
        raise AssertionError("an oversize photo was read")


def test_an_oversize_photo_is_refused_from_its_declared_size_without_a_read():
    with pytest.raises(ClosetImageError, match="too large"):
        read_capped(_ExplodingStream(), declared_size=MAX_PHOTO_BYTES + 1)


def test_an_oversize_stream_is_refused_before_decode(monkeypatch):
    def no_decode(*_args, **_kwargs):
        raise AssertionError("an oversize photo was decoded")

    monkeypatch.setattr(closet_images.Image, "open", no_decode)
    stream = io.BytesIO(b"\xff" * (MAX_PHOTO_BYTES + 10))
    with pytest.raises(ClosetImageError, match="too large"):
        read_capped(stream)
    with pytest.raises(ClosetImageError, match="too large"):
        make_thumbnail(b"\xff" * (MAX_PHOTO_BYTES + 1))


def test_a_photo_at_the_cap_is_read_whole():
    data = b"\x00" * MAX_PHOTO_BYTES
    assert read_capped(io.BytesIO(data), declared_size=None) == data


@pytest.mark.parametrize(
    "data", [b"not a photo at all", b"\xff\xd8\xff\xe0truncated jpeg", b"\x89PNG\r\n"]
)
def test_garbage_bytes_are_refused(data):
    with pytest.raises(ClosetImageError, match="could not be read"):
        make_thumbnail(data)


def _png_header(width: int, height: int) -> bytes:
    """A PNG that declares `width` x `height` and carries no pixels at all."""

    def chunk(kind: bytes, body: bytes) -> bytes:
        crc = zlib.crc32(kind + body) & 0xFFFFFFFF
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IEND", b"")


def test_a_photo_declaring_too_many_pixels_is_refused_before_decode(monkeypatch):
    def no_decode(*_args, **_kwargs):
        raise AssertionError("an oversize canvas was decoded")

    monkeypatch.setattr(Image.Image, "load", no_decode)
    # 7000 x 7000 is 49 MP: under Pillow's own bomb limit, over the cap.
    with pytest.raises(ClosetImageError, match="megapixels"):
        make_thumbnail(_png_header(7000, 7000))


def test_the_pixel_cap_applies_to_a_real_photo(monkeypatch):
    monkeypatch.setattr(closet_images, "MAX_PIXELS", 100 * 100)
    out = io.BytesIO()
    Image.new("RGB", (101, 100), (1, 2, 3)).save(out, format="PNG")
    with pytest.raises(ClosetImageError, match="too large"):
        make_thumbnail(out.getvalue())


def test_a_decompression_bomb_warning_is_an_error(monkeypatch):
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 50 * 50)
    out = io.BytesIO()
    Image.new("RGB", (60, 60), (1, 2, 3)).save(out, format="PNG")
    with pytest.raises(ClosetImageError, match="could not be read"):
        make_thumbnail(out.getvalue())


def test_only_photo_formats_are_opened():
    out = io.BytesIO()
    Image.new("RGB", (20, 20), (1, 2, 3)).save(out, format="GIF")
    with pytest.raises(ClosetImageError, match="could not be read"):
        make_thumbnail(out.getvalue())


def test_an_empty_upload_is_refused():
    with pytest.raises(ClosetImageError, match="empty"):
        read_capped(io.BytesIO(b""))


def test_the_cap_is_the_importers():
    assert MAX_PHOTO_BYTES == importer.MAX_PHOTO_BYTES


def test_the_module_stays_pure():
    tree = ast.parse((BACKEND / "closet_images.py").read_text())
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported |= {alias.name.split(".")[0] for alias in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
    assert not imported & {"fastapi", "sqlalchemy", "starlette", "models", "db"}


# The reading copy (intake, spec D2): what the reader sees tomorrow.


def _decode_jpeg(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


def test_the_reading_copy_is_an_upright_jpeg_at_most_3072():
    copy = make_reading_copy(_jpeg_with_orientation(4032, 3024, 6))
    image = _decode_jpeg(copy)
    assert image.format == "JPEG"
    assert max(image.size) == READING_LONG_EDGE == 3072
    assert image.height > image.width
    rgb = image.convert("RGB")
    top = rgb.getpixel((image.width // 2, image.height // 8))
    assert top[0] > 200 and top[2] < 60
    # Turned in the pixels, so no orientation tag is left to turn it twice.
    assert image.getexif().get(0x0112) in (None, 1)


def test_a_small_photo_keeps_its_size_in_the_reading_copy():
    image = _decode_jpeg(make_reading_copy(_jpeg_with_orientation(1200, 800, 1)))
    assert image.size == (1200, 800)


def test_a_heic_opens_as_a_reading_copy():
    out = io.BytesIO()
    from_pillow(Image.new("RGB", (640, 480), (0, 128, 0))).save(out, quality=80)
    image = _decode_jpeg(make_reading_copy(out.getvalue()))
    assert image.format == "JPEG"
    assert image.size == (640, 480)


def test_the_reading_copy_refuses_an_oversize_photo():
    with pytest.raises(ClosetImageError, match="too large"):
        make_reading_copy(b"\xff" * (MAX_PHOTO_BYTES + 1))


def test_the_reading_copy_refuses_what_is_not_a_photo():
    with pytest.raises(ClosetImageError, match="could not be read"):
        make_reading_copy(b"not a photo")
