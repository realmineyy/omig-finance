"""Paths and configuration loading."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.yaml"
CACHE_DIR = ROOT / "cache"
SITE_DATA = ROOT / "docs" / "data"
COMPANY_DIR = SITE_DATA / "companies"

# Sent with every request to Wikipedia so we're a well-behaved client.
USER_AGENT = "equity-research-engine/1.0 (student research project)"


def load_config(path: Path = CONFIG_PATH) -> dict:
    with open(path) as f:
        cfg = yaml.safe_load(f) or {}
    cfg.setdefault("watchlist", [])
    cfg.setdefault("screens", [])
    universe = cfg.setdefault("universe", {})
    universe.setdefault("exchanges", ["NYSE", "Nasdaq"])
    universe.setdefault("time_budget_minutes", 45)
    macro = cfg.setdefault("macro", {})
    macro.setdefault("risk_free_rate", 0.043)
    macro.setdefault("equity_risk_premium", 0.05)
    macro.setdefault("terminal_growth", 0.025)
    # PyYAML reads "2.0e9" as a string, so coerce numeric filter bounds explicitly.
    for screen in cfg["screens"]:
        for cond in screen.get("filters", {}).values():
            if isinstance(cond, dict):
                for bound in ("min", "max"):
                    if cond.get(bound) is not None:
                        cond[bound] = float(cond[bound])
    return cfg
