"""Google OpenID Connect sign-in for the single admin account."""

from __future__ import annotations

import logging
from collections.abc import Mapping

from config import Config

logger = logging.getLogger(__name__)


def is_allowed(userinfo: Mapping[str, object], config: Config) -> bool:
    """Whether this Google identity may sign in.

    Three conditions, all required:

    1. Google asserts the address is verified. Without this, an unverified
       account claiming the admin's address would pass. The check is against
       the literal True rather than truthiness, because the string "false" is
       truthy.
    2. The address matches ADMIN_EMAIL, compared case-insensitively after
       stripping whitespace.
    3. If ADMIN_GOOGLE_SUB is configured, the immutable Google subject
       identifier matches too. Google's documentation is explicit that `sub`,
       not `email`, is the stable identifier for an account.
    """
    if userinfo.get("email_verified") is not True:
        return False

    email = str(userinfo.get("email") or "").strip().lower()
    if not email or email != config.admin_email.strip().lower():
        return False

    pinned_sub = (config.admin_google_sub or "").strip()
    if pinned_sub:
        return str(userinfo.get("sub") or "") == pinned_sub

    return True
