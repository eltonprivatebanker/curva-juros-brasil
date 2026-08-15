#!/usr/bin/env python3
"""Valida a estrutura dos snapshots Tesouro V2.1."""
import json, sys
from pathlib import Path
p=Path(sys.argv[1] if len(sys.argv)>1 else "data/tesouro/2026-08-14.json")
o=json.loads(p.read_text(encoding="utf-8"))
assert o.get("titles"), "sem títulos"
missing=[t.get("title_key",t.get("type")) for t in o["titles"] if "business_days" not in t]
print("data:",o.get("date"),"titulos:",len(o["titles"]),"sem_DU:",len(missing))
if missing: print("exemplos sem DU:",missing[:5])
