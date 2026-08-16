# Widgets para o Catálogo de Fundos

## Widget 1 — Curva DI atual
Arquivos:
- `curva-di-fundos.html`
- `curva-di-fundos.css`
- `curva-di-fundos.js`

Objetivo:
- curva atual × pregão anterior;
- 6M, 1A, 2A, 3A, 5A, 7A e 10A;
- leitura automática;
- movimento por prazo;
- abertura = laranja; fechamento = azul/ciano.

URL após upload em `/widgets/`:
`https://eltonprivatebanker.github.io/curva-juros-brasil/widgets/curva-di-fundos.html`

## Widget 2 — Evolução da Curva DI
Arquivos:
- `evolucao-di-fundos.html`
- `evolucao-di-fundos.css`
- `evolucao-di-fundos.js`

Objetivo:
- curva atual sempre visível;
- comparação com 1 semana, 1 mês, 3 meses, 6 meses e 1 ano;
- mesmos vértices constantes;
- interpolação flat-forward;
- leitura automática contra a janela histórica mais longa selecionada.

URL após upload:
`https://eltonprivatebanker.github.io/curva-juros-brasil/widgets/evolucao-di-fundos.html`

## Prévia
`preview-fundos.html`

## Incorporação futura no Catálogo

```html
<iframe
  src="https://eltonprivatebanker.github.io/curva-juros-brasil/widgets/curva-di-fundos.html"
  title="Curva DI atual"
  width="100%"
  height="590"
  loading="lazy"
  style="border:0;border-radius:18px;overflow:hidden">
</iframe>
```

```html
<iframe
  src="https://eltonprivatebanker.github.io/curva-juros-brasil/widgets/evolucao-di-fundos.html"
  title="Evolução da Curva DI"
  width="100%"
  height="520"
  loading="lazy"
  style="border:0;border-radius:18px;overflow:hidden">
</iframe>
```

Os widgets usam os dados existentes em `data/index.json` e `data/snapshots/`; não duplicam a coleta.
