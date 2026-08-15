#!/usr/bin/env python3
import argparse,json,math
from pathlib import Path
R=Path(__file__).resolve().parents[1];V=[126,252,504,756,1260,2520]
def ip(cs,du):
 p=sorted((float(c['business_days']),float(c['rate_pct'])) for c in cs if c.get('business_days') is not None and c.get('rate_pct') is not None);e=next((y for x,y in p if x==du),None)
 if e is not None:return e
 l=max((z for z in p if z[0]<du),default=None);r=min((z for z in p if z[0]>du),default=None)
 return math.nan if not l or not r else l[1]+(du-l[0])/(r[0]-l[0])*(r[1]-l[1])
def main():
 a=argparse.ArgumentParser();a.add_argument('--date',default='2026-08-14');x=a.parse_args();di=json.loads((R/f'data/snapshots/{x.date}.json').read_text());an=json.loads((R/f'data/anbima/{x.date}.json').read_text());m={int(z['du']):z for z in an['curves']};print('DU     DI %      ANBIMA %   BASIS bps')
 for du in V:
  if du not in m or m[du].get('pre_pct') is None:continue
  d=ip(di['contracts'],du);p=float(m[du]['pre_pct']);print(f'{du:4d}  {d:8.4f}  {p:10.4f}  {(p-d)*100:9.1f}')
if __name__=='__main__':main()
