# Dynamic KPI Matrix

Visual personalizado para Microsoft Power BI: matriz dinâmica em que **cada célula é um card** com um **valor principal** e até **quatro informações complementares**.

Não depende de nomes fixos de tabelas, categorias ou medidas — funciona com qualquer modelo semântico.

**Autor:** Delvidio Demarchi Neto | DQExp · [contato@dqexp.com.br](mailto:contato@dqexp.com.br)

---

## Instalação

1. Gere o pacote (ou use o `.pbiviz` já gerado em `dist/`):

```bash
cd dynamicKpiMatrix
npm install
npm run package
```

2. No Power BI Desktop: **… (reticências) → Importar um visual de um arquivo** → selecione `dist/DynamicKpiMatrix.pbiviz` (ou `dynamicKpiMatrix.pbiviz`, conforme o nome gerado).

3. Arraste o visual para a página do relatório.

---

## Como usar (passo a passo)

### 1. Configure os campos

No painel **Dados** do visual:

| Campo | Obrigatório | O que colocar |
| --- | --- | --- |
| **Categorias** | Sim (1 coluna) | Dimensão da linha (produto, região, franquia, etc.) |
| **Valores** | Sim (≥ 1 medida) | Cada medida vira uma **coluna** da matriz |
| **Informações complementares** | Não | Pool de medidas auxiliares (IBP, Quota, YoY, etc.) |
| **SVG** | Não | Medidas DAX que retornam código SVG (associadas por categoria / Total no Formatar) |
| **Dicas de ferramentas** | Não | Medidas extras só para o tooltip da categoria |

A **ordem** das medidas em **Valores** define a ordem das colunas.

### 2. Associe complementos a cada valor

O Power BI não permite wells aninhados “por coluna”. Por isso:

1. Coloque as medidas auxiliares em **Informações complementares**.
2. Abra **Formato do visual → Indicadores por KPI**.
3. Escolha o valor (KPI) no seletor.
4. Na seção **KPI**: título exibido e orientação dos complementos (vertical / horizontal / automático).
5. Na seção **Complementos**:
   - selecione **Complemento 1–4**;
   - escolha a **medida**;
   - informe o **rótulo**;
   - em **Elemento da célula**, configure como na Matrix nativa: cor da fonte, fundo, barras, ícones ou URL (com botão **fx** onde houver formatação condicional de cor).

A associação usa o `queryName` da medida (não a posição no well), então reordenar ou remover outras medidas não “quebra” o mapeamento.

### 3. Formate o visual

Principais cards no painel **Formato**:

| Card | Para quê |
| --- | --- |
| **Aparência Geral** | Fonte, fundo e tipografia base |
| **Categorias** | **Geral**: largura, tipografia, tamanho/posição da imagem, ordenação. **Imagens**: por categoria — Exibição (texto / imagem / ambos), Texto e SVG |
| **Valores** | Tamanho, cor, alinhamento, **unidades de exibição** (Automático / Nenhum / Milhares / Milhões / Bilhões / Trilhões), casas decimais e **bordas por lado** (esquerda, direita, cima, baixo) no bloco valor + complementos |
| **Total Geral** | Exibir/ocultar, **Exibição** (texto / imagem / ambos), Texto, SVG, estilo da linha |
| **Cabeçalho** | Estilo dos títulos das colunas |
| **Linhas** | Zebra, cores, borda da linha, altura e espaçamento |
| **Colunas** | Fundo, **ligar/desligar borda** da grade, largura e espaçamento entre colunas |
| **Indicadores por KPI** | Título, layout e complementos **por coluna de valor** |
| **Subtotais** | Solicitar subtotal DAX e posição (topo/base) |
| **Tooltip** | Liga/desliga tooltip na coluna de categorias |

### 4. Total Geral

A linha de total usa o **subtotal da Matrix DataView** (contexto total do modelo), **não** a média nem a soma “manual” das linhas renderizadas — alinhado ao comportamento semântico do Power BI.

Se o host não enviar subtotal, o visual faz fallback pela soma das linhas visíveis.

### 5. Imagens (SVG via medida DAX)

1. Arraste uma ou mais medidas que retornam SVG para o well **SVG** no painel Dados.
2. **Categorias → Imagens**: selecione a categoria → escolha **Exibição** → preencha **Texto** e/ou **SVG** conforme o modo. Cada categoria é independente; o texto customizado não altera a identidade usada em filtros/seleção.
3. **Total Geral**: **Exibição** primeiro → **Texto** e/ou **SVG** (medida avaliada no contexto do total).

SVGs são sanitizados (scripts, eventos e URLs externas removidos) e cabem na célula sem distorção (`object-fit: contain`).

### 6. Tooltip

O tooltip nativo / tooltip de página dispara **somente** ao passar o mouse na **célula da categoria** (nome/imagem). Células de valor não abrem tooltip.

---

## Comportamentos importantes

### Largura das colunas

Em **Colunas → Largura da coluna**, o valor pedido é um mínimo desejado. A coluna **nunca fica menor que o maior texto** — mesmo com largura `0`, o conteúdo define o tamanho (`max(largura, texto)`).

### Unidades de exibição

Em **Valores → Unidades de exibição** (controle nativo do Power BI):

| Opção | Efeito |
| --- | --- |
| Automático | Compacta valores grandes quando faz sentido |
| Nenhum | Número completo |
| Milhares / Milhões / Bilhões / Trilhões | Divide pela unidade e acrescenta sufixo (K, M, bn, T) |

### Bordas do bloco de valor

Em **Valores**, ligue independentemente:

- Borda esquerda / direita / superior / inferior  
- Cor, espessura e arredondamento (aparecem quando algum lado está ativo)

A borda envolve o **card interno** (valor principal + complementos), não a grade inteira.

### Formatação condicional nos complementos

No card **Indicadores por KPI → Complementos → Elemento da célula**, as cores de fonte/fundo usam o botão **fx** (regras nativas do Power BI), no espírito dos *Cell elements* da Matrix.

---

## Exemplo rápido de modelo

```
Categorias .............. 'Produto'[Nome]
Valores ................. [Faturamento], [Margem %]
Informações complementares [IBP], [Quota], [YoY]
SVG ..................... [Produto SVG], [Total SVG]   // opcional
Dicas de ferramentas .... [Qtd pedidos]   // opcional
```

Depois, em **Indicadores por KPI**, para *Faturamento*: Complemento 1 = IBP, Complemento 2 = Quota, etc.

Exemplos DAX: [dax/examples.dax](dax/examples.dax).

---

## Desenvolvimento

```bash
npm start          # debug no Power BI Desktop
npm test           # testes do converter/mapper
npm run package    # gera o .pbiviz
```

- API: `5.11.1`
- Tools: `powerbi-visuals-tools` 7.x
- Node: 18+

## Documentação adicional

- [docs/LIMITATIONS.md](docs/LIMITATIONS.md) — limitações do SDK e alternativas
- [docs/FIELD_GUIDE.md](docs/FIELD_GUIDE.md) — guia detalhado dos campos
- [dax/examples.dax](dax/examples.dax) — exemplos de medidas
