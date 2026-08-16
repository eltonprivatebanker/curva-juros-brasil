# Juros Brasil · V3.0 Teste

A `v3.html` é uma página paralela. A `v2.html` permanece intacta.

## O que entra na V3.0

### DI Futuro
A leitura principal passa a usar os mesmos vértices normalizados do gráfico:

- 6M
- 1A
- 2A
- 3A
- 5A
- 7A
- 10A

Metodologia: flat-forward no log do fator de desconto, base 252 DU.

As faixas ficam:
- curto: 6M–1A
- médio: 2A–3A
- longo: 5A–10A

Isso evita misturar médias de contratos com vértices constantes.

### Evolução da Curva DI
Também passa a usar flat-forward e inclui 6M na leitura.

Objetivo: eliminar a inconsistência em que 6M podia fechar na comparação diária e a evolução ainda dizer que todos os vértices estavam acima.

### Contratos de janeiro
A V3 mostra 7 pontos distribuídos ao longo da curva por padrão.

Botão:
`Ver todos os contratos de janeiro`

### Decisão RF
Nova ordem:
1. Entradas
2. Resultado do cenário
3. Referências de mercado
4. Contexto histórico
5. Pontos de equilíbrio / checklist

`maior valor no cenário` vira visualmente:
`maior montante modelado`

### Tesouro Direto
Ao abrir a aba pela primeira vez, a V3 seleciona `Prefixados` em vez de mostrar todos os 60 títulos.

Os filtros existentes continuam disponíveis.

### Cabeçalho
A fonte passa a mudar conforme a aba:
- DI: B3
- ANBIMA: ANBIMA
- Tesouro: Tesouro Nacional
- Conexões: multifonte
- Cenários: BCB + B3
- Decisão: B3 + ANBIMA + BCB

### ANBIMA
`Real` passa visualmente para `Juro real`.

Também fica explícito que inflação implícita é uma referência derivada das curvas, não uma projeção garantida.

### Build
A caixa grande de versão deixa o corpo da página.
A versão fica discreta no rodapé.

## Arquivos

Adicionar apenas:
- `v3.html`
- `css/v3.css`
- `js/v3.js`
- `V3-TESTE.md`

Nenhum arquivo da V2 precisa ser substituído.

## URL de teste

`https://eltonprivatebanker.github.io/curva-juros-brasil/v3.html`

## Testes prioritários

1. DI: 13/02/2026 → 14/08/2026
   - 6M deve aparecer em fechamento;
   - a leitura deve dizer predomínio de abertura, não abertura em todos.

2. Evolução com 6 meses
   - deve ser coerente com os mesmos 7 vértices e com o 6M.

3. Contratos de janeiro
   - 7 aparecem inicialmente;
   - o botão expande todos.

4. Tesouro
   - primeira abertura seleciona Prefixados.

5. Decisão RF
   - Resultado aparece logo após Entradas.

6. Navegação
   - a fonte do cabeçalho muda conforme a aba.
