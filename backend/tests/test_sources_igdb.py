"""IGDB response mapping and token caching, against recorded fixtures."""

import json
from pathlib import Path

import pytest

from config import Config
from sources.base import SourceNotConfigured
from sources.igdb import (
    PLATFORM_IDS,
    PLATFORM_NAMES,
    IgdbSource,
    date_from_unix,
    platform_id,
    year_from_unix,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _config(**overrides) -> Config:
    base = dict(
        google_client_id="x",
        google_client_secret="x",
        session_secret="x",
        admin_email="x@example.com",
        frontend_url="http://localhost:5173",
        database_url="postgresql://x",
        database_url_direct="postgresql://x",
        igdb_client_id="cid",
        igdb_client_secret="secret",
    )
    return Config(**{**base, **overrides})


def _search_payload() -> list[dict]:
    return json.loads((FIXTURES / "igdb_search.json").read_text())


def _detail_payload() -> dict:
    return json.loads((FIXTURES / "igdb_game.json").read_text())[0]


def test_release_dates_are_unix_timestamps_not_date_strings():
    # The one place IGDB differs from every other source. year_from_date would
    # read 1559001600 as the year 1559 -- a plausible-looking value that would
    # then filter the candidate list and hide the right answer.
    assert year_from_unix(1559001600) == 2019
    assert year_from_unix(None) is None
    assert year_from_unix("1559001600") is None


def test_unconfigured_when_either_credential_is_missing():
    assert IgdbSource(_config()).configured() is True
    assert IgdbSource(_config(igdb_client_id=None)).configured() is False
    assert IgdbSource(_config(igdb_client_secret=None)).configured() is False


@pytest.mark.asyncio
async def test_search_without_credentials_names_both_variables():
    with pytest.raises(SourceNotConfigured) as excinfo:
        await IgdbSource(_config(igdb_client_id=None)).search("Outer Wilds")
    message = str(excinfo.value)
    assert "IGDB_CLIENT_ID" in message
    assert "IGDB_CLIENT_SECRET" in message


def test_search_payload_maps_onto_source_results():
    results = IgdbSource(_config())._parse_search(_search_payload())

    assert results
    first = results[0]
    assert first.title
    assert first.external_id.isdigit()
    assert first.thumbnail_url is None or first.thumbnail_url.startswith(
        "https://images.igdb.com/igdb/image/upload/t_cover_small/"
    )


def test_detail_maps_onto_a_source_detail():
    detail = IgdbSource(_config())._parse_detail(_detail_payload())

    assert detail.title == "Outer Wilds"
    assert detail.year == 2019
    # creator is the developer, not the publisher: Annapurna published Outer
    # Wilds, Mobius Digital made it.
    assert detail.creator == "Mobius Digital"
    assert detail.cover_url.startswith(
        "https://images.igdb.com/igdb/image/upload/t_cover_big/"
    )
    assert detail.source_metadata["genres"]
    assert detail.source_metadata["community_score"]


def test_similar_games_are_kept_for_the_recommendation_engine():
    detail = IgdbSource(_config())._parse_detail(_detail_payload())
    assert isinstance(detail.source_metadata["similar_games"], list)
    assert detail.source_metadata["similar_games"]


def test_duplicate_developer_entries_are_collapsed():
    # involved_companies really does repeat a company across roles.
    detail = IgdbSource(_config())._parse_detail(
        {
            "id": 1,
            "name": "Repeated",
            "involved_companies": [
                {"company": {"name": "Studio"}, "developer": True},
                {"company": {"name": "Studio"}, "developer": True},
                {"company": {"name": "Publisher"}, "developer": False},
            ],
        }
    )
    assert detail.creator == "Studio"


def test_a_game_with_no_cover_or_developer_still_maps():
    detail = IgdbSource(_config())._parse_detail({"id": 2, "name": "Bare"})
    assert detail.cover_url is None
    assert detail.creator is None
    assert detail.year is None
    assert detail.source_metadata["genres"] == []


class _FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _RecordingClient:
    """Stands in for httpx2.AsyncClient, recording every POST it receives."""

    def __init__(self, calls: list[str], responses: dict[str, list[_FakeResponse]]):
        self._calls = calls
        self._responses = responses

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def post(self, url, **_kwargs):
        kind = "token" if "twitch" in url else "games"
        self._calls.append(kind)
        queue = self._responses[kind]
        return queue.pop(0) if len(queue) > 1 else queue[0]


def _patch_http(monkeypatch, games: list[_FakeResponse]) -> list[str]:
    calls: list[str] = []
    responses = {
        "token": [_FakeResponse(200, {"access_token": "token"})],
        "games": games,
    }
    monkeypatch.setattr(
        "sources.igdb.httpx2.AsyncClient",
        lambda **_: _RecordingClient(calls, responses),
    )
    return calls


@pytest.mark.asyncio
async def test_the_token_is_fetched_once_and_reused(monkeypatch):
    # A credential that lasts two months must not cost a round trip on every
    # lookup. This drives the real _query, so the caching being tested is the
    # caching that ships.
    calls = _patch_http(monkeypatch, [_FakeResponse(200, [])])
    source = IgdbSource(_config())

    await source.search("one")
    await source.search("two")

    assert calls.count("token") == 1
    assert calls.count("games") == 2


@pytest.mark.asyncio
async def test_a_401_refreshes_the_token_once_and_retries(monkeypatch):
    # The app token does eventually expire. The fix is a new token, not an
    # error surfaced to whoever happened to be importing at the time.
    calls = _patch_http(monkeypatch, [_FakeResponse(401, None), _FakeResponse(200, [])])
    source = IgdbSource(_config())

    await source.search("one")

    assert calls == ["token", "games", "token", "games"]


def test_platform_ids_come_from_igdb_not_from_guessing():
    # Resolved against IGDB's own /v4/platforms endpoint. A wrong id here
    # would filter every search down to the wrong console and look exactly
    # like the game simply not existing.
    assert platform_id("Nintendo Switch 2") == 508
    assert platform_id("Nintendo Switch") == 130
    assert platform_id("PlayStation 5") == 167
    assert platform_id("Xbox Series X|S") == 169


def test_platform_matching_is_forgiving_about_how_it_was_printed():
    assert platform_id("nintendo switch 2") == 508
    assert platform_id("NINTENDO SWITCH 2") == 508
    assert platform_id("Xbox Series X/S") == 169
    assert platform_id("PS5") == 167


def test_edition_wording_still_resolves_to_the_right_console():
    # Cases really do say "Nintendo Switch 2 Edition". The longer name has to
    # win over the shorter one it contains, or every Switch 2 game filters to
    # the original Switch and matches the wrong release.
    assert platform_id("Nintendo Switch 2 Edition") == 508
    assert platform_id("Nintendo Switch Edition") == 130


def test_an_unknown_platform_yields_none_rather_than_a_guess():
    # None means "search unfiltered", which is the same as not knowing. A
    # guess would filter to the wrong console and hide the right game.
    assert platform_id("Sega Saturn") is None
    assert platform_id("") is None
    assert platform_id(None) is None


@pytest.mark.asyncio
async def test_a_known_platform_filters_the_search(monkeypatch):
    # The Star Fox case: IGDB holds a 1993 release and a 2026 one under
    # exactly that title, so no string comparison separates them.
    bodies: list[str] = []

    async def fake_query(body):
        bodies.append(body)
        return [{"id": 1, "name": "Star Fox"}]

    source = IgdbSource(_config())
    monkeypatch.setattr(source, "_query", fake_query)

    await source.search("Star Fox", platform="Nintendo Switch 2")

    assert "where platforms = (508)" in bodies[0]
    assert len(bodies) == 1


@pytest.mark.asyncio
async def test_no_platform_means_no_filter(monkeypatch):
    bodies: list[str] = []

    async def fake_query(body):
        bodies.append(body)
        return []

    source = IgdbSource(_config())
    monkeypatch.setattr(source, "_query", fake_query)

    await source.search("Star Fox")

    assert "where platforms" not in bodies[0]


@pytest.mark.asyncio
async def test_an_empty_filtered_result_retries_unfiltered(monkeypatch):
    # A misread platform should cost precision, never the item.
    bodies: list[str] = []

    async def fake_query(body):
        bodies.append(body)
        return [] if "where platforms" in body else [{"id": 1, "name": "Star Fox"}]

    source = IgdbSource(_config())
    monkeypatch.setattr(source, "_query", fake_query)

    results = await source.search("Star Fox", platform="Nintendo Switch 2")

    assert len(bodies) == 2
    assert "where platforms" in bodies[0]
    assert "where platforms" not in bodies[1]
    assert results[0].title == "Star Fox"


class _UrlClient:
    """Records the URL of every POST; answers the token and one query."""

    def __init__(self, urls: list[str]):
        self._urls = urls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def post(self, url, **_kwargs):
        self._urls.append(url)
        if "twitch" in url:
            return _FakeResponse(200, {"access_token": "token"})
        return _FakeResponse(200, [])


@pytest.mark.asyncio
async def test_a_query_goes_to_the_endpoint_it_names(monkeypatch):
    # Time to beat and platforms live on their own endpoints; games stays the
    # default so every existing caller is unchanged.
    urls: list[str] = []
    monkeypatch.setattr("sources.igdb.httpx2.AsyncClient", lambda **_: _UrlClient(urls))
    source = IgdbSource(_config())

    await source._query("fields id;")
    await source._query("fields id;", endpoint="platforms")

    queries = [url for url in urls if "twitch" not in url]
    assert queries == [
        "https://api.igdb.com/v4/games",
        "https://api.igdb.com/v4/platforms",
    ]


# --- E7b: the deeper snapshot, against fixtures recorded from the live API
# by scripts/record_igdb_fixtures.py on 2026-09-23. -------------------------


def _e7b_games() -> dict[int, dict]:
    rows = json.loads((FIXTURES / "igdb_games_e7b.json").read_text())
    return {row["id"]: row for row in rows}


def _e7b_times() -> dict:
    return json.loads((FIXTURES / "igdb_time_to_beats.json").read_text())


MARIO_KART_WORLD = 338067  # Switch 2, released, time to beat recorded
BREATH_OF_THE_WILD = 237895  # Switch, released, no time to beat
SUPER_MARIO_64_2 = 175964  # N64, cancelled, no release date


def _parse(game_id: int, with_time: bool = True):
    source = IgdbSource(_config())
    times = {
        row["game_id"]: source._time_to_beat(row) for row in _e7b_times()["response"]
    }
    return source._parse_detail(
        _e7b_games()[game_id], times.get(game_id) if with_time else None
    )


def test_the_platform_ids_match_the_live_api():
    live = json.loads((FIXTURES / "igdb_platforms.json").read_text())
    by_slug = {row["slug"]: row["id"] for row in live}
    assert by_slug == {"switch-2": 508, "switch": 130, "n64": 4}
    for platform in by_slug.values():
        assert platform in PLATFORM_NAMES
    assert set(PLATFORM_IDS.values()) <= set(PLATFORM_NAMES)


def test_the_snapshot_carries_the_e7b_keys():
    snapshot = _parse(MARIO_KART_WORLD).source_metadata

    assert "Fantasy" in snapshot["themes"]
    assert snapshot["game_modes"]
    assert snapshot["player_perspectives"] == ["Third person"]
    assert snapshot["genre_ids"] == [10, 31]
    assert snapshot["platform_ids"] == [508]
    assert snapshot["theme_ids"]
    assert snapshot["hypes"] == 36


def test_keywords_are_trimmed_to_ten():
    # Mario Kart World carries 62; IGDB's query language cannot trim them.
    assert len(_e7b_games()[MARIO_KART_WORLD]["keywords"]) > 10
    assert len(_parse(MARIO_KART_WORLD).source_metadata["keywords"]) == 10


def test_the_release_date_is_an_iso_date():
    snapshot = _parse(MARIO_KART_WORLD).source_metadata
    assert snapshot["first_release_date"] == "2025-06-05"
    assert date_from_unix(1749081600) == "2025-06-05"
    assert date_from_unix(None) is None


def test_a_game_without_a_release_date_has_no_key():
    assert "first_release_date" not in _parse(SUPER_MARIO_64_2).source_metadata


def test_release_status_is_the_status_name_and_absent_when_null():
    # The live API returns game_status only for games that are not simply
    # released: released games come back null, so absence means unknown.
    assert _parse(SUPER_MARIO_64_2).source_metadata["release_status"] == "Cancelled"
    assert "release_status" not in _parse(MARIO_KART_WORLD).source_metadata


def test_hypes_are_absent_when_null():
    assert "hypes" not in _parse(BREATH_OF_THE_WILD).source_metadata


def test_time_to_beat_is_hours_and_drops_missing_figures():
    # 18000 s and 21600 s; nobody submitted a completionist time.
    assert _parse(MARIO_KART_WORLD).source_metadata["time_to_beat"] == {
        "hastily": 5.0,
        "normally": 6.0,
        "count": 3,
    }


def test_a_game_with_no_time_to_beat_has_no_key():
    times = _e7b_times()
    answered = {row["game_id"] for row in times["response"]}
    # The recorded evidence: every unrated game asked about came back absent.
    assert not answered & set(times["requested_obscure"])
    assert BREATH_OF_THE_WILD not in answered
    assert "time_to_beat" not in _parse(BREATH_OF_THE_WILD).source_metadata


def test_zero_durations_are_never_stored():
    source = IgdbSource(_config())
    assert source._time_to_beat({"game_id": 1, "hastily": 0, "count": 0}) is None
    assert source._time_to_beat({"game_id": 1, "normally": 3600, "count": 1}) == {
        "normally": 1.0,
        "count": 1,
    }


class _EndpointClient:
    """Answers each /v4 endpoint from a table and records the bodies sent."""

    def __init__(self, sent: list[tuple[str, str]], answers: dict[str, list]):
        self._sent = sent
        self._answers = answers

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def post(self, url, content=None, **_kwargs):
        if "twitch" in url:
            return _FakeResponse(200, {"access_token": "token"})
        endpoint = url.rsplit("/", 1)[-1]
        self._sent.append((endpoint, content))
        return _FakeResponse(200, self._answers[endpoint])


def _patch_endpoints(monkeypatch, answers) -> list[tuple[str, str]]:
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "sources.igdb.httpx2.AsyncClient",
        lambda **_: _EndpointClient(sent, answers),
    )
    return sent


@pytest.mark.asyncio
async def test_fetch_many_batches_games_and_times_by_100(monkeypatch):
    games = list(_e7b_games().values())
    sent = _patch_endpoints(
        monkeypatch,
        {"games": games, "game_time_to_beats": _e7b_times()["response"]},
    )
    ids = [str(n) for n in range(1, 151)] + ["not-a-number"]

    details = await IgdbSource(_config()).fetch_many(ids)

    assert [endpoint for endpoint, _ in sent] == [
        "games",
        "game_time_to_beats",
        "games",
        "game_time_to_beats",
    ]
    # An explicit limit: IGDB's default is 10 rows.
    assert all("limit 100;" in body for _, body in sent)
    assert "not-a-number" not in sent[0][1] + sent[2][1]
    # Each batch returns the three fixture games, joined to their times.
    kart = next(d for d in details if d.external_id == str(MARIO_KART_WORLD))
    assert kart.source_metadata["time_to_beat"]["normally"] == 6.0


@pytest.mark.asyncio
async def test_fetch_includes_time_to_beat(monkeypatch):
    sent = _patch_endpoints(
        monkeypatch,
        {
            "games": [_e7b_games()[MARIO_KART_WORLD]],
            "game_time_to_beats": _e7b_times()["response"],
        },
    )

    detail = await IgdbSource(_config()).fetch(str(MARIO_KART_WORLD))

    assert [endpoint for endpoint, _ in sent] == ["games", "game_time_to_beats"]
    assert detail.source_metadata["time_to_beat"]["hastily"] == 5.0


def test_the_fixture_recorder_asks_for_the_same_fields():
    # The recorder keeps its own copy of the field list; a drift would record
    # fixtures that no longer describe what the adapter parses.
    import importlib.util

    from sources.igdb import FIELDS

    spec = importlib.util.spec_from_file_location(
        "record_igdb_fixtures",
        Path(__file__).parent.parent / "scripts" / "record_igdb_fixtures.py",
    )
    recorder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(recorder)
    assert recorder.GAME_FIELDS == FIELDS
