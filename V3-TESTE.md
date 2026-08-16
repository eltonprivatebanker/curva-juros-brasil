# Juros Brasil · V3.1 Teste

A V3.1 continua paralela à V2. A página principal e a `v2.html` permanecem intactas.

## Objetivo da V3.1

Fazer o painel ser compreensível antes de ser técnico.

A lógica passa a ser:

**conclusão → explicação → gráfico → detalhe técnico**

## 1. Nova aba Resumo

É a página inicial da V3.1.

Ela responde cinco perguntas:

1. O que aconteceu com os juros?
2. Onde a curva mais mexeu?
3. Quanto o mercado está cobrando em Pré, juro real e inflação implícita?
4. Como posicionar o nível atual no histórico?
5. Como levar isso para a comparação Pós × Pré × IPCA+?

Os cards são clicáveis e levam para a aba correspondente.

## 2. Navegação renomeada

- Resumo
- Juros futuros
- Curva soberana
- Tesouro Direto
- Comparar curvas
- Histórico e cenários
- Aprender
- Comparar renda fixa

A ideia é que o nome da aba já explique sua função.

## 3. “Esta aba responde…”

Cada área recebe uma pergunta-guia no topo.

Exemplos:

**Juros futuros**
> Os juros abriram ou fecharam — e em quais prazos?

**Curva soberana**
> Quanto o mercado exige em taxa nominal, juro real e inflação implícita?

**Comparar curvas**
> DI, ANBIMA e Tesouro estão contando a mesma história?

**Histórico e cenários**
> O nível atual é alto ou baixo comparado ao histórico?

**Comparar renda fixa**
> Como Pós, Pré e IPCA+ se comparam no mesmo horizonte?

## 4. Modo Essencial × Técnico

O painel abre em **Essencial**.

### Essencial
Esconde alguns blocos de detalhe:
- tabela contrato a contrato do DI;
- tabela completa da ANBIMA;
- parâmetros/metodologia técnica;
- tabela detalhada do Tesouro;
- tabela detalhada de basis;
- trajetória forward;
- matriz histórica completa.

### Técnico
Mostra tudo.

A preferência fica salva no navegador.

## 5. Resumo automático

A página inicial lê os próprios arquivos de dados do projeto.

DI:
- último pregão × anterior;
- flat-forward;
- 6M, 1A, 2A, 3A, 5A, 7A e 10A;
- classificação de abertura/fechamento;
- identifica a região de maior movimento.

ANBIMA:
- usa 5A como referência principal quando disponível;
- mostra Pré, juro real e inflação implícita.

Histórico:
- mostra o DI 5A no primeiro carregamento;
- quando a aba de cenários já tiver dados renderizados, o resumo pode indicar se está acima ou abaixo da mediana.

## Arquivos desta etapa

Substituir apenas os mesmos 4 arquivos da V3:

- `v3.html`
- `css/v3.css`
- `js/v3.js`
- `V3-TESTE.md`

A V2 não muda.

## URL

`https://eltonprivatebanker.github.io/curva-juros-brasil/v3.html`

## Teste visual prioritário

Ao abrir a V3.1, a primeira tela deve ser **Resumo**.

O usuário deve conseguir responder, sem abrir nenhuma tabela:

- juros abriram ou fecharam?
- onde mais mexeram?
- qual referência de Pré / juro real / inflação implícita?
- onde buscar o contexto histórico?
- onde comparar Pós, Pré e IPCA+?

Depois altere:

`Modo Essencial → Técnico`

e confirme que as tabelas e blocos de profundidade reaparecem.
