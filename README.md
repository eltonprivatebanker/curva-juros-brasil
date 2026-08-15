# Curva de Juros Brasil — DI Futuro

Painel didático para acompanhar a estrutura a termo dos contratos futuros de DI1, comparar pregões e traduzir movimentos de taxa em pontos-base (bps).

## Arquitetura

- **B3**: fonte oficial dos dados de derivativos.
- **PYield 0.54.2**: cliente/parser usado para baixar e organizar os dados públicos da B3.
- **Python**: gera um JSON por pregão em `data/snapshots/`.
- **GitHub Actions**: atualiza o pregão mais recente e permite backfill histórico sob demanda.
- **GitHub Pages**: hospeda `index.html`, CSS e JavaScript sem backend.

## Estado da V1

O repositório nasce com dois snapshots **sintéticos**, apenas para que a interface funcione imediatamente. O cabeçalho mostra `DEMO`. Assim que o workflow `Atualizar curva DI` grava o primeiro snapshot real, `data/index.json` passa automaticamente para `mode: live` e a interface mostra `B3 · LIVE`.

## Rodar localmente

```bash
python -m http.server 8000
```

Abra `http://localhost:8000` no navegador. Não abra o HTML diretamente com `file://`, porque o navegador pode bloquear os `fetch()` dos JSONs.

## Buscar o pregão mais recente

Requer Python 3.12+.

```bash
pip install -r requirements.txt
python scripts/update_di.py --latest
```

## Fazer backfill

Exemplo desde 2022:

```bash
python scripts/update_di.py --start 2022-01-03 --end 2026-08-14
```

O script ignora fins de semana; feriados ou datas sem pregão retornam vazios e não geram snapshot.

No GitHub, o mesmo processo pode ser iniciado em **Actions → Backfill histórico DI → Run workflow**.

## Publicar no GitHub Pages

Depois de subir o repositório, em **Settings → Pages**, escolha a publicação a partir da branch `main`, pasta `/ (root)`. A URL padrão será semelhante a:

`https://SEU-USUARIO.github.io/curva-juros-brasil/`

## O que a V1 já calcula

- curva atual × curva de comparação;
- movimento por contrato em bps;
- média de movimento da curva;
- leitura de curto, médio e longo prazo;
- maior abertura/fechamento entre os contratos em comum;
- tabela completa dos vértices comparáveis.

## Próximos passos

1. validar a coleta real da B3 no GitHub Actions;
2. executar backfill a partir de 2022;
3. criar curva normalizada por prazo (6m, 1a, 2a, 3a, 5a, 7a, 10a);
4. acrescentar inclinação/steepening/flattening;
5. integrar ETTJ ANBIMA, LTN/NTN-F e taxas prefixadas.

> Uso educacional. O painel não constitui recomendação de investimento.
