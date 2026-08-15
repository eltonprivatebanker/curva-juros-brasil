#!/usr/bin/env python3
"""Coleta o histórico oficial do Tesouro Direto e grava snapshots enriquecidos."""

from __future__ import annotations
import argparse
import csv
import io
import json
import math
import re
import unicodedata
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "tesouro"
INDEX_PATH = DATA_DIR / "index.json"
TZ = ZoneInfo("America/Sao_Paulo")

PACKAGE_API = "https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto"
FALLBACK_CSV = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv"
UA = "curva-juros-brasil/2.1 (+GitHub Actions)"

def fetch_bytes(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()

def discover_csv_url() -> str:
    try:
        obj = json.loads(fetch_bytes(PACKAGE_API, 30).decode("utf-8"))
        for resource in obj.get("result", {}).get("resources", []):
            if str(resource.get("format", "")).upper() == "CSV" and "taxas" in str(resource.get("name", "")).lower():
                return resource.get("url") or FALLBACK_CSV
    except Exception as exc:
        print(f"[aviso] descoberta CKAN falhou: {exc}")
    return FALLBACK_CSV

def normalize_key(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")

def field(row: dict, *aliases):
    normalized = {normalize_key(k): v for k, v in row.items()}
    for alias in aliases:
        if normalize_key(alias) in normalized:
            return normalized[normalize_key(alias)]
    return None

def number(value):
    if value is None:
        return None
    text = str(value).strip().replace("R$", "").replace(" ", "")
    if not text:
        return None
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        x = float(text)
        return x if math.isfinite(x) else None
    except ValueError:
        return None

def parse_date(value: str) -> str | None:
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(value).strip(), fmt).date().isoformat()
        except (TypeError, ValueError):
            pass
    return None

def category(title: str) -> str:
    text = (title or "").lower()
    if "prefixado" in text:
        return "prefixado"
    if "renda+" in text:
        return "renda"
    if "educa+" in text:
        return "educa"
    if "selic" in text:
        return "selic"
    if "ipca+" in text:
        return "ipca"
    return "outros"

def rate_indexer(title: str) -> str:
    cat = category(title)
    if cat == "selic":
        return "SELIC"
    if cat in {"ipca", "renda", "educa"}:
        return "IPCA"
    if "igpm" in (title or "").lower():
        return "IGP-M"
    if cat == "prefixado":
        return "PRE"
    return "OUTRO"

def business_days(reference_date: str, maturity: str) -> tuple[int | None, str | None]:
    """Conta DU pelo calendário brasileiro do PYield e ajusta vencimento não útil."""
    try:
        import pyield as yd
        adjusted = yd.du.deslocar(maturity, 0)
        adjusted_iso = adjusted.isoformat() if hasattr(adjusted, "isoformat") else str(adjusted)
        du = yd.du.contar(reference_date, adjusted_iso)
        return (int(du) if du is not None else None, adjusted_iso[:10])
    except Exception as exc:
        print(f"[aviso] DU {reference_date}->{maturity}: {exc}")
        return None, None

def read_rows() -> list[dict]:
    raw = fetch_bytes(discover_csv_url())
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    output = []
    for row in csv.DictReader(io.StringIO(text), delimiter=";"):
        ref = parse_date(field(row, "Data Base"))
        maturity = parse_date(field(row, "Data Vencimento"))
        title = field(row, "Tipo Titulo", "Tipo Título")
        if not (ref and maturity and title):
            continue
        output.append({
            "date": ref,
            "type": str(title).strip(),
            "maturity": maturity,
            "buy_rate_pct": number(field(row, "Taxa Compra Manha", "Taxa Compra Manhã")),
            "sell_rate_pct": number(field(row, "Taxa Venda Manha", "Taxa Venda Manhã")),
            "buy_price": number(field(row, "PU Compra Manha", "PU Compra Manhã")),
            "sell_price": number(field(row, "PU Venda Manha", "PU Venda Manhã")),
            "base_price": number(field(row, "PU Base Manha", "PU Base Manhã")),
        })
    return output

def enrich_title(ref_date: str, row: dict) -> dict:
    title = {k: v for k, v in row.items() if k != "date" and v is not None}
    title["category"] = category(title.get("type", ""))
    title["rate_indexer"] = rate_indexer(title.get("type", ""))
    du, adjusted = business_days(ref_date, title["maturity"])
    if du is not None:
        title["business_days"] = du
    if adjusted:
        title["maturity_business_day"] = adjusted
    title["title_key"] = f'{title.get("type","")}|{title.get("maturity","")}'
    return title

def write_snapshot(ref_date: str, rows_for_date: list[dict]) -> None:
    if not rows_for_date:
        return
    titles = [enrich_title(ref_date, row) for row in rows_for_date]
    titles.sort(key=lambda x: (x.get("category", ""), x.get("type", ""), x.get("maturity", "")))
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": 2,
        "date": ref_date,
        "source": "Tesouro Nacional · Tesouro Transparente",
        "dataset": "Taxas dos Títulos Ofertados pelo Tesouro Direto",
        "generated_at": datetime.now(TZ).isoformat(timespec="seconds"),
        "business_days_source": "PYield · calendário brasileiro",
        "titles": titles,
    }
    (DATA_DIR / f"{ref_date}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"[ok] {ref_date}: {len(titles)} títulos")

def rebuild_index() -> None:
    entries = []
    for path in sorted(DATA_DIR.glob("????-??-??.json")):
        try:
            obj = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if obj.get("titles"):
            entries.append({
                "date": obj.get("date", path.stem),
                "path": f"data/tesouro/{path.name}",
                "schema_version": obj.get("schema_version", 1),
            })
    payload = {
        "schema_version": 2,
        "mode": "live" if entries else "pending",
        "source": "Tesouro Nacional · Tesouro Transparente",
        "latest": entries[-1]["date"] if entries else None,
        "entries": entries,
    }
    INDEX_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[ok] índice Tesouro: {len(entries)} pregões")

def main() -> int:
    parser = argparse.ArgumentParser(description="Atualiza snapshots do Tesouro Direto.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--latest", action="store_true")
    group.add_argument("--date")
    group.add_argument("--start")
    parser.add_argument("--end")
    args = parser.parse_args()

    rows = read_rows()
    if not rows:
        print("[erro] base do Tesouro sem linhas reconhecidas")
        return 2

    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["date"], []).append(row)
    available = sorted(grouped)

    if args.latest:
        targets = [available[-1]]
    elif args.date:
        targets = [args.date]
    else:
        end = args.end or available[-1]
        targets = [d for d in available if args.start <= d <= end]

    for ref_date in targets:
        write_snapshot(ref_date, grouped.get(ref_date, []))
    rebuild_index()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
