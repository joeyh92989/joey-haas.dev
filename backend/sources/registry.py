"""Which adapter handles which media type."""

from __future__ import annotations

from config import Config
from models import ItemType
from sources.base import SourceAdapter, SourceNotConfigured
from sources.bgg import BggSource
from sources.comicvine import ComicVineSource
from sources.igdb import IgdbSource
from sources.tmdb import TmdbSource


def build_registry(config: Config) -> dict[ItemType, SourceAdapter]:
    """Every implemented adapter, configured or not.

    Unconfigured adapters are registered rather than omitted. Asking for one
    then raises SourceNotConfigured, which names the missing variable, instead
    of a KeyError that says only that the type is unknown -- a materially worse
    error to meet when the real problem is an unset key.
    """
    return {
        ItemType.MOVIE: TmdbSource(config),
        ItemType.GAME: IgdbSource(config),
        ItemType.COMIC: ComicVineSource(config),
        # Registered but never configured: BGG now requires an authorization
        # token. Registering it anyway is what makes the failure explain
        # itself rather than reporting the type as unimplemented.
        ItemType.BOARDGAME: BggSource(config),
    }


def adapter_for(
    registry: dict[ItemType, SourceAdapter], item_type: ItemType
) -> SourceAdapter:
    """The adapter for `item_type`, or SourceNotConfigured explaining why not."""
    adapter = registry.get(item_type)
    if adapter is None:
        raise SourceNotConfigured(
            item_type.value,
            f"no metadata source is implemented for {item_type.value}",
        )
    if not adapter.configured():
        raise SourceNotConfigured(
            adapter.source_name,
            f"{adapter.source_name} has no credentials configured",
        )
    return adapter


def configured_sources(registry: dict[ItemType, SourceAdapter]) -> list[str]:
    """Names of the sources that have credentials, for the startup log.

    This log line is the mitigation for checking configuration lazily: a
    mistyped key shows up as an absence here at boot, rather than only when
    someone first tries to look something up.
    """
    return sorted(a.source_name for a in registry.values() if a.configured())
