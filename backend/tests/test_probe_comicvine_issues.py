"""The pure helpers of scripts/probe_comicvine_issues.py (#302).

The probe itself needs a live Comic Vine key; the helpers that read its
answers do not. scripts/record_tmdb_fixtures.py is the other untested
script: it only makes one live call and writes the body, so it has no pure
logic to pin (its adapter, sources/tmdb.py, is tested on the fixture it
records).
"""

import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import probe_comicvine_issues as probe  # noqa: E402


def test_filter_held_needs_every_row_in_the_volume():
    rows = [{"volume": {"id": 7}}, {"volume": {"id": 7}}]
    assert probe.filter_held({"results": rows}, 7) is True
    assert probe.filter_held({"results": rows + [{"volume": {"id": 8}}]}, 7) is False
    assert probe.filter_held({"results": []}, 7) is False


def test_descriptions_present_needs_one_on_every_row():
    assert probe.descriptions_present({"results": [{"description": "a"}]}) is True
    assert probe.descriptions_present({"results": [{"description": ""}]}) is False
    assert probe.descriptions_present({}) is False


def test_pick_trade_matches_volume_and_name_exactly():
    hit = {"volume": {"name": probe.TRADE_VOLUME}, "name": probe.TRADE_NAME}
    other = {"volume": {"name": probe.TRADE_VOLUME}, "name": "Volume 2"}
    assert probe.pick_trade([other, hit]) is hit
    assert probe.pick_trade([other]) is None


def test_image_size_reads_png_gif_and_jpeg_headers():
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8 + struct.pack(">II", 30, 40)
    assert probe.image_size(png) == (30, 40)
    gif = b"GIF89a" + struct.pack("<HH", 5, 6)
    assert probe.image_size(gif) == (5, 6)
    jpeg = (
        b"\xff\xd8"
        + b"\xff\xc0"
        + struct.pack(">H", 17)
        + b"\x08"
        + struct.pack(">HH", 50, 60)
        + b"\x00" * 10
    )
    assert probe.image_size(jpeg) == (60, 50)
    assert probe.image_size(b"nope") is None
