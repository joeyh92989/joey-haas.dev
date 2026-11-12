"""The probe script, offline: a fake client stands in for Gemini."""

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parent.parent / "scripts" / "probe_llm_chain.py"
spec = importlib.util.spec_from_file_location("probe_llm_chain", SCRIPT)
probe = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = probe  # dataclasses look their module up
spec.loader.exec_module(probe)


class _Response:
    def __init__(self, status: int, body: dict) -> None:
        self.status_code = status
        self._body = body

    def json(self) -> dict:
        return self._body


class _FakeClient:
    """Answers models.list and generateContent from a table keyed by model."""

    def __init__(self, served: list[str], answers: dict) -> None:
        self.served = served
        self.answers = answers
        self.bodies: list[tuple[str, dict]] = []
        self.headers: list[dict] = []

    async def get(self, url, headers=None, params=None):
        self.headers.append(headers or {})
        return _Response(
            200,
            {
                "models": [
                    {
                        "name": f"models/{name}",
                        "supportedGenerationMethods": ["generateContent"],
                    }
                    for name in self.served
                ]
            },
        )

    async def post(self, url, json=None, headers=None):
        self.headers.append(headers or {})
        model = url.rsplit("/", 1)[1].split(":")[0]
        self.bodies.append((model, json))
        answer = self.answers[model]
        return answer(json) if callable(answer) else answer


OK = _Response(
    200, {"candidates": [{"content": {"parts": [{"text": '{"ok": "ok"}'}]}}]}
)


def _per_day_429(value: str | None = "20") -> _Response:
    violation = {"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}
    if value is not None:
        violation["quotaValue"] = value
    return _Response(
        429,
        {
            "error": {
                "code": 429,
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                        "violations": [violation],
                    }
                ],
            }
        },
    )


@pytest.mark.asyncio
async def test_a_served_model_that_answers_is_reported_ok():
    client = _FakeClient(["gemini-3.6-flash"], {"gemini-3.6-flash": OK})
    candidates = [probe.Candidate("gemini-3.6-flash", {"thinkingLevel": "MINIMAL"})]

    served = await probe.list_models(client, "k")
    results = await probe.run(client, "k", candidates, served)

    assert served == {"gemini-3.6-flash"}
    [result] = results
    assert result.status == 200
    assert result.parsed is True
    _, body = client.bodies[0]
    assert body["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "MINIMAL"}
    assert body["generationConfig"]["responseSchema"]["type"] == "object"


@pytest.mark.asyncio
async def test_a_model_the_api_does_not_list_is_not_sent_a_request():
    client = _FakeClient([], {})
    candidates = [probe.Candidate("gemini-3.7-flash", None)]

    results = await probe.run(client, "k", candidates, served=set())

    assert client.bodies == []
    assert results[0].status is None
    assert results[0].note == "not listed"


@pytest.mark.asyncio
async def test_a_per_day_429_reports_its_quota_value():
    client = _FakeClient(["gemini-2.5-flash"], {"gemini-2.5-flash": _per_day_429()})

    [result] = await probe.run(
        client, "k", [probe.Candidate("gemini-2.5-flash", None)], {"gemini-2.5-flash"}
    )

    assert result.status == 429
    assert "PerDay" in result.quota_id
    assert result.quota_value == "20"


@pytest.mark.asyncio
async def test_a_429_without_a_quota_value_still_reads():
    client = _FakeClient(
        ["gemini-2.5-flash"], {"gemini-2.5-flash": _per_day_429(value=None)}
    )

    [result] = await probe.run(
        client, "k", [probe.Candidate("gemini-2.5-flash", None)], {"gemini-2.5-flash"}
    )

    assert result.quota_value == ""


@pytest.mark.asyncio
async def test_a_rejected_thinking_config_shows_the_api_message():
    rejected = _Response(
        400,
        {"error": {"code": 400, "message": "Thinking level is not supported."}},
    )
    client = _FakeClient(["gemini-2.5-flash-lite"], {"gemini-2.5-flash-lite": rejected})

    [result] = await probe.run(
        client,
        "k",
        [probe.Candidate("gemini-2.5-flash-lite", {"thinkingLevel": "LOW"})],
        {"gemini-2.5-flash-lite"},
    )

    assert result.status == 400
    assert "Thinking level" in result.note


@pytest.mark.asyncio
async def test_a_none_thinking_config_sends_no_thinking_config():
    client = _FakeClient(["gemini-2.5-flash"], {"gemini-2.5-flash": OK})

    await probe.run(
        client, "k", [probe.Candidate("gemini-2.5-flash", None)], {"gemini-2.5-flash"}
    )

    _, body = client.bodies[0]
    assert "thinkingConfig" not in body["generationConfig"]


@pytest.mark.asyncio
async def test_the_key_travels_in_a_header_and_never_in_the_table():
    client = _FakeClient(["gemini-3.6-flash"], {"gemini-3.6-flash": OK})
    served = await probe.list_models(client, "secret-key")
    results = await probe.run(
        client, "secret-key", [probe.Candidate("gemini-3.6-flash", None)], served
    )

    assert all(h.get("x-goog-api-key") == "secret-key" for h in client.headers)
    table = probe.format_table(results)
    assert "secret-key" not in table
    assert "gemini-3.6-flash" in table


def test_the_default_candidates_are_the_chain_with_its_levels():
    from llm import THINKING_LEVELS

    assert {c.model: c.thinking for c in probe.CANDIDATES} == {
        model: {"thinkingLevel": level} for model, level in THINKING_LEVELS.items()
    }
