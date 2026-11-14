"""Facets: the cross-media vocabulary taste is built on (recommendation engine spec)."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

import facets
from facets import FACET_MAP, coverage, facets_of, is_form, snapshot_tags, specificity

FIXTURES = Path(__file__).resolve().parent / "fixtures"
IGDB_KINDS = ("genres", "themes", "keywords", "game_modes", "player_perspectives")
COMICVINE_KINDS = ("characters", "concepts", "teams", "locations")


def _names(values) -> set[str]:
    return {v["name"] for v in values or [] if isinstance(v, dict) and v.get("name")}


def _igdb_games(body):
    for row in body if isinstance(body, list) else [body]:
        if isinstance(row, dict):
            yield row.get("game") if isinstance(row.get("game"), dict) else row


def source_strings() -> set[tuple[str, str, str]]:
    """Every (source, kind, string) the recorded fixtures and the collection
    export carry, by the key the adapters store it under."""
    found: set[tuple[str, str, str]] = set()
    for name in (
        "igdb_game",
        "igdb_games_e7b",
        "igdb_search",
        "igdb_upcoming_release_dates",
    ):
        for game in _igdb_games(json.loads((FIXTURES / f"{name}.json").read_text())):
            for kind in IGDB_KINDS:
                found |= {("igdb", kind, v) for v in _names(game.get(kind))}
    movie = json.loads((FIXTURES / "tmdb_movie.json").read_text())
    found |= {("tmdb", "genres", v) for v in _names(movie.get("genres"))}
    found |= {
        ("tmdb", "keywords", v)
        for v in _names((movie.get("keywords") or {}).get("keywords"))
    }
    volume = json.loads((FIXTURES / "comicvine_volume.json").read_text())["results"]
    for kind in COMICVINE_KINDS:
        found |= {("comicvine", kind, v) for v in _names(volume.get(kind))}
    found |= _attested()
    found |= _export_strings()
    return found


EXPORT = FIXTURES / "picker_collection.json"


def _attested() -> set[tuple[str, str, str]]:
    """The few mapped strings only the collection export carries. The export
    is gitignored (it could be matched back to real games), so they are kept
    here, checked against it wherever it exists."""
    body = json.loads((FIXTURES / "facet_attested.json").read_text())
    return {tuple(entry) for entry in body["strings"]}


def _export_strings() -> set[tuple[str, str, str]]:
    if not EXPORT.exists():
        return set()
    found: set[tuple[str, str, str]] = set()
    for item in json.loads(EXPORT.read_text())["items"]:
        for kind, values in item.get("tags", {}).items():
            found |= {(item.get("source") or "", kind, v) for v in values}
    return found


def item(type_="game", source="igdb", **tags):
    return SimpleNamespace(
        type=type_,
        source=source,
        tags=tuple((kind, v) for kind, values in tags.items() for v in values),
    )


def test_every_mapped_string_is_one_a_source_actually_wrote():
    """AC 10: the map is copied from snapshots, never typed from memory."""
    missing = sorted(key for key in FACET_MAP if key not in source_strings())
    assert missing == []


@pytest.mark.skipif(not EXPORT.exists(), reason="no collection export")
def test_the_attested_strings_are_mapped_and_in_the_export():
    """The committed list stands in for the export, so it holds only mapped
    strings the export really carries."""
    attested = _attested()
    assert attested <= set(FACET_MAP)
    assert attested <= _export_strings()


def test_every_mapped_facet_has_a_kind():
    known = facets.THEME_FACETS | facets.TONE_FACETS | facets.FORM_FACETS
    assert set(FACET_MAP.values()) <= known
    assert not facets.THEME_FACETS & facets.TONE_FACETS
    assert not (facets.THEME_FACETS | facets.TONE_FACETS) & facets.FORM_FACETS


def test_themes_bridge_media_and_forms_stay_in_their_type():
    game = item(keywords=["space", "2d platformer"], genres=["Adventure"])
    movie = item("movie", "tmdb", keywords=["space opera"], genres=["Adventure"])
    comic = item("comic", "comicvine", locations=["Space"])
    assert facets_of(game) == {"space", "game:form:platformer", "game:form:adventure"}
    assert facets_of(movie) == {"space", "movie:form:adventure"}
    assert facets_of(comic) == {"space"}
    shared = facets_of(game) & facets_of(movie)
    assert shared == {"space"}
    assert all(facets.bridges(f) for f in shared)
    assert not facets.bridges("game:form:adventure")


def test_modes_and_perspectives_are_not_facets():
    game = item(game_modes=["Single player"], player_perspectives=["Side view"])
    assert facets_of(game) == frozenset()


def test_an_unmapped_tag_becomes_a_type_scoped_facet():
    found = facets_of(item(keywords=["luigi"], characters=["Mario"]))
    assert found == {"game:keyword:luigi", "game:character:Mario"}
    assert facets.facet_kind("game:keyword:luigi") == "tag"
    assert facets.facet_label("game:keyword:luigi") == "luigi"
    assert not facets.bridges("game:keyword:luigi")


def test_storefront_noise_is_ignored():
    game = item(keywords=["steam greenlight", "achievements", "nextfest 2024"])
    comic = item("comic", "comicvine", concepts=["Variant Cover"])
    assert facets_of(game) == facets_of(comic) == frozenset()


@pytest.mark.parametrize(
    ("facet", "expected"),
    [
        ("game:form:platformer", True),
        ("space", False),
        ("game:keyword:form", False),
        ("comedy", False),
    ],
)
def test_is_form(facet, expected):
    assert is_form(facet) is expected


def test_specificity_is_normalised_per_kind():
    items = [
        item(keywords=["space", "funny"], genres=["Platform"]),
        item(keywords=["space"], genres=["Platform"]),
        item(keywords=["space", "dinosaurs"], genres=["Puzzle"]),
        item(keywords=["space"], genres=["Platform"]),
    ]
    spec = specificity(items)
    assert spec["space"] == 0.0  # on every item
    assert spec["dinosaurs"] == 1.0  # the rarest theme
    assert spec["comedy"] == 1.0  # the rarest tone
    assert spec["game:form:puzzle"] == 1.0
    assert 0 < spec["game:form:platformer"] < 1


def test_specificity_of_nothing_is_empty():
    assert specificity([]) == {}
    assert specificity([item()]) == {}


def test_coverage_lists_unmapped_tags_by_how_many_items_carry_them():
    items = [
        item(keywords=["luigi", "space", "achievements"]),
        item(keywords=["luigi", "luigi"]),
        item("comic", "comicvine", characters=["Alana"]),
    ]
    assert coverage(items) == [
        ("igdb", "keywords", "luigi", 2),
        ("comicvine", "characters", "Alana", 1),
    ]


def test_snapshot_tags_reads_the_taste_keys_only():
    snapshot = {
        "genres": ["Platform"],
        "keywords": ["space", ""],
        "game_modes": ["Single player"],
        "similar_games": [1, 2],
        "summary": "text",
    }
    assert snapshot_tags(snapshot) == (("genres", "Platform"), ("keywords", "space"))
    assert snapshot_tags(None) == ()


def test_the_coverage_script_reads_the_export_and_applies_its_floor():
    import importlib.util

    path = Path(__file__).resolve().parent.parent / "scripts" / "facet_coverage.py"
    spec = importlib.util.spec_from_file_location("facet_coverage", path)
    script = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script)
    body = {
        "items": [
            {
                "type": "game",
                "source": "igdb",
                "tags": {"keywords": ["luigi", "space"]},
            },
            {
                "type": "game",
                "source": "igdb",
                "tags": {"keywords": ["luigi", "yoshi"]},
            },
        ]
    }
    assert script.report(body, 2, None) == ["   2  igdb  keywords  luigi"]
    assert len(script.report(body, 1, 1)) == 1


def _tagged(item_type, *stored, source=None, tags=()):
    """An item carrying stored curated tags, as picker_routes builds them."""
    return SimpleNamespace(
        type=item_type,
        source=source,
        tags=snapshot_tags(None, [{"group": g, "tag": t} for g, t in stored]) + tags,
    )


def test_a_comics_curated_genres_read_as_the_shared_facets():
    comic = _tagged(
        "comic",
        ("genre", "horror"),
        ("genre", "sci-fi"),
        ("genre", "superhero"),
        ("based_on", "movie"),
        ("form", "ongoing"),
    )
    assert facets_of(comic) == {"horror", "science fiction", "comic:tag:superhero"}


def test_a_games_curated_tags_read_as_the_same_facets_igdb_gives_it():
    game = _tagged(
        "game",
        ("play_style", "shooter"),
        ("play_style", "open-world"),
        ("play_style", "story-led"),
        ("setting", "historical"),
        ("tone", "comedy"),
        ("tone", "family"),
    )
    assert facets_of(game) == {
        "game:form:shooter",
        "game:form:open world",
        "history",
        "comedy",
    }


def test_curated_and_source_facets_meet_in_one_set():
    game = _tagged(
        "game",
        ("setting", "horror"),
        source="igdb",
        tags=(("themes", "Horror"), ("genres", "Platform")),
    )
    assert facets_of(game) == {"horror", "game:form:platformer"}


def test_every_curated_word_is_in_the_vocabulary():
    import tags as vocab

    for table, item_type in (
        (facets._CURATED_GAME, "game"),
        (facets._CURATED_COMIC, "comic"),
    ):
        allowed = {(g, t) for g, ts in vocab.VOCABULARY[item_type] for t in ts}
        assert set(table) <= allowed
    comic_genres = dict(vocab.VOCABULARY["comic"])["genre"]
    assert set(facets._CURATED_COMIC_OWN) <= set(comic_genres)


def test_an_unknown_curated_value_adds_nothing_and_coverage_ignores_it():
    odd = SimpleNamespace(
        type="comic", source=None, tags=(("curated", "genre/nonsense"),)
    )
    assert facets_of(odd) == frozenset()
    assert coverage([odd]) == []
