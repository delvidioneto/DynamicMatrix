# Manual de configuração dos campos

## Passo a passo rápido

1. Arraste uma coluna de dimensão para **Categorias** (ex.: `DimProduto[Produto]`).
2. Arraste medidas para **Valores** (ex.: Billing, Open Orders, Delivery).
3. Arraste medidas auxiliares para **Informações complementares** (ex.: Billing IBP %, Billing Quota %).
4. Abra **Formatar visual → Indicadores por KPI**.
5. Para cada valor, escolha até 4 complementos (medida + rótulo) e o elemento da célula (fonte, fundo, barras, ícones, URL).
6. Em **Valores**, ajuste tamanho, alinhamento, unidades de exibição e bordas por lado do card.

## Exemplo de mapeamento

| Valor (coluna) | Complemento 1 | Complemento 2 |
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

1. Em **Imagens das categorias**, selecione a categoria no dropdown.
2. Opcional: defina um **Título** customizado.
3. Escolha o **Tipo de imagem**:
   - **PNG (upload)** — importe o arquivo;
   - **SVG (medida/texto)** — cole o SVG ou use o well **Ícone da categoria** (aceita texto entre aspas).
4. O mapa JSON persiste mesmo se a categoria estiver filtrada fora da vista.

## Total Geral

- Texto customizável (ex.: “Total LATAM”).
- Modos: somente texto, somente imagem, ambos.
- Tipo PNG (upload) ou SVG (texto/medida).
- A linha permanece destacada e sticky no topo (com subtotal solicitado).

## Tooltip

Somente a coluna de **Categorias** dispara tooltip. Inclua medidas em **Dicas de ferramentas** para enriquecer o conteúdo.
