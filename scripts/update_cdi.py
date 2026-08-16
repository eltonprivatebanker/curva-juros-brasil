#!/usr/bin/env python3
"""Coleta CDI diário do Banco Central (SGS 12) e consolida janelas históricas.

Fonte: Banco Central do Brasil - SGS série 12, "Taxa de juros - CDI".
Unidade da série: percentual ao dia (% a.d.).

A taxa equivalente de cada janela é calculada por composição dos fatores
diários observados, e não por média aritmética:

    fator = Π (1 + CDI_dia / 100)
    taxa_equivalente_aa = fator ** (252 / N_DU) - 1

O arquivo gerado é data/cdi/index.json.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import time
from datetime import date, datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "cdi"
OUT_PATH = OUT_DIR / "index.json"
TZ = ZoneInfo("America/Sao_Paulo")

SERIES_CODE = 12
SERIES_NAME = "Taxa de juros - CDI"
SOURCE = "Banco Central do Brasil · SGS 12"
API_BASE = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{SERIES_CODE}/dados"
DEFAULT_START = date(1986, 3, 6)

HORIZONS = {
    126: "6M",
    252: "1A",
    504: "2A",
    756: "3A",
    1260: "5A",
    1764: "7A",
    2520: "10A",
}


def parse_iso(s: str) -> date:
    return date.fromisoformat(s)


def bcb_date(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def add_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # 29/02 -> 28/02
        return d.replace(month=2, day=28, year=d.year + years)


def fetch_chunk(start: date, end: date, retries: int = 4) -> list[dict]:
    query = urlencode({
        "formato": "json",
        "dataInicial": bcb_date(start),
        "dataFinal": bcb_date(end),
    })
    url = f"{API_BASE}?{query}"
    req = Request(
        url,
        headers={
            "User-Agent": "curva-juros-brasil/2.3 (+GitHub Actions)",
            "Accept": "application/json",
        },
    )
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=45) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            if not isinstance(payload, list):
                raise ValueError("Resposta do SGS não é uma lista.")
            return payload
        except Exception as exc:
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Falha SGS {start}..{end}: {last_error}")


def fetch_series(start: date, end: date) -> list[dict]:
    """Consulta em blocos <10 anos para respeitar limites do serviço SGS."""
    rows: list[dict] = []
    cursor = start
    while cursor <= end:
        chunk_end = min(add_years(cursor, 8), end)
        print(f"[info] SGS 12: {cursor} -> {chunk_end}")
        rows.extend(fetch_chunk(cursor, chunk_end))
        cursor = date.fromordinal(chunk_end.toordinal() + 1)
    return rows


def normalize(rows: Iterable[dict]) -> list[dict]:
    by_date: dict[date, float] = {}
    for row in rows:
        try:
            d = datetime.strptime(str(row["data"]), "%d/%m/%Y").date()
            v = float(str(row["valor"]).replace(",", "."))
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(v) and v > -100:
            by_date[d] = v
    return [{"date": d.isoformat(), "daily_pct": by_date[d]} for d in sorted(by_date)]


def percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return math.nan
    if len(sorted_values) == 1:
        return sorted_values[0]
    x = (len(sorted_values) - 1) * p
    lo = math.floor(x)
    hi = math.ceil(x)
    if lo == hi:
        return sorted_values[lo]
    w = x - lo
    return sorted_values[lo] * (1 - w) + sorted_values[hi] * w


def annual_equivalent_from_log(log_factor: float, business_days: int) -> float:
    return math.expm1(log_factor * 252.0 / business_days) * 100.0


def build_window(observations: list[dict], n: int, label: str) -> dict | None:
    if len(observations) < n:
        return None

    logs = [0.0]
    for obs in observations:
        logs.append(logs[-1] + math.log1p(float(obs["daily_pct"]) / 100.0))

    annual_values: list[float] = []
    sampled: list[dict] = []
    latest = None

    # Uma observação mensal aproximada a cada 21 pregões para manter o JSON leve.
    sample_stride = 21

    for end_idx in range(n, len(observations) + 1):
        start_idx = end_idx - n
        log_factor = logs[end_idx] - logs[start_idx]
        annual = annual_equivalent_from_log(log_factor, n)
        accumulated = math.expm1(log_factor) * 100.0
        annual_values.append(annual)

        point = {
            "date": observations[end_idx - 1]["date"],
            "annual_equivalent_pct": round(annual, 6),
        }
        if (end_idx - n) % sample_stride == 0 or end_idx == len(observations):
            sampled.append(point)

        if end_idx == len(observations):
            latest = {
                "start": observations[start_idx]["date"],
                "end": observations[end_idx - 1]["date"],
                "business_days": n,
                "accumulated_pct": round(accumulated, 6),
                "annual_equivalent_pct": round(annual, 6),
            }

    values = sorted(annual_values)
    dist = {
        "count": len(values),
        "min_pct": round(values[0], 6),
        "p25_pct": round(percentile(values, 0.25), 6),
        "median_pct": round(percentile(values, 0.50), 6),
        "p75_pct": round(percentile(values, 0.75), 6),
        "max_pct": round(values[-1], 6),
        "mean_pct": round(statistics.fmean(values), 6),
    }

    return {
        "label": label,
        "business_days": n,
        "latest": latest,
        "distribution": dist,
        "series": sampled,
    }


def build_payload(observations: list[dict]) -> dict:
    if not observations:
        raise ValueError("Nenhuma observação válida do CDI.")

    latest_daily = float(observations[-1]["daily_pct"])
    latest_annualized = (math.pow(1 + latest_daily / 100.0, 252) - 1) * 100.0

    windows = {}
    for du, label in HORIZONS.items():
        item = build_window(observations, du, label)
        if item:
            windows[str(du)] = item

    return {
        "schema_version": 1,
        "mode": "live",
        "source": SOURCE,
        "series_code": SERIES_CODE,
        "series_name": SERIES_NAME,
        "unit": "% ao dia",
        "methodology": "Composição dos fatores diários; taxa anual equivalente em base 252 DU.",
        "generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
        "history_start": observations[0]["date"],
        "history_end": observations[-1]["date"],
        "observations": len(observations),
        "latest_daily": {
            "date": observations[-1]["date"],
            "daily_pct": round(latest_daily, 6),
            "annualized_252_pct": round(latest_annualized, 6),
        },
        "windows": windows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=DEFAULT_START.isoformat())
    parser.add_argument("--end", default=datetime.now(TZ).date().isoformat())
    args = parser.parse_args()

    start = parse_iso(args.start)
    end = parse_iso(args.end)
    if end < start:
        raise SystemExit("Data final anterior à inicial.")

    rows = fetch_series(start, end)
    observations = normalize(rows)
    payload = build_payload(observations)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(
        f"[ok] {payload['observations']} observações · "
        f"{payload['history_start']} -> {payload['history_end']} · "
        f"{len(payload['windows'])} horizontes -> {OUT_PATH.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
