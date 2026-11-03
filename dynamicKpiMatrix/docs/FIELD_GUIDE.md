# Manual de configuração dos campos

## Passo a passo rápido

1. Arraste uma coluna de dimensão para **Categorias** (ex.: `DimProduto[Produto]`).
2. Arraste medidas para **Valores** (ex.: Billing, Open Orders, Delivery).
3. Arraste medidas auxiliares para **Informações complementares** (ex.: Billing IBP %, Billing Quota %).
4. (Opcional) Arraste medidas DAX que retornam código SVG para o well **SVG**.
5. Abra **Formatar visual → Indicadores**.
6. Em **Indicadores**, selecione o KPI. Em **Complemento**, escolha **Complemento 1** ou **Complemento 2** no dropdown e configure a medida e a formatação daquele slot (fonte, fundo, barras, ícones, URL, formatação condicional). Cada complemento guarda suas próprias configurações.
7. Em **Valores**, ajuste **Texto**, **Número** e **Borda** do bloco valor + complementos.

## Exemplo de mapeamento

| Valor (coluna) | Complemento 1 | Complemento 2 |
| --- | --- | --- |
| Billing | Billing IBP % | Billing Quota % |
| Open Orders | Open IBP % | Open Quota % |
| Delivery | Delivery % | — |

## Ordenação

Em **Categorias → Coluna**:

- Ordem dos dados
- Alfabética A–Z / Z–A

## Imagens por categoria

1. Em **Categorias → Por categoria**, selecione a **Categoria** no dropdown.
2. Escolha a **Exibição**:
   - **Somente texto** — informe o **Texto** (substitui só a apresentação; a identidade da categoria para filtro/seleção permanece).
   - **Somente imagem** — escolha a medida no campo **SVG** (medida do well **SVG**).
   - **Texto e imagem** — preencha **Texto** e **SVG** (imagem à esquerda do texto).
3. O mapa JSON persiste mesmo se a categoria estiver filtrada fora da vista.
4. Cada categoria tem configuração independente (alterar uma não muda as demais).

## Total Geral

Em **Total Geral**, a primeira opção é **Exibição**:

- **Somente texto** — propriedade **Texto** (ex.: “Total LATAM”).
- **Somente imagem** — campo **SVG** (medida DAX no contexto do total).
- **Texto e imagem** — **Texto** + **SVG** (imagem à esquerda).

A linha permanece destacada e sticky no topo (com subtotal solicitado).

## Tooltip

Somente a coluna de **Categorias** dispara tooltip. Inclua medidas em **Dicas de ferramentas** para enriquecer o conteúdo.
