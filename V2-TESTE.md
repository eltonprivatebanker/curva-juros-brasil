# V2 · teste paralelo

A V2 foi criada como `v2.html` para não substituir o painel atual.

## Suba estes arquivos novos
- v2.html
- css/v2.css
- js/market.js
- scripts/update_tesouro.py
- scripts/update_anbima.py
- scripts/test_connections.py
- data/anbima/index.json
- data/anbima/2026-08-14.json
- data/tesouro/index.json
- .github/workflows/atualizar-tesouro.yml
- .github/workflows/atualizar-anbima.yml

Não altere o `index.html`, `js/app.js`, `css/style.css`, `data/snapshots/` ou os workflows atuais do DI.

## Teste 1 · interface
Abra `/v2.html`. As abas ANBIMA e Conexões já devem funcionar para 14/08/2026.

## Teste 2 · Tesouro Direto
Actions → Atualizar Tesouro Direto → Run workflow.
Quando concluir, a aba Tesouro Direto será preenchida a partir do snapshot gravado em `data/tesouro/`.

## ANBIMA automática
O snapshot inicial é manual. A API automática fica pronta, mas sem credenciais o workflow apenas pula a coleta. Quando houver acesso, crie os secrets `ANBIMA_CLIENT_ID` e `ANBIMA_CLIENT_SECRET`.

Nunca salve credenciais ANBIMA em arquivos públicos.
