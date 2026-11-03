# Análise de Viabilidade Técnica: Dynamic KPI Matrix Custom Visual

**Data**: 03 de Novembro de 2026  
**Power BI Custom Visuals API**: v5.11.1 (atual)  
**pbiviz tools**: v7.2.1 (atual)

---

## 📊 Tabela de Viabilidade Geral

| Item | Status | Complexidade | Notas |
|------|--------|--------------|-------|
| **Associação KPI ↔ Complementos** | ⚠️ LIMITADO | Alta | Requer roles fixos + mapeamento via objects |
| **Identificadores Estáveis** | ⚠️ LIMITADO | Média | queryName sobrevive rename **só em Import Mode** |
| **Imagens Persistidas** | ✅ VIÁVEL | Média | Base64 em text property, limite ~24KB |
| **Formatação Condicional** | ✅ VIÁVEL | Baixa | Suportada para cores via Formatting Model API |
| **Tooltip de Página** | ✅ VIÁVEL | Baixa | ITooltipService + SelectionId |
| **Total Geral (DAX context)** | ⚠️ LIMITADO | Média | Requer Matrix DataView + Subtotals API |
| **Sticky Header/Column/Total** | ✅ VIÁVEL | Média | CSS/HTML customizado (position: sticky) |

---

## 1. Associação KPI ↔ Medidas Complementares

### Status: ⚠️ **LIMITADO** (Workaround Necessário)

### Análise

**capabilities.json NÃO suporta dataRoles aninhados ou dinâmicos.**

**Evidência:**
- [Microsoft Learn - Capabilities](https://learn.microsoft.com/en-us/power-bi/developer/visuals/capabilities): `dataRoles` são flat, sem suporte a hierarquia.
- [DataView Mappings](https://learn.microsoft.com/en-us/power-bi/developer/visuals/dataview-mappings): `categorical.values` é um array de medidas sem vínculo declarado entre elas.

### Alternativas Reais

#### Opção A: **Roles Fixos com Sufixos** (Recomendada para MVP)

```json
{
  "dataRoles": [
    {
      "name": "category",
      "kind": "Grouping",
      "displayName": "Categoria"
    },
    {
      "name": "kpi1",
      "kind": "Measure",
      "displayName": "KPI 1"
    },
    {
      "name": "kpi1_comp1",
      "kind": "Measure",
      "displayName": "KPI 1 - Complemento 1"
    },
    {
      "name": "kpi1_comp2",
      "kind": "Measure",
      "displayName": "KPI 1 - Complemento 2"
    },
    // ... repetir para kpi2, kpi3, etc. (até 4 KPIs)
    {
      "name": "kpi2",
      "kind": "Measure"
    }
    // Total: 1 categoria + 4 KPIs x 5 roles (kpi + 4 complementos) = 21 roles
  ],
  "dataViewMappings": [
    {
      "conditions": [
        {
          "category": { "max": 1 },
          "kpi1": { "max": 1 },
          "kpi1_comp1": { "max": 1 },
          "kpi1_comp2": { "max": 1 },
          "kpi1_comp3": { "max": 1 },
          "kpi1_comp4": { "max": 1 }
          // ... mesmo padrão para kpi2, kpi3, kpi4
        }
      ],
      "categorical": {
        "categories": {
          "for": { "in": "category" }
        },
        "values": {
          "select": [
            { "bind": { "to": "kpi1" } },
            { "bind": { "to": "kpi1_comp1" } },
            { "bind": { "to": "kpi1_comp2" } },
            { "bind": { "to": "kpi1_comp3" } },
            { "bind": { "to": "kpi1_comp4" } }
            // ... repetir para kpi2, kpi3, kpi4
          ]
        }
      }
    }
  ]
}
```

**Prós:**
- Simples de implementar
- UX clara: usuário arrasta medidas para slots específicos
- Mapeamento direto no DataViewConverter

**Contras:**
- Não é "dinâmico" (usuário precisa escolher slots manualmente)
- Limite fixo de KPIs (ex: 4 KPIs x 5 medidas = 20 roles de medida + 1 categoria)

---

#### Opção B: **Roles Genéricos + Mapeamento via `objects`**

```json
{
  "dataRoles": [
    {
      "name": "category",
      "kind": "Grouping"
    },
    {
      "name": "measures",
      "kind": "Measure",
      "displayName": "Medidas (KPIs e Complementos)"
    }
  ],
  "dataViewMappings": [
    {
      "conditions": [
        {
          "category": { "max": 1 },
          "measures": { "max": 20 }
        }
      ],
      "categorical": {
        "categories": {
          "for": { "in": "category" }
        },
        "values": {
          "select": [
            { "for": { "in": "measures" } }
          ]
        }
      }
    }
  ],
  "objects": {
    "kpiMapping": {
      "properties": {
        "mappings": {
          "type": { "text": true }
        }
      }
    }
  }
}
```

**Mapeamento via Formatting Pane:**

```typescript
// Exemplo de mapeamento persistido via persistProperties
interface KpiMappingSchema {
  kpis: Array<{
    kpiQueryName: string;        // "Sum(Sales[Total])"
    complementQueryNames: string[]; // ["Min(Sales[Total])", "Max(Sales[Total])"]
  }>;
}

// No update():
const mappingsJson = options.dataViews[0].metadata.objects?.kpiMapping?.mappings as string;
const mappings: KpiMappingSchema = JSON.parse(mappingsJson || '{"kpis":[]}');
```

**Prós:**
- Flexível: usuário pode adicionar quantos KPIs quiser (até limite de 20 medidas)
- UI customizada no Formatting Pane

**Contras:**
- UX complexa: usuário precisa mapear manualmente via JSON ou dropdowns
- Requer UI customizada (DropdownSlice para cada medida)
- **queryName não é estável** (ver seção 2)

---

### Recomendação

**Opção A** para MVP/produção:
- UX mais amigável
- Mapeamento previsível
- Limite aceitável (4-6 KPIs é suficiente para maioria dos casos)

---

## 2. Identificadores Estáveis de Medidas

### Status: ⚠️ **LIMITADO** (Instável em DirectQuery/Live Connection)

### Análise

**Power BI Custom Visuals NÃO expõem GUID ou LineageTag de medidas.**

**Evidências:**
- [Community: Rename Breaking Visuals](https://community.fabric.microsoft.com/discussions/power-bi-designer/direct-query--live-connections---changing-columnmeasure-names/4377527): "If you are using live connection and change measure name, the visual will break."
- [GitHub: TabularEditor #937](https://github.com/TabularEditor/TabularEditor/issues/937): LineageTag existe no modelo Tabular, mas **não está disponível na API de Custom Visuals**.
- [UNPKG: visuals-api.d.ts](https://unpkg.com/browse/powerbi-visuals-api@5.7.0/src/visuals-api.d.ts):

```typescript
export interface DataViewMetadataColumn {
    displayName: string;      // "Total de Vendas" (user-facing, MUDA)
    queryName?: string;       // "Sum(Sales[Total])" (interno, PODE mudar)
    format?: string;
    type?: ValueTypeDescriptor;
    isMeasure?: boolean;
    index?: number;
    roles?: { [name: string]: boolean };
    // ❌ Nenhum measureGuid ou lineageTag
}
```

### Comportamento de `queryName`

| Cenário | queryName Persiste? | Observações |
|---------|---------------------|-------------|
| **Rename medida (Import Mode)** | ✅ SIM | Power BI atualiza automaticamente o queryName no DataView |
| **Rename medida (DirectQuery/Live)** | ❌ NÃO | Visual quebra (grey box of death) |
| **Mudança de agregação (Sum → Average)** | ⚠️ PODE MUDAR | queryName reflete a agregação aplicada |
| **Rename coluna subjacente** | ⚠️ PODE MUDAR | Se a medida usa `[ColunaNova]`, queryName muda |

**Evidência de instabilidade:**
- [Community: queryName not updated](https://community.fabric.microsoft.com/t5/Custom-Visuals-Development/Table-columns-queryName-property-not-updated-after-changing-the/m-p/1410381): "If I change the aggregate function, the queryName property doesn't update."

### Workaround

**Use `queryName` como identificador, mas:**

1. **Valide na inicialização:**
   ```typescript
   function validateMeasures(dataView: DataView): boolean {
     const expected = ["Sum(Sales[Total])", "Sum(Sales[Quantity])"];
     const actual = dataView.categorical.values.map(v => v.source.queryName);
     return expected.every(e => actual.includes(e));
   }
   ```

2. **Exiba warning se o mapeamento quebrou:**
   ```typescript
   if (!validateMeasures(dataView)) {
     this.host.displayWarningIcon(
       "Medidas faltando. Verifique se as medidas foram renomeadas.",
       "Medidas Inválidas"
     );
   }
   ```

3. **Documente no AppSource:**
   > "⚠️ Renomear medidas no modelo quebra o visual em DirectQuery/Live Connection. Use Import Mode ou reconfigure o visual após rename."

---

## 3. Imagens (PNG/SVG) Persistidas nas Propriedades

### Status: ✅ **VIÁVEL** (com Limitações de Tamanho)

### Análise

**Formatting Model API suporta `ImageUpload`, mas com limitações de persistência.**

**Evidências:**
- [FormattingSettingsComponents.ts](https://github.com/microsoft/powerbi-visuals-utils-formattingmodel/blob/ff8843c49d6cd315e30f501fd2f36c8d27b8c7bf/src/FormattingSettingsComponents.ts):
  ```typescript
  export class ImageUpload extends SimpleSlice<powerbi.ImageValue> {
    type = visuals.FormattingComponent.ImageUpload;
  }
  ```
- [Community: State Persistence](https://community.fabric.microsoft.com/discussions/developer/power-bi-custom-visual-state-persistence/1660341): "If your property is a complex object, you can declare a text property and stringify the JSON."

### Limitações de Tamanho

**Power Query limite: 32.766 caracteres por célula.**

**Evidências:**
- [StackOverflow: Large Images](https://stackoverflow.com/questions/58640918/how-to-load-large-images-in-powerbi):
  > "The maximum length of a text value that the Power Query engine can load into a single cell is 32766 characters."

**Conversão Base64:**
- 1 byte = 4/3 caracteres Base64
- 32.766 caracteres ÷ 1.33 ≈ **24.600 bytes (~24 KB)**

### Soluções

#### Solução 1: **Base64 em `objects` (Property Text)** ⭐ Recomendada

```json
// capabilities.json
{
  "objects": {
    "categoryImages": {
      "properties": {
        "imageData": {
          "type": { "text": true }
        }
      }
    }
  }
}
```

```typescript
// Estrutura persistida
interface CategoryImageMapping {
  [categoryName: string]: string; // "data:image/png;base64,iVBORw0..."
}

// No Formatting Pane, criar um ImageUpload por categoria
export class CategoryImagesCard extends FormattingCard {
  // ... para cada categoria detectada em runtime
  getCategoryImageSlice(categoryName: string): ImageUpload {
    return new ImageUpload({
      name: `img_${categoryName}`,
      displayName: `Imagem: ${categoryName}`,
      value: { image: this.loadImageForCategory(categoryName) }
    });
  }
}

// Persistir quando usuário altera
public persistCategoryImage(categoryName: string, imageBase64: string) {
  const currentMappings = JSON.parse(
    this.dataView.metadata.objects?.categoryImages?.imageData || '{}'
  );
  currentMappings[categoryName] = imageBase64;
  
  this.host.persistProperties({
    merge: [{
      objectName: 'categoryImages',
      properties: {
        imageData: JSON.stringify(currentMappings)
      },
      selector: null // propriedade global
    }]
  });
}
```

**Prós:**
- Imagens persistidas no .pbix (não requer servidor externo)
- Funciona offline

**Contras:**
- **Limite de ~24KB por imagem** (ex: ícones 100x100 PNG otimizados)
- JSON total pode crescer (ex: 10 categorias x 20KB = 200KB de text property)

---

#### Solução 2: **Image URLs (Azure Blob Storage)**

```json
{
  "objects": {
    "categoryImages": {
      "properties": {
        "imageUrls": {
          "type": { "text": true }
        }
      }
    }
  }
}
```

```typescript
interface CategoryImageUrls {
  [categoryName: string]: string; // "https://mystorageaccount.blob.core.windows.net/icons/produto1.png"
}
```

**Prós:**
- Sem limite de tamanho de imagem
- Imagens podem ser gerenciadas externamente

**Contras:**
- Requer servidor externo
- Não funciona offline
- **Bloqueado em certificação AppSource** se usar domínios não declarados em `externalJS` (capabilities.json)

---

#### Solução 3: **Hybrid: SVG Inline (< 5KB) + URLs para PNG grandes**

```typescript
function getImageForCategory(category: string): string {
  const mapping = this.categoryImageMappings[category];
  
  if (mapping.startsWith('data:image/svg+xml')) {
    return mapping; // SVG Base64 (< 5KB)
  } else if (mapping.startsWith('https://')) {
    return mapping; // URL externa
  } else {
    return mapping; // PNG Base64 (< 24KB)
  }
}
```

---

### Recomendação

**Solução 1** (Base64 em text property) para:
- ✅ Ícones pequenos (até 100x100 PNG otimizados)
- ✅ SVG simples
- ✅ Visual certificado no AppSource (sem rede externa)

**Solução 2** (URLs) se:
- ⚠️ Imagens > 50KB
- ⚠️ Usuário tem infraestrutura de CDN
- ⚠️ Visual interno (não para AppSource)

---

## 4. Formatação Condicional Nativa

### Status: ✅ **VIÁVEL** (Cores Suportadas)

### Análise

**Formatting Model API suporta conditional formatting para cores via `instanceKind: ConstantOrRule`.**

**Evidências:**
- [Microsoft Learn: Conditional Formatting](https://learn.microsoft.com/en-us/power-bi/developer/visuals/conditional-format?tabs=getFormattingModel):

```typescript
formattingGroup.slices.push({
  uid: `colorKPI${index}_uid`,
  displayName: kpiName,
  control: {
    type: powerbi.visuals.FormattingComponent.ColorPicker,
    properties: {
      descriptor: {
        objectName: "kpiColors",
        propertyName: "fill",
        selector: dataViewWildcard.createDataViewWildcardSelector(
          dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
        ),
        altConstantValueSelector: kpiSelectionId.getSelector(),
        instanceKind: powerbi.VisualEnumerationInstanceKinds.ConstantOrRule
      },
      value: { value: "#000000" }
    }
  }
});
```

### Funcionalidades Disponíveis

| Feature | Suportado? | Tipo de Propriedade |
|---------|------------|---------------------|
| **Cor sólida** | ✅ Sim | ColorPicker |
| **Cor por regra (min/max)** | ✅ Sim | ColorPicker + ConstantOrRule |
| **Cor por gradiente** | ✅ Sim | ColorPicker + ConstantOrRule |
| **Cor por valor de campo** | ✅ Sim | ColorPicker + ConstantOrRule |
| **Formatação de número** | ⚠️ Limitado | Não há ConditionalFormattingControl para número |
| **Ícones condicionais** | ❌ Não | FormattingComponent.Icon não suporta rules |

**Evidência:**
- [Microsoft Learn: Conditional Formatting](https://learn.microsoft.com/en-us/power-bi/developer/visuals/conditional-format?tabs=getFormattingModel):
  > "Currently, conditional formatting can only be applied to **color**."

### Limitações vs Visuals Nativos

| Visual Nativo (Table/Matrix) | Custom Visual (Formatting Model API) |
|------------------------------|--------------------------------------|
| ✅ Cor de fundo por célula    | ✅ Cor por data point (via SelectionId) |
| ✅ Cor de fonte por célula    | ✅ Mesma capacidade |
| ✅ Barras de dados (data bars)| ❌ Não suportado (CSS manual) |
| ✅ Ícones (KPI, semáforo)     | ❌ Não suportado nativamente |
| ✅ Web URL condicional        | ⚠️ Possível via text property + rules |

### Exemplo de Implementação

```typescript
// No update(), processar as regras aplicadas pelo usuário
public update(options: VisualUpdateOptions) {
  const dataView = options.dataViews[0];
  const values = dataView.categorical.values;
  
  values.forEach((column, idx) => {
    const objects = column.objects; // Regras de conditional formatting
    
    column.values.forEach((value, rowIdx) => {
      // Power BI já calcula a cor baseada nas regras
      const categoryObjects = dataView.categorical.categories[0].objects?.[rowIdx];
      const fillColor = categoryObjects?.kpiColors?.fill?.solid?.color || '#000000';
      
      // Aplicar no DOM
      const cell = this.table.rows[rowIdx].cells[idx];
      cell.style.backgroundColor = fillColor;
    });
  });
}
```

---

### Recomendação

✅ **Use Formatting Model API para cores condicionais.**

Exemplo de UX no Formatting Pane:
```
┌─ KPI Colors ────────────────────┐
│ ● KPI 1 - Vendas                │
│   ┌──────────────────────────┐  │
│   │ [Cor] ▼ Color by rules   │  │
│   │ ● If value >= 1000 → 🟢  │  │
│   │ ● If value < 500   → 🔴  │  │
│   └──────────────────────────┘  │
└─────────────────────────────────┘
```

Para **ícones/barras**, implemente em CSS/HTML customizado (não há API nativa).

---

## 5. Tooltip de Página (Report Page Tooltip)

### Status: ✅ **VIÁVEL**

### Análise

**ITooltipService suporta report page tooltips desde que o SelectionId seja passado corretamente.**

**Evidências:**
- [Microsoft Learn: Add Tooltips](https://learn.microsoft.com/en-us/power-bi/developer/visuals/add-tooltips):

```json
// capabilities.json
{
  "tooltips": {
    "supportedTypes": {
      "default": true,
      "canvas": true
    },
    "roles": ["tooltips"] // Opcional: permite dataRole específico para tooltip
  }
}
```

```typescript
// No visual.ts
this.tooltipServiceWrapper.addTooltip(
  d3.selectAll('.category-cell'),
  (dataPoint: CategoryDataPoint) => this.getTooltipData(dataPoint),
  (dataPoint: CategoryDataPoint) => dataPoint.selectionId // SelectionId é a chave
);

// Criar SelectionId no DataViewConverter
export function convertDataView(dataView: DataView, host: IVisualHost): ViewModel {
  const categories = dataView.categorical.categories[0];
  
  return categories.values.map((categoryValue, index) => {
    const selectionId = host.createSelectionIdBuilder()
      .withCategory(categories, index)
      .createSelectionId();
    
    return {
      category: categoryValue as string,
      selectionId: selectionId,
      // ... outras props
    };
  });
}
```

### Requisitos

1. ✅ **capabilities.json** deve declarar `tooltips` (mostrado acima)
2. ✅ **SelectionId** deve incluir `withCategory()` para que o Power BI saiba qual linha filtrar na tooltip page
3. ⚠️ **Tooltip page** criada pelo usuário no Power BI Desktop deve ter filtros compatíveis com o SelectionId

### UX Sugerida

**Habilitar tooltip de página APENAS na coluna de categoria:**

```typescript
// Aplicar tooltip apenas em .category-cell, não em .kpi-cell
this.table.querySelectorAll('.category-cell').forEach((cell, index) => {
  cell.addEventListener('mouseenter', (event) => {
    const dataPoint = this.viewModel.rows[index];
    
    this.tooltipService.show({
      coordinates: [event.clientX, event.clientY],
      isTouchEvent: false,
      dataItems: [
        { displayName: 'Categoria', value: dataPoint.category }
      ],
      identities: [dataPoint.selectionId] // ← Report page tooltip usa isso
    });
  });
});
```

**Resultado:**
- Hover em **categoria** → Report page tooltip
- Hover em **KPI** → Default tooltip (valor numérico)

---

### Recomendação

✅ **Implemente ITooltipService + SelectionId para categoria.**

Documentar no AppSource:
> "Para usar Report Page Tooltips, crie uma página de tooltip no Power BI Desktop e configure os filtros para a dimensão 'Categoria'."

---

## 6. Total Geral (Contexto DAX, não soma de linhas)

### Status: ⚠️ **LIMITADO** (Requer Matrix DataView)

### Análise

**Categorical DataView NÃO fornece subtotais/totais. É necessário usar Matrix DataView + Subtotals API.**

**Evidências:**
- [StackOverflow: Get Total Values](https://stackoverflow.com/questions/34920994/how-to-get-total-min-and-max-values-from-category):
  > "Categorical data views don't provide you with subtotals. To get subtotals, you need to use a **Table data view** or a **Matrix data view**."
  
- [Microsoft Learn: Subtotal API](https://learn.microsoft.com/en-us/power-bi/developer/visuals/total-subtotal-api):
  ```json
  // capabilities.json
  {
    "dataViewMappings": [
      {
        "matrix": {
          "rows": {
            "for": { "in": "category" }
          },
          "values": {
            "select": [
              { "for": { "in": "measures" } }
            ]
          }
        },
        "subtotals": {
          "rowSubtotals": {
            "propertyIdentifier": {
              "objectName": "subTotals",
              "propertyName": "rowSubtotals"
            },
            "defaultValue": true
          },
          "rowSubtotalsType": {
            "propertyIdentifier": {
              "objectName": "subTotals",
              "propertyName": "rowSubtotalsType"
            },
            "defaultValue": "Bottom"
          }
        }
      }
    ]
  }
  ```

### Estrutura do DataView Matrix

```typescript
interface DataViewMatrix {
  rows: DataViewHierarchy; // Categorias
  columns: DataViewHierarchy; // Vazio (sem colunas pivotadas)
  valueSources: DataViewMetadataColumn[]; // Medidas
}

interface DataViewHierarchy {
  levels: DataViewHierarchyLevel[];
  root: DataViewMatrixNode; // Nó raiz contém children + isSubtotal: true
}

interface DataViewMatrixNode {
  level: number;
  value: any; // Valor da categoria OU "(Total)"
  identity?: DataViewScopeIdentity;
  children?: DataViewMatrixNode[];
  values?: { [measureIndex: number]: DataViewTreeNodeValue };
  isSubtotal?: boolean; // ← TRUE para linha de total
}
```

### Exemplo de Conversão

```typescript
export function convertMatrixDataView(dataView: DataView): ViewModel {
  const matrix = dataView.matrix;
  if (!matrix) return { rows: [], totals: [] };
  
  const rows: Row[] = [];
  const totals: number[] = [];
  
  // Processar nós (categorias)
  function traverseNodes(node: DataViewMatrixNode, level: number) {
    if (node.children) {
      node.children.forEach(child => {
        if (child.isSubtotal) {
          // ✅ Total Geral (calculado pelo DAX no contexto vazio)
          totals.push(...extractValues(child, matrix.valueSources));
        } else {
          // Categoria normal
          rows.push({
            category: child.value as string,
            kpiValues: extractValues(child, matrix.valueSources)
          });
          
          // Recursão para subcategorias
          traverseNodes(child, level + 1);
        }
      });
    }
  }
  
  traverseNodes(matrix.rows.root, 0);
  
  return { rows, totals };
}

function extractValues(node: DataViewMatrixNode, valueSources: DataViewMetadataColumn[]): number[] {
  return valueSources.map((source, idx) => {
    const value = node.values?.[idx];
    return value?.value as number || null;
  });
}
```

### Alternativa: **Categorical + Medida de Total Separada**

Se você NÃO usar Matrix DataView:

```dax
// No modelo DAX, criar medida de total
Total Vendas Global = 
  CALCULATE(
    SUM(Sales[Amount]),
    ALL(Sales[Category]) // Remove filtro de categoria
  )
```

**No visual:**
```json
{
  "dataRoles": [
    { "name": "category", "kind": "Grouping" },
    { "name": "kpis", "kind": "Measure" },
    { "name": "totals", "kind": "Measure", "displayName": "Totais Globais" }
  ]
}
```

**Prós:**
- Mais simples (Categorical DataView)
- Usuário controla lógica de total (DAX)

**Contras:**
- Usuário precisa criar medidas duplicadas ([KPI] e [KPI Total])

---

### Recomendação

**Matrix DataView + Subtotals API** se:
- ✅ Você quer total automático (sem medidas duplicadas)
- ✅ Visual precisa de hierarquias (categoria → subcategoria)

**Categorical + Medidas Separadas** se:
- ✅ Visual é simples (1 nível de categoria)
- ✅ Mais fácil de implementar (MVP)

---

## 7. Versão Recomendada (2025/2026)

### Status: ✅ **DEFINIDO**

**Evidências:**
- [GitHub Release: pbiviz v7.2.1](https://github.com/microsoft/PowerBI-visuals-tools/releases/tag/v7.2.1) (Julho 2026)
- [Changelog](https://github.com/Microsoft/PowerBI-visuals-tools/blob/main/Changelog.md):
  > "Bumped apiVersion to 5.11.1 in the visual templates' pbiviz.json."

### Stack Atual (Novembro 2026)

| Componente | Versão | Instalação |
|------------|--------|------------|
| **Node.js** | 20 LTS (≥ 20.19.0) | [nodejs.org](https://nodejs.org) |
| **pbiviz tools** | 7.2.1 | `npm i -g powerbi-visuals-tools@latest` |
| **powerbi-visuals-api** | 5.11.1 | (incluído no template) |
| **TypeScript** | 5.x | (gerenciado pelo pbiviz) |
| **Webpack** | 5.x | (gerenciado pelo pbiviz) |

### Breaking Changes Relevantes

#### pbiviz 7.0.0 (2026)
- ❌ **Removidos polyfills do Node.js** (crypto, buffer, stream)
- ⚠️ **Node.js 20.19.0+ obrigatório** (versões anteriores não suportadas)

**Evidência:**
- [Changelog 7.0.0](https://github.com/Microsoft/PowerBI-visuals-tools/blob/main/Changelog.md#700):
  > "Removed Node.js polyfills from webpack configuration for improved security and reduced bundle size."

**Ação Necessária:**
Se você usa `crypto`, `Buffer`, ou `stream` no código do visual:
```typescript
// ❌ Não funciona mais:
import crypto from 'crypto';

// ✅ Use alternativas browser-native ou bibliotecas Web Crypto API:
const hash = await crypto.subtle.digest('SHA-256', buffer);
```

#### pbiviz 5.0.0 (2024)
- ⚠️ **getFormattingModel()** substituiu `enumerateObjectInstances()` (deprecated mas ainda funciona)

---

### Comandos de Setup

```bash
# 1. Verificar Node.js
node --version
# Esperado: v20.19.0 ou superior

# 2. Instalar pbiviz globalmente
npm install -g powerbi-visuals-tools@latest

# 3. Criar novo visual
pbiviz new DynamicKPIMatrix

# 4. Verificar versões
cd DynamicKPIMatrix
cat pbiviz.json | grep apiVersion
# Esperado: "apiVersion": "5.11.1"

# 5. Instalar dependências
npm install

# 6. Iniciar dev server
pbiviz start
```

---

## 📐 Proposta de Arquitetura

### capabilities.json (Opção A: Roles Fixos)

```json
{
  "dataRoles": [
    {
      "name": "category",
      "kind": "Grouping",
      "displayName": "Categoria",
      "description": "Dimensão principal (ex: Produto, Cliente)"
    },
    {
      "name": "kpi1",
      "kind": "Measure",
      "displayName": "KPI 1"
    },
    {
      "name": "kpi1_comp1",
      "kind": "Measure",
      "displayName": "KPI 1 - Complemento 1"
    },
    {
      "name": "kpi1_comp2",
      "kind": "Measure",
      "displayName": "KPI 1 - Complemento 2"
    },
    {
      "name": "kpi1_comp3",
      "kind": "Measure",
      "displayName": "KPI 1 - Complemento 3"
    },
    {
      "name": "kpi1_comp4",
      "kind": "Measure",
      "displayName": "KPI 1 - Complemento 4"
    },
    {
      "name": "kpi2",
      "kind": "Measure",
      "displayName": "KPI 2"
    },
    {
      "name": "kpi2_comp1",
      "kind": "Measure",
      "displayName": "KPI 2 - Complemento 1"
    },
    {
      "name": "kpi2_comp2",
      "kind": "Measure",
      "displayName": "KPI 2 - Complemento 2"
    },
    {
      "name": "kpi2_comp3",
      "kind": "Measure",
      "displayName": "KPI 2 - Complemento 3"
    },
    {
      "name": "kpi2_comp4",
      "kind": "Measure",
      "displayName": "KPI 2 - Complemento 4"
    },
    {
      "name": "kpi3",
      "kind": "Measure",
      "displayName": "KPI 3"
    },
    {
      "name": "kpi3_comp1",
      "kind": "Measure",
      "displayName": "KPI 3 - Complemento 1"
    },
    {
      "name": "kpi3_comp2",
      "kind": "Measure",
      "displayName": "KPI 3 - Complemento 2"
    },
    {
      "name": "kpi3_comp3",
      "kind": "Measure",
      "displayName": "KPI 3 - Complemento 3"
    },
    {
      "name": "kpi3_comp4",
      "kind": "Measure",
      "displayName": "KPI 3 - Complemento 4"
    },
    {
      "name": "kpi4",
      "kind": "Measure",
      "displayName": "KPI 4"
    },
    {
      "name": "kpi4_comp1",
      "kind": "Measure",
      "displayName": "KPI 4 - Complemento 1"
    },
    {
      "name": "kpi4_comp2",
      "kind": "Measure",
      "displayName": "KPI 4 - Complemento 2"
    },
    {
      "name": "kpi4_comp3",
      "kind": "Measure",
      "displayName": "KPI 4 - Complemento 3"
    },
    {
      "name": "kpi4_comp4",
      "kind": "Measure",
      "displayName": "KPI 4 - Complemento 4"
    }
  ],
  "dataViewMappings": [
    {
      "conditions": [
        {
          "category": { "max": 1 },
          "kpi1": { "max": 1 },
          "kpi1_comp1": { "max": 1 },
          "kpi1_comp2": { "max": 1 },
          "kpi1_comp3": { "max": 1 },
          "kpi1_comp4": { "max": 1 },
          "kpi2": { "max": 1 },
          "kpi2_comp1": { "max": 1 },
          "kpi2_comp2": { "max": 1 },
          "kpi2_comp3": { "max": 1 },
          "kpi2_comp4": { "max": 1 },
          "kpi3": { "max": 1 },
          "kpi3_comp1": { "max": 1 },
          "kpi3_comp2": { "max": 1 },
          "kpi3_comp3": { "max": 1 },
          "kpi3_comp4": { "max": 1 },
          "kpi4": { "max": 1 },
          "kpi4_comp1": { "max": 1 },
          "kpi4_comp2": { "max": 1 },
          "kpi4_comp3": { "max": 1 },
          "kpi4_comp4": { "max": 1 }
        }
      ],
      "categorical": {
        "categories": {
          "for": { "in": "category" }
        },
        "values": {
          "select": [
            { "bind": { "to": "kpi1" } },
            { "bind": { "to": "kpi1_comp1" } },
            { "bind": { "to": "kpi1_comp2" } },
            { "bind": { "to": "kpi1_comp3" } },
            { "bind": { "to": "kpi1_comp4" } },
            { "bind": { "to": "kpi2" } },
            { "bind": { "to": "kpi2_comp1" } },
            { "bind": { "to": "kpi2_comp2" } },
            { "bind": { "to": "kpi2_comp3" } },
            { "bind": { "to": "kpi2_comp4" } },
            { "bind": { "to": "kpi3" } },
            { "bind": { "to": "kpi3_comp1" } },
            { "bind": { "to": "kpi3_comp2" } },
            { "bind": { "to": "kpi3_comp3" } },
            { "bind": { "to": "kpi3_comp4" } },
            { "bind": { "to": "kpi4" } },
            { "bind": { "to": "kpi4_comp1" } },
            { "bind": { "to": "kpi4_comp2" } },
            { "bind": { "to": "kpi4_comp3" } },
            { "bind": { "to": "kpi4_comp4" } }
          ]
        }
      }
    }
  ],
  "objects": {
    "categoryImages": {
      "displayName": "Imagens de Categoria",
      "properties": {
        "imageData": {
          "displayName": "Dados de Imagem (JSON)",
          "type": { "text": true }
        }
      }
    },
    "kpiColors": {
      "displayName": "Cores de KPI",
      "properties": {
        "fill": {
          "displayName": "Cor",
          "type": { "fill": { "solid": { "color": true } } }
        }
      }
    },
    "subTotals": {
      "displayName": "Totais",
      "properties": {
        "show": {
          "displayName": "Mostrar Total Geral",
          "type": { "bool": true }
        }
      }
    }
  },
  "tooltips": {
    "supportedTypes": {
      "default": true,
      "canvas": true
    }
  },
  "supportsHighlight": true,
  "sorting": {
    "default": {}
  }
}
```

---

### objects Schema (Imagens + Cores)

```typescript
// src/settings.ts
export interface CategoryImageMapping {
  [categoryName: string]: string; // "data:image/png;base64,..."
}

export interface VisualSettings {
  categoryImages: {
    imageData: string; // JSON.stringify(CategoryImageMapping)
  };
  kpiColors: {
    fill: string; // "#FF0000" ou rule
  };
  subTotals: {
    show: boolean;
  };
}
```

---

### DataViewConverter (Estrutura Mínima)

```typescript
// src/dataViewConverter.ts
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

export interface KpiColumn {
  displayName: string;
  queryName: string;
  format: string;
  complementColumns: MeasureColumn[];
}

export interface MeasureColumn {
  displayName: string;
  queryName: string;
  format: string;
}

export interface Row {
  category: string;
  categoryImage: string | null;
  selectionId: powerbi.visuals.ISelectionId;
  kpiValues: Array<{
    kpi: number | null;
    complements: Array<number | null>;
  }>;
}

export interface ViewModel {
  rows: Row[];
  kpiColumns: KpiColumn[];
  totalRow: Row | null;
}

export function convertDataView(dataView: DataView, host: IVisualHost): ViewModel {
  if (!dataView?.categorical?.categories?.[0]) {
    return { rows: [], kpiColumns: [], totalRow: null };
  }

  const categories = dataView.categorical.categories[0];
  const values = dataView.categorical.values;
  
  // Carregar imagens persistidas
  const imageDataJson = dataView.metadata.objects?.categoryImages?.imageData as string;
  const categoryImages: CategoryImageMapping = JSON.parse(imageDataJson || '{}');
  
  // Detectar KPIs e complementos por prefixo de role
  const kpiGroups = groupMeasuresByKPI(values);
  
  // Construir linhas
  const rows: Row[] = categories.values.map((categoryValue, rowIndex) => {
    const category = categoryValue as string;
    const selectionId = host.createSelectionIdBuilder()
      .withCategory(categories, rowIndex)
      .createSelectionId();
    
    const kpiValues = kpiGroups.map(group => ({
      kpi: group.kpiColumn?.values[rowIndex] as number || null,
      complements: group.complementColumns.map(col => col.values[rowIndex] as number || null)
    }));
    
    return {
      category,
      categoryImage: categoryImages[category] || null,
      selectionId,
      kpiValues
    };
  });
  
  return {
    rows,
    kpiColumns: kpiGroups.map(g => ({
      displayName: g.kpiColumn?.source.displayName || '',
      queryName: g.kpiColumn?.source.queryName || '',
      format: g.kpiColumn?.source.format || '',
      complementColumns: g.complementColumns.map(c => ({
        displayName: c.source.displayName,
        queryName: c.source.queryName,
        format: c.source.format
      }))
    })),
    totalRow: null // TODO: implementar com Matrix DataView
  };
}

function groupMeasuresByKPI(values: powerbi.DataViewValueColumns) {
  const groups: Array<{
    kpiColumn: powerbi.DataViewValueColumn | null;
    complementColumns: powerbi.DataViewValueColumn[];
  }> = [];
  
  for (let i = 1; i <= 4; i++) {
    const kpiColumn = values.find(v => v.source.roles?.[`kpi${i}`]);
    const complementColumns = [
      values.find(v => v.source.roles?.[`kpi${i}_comp1`]),
      values.find(v => v.source.roles?.[`kpi${i}_comp2`]),
      values.find(v => v.source.roles?.[`kpi${i}_comp3`]),
      values.find(v => v.source.roles?.[`kpi${i}_comp4`])
    ].filter(Boolean);
    
    if (kpiColumn || complementColumns.length > 0) {
      groups.push({ kpiColumn, complementColumns });
    }
  }
  
  return groups;
}
```

---

## 🚨 Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **queryName muda em DirectQuery** | Alta | Alto | Documentar limitação + validação em runtime |
| **Imagem > 24KB truncada** | Média | Médio | Validar tamanho no upload + mensagem de erro |
| **Usuário não mapeia complementos corretamente** | Média | Baixo | UI intuitiva (slots nomeados "KPI 1 → Comp 1") |
| **Total DAX incorreto** | Baixa | Alto | Exemplo DAX na documentação |
| **Performance com 1000+ linhas** | Média | Médio | Virtual scrolling (ex: react-window) |

---

## ✅ Checklist de Implementação

### Fase 1: MVP (Core Features)
- [ ] Setup pbiviz 7.2.1 + Node 20 LTS
- [ ] capabilities.json com 4 KPIs fixos (20 roles)
- [ ] DataViewConverter básico (Categorical)
- [ ] Renderização HTML Table (sticky header/column via CSS)
- [ ] Formatting Model API: cores por KPI
- [ ] ITooltipService para categoria

### Fase 2: Imagens
- [ ] objects.categoryImages (text property)
- [ ] ImageUpload no Formatting Pane (1 por categoria)
- [ ] Validação de tamanho (< 24KB)
- [ ] Fallback: ícone padrão se imagem ausente

### Fase 3: Totais
- [ ] Matrix DataView (substituir Categorical)
- [ ] Subtotals API (rowSubtotals)
- [ ] Sticky total row (CSS: position: sticky; bottom: 0)

### Fase 4: Formatação Condicional
- [ ] instanceKind: ConstantOrRule para cores
- [ ] Processar rules no update()
- [ ] Aplicar cores em células

### Fase 5: Polish
- [ ] Validação de queryName (warning se medida falta)
- [ ] Loading state (renderingStarted/Finished)
- [ ] Testes com datasets grandes (> 500 linhas)
- [ ] Documentação AppSource

---

## 📚 Referências (URLs)

1. **Capabilities & DataRoles**: https://learn.microsoft.com/en-us/power-bi/developer/visuals/capabilities
2. **DataView Mappings**: https://learn.microsoft.com/en-us/power-bi/developer/visuals/dataview-mappings
3. **Conditional Formatting**: https://learn.microsoft.com/en-us/power-bi/developer/visuals/conditional-format?tabs=getFormattingModel
4. **Subtotals API**: https://learn.microsoft.com/en-us/power-bi/developer/visuals/total-subtotal-api
5. **Add Tooltips**: https://learn.microsoft.com/en-us/power-bi/developer/visuals/add-tooltips
6. **Objects & Properties**: https://learn.microsoft.com/en-us/power-bi/developer/visuals/objects-properties
7. **pbiviz Tools Releases**: https://github.com/microsoft/PowerBI-visuals-tools/releases
8. **Formatting Model Utils**: https://github.com/microsoft/powerbi-visuals-utils-formattingmodel
9. **Sample Bar Chart (código de referência)**: https://github.com/microsoft/PowerBI-visuals-sampleBarChart
10. **Rename Breaking Visuals (community)**: https://community.fabric.microsoft.com/discussions/power-bi-designer/direct-query--live-connections---changing-columnmeasure-names/4377527

---

## 🎯 Conclusão

O visual **Dynamic KPI Matrix** é **VIÁVEL** com as seguintes considerações:

### ✅ Completamente Suportado
- Sticky header/column/total (CSS puro)
- Formatação condicional de cores
- Tooltips de página na categoria
- Imagens pequenas (< 24KB) via Base64

### ⚠️ Suportado com Limitações
- KPIs ↔ complementos via roles fixos (não dinâmico)
- queryName estável **apenas em Import Mode**
- Total Geral requer Matrix DataView OU medidas DAX duplicadas

### ❌ Não Suportado
- Ícones/barras condicionais nativos (manual CSS/HTML)
- Imagens > 24KB persistidas (requer URL externa)
- dataRoles aninhados/dinâmicos

**Recomendação final:**  
Avançar com **Opção A (roles fixos)** + **Categorical DataView** + **Base64 para ícones** para MVP funcional em 4-6 semanas de desenvolvimento.
