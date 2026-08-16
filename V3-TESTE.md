# Juros Brasil · V3.2 Teste

A V3.2 adiciona a **Camada Educacional**. A V2 continua intacta e a V3 segue paralela.

## Objetivo

Fazer com que um cliente consiga navegar sem conhecer previamente:

- DI;
- DI1;
- ETTJ;
- CDI;
- Selic;
- bps;
- DU;
- juro real;
- inflação implícita;
- basis;
- marcação a mercado.

A regra da interface passa a ser:

**nome simples → termo técnico → gráfico → detalhe**

---

## Juros futuros

Antes dos controles e do gráfico, a aba explica:

### DI Futuro
Contrato futuro de taxa de juros negociado na B3.

### Quem forma a curva?
Fluxo visual:

`Participantes → DI1 na B3 → taxas por vencimento → Curva DI`

### O que está sendo negociado?
A camada educacional apresenta a lógica como:

`taxa fixa negociada hoje × DI que será realizado`

Sem tratar DI1 como CDB ou título de renda fixa.

### Posso sair antes?
Explica que a exposição pode ser encerrada por uma operação oposta, sujeita à liquidez.

### Por que importa?
Hedge, gestão de risco, arbitragem e estratégias de mercado.

### Selic × CDI/DI × DI Futuro
Novo fluxo:

`Selic → Taxa DI/CDI → DI Futuro`

### Como interpretar
- taxa sobe = abertura;
- taxa cai = fechamento;
- DI Futuro não é promessa de rentabilidade;
- DI Futuro não é uma previsão garantida da Selic.

### Modo Técnico
Mostra:
- PU anda no sentido inverso da taxa;
- ajustes diários;
- margem de garantia;
- valor nocional no vencimento.

Fonte oficial visível:
`B3 · Futuro de DI1`

---

## Curva soberana / ANBIMA

O título principal vira:

`Curva de juros ANBIMA`

Logo abaixo:

`ETTJ — Estrutura a Termo da Taxa de Juros`

A aba explica que ETTJ é uma **curva de referência**, e não um título específico.

Três blocos:

- Juros nominais — ETTJ Prefixada
- Juro real — ETTJ associada ao IPCA
- Inflação implícita — relação entre nominal e real

Fonte oficial visível:
`ANBIMA · Estrutura a Termo`

No gráfico, `ETTJ Pré` aparece como:
`Juros nominais (ETTJ Pré)`

---

## Comparar curvas

Título mais amigável:

`Juros futuros × Curva soberana ANBIMA`

Subtítulo preserva o termo técnico:
`DI Futuro × ETTJ Prefixada`

`BASIS` passa a aparecer como:
`DIFERENÇA ENTRE CURVAS · BASIS`

---

## Aprender

Novo `Glossário essencial`:

- DI Futuro / DI1
- ETTJ
- CDI / Taxa DI
- Selic
- bp / bps
- DU
- juro real
- inflação implícita
- basis
- marcação a mercado

---

## Arquivos

Substituir os mesmos 4 arquivos da V3:

- `v3.html`
- `css/v3.css`
- `js/v3.js`
- `V3-TESTE.md`

Nenhum arquivo da V2 precisa ser alterado.

## URL

`https://eltonprivatebanker.github.io/curva-juros-brasil/v3.html`

## Testes

### Modo Essencial
Na aba Juros futuros devem aparecer:
1. explicação do DI;
2. quem forma a curva;
3. Selic → CDI/DI → DI Futuro;
4. abertura × fechamento;
5. fonte B3;
6. depois os dados e gráficos.

O bloco sobre PU, margem e ajustes deve ficar escondido.

### Modo Técnico
O bloco:
`Como o contrato DI1 funciona por dentro`
deve aparecer.

### Curva soberana
O cliente deve ver imediatamente:

`ETTJ = Estrutura a Termo da Taxa de Juros`

antes da leitura dos números.

### Aprender
Confirmar que o glossário possui os dez conceitos essenciais.
