#!/usr/bin/env python3
from __future__ import annotations
import argparse,csv,io,json,math,re,unicodedata,urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]; DIR=ROOT/'data/tesouro'; IDX=DIR/'index.json'; TZ=ZoneInfo('America/Sao_Paulo')
API='https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto'
FALLBACK='https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv'
def get(url,timeout=120):
 req=urllib.request.Request(url,headers={'User-Agent':'curva-juros-brasil/2.0','Accept':'*/*'}); return urllib.request.urlopen(req,timeout=timeout).read()
def url():
 try:
  o=json.loads(get(API,30).decode()); rs=o.get('result',{}).get('resources',[])
  for r in rs:
   if str(r.get('format','')).upper()=='CSV' and 'taxas' in str(r.get('name','')).lower(): return r.get('url') or FALLBACK
 except Exception as e: print('[aviso] CKAN:',e)
 return FALLBACK
def nk(s): return re.sub(r'[^a-z0-9]+','_',unicodedata.normalize('NFKD',s or '').encode('ascii','ignore').decode().lower()).strip('_')
def field(row,*a):
 m={nk(k):v for k,v in row.items()}
 for x in a:
  if nk(x) in m:return m[nk(x)]
def num(v):
 if v is None:return None
 s=str(v).strip().replace('R$','').replace(' ','')
 if not s:return None
 if ',' in s:s=s.replace('.','').replace(',','.')
 try:
  x=float(s);return x if math.isfinite(x) else None
 except:return None
def dt(v):
 for f in ('%d/%m/%Y','%Y-%m-%d'):
  try:return datetime.strptime(str(v).strip(),f).date().isoformat()
  except:pass
def rows():
 raw=get(url());
 try:text=raw.decode('utf-8-sig')
 except UnicodeDecodeError:text=raw.decode('latin-1')
 out=[]
 for r in csv.DictReader(io.StringIO(text),delimiter=';'):
  base,maturity,title=dt(field(r,'Data Base')),dt(field(r,'Data Vencimento')),field(r,'Tipo Titulo','Tipo Título')
  if not(base and maturity and title):continue
  out.append({'date':base,'type':str(title).strip(),'maturity':maturity,'buy_rate_pct':num(field(r,'Taxa Compra Manha','Taxa Compra Manhã')),'sell_rate_pct':num(field(r,'Taxa Venda Manha','Taxa Venda Manhã')),'buy_price':num(field(r,'PU Compra Manha','PU Compra Manhã')),'sell_price':num(field(r,'PU Venda Manha','PU Venda Manhã')),'base_price':num(field(r,'PU Base Manha','PU Base Manhã'))})
 return out
def write(d,rs):
 ts=[{k:v for k,v in r.items() if k!='date' and v is not None} for r in rs if r['date']==d];ts.sort(key=lambda x:(x.get('type',''),x.get('maturity','')))
 if not ts:return
 DIR.mkdir(parents=True,exist_ok=True);o={'schema_version':1,'date':d,'source':'Tesouro Nacional · Tesouro Transparente','dataset':'Taxas dos Títulos Ofertados pelo Tesouro Direto','generated_at':datetime.now(TZ).isoformat(timespec='seconds'),'titles':ts};(DIR/f'{d}.json').write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('[ok]',d,len(ts),'títulos')
def rebuild():
 es=[]
 for p in sorted(DIR.glob('????-??-??.json')):
  try:o=json.loads(p.read_text(encoding='utf-8'))
  except:continue
  if o.get('titles'):es.append({'date':o.get('date',p.stem),'path':f'data/tesouro/{p.name}'})
 IDX.write_text(json.dumps({'schema_version':1,'mode':'live' if es else 'pending','source':'Tesouro Nacional · Tesouro Transparente','latest':es[-1]['date'] if es else None,'entries':es},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def main():
 a=argparse.ArgumentParser();g=a.add_mutually_exclusive_group(required=True);g.add_argument('--latest',action='store_true');g.add_argument('--date');g.add_argument('--start');a.add_argument('--end');x=a.parse_args();rs=rows();ds=sorted({r['date'] for r in rs});targets=[ds[-1]] if x.latest else [x.date] if x.date else [d for d in ds if x.start<=d<=(x.end or ds[-1])]
 for d in targets:write(d,rs)
 rebuild();return 0
if __name__=='__main__':raise SystemExit(main())
