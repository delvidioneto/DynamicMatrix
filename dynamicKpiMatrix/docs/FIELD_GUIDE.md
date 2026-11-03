# Manual de configuração dos campos

## Passo a passo rápido

1. Arraste uma coluna de dimensão para **Categorias** (ex.: `DimProduto[Produto]`).
2. Arraste medidas para **KPIs principais** (ex.: Billing, Open Orders, Delivery).
3. Arraste medidas auxiliares para **Informações complementares** (ex.: Billing IBP %, Billing Quota %).
4. Abra **Formatar visual → Indicadores por KPI**.
5. Para cada KPI, escolha até 4 complementos e ajuste título/layout/cores.

## Exemplo de mapeamento

| KPI principal | Complemento 1 | Complemento 2 |
| --- | --- | --- |
| Billing | Billing IBP % | Billing Quota % |
| Open Orders | Open IBP % | Open Quota % |
| Delivery | Delivery % | — |

## Ordenação

Em **Categorias**:

- Ordem dos dados
- Alfabética A–Z / Z–A
- Por KPI (informe o `queryName` da medida em “KPI para ordenação”)

## Imagens por categoria

1. Em **Imagens das categorias**, informe o nome exato da categoria.
2. Cole um data URI PNG/SVG ou um bloco `<svg>…</svg>`.
3. O mapa JSON persiste mesmo se a categoria estiver filtrada fora da vista.

Ou use o well **Ícone da categoria** com uma medida que retorne URL/SVG por linha.

## Total Geral

- Texto customizável (ex.: “Total LATAM”).
- Modos: somente texto, somente imagem, ambos.
- A linha permanece destacada e sticky no topo (com subtotal solicitado).

## Tooltip de página

1. Crie uma página de tooltip no relatório.
2. No visual, configure a página de tooltip nas opções do visual.
3. Passe o mouse **apenas** sobre a coluna de categorias — o filtro da categoria é propagado via `SelectionId`.
