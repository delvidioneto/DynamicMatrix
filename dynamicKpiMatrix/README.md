# Dynamic KPI Matrix

Visual personalizado para Microsoft Power BI: matriz dinâmica de KPIs em que **cada célula é um card** com valor principal e até **quatro informações complementares**.

Não depende de nomes fixos de tabelas, categorias ou medidas.

## Instalação

1. Gere o pacote (ou use o `.pbiviz` em `dist/`):

```bash
cd dynamicKpiMatrix
npm install
npm run package
```

2. No Power BI Desktop: **… → Importar um visual de um arquivo** → selecione `dist/dynamicKpiMatrix.pbiviz`.

## Campos (wells)

| Campo | Tipo | Uso |
| --- | --- | --- |
| **Categorias** | Coluna (1) | Dimensão da linha (produto, região, franquia, etc.) |
| **KPIs principais** | Medidas (N) | Cada medida cria uma coluna |
| **Informações complementares** | Medidas (N) | Pool de complementos; associe até 4 por KPI na formatação |
| **Ícone da categoria** | Medida (0–1) | URL, data URI ou SVG por categoria |
| **Dicas de ferramentas** | Medidas | Conteúdo extra no tooltip da coluna de categorias |

## Associação de complementos

O SDK não oferece wells aninhados por KPI. Use:

1. Card **Indicadores por KPI** — selecione o KPI e escolha Complemento 1–4 (queryName).
2. Ou edite o JSON em **Informações Complementares → mappingJson**.

A associação usa `queryName` (não a posição no well), para sobreviver a reordenação/remoção.

## Total Geral

A linha de total vem do **subtotal da Matrix DataView** (API de Subtotals), com a medida avaliada no contexto total do Power BI — **não** é a soma das linhas do visual.

## Tooltip

O tooltip nativo / página de tooltip é acionado **somente** ao passar o mouse na célula da categoria (nome/imagem). Células de KPI não disparam tooltip.

## Formatação

Seções principais: Aparência Geral, Categorias, Imagens das categorias, Total Geral, Cabeçalho, Cores das linhas, Indicadores (KPIs), Informações Complementares, Subtotais, Tooltip.

Prioridade tipográfica: **elemento (KPI) > coluna > global**.

## Imagens

Não há tipo oficial de upload de arquivo em `capabilities.json`. O visual persiste imagens como **texto** (data URI PNG/SVG ou SVG). Limite recomendado ~24 KB. Alternativa: medida no well **Ícone da categoria**.

## Desenvolvimento

```bash
npm start          # debug visual no Power BI Desktop
npm test           # testes unitários do converter/mapper
npm run package    # gera .pbiviz
```

API: `5.11.1` · Tools: `powerbi-visuals-tools` 7.x · Node 18+.

## Documentação adicional

- [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — limitações do SDK e alternativas
- [docs/FIELD_GUIDE.md](docs/FIELD_GUIDE.md) — guia de configuração dos campos
- [dax/examples.dax](dax/examples.dax) — exemplos de medidas
