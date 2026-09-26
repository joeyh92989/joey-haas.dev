"""The fixture recorder's paging helpers (the fetching itself is owner-run)."""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "record_physical_fixtures.py"
spec = importlib.util.spec_from_file_location("record_physical_fixtures", SCRIPT)
recorder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recorder)


def test_page_url_replaces_the_page_parameter():
    url = "https://a.test/collections/x/products.json?limit=250&page=1"
    assert recorder.page_url(url, 3) == (
        "https://a.test/collections/x/products.json?limit=250&page=3"
    )


def test_page_url_keeps_parameters_after_the_page():
    url = "https://a.test/wp-json/wc/store/v1/products?per_page=100&page=1&category=65"
    assert recorder.page_url(url, 2).endswith("&page=2&category=65")


def test_page_out_numbers_the_file():
    assert recorder.page_out("shopify/a/x.p1.json", 2) == "shopify/a/x.p2.json"


def test_a_short_page_is_the_last():
    assert recorder.is_last_page(249, 250)
    assert recorder.is_last_page(0, 250)
    assert not recorder.is_last_page(250, 250)
