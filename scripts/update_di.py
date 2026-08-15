#!/usr/bin/env python3
"""Baixa e consolida curvas de DI1 da B3 usando PYield.

A fonte econômica é a B3. O PYield funciona como cliente/parser do boletim da B3.
O script grava um snapshot JSON por pregão e reconstrói data/index.json.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_DIR = ROOT / "data" / "snapshots"
INDEX_PATH = ROOT / "data" / "index.json"
TZ = ZoneInfo("America/Sao_Paulo")

# Nomes observados/documentados pelo PYield. Os aliases deixam o coletor mais
# tolerante a pequenas mudanças de nomenclatura.
ALIASES = {
    "reference_date": ("data_referencia", "DataReferencia", "TradeDate"),
    "ticker": ("codigo_negociacao", "CodigoNegociacao", "TickerSymbol"),
    "maturity": ("data_vencimento", "DataVencimento", "ExpirationDate"),
    "business_days": ("dias_uteis", "DiasUteis", "BDToExpiration"),
    "rate": ("taxa_ajuste", "TaxaAjuste", "SettlementRate"),
    "open_interest": ("contratos_abertos", "ContratosAbertos", "OpenInterest"),
    "trades": ("numero_negocios", "NumeroNegocios", "TradeCount"),
    "volume": ("volume_financeiro", "VolumeFinanceiro", "FinancialVolume"),
}


def _as_iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()[:10]
    text = str(value)
    return text[:10] if len(text) >= 10 else text


def _number(value: Any) -> float | int | None:
    if value is None:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(n):
        return None
    return int(n) if n.is_integer() else n


def _first(row: dict[str, Any], key: str) -> Any:
    for name in ALIASES[key]:
        if name in row:
            return row[name]
    return None


def dataframe_to_rows(frame: Any) -> list[dict[str, Any]]:
    """Converte Polars/Pandas/iteráveis para lista de dicionários."""
    if frame is None:
        return []
    if hasattr(frame, "to_dicts"):  # Polars
        return frame.to_dicts()
    if hasattr(frame, "to_dict"):  # Pandas
        try:
            return frame.to_dict(orient="records")
        except TypeError:
            pass
    if isinstance(frame, list):
        return [dict(x) for x in frame]
    return [dict(x) for x in frame]


def normalize_row(row: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None]:
    ticker = _first(row, "ticker")
    maturity = _as_iso(_first(row, "maturity"))
    ref_date = _as_iso(_first(row, "reference_date"))
    rate_raw = _number(_first(row, "rate"))

    if not ticker or not maturity or rate_raw is None:
        return ref_date, None

    rate = float(rate_raw)
    # PYield expressa taxas como decimal. A guarda abaixo evita duplicar x100
    # caso uma versão/fonte já entregue percentuais.
    if abs(rate) > 1.5:
        rate = rate / 100.0

    contract: dict[str, Any] = {
        "ticker": str(ticker),
        "maturity": maturity,
        "business_days": _number(_first(row, "business_days")),
        "rate": round(rate, 8),
        "rate_pct": round(rate * 100.0, 4),
    }

    optional = {
        "open_interest": _first(row, "open_interest"),
        "trades": _first(row, "trades"),
        "financial_volume": _first(row, "volume"),
    }
    for key, value in optional.items():
        parsed = _number(value)
        if parsed is not None:
            contract[key] = parsed

    return ref_date, contract


def fetch_history(dates: list[str]) -> list[dict[str, Any]]:
    try:
        import pyield as yd
    except ImportError as exc:
        raise SystemExit(
            "PYield não instalado. Rode: pip install -r requirements.txt"
        ) from exc

    # O endpoint do PYield aceita uma data ou uma lista de datas. Em caso de
    # incompatibilidade futura, fazemos fallback para chamadas individuais.
    try:
        frame = yd.futuro.historico(dates, "DI1")
        return dataframe_to_rows(frame)
    except Exception as batch_exc:
        print(f"[aviso] consulta em lote falhou: {batch_exc}", file=sys.stderr)
        all_rows: list[dict[str, Any]] = []
        for d in dates:
            try:
                frame = yd.futuro.historico(d, "DI1")
                all_rows.extend(dataframe_to_rows(frame))
            except Exception as exc:
                print(f"[aviso] {d}: {exc}", file=sys.stderr)
        return all_rows


def write_snapshots(rows: Iterable[dict[str, Any]], requested_dates: list[str]) -> int:
    grouped: dict[str, list[dict[str, Any]]] = {}
    fallback_date = requested_dates[0] if len(requested_dates) == 1 else None

    for row in rows:
        ref_date, contract = normalize_row(row)
        if contract is None:
            continue
        ref_date = ref_date or fallback_date
        if not ref_date:
            continue
        grouped.setdefault(ref_date, []).append(contract)

    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    generated = datetime.now(TZ).isoformat(timespec="seconds")

    for ref_date, contracts in grouped.items():
        contracts.sort(key=lambda x: (x.get("business_days") is None, x.get("business_days", 10**9), x["maturity"]))
        payload = {
            "schema_version": 1,
            "date": ref_date,
            "source": "B3 (coleta e parsing via PYield)",
            "demo": False,
            "generated_at": generated,
            "contracts": contracts,
        }
        path = SNAPSHOT_DIR / f"{ref_date}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[ok] {ref_date}: {len(contracts)} contratos -> {path.relative_to(ROOT)}")
        written += 1

    return written


def rebuild_index() -> None:
    entries: list[dict[str, Any]] = []
    for path in sorted(SNAPSHOT_DIR.glob("????-??-??.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not payload.get("contracts"):
            continue
        d = payload.get("date") or path.stem
        entries.append({
            "date": d,
            "path": f"data/snapshots/{path.name}",
            "demo": False,
        })

    if not entries:
        print("[info] nenhum snapshot real encontrado; índice demo preservado")
        return

    payload = {
        "schema_version": 1,
        "mode": "live",
        "source": "B3 (coleta e parsing via PYield)",
        "latest": entries[-1]["date"],
        "entries": entries,
    }
    INDEX_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[ok] índice reconstruído com {len(entries)} pregões")


def calendar_dates(start: date, end: date) -> list[str]:
    if end < start:
        raise ValueError("data final anterior à inicial")
    days: list[str] = []
    d = start
    while d <= end:
        # Evita chamadas óbvias em sábados e domingos. Feriados simplesmente
        # retornam vazios no PYield/B3.
        if d.weekday() < 5:
            days.append(d.isoformat())
        d += timedelta(days=1)
    return days


def chunks(items: list[str], size: int) -> Iterable[list[str]]:
    for i in range(0, len(items), size):
        yield items[i:i + size]


def run_latest(lookback: int = 10) -> int:
    today = datetime.now(TZ).date()
    candidates = [
        (today - timedelta(days=i)).isoformat()
        for i in range(lookback)
        if (today - timedelta(days=i)).weekday() < 5
    ]
    # Consulta candidatos em ordem; depois o agrupamento grava qualquer pregão
    # disponível. A data mais recente fica no índice.
    rows = fetch_history(candidates)
    written = write_snapshots(rows, candidates)
    rebuild_index()
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description="Atualiza snapshots da curva DI1 (B3).")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--latest", action="store_true", help="busca o pregão mais recente disponível")
    group.add_argument("--start", help="data inicial YYYY-MM-DD para backfill")
    parser.add_argument("--end", help="data final YYYY-MM-DD; padrão: hoje em São Paulo")
    parser.add_argument("--batch-size", type=int, default=20, help="número de datas por consulta no backfill")
    args = parser.parse_args()

    if args.latest:
        count = run_latest()
        return 0 if count else 2

    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end) if args.end else datetime.now(TZ).date()
    dates = calendar_dates(start, end)
    if not dates:
        print("Nenhuma data útil no intervalo.")
        return 2

    total = 0
    for batch in chunks(dates, max(1, args.batch_size)):
        print(f"[info] lote {batch[0]} -> {batch[-1]} ({len(batch)} datas)")
        rows = fetch_history(batch)
        total += write_snapshots(rows, batch)

    rebuild_index()
    print(f"[fim] {total} snapshots gravados/atualizados")
    return 0 if total else 2


if __name__ == "__main__":
    raise SystemExit(main())
