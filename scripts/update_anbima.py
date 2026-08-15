#!/usr/bin/env python3
from __future__ import annotations
import argparse,base64,json,math,os,urllib.parse,urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1];DIR=ROOT/'data/anbima';IDX=DIR/'index.json';TZ=ZoneInfo('America/Sao_Paulo');TOKEN='https://api.anbima.com.br/oauth/access-token';URL='https://api.anbima.com.br/feed/precos-indices/v1/titulos-publicos/curvas-juros'
def n(v):
 if v is None:return None
 s=str(v).strip();s=s.replace('.','').replace(',','.') if ',' in s else s
 try:
  x=float(s);return x if math.isfinite(x) else None
 except:return None
def walk(o):
 if isinstance(o,dict):
  yield o
  for v in o.values():yield from walk(v)
 elif isinstance(o,list):
  for v in o:yield from walk(v)
def first(o,k):
 for d in walk(o):
  if k in d and d[k] not in(None,''):return d[k]
def normalize(raw):
 date=first(raw,'data_referencia');params=[];curves=[];errors=[];circ=[];seen=set()
 for d in walk(raw):
  ks=set(d)
  if {'b1','b2','b3','b4','l1','l2'}<=ks:
   g=d.get('grupo_indexador') or d.get('grupo') or '—';key=('p',g)
   if key not in seen:seen.add(key);params.append({'group':g,'b1':n(d.get('b1')),'b2':n(d.get('b2')),'b3':n(d.get('b3')),'b4':n(d.get('b4')),'l1':n(d.get('l1')),'l2':n(d.get('l2'))})
  if 'vertice_du' in d and any(k in d for k in ('taxa_prefixadas','taxa_ipca','taxa_implicita')):
   du=int(n(d.get('vertice_du')) or 0);key=('c',du)
   if du and key not in seen:seen.add(key);curves.append({'du':du,'pre_pct':n(d.get('taxa_prefixadas')),'ipca_pct':n(d.get('taxa_ipca')),'implied_pct':n(d.get('taxa_implicita'))})
  if 'valor_erro' in d and 'data_vencimento' in d:errors.append({'title_type':d.get('tipo_titulo'),'selic_code':str(d.get('codigo_selic') or ''),'maturity':d.get('data_vencimento'),'error_pct':n(d.get('valor_erro'))})
  if 'vertice_du' in d and 'taxa' in d and not any(k in d for k in ('taxa_prefixadas','taxa_ipca','taxa_implicita')):circ.append({'du':int(n(d.get('vertice_du')) or 0),'rate_pct':n(d.get('taxa'))})
 curves.sort(key=lambda x:x['du']);circ.sort(key=lambda x:x['du'])
 if not date or not curves:raise ValueError('Resposta ANBIMA não reconhecida')
 return {'schema_version':1,'date':str(date)[:10],'source':'ANBIMA · Curvas de Juros','source_mode':'api','generated_at':datetime.now(TZ).isoformat(timespec='seconds'),'parameters':params,'curves':curves,'circular_3361':circ,'errors':errors}
def fetch(date=None):
 cid=os.getenv('ANBIMA_CLIENT_ID','').strip();sec=os.getenv('ANBIMA_CLIENT_SECRET','').strip()
 if not cid or not sec:raise RuntimeError('ANBIMA_CLIENT_ID/ANBIMA_CLIENT_SECRET não configurados')
 basic=base64.b64encode(f'{cid}:{sec}'.encode()).decode();req=urllib.request.Request(TOKEN,data=json.dumps({'grant_type':'client_credentials'}).encode(),headers={'Content-Type':'application/json','Authorization':f'Basic {basic}'},method='POST');access=json.loads(urllib.request.urlopen(req,timeout=30).read().decode())['access_token'];u=URL+(('?'+urllib.parse.urlencode({'data':date})) if date else '');req=urllib.request.Request(u,headers={'Content-Type':'application/json','client_id':cid,'access_token':access});return json.loads(urllib.request.urlopen(req,timeout=60).read().decode())
def rebuild():
 es=[]
 for p in sorted(DIR.glob('????-??-??.json')):
  try:o=json.loads(p.read_text(encoding='utf-8'))
  except:continue
  if o.get('curves'):es.append({'date':o.get('date',p.stem),'path':f'data/anbima/{p.name}','seed':o.get('source_mode')=='manual_page_seed'})
 IDX.write_text(json.dumps({'schema_version':1,'mode':'live' if any(not e.get('seed') for e in es) else 'seed','source':'ANBIMA · ETTJ','latest':es[-1]['date'] if es else None,'entries':es},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def main():
 a=argparse.ArgumentParser();g=a.add_mutually_exclusive_group(required=True);g.add_argument('--latest',action='store_true');g.add_argument('--date');g.add_argument('--file');a.add_argument('--skip-if-no-credentials',action='store_true');x=a.parse_args()
 try:
  if x.file:
   raw=json.loads(Path(x.file).read_text(encoding='utf-8'));o=raw if raw.get('curves') and raw.get('date') else normalize(raw)
  else:o=normalize(fetch(x.date if x.date else None))
 except RuntimeError as e:
  if x.skip_if_no_credentials:print('[skip]',e);rebuild();return 0
  raise
 DIR.mkdir(parents=True,exist_ok=True);(DIR/f"{o['date']}.json").write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('[ok] ANBIMA',o['date']);rebuild();return 0
if __name__=='__main__':raise SystemExit(main())
