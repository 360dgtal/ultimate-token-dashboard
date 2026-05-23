"""Pricing table + plan-aware cost formatting."""
from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path
from typing import Optional, Union

from .db import connect

_RATES_CACHE: dict = {"ts": 0.0, "data": {"USD": 1.0, "GBP": 0.79, "EUR": 0.92}}
_RATES_TTL = 3600  # refresh at most once per hour


def fetch_rates() -> dict:
    """Return {USD, GBP, EUR} exchange rates vs USD. Falls back to defaults on error.

    Rates are fetched from open.er-api.com (no API key required) and cached
    for one hour. The cache seeds with reasonable defaults so the dashboard
    always has a value even when offline.
    """
    now = time.time()
    if now - _RATES_CACHE["ts"] < _RATES_TTL:
        return _RATES_CACHE["data"]
    try:
        url = "https://open.er-api.com/v6/latest/USD"
        with urllib.request.urlopen(url, timeout=5) as resp:  # noqa: S310
            payload = json.loads(resp.read())
        all_rates = payload.get("rates", {})
        rates = {
            "USD": 1.0,
            "GBP": all_rates.get("GBP", 0.79),
            "EUR": all_rates.get("EUR", 0.92),
        }
        _RATES_CACHE["data"] = rates
        _RATES_CACHE["ts"] = now
    except Exception:
        pass  # keep last good value or hardcoded defaults
    return _RATES_CACHE["data"]


def load_pricing(path: Union[str, Path]) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _tier_from_name(model: str) -> Optional[str]:
    m = (model or "").lower()
    for tier in ("opus", "sonnet", "haiku"):
        if tier in m:
            return tier
    return None


def cost_for(model: str, usage: dict, pricing: dict) -> dict:
    """Return {usd, estimated, breakdown}. usd=None when no tier match."""
    rates = pricing["models"].get(model)
    estimated = False
    if rates is None:
        tier = _tier_from_name(model or "")
        if tier and tier in pricing["tier_fallback"]:
            rates = pricing["tier_fallback"][tier]
            estimated = True
        else:
            return {"usd": None, "estimated": True, "breakdown": {}}
    bd = {
        "input":           usage["input_tokens"]            * rates["input"]           / 1_000_000,
        "output":          usage["output_tokens"]           * rates["output"]          / 1_000_000,
        "cache_read":      usage["cache_read_tokens"]       * rates["cache_read"]      / 1_000_000,
        "cache_create_5m": usage["cache_create_5m_tokens"]  * rates["cache_create_5m"] / 1_000_000,
        "cache_create_1h": usage["cache_create_1h_tokens"]  * rates["cache_create_1h"] / 1_000_000,
    }
    return {"usd": round(sum(bd.values()), 6), "estimated": estimated, "breakdown": bd}


def get_plan(db_path: Union[str, Path], default: str = "api") -> str:
    with connect(db_path) as c:
        row = c.execute("SELECT v FROM plan WHERE k='plan'").fetchone()
    return row["v"] if row else default


def set_plan(db_path: Union[str, Path], plan: str) -> None:
    with connect(db_path) as c:
        c.execute("INSERT OR REPLACE INTO plan (k, v) VALUES ('plan', ?)", (plan,))
        c.commit()


def format_for_user(api_cost_usd: float, plan: str, pricing: dict) -> dict:
    p = pricing["plans"].get(plan, pricing["plans"]["api"])
    if plan == "api" or p["monthly"] == 0:
        return {"display_usd": api_cost_usd, "subtitle": None, "subscription_usd": None}
    return {
        "display_usd":      api_cost_usd,
        "subtitle":         f"You pay ${p['monthly']}/mo on {p['label']}",
        "subscription_usd": p["monthly"],
    }
