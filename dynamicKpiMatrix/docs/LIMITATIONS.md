# Limitações técnicas — Dynamic KPI Matrix

## 1. Associação KPI ↔ complementos

O Power BI Visuals SDK **não** oferece dataRoles aninhados/dinâmicos no painel de campos.

**Alternativa implementada:** wells flat (`kpis` + `complements`) + mapeamento persistente por `queryName` (objects `kpiStyle` com seletor de metadata e/ou `kpiMapping.mappingJson`).

## 2. Imagens SVG

Não há well de dados dentro do painel **Formatar** — apenas no painel **Dados**.

**Alternativa implementada:** well Measure `categoryIcon` (displayName **SVG**) + seleção por `queryName` no Formatar (Total Geral e por categoria). O valor é lido no nó da matrix (contexto de filtro da linha ou do total). SVGs são sanitizados (script, eventos, URLs externas removidos). Upload PNG legado não faz parte do fluxo ativo.

## 3. Formatação condicional

A API oficial de custom visuals aplica formatação condicional nativa principalmente a **cores** (`ConstantOrRule` + `fillRule`). O host avalia as regras e devolve as cores em `DataViewObjects` (nó da categoria e/ou valor da medida).

**Alternativa implementada:** por indicador e por complemento (slots 1 e 2), ColorPicker com botão **fx** para fonte, fundo e cor da barra. A regra fica no metadata do KPI e o visual lê a cor avaliada na célula desse indicador (`complementNFontColor`, `complementNBackColor`, `complementNDataBarColor`). Barras de dados usam toggle + cor (com fx). Ícones usam conjuntos fixos (direcional / semáforo / triângulos) com limiares locais — o SDK não expõe o editor de conjuntos de ícones da Matrix nativa.

## 4. Identificadores de medidas

A chave estável usada é `DataViewMetadataColumn.queryName`. Renomear medidas em DirectQuery/Live Connection pode invalidar o mapeamento. `lineageTag` do modelo tabular não é exposto de forma confiável no DataView.

## 5. Total Geral

`categorical` DataView **não** fornece subtotais. O visual usa **matrix** + Subtotals API. Se o host não devolver nó `isSubtotal`, a linha de total não aparece (o visual **não** inventa a soma das linhas).

## 6. Volume de dados

Data reduction padrão: top 500 categorias. Virtualização de linhas/colunas não está nesta versão; avalie se o volume justificar em releases futuras.

## 7. Hierarquia

Apenas **um nível** de categoria. Sem drill-down / expand-collapse nesta versão.

## 8. Sticky layout

Cabeçalho, Total Geral e primeira coluna usam `position: sticky` em CSS. Em hosts muito antigos o comportamento pode degradar para rolagem simples.
