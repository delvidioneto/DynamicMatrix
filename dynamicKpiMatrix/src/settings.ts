"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { defaultStyle, ResolvedVisualStyle, SortMode, DisplayMode, Align, ImagePlacement } from "./data/viewModel";
import { parseImagesJson } from "./data/kpiMapper";
import { upsertCategoryImage } from "./services/ImageManager";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

const LAYOUTS = [
    { value: "auto", displayName: "Automático" },
    { value: "vertical", displayName: "Vertical" },
    { value: "horizontal", displayName: "Horizontal" },
];

const WIDTH_MODES = [
    { value: "auto", displayName: "Automática" },
    { value: "fixed", displayName: "Manual (px)" },
];

const SORT_MODES = [
    { value: "data", displayName: "Ordem dos dados" },
    { value: "alphaAsc", displayName: "Alfabética A–Z" },
    { value: "alphaDesc", displayName: "Alfabética Z–A" },
    { value: "kpiAsc", displayName: "Por KPI (crescente)" },
    { value: "kpiDesc", displayName: "Por KPI (decrescente)" },
];

const DISPLAY_MODES = [
    { value: "text", displayName: "Somente texto" },
    { value: "image", displayName: "Somente imagem" },
    { value: "both", displayName: "Texto e imagem" },
];

const ALIGNS = [
    { value: "left", displayName: "Esquerda" },
    { value: "center", displayName: "Centro" },
    { value: "right", displayName: "Direita" },
];

const IMAGE_PLACES = [
    { value: "left", displayName: "À esquerda do texto" },
    { value: "above", displayName: "Acima do texto" },
];

const WEIGHTS = [
    { value: "400", displayName: "Regular" },
    { value: "600", displayName: "Semibold" },
    { value: "700", displayName: "Bold" },
];

const CF_APPLY = [
    { value: "value", displayName: "Valor principal" },
    { value: "background", displayName: "Fundo da célula" },
    { value: "both", displayName: "Valor e fundo" },
];

function color(name: string, displayName: string, value: string) {
    return new formattingSettings.ColorPicker({
        name,
        displayName,
        value: { value },
    });
}

function num(name: string, displayName: string, value: number) {
    return new formattingSettings.NumUpDown({
        name,
        displayName,
        value,
    });
}

function text(name: string, displayName: string, value: string, placeholder = "") {
    return new formattingSettings.TextInput({
        name,
        displayName,
        value,
        placeholder,
    });
}

function toggle(name: string, displayName: string, value: boolean) {
    return new formattingSettings.ToggleSwitch({
        name,
        displayName,
        value,
    });
}

function dropdown(name: string, displayName: string, value: string, items: Array<{ value: string; displayName: string }>) {
    return new formattingSettings.ItemDropdown({
        name,
        displayName,
        value: items.find((i) => i.value === value) ?? items[0],
        items,
    });
}

class GeneralCard extends FormattingSettingsCard {
    fontFamily = new formattingSettings.FontPicker({
        name: "fontFamily",
        displayName: "Família da fonte",
        value: defaultStyle.fontFamily,
    });
    fontSize = num("fontSize", "Tamanho padrão", defaultStyle.fontSize);
    fontColor = color("fontColor", "Cor padrão", defaultStyle.fontColor);
    fontWeight = dropdown("fontWeight", "Peso da fonte", defaultStyle.fontWeight, WEIGHTS);
    background = color("background", "Fundo do visual", defaultStyle.background);
    borderColor = color("borderColor", "Cor da borda", defaultStyle.borderColor);
    borderWidth = num("borderWidth", "Espessura da borda", defaultStyle.borderWidth);
    borderRadius = num("borderRadius", "Arredondamento", defaultStyle.borderRadius);
    rowHeight = num("rowHeight", "Altura padrão das linhas", defaultStyle.rowHeight);
    rowGap = num("rowGap", "Espaçamento vertical", defaultStyle.rowGap);

    name = "general";
    displayName = "Aparência Geral";
    slices: FormattingSettingsSlice[] = [
        this.fontFamily,
        this.fontSize,
        this.fontColor,
        this.fontWeight,
        this.background,
        this.borderColor,
        this.borderWidth,
        this.borderRadius,
        this.rowHeight,
        this.rowGap,
    ];
}

class CategoriesCard extends FormattingSettingsCard {
    width = num("width", "Largura da coluna", defaultStyle.categoryWidth);
    fontSize = num("fontSize", "Tamanho da fonte", defaultStyle.categoryFontSize);
    fontColor = color("fontColor", "Cor da fonte", defaultStyle.categoryFontColor);
    fontWeight = dropdown("fontWeight", "Peso da fonte", defaultStyle.categoryFontWeight, WEIGHTS);
    alignment = dropdown("alignment", "Alinhamento", defaultStyle.categoryAlignment, ALIGNS);
    imageSize = num("imageSize", "Tamanho da imagem", defaultStyle.imageSize);
    imagePlacement = dropdown("imagePlacement", "Posição da imagem", defaultStyle.imagePlacement, IMAGE_PLACES);
    sortMode = dropdown("sortMode", "Ordenação", defaultStyle.sortMode, SORT_MODES);
    sortKpiQueryName = text("sortKpiQueryName", "KPI para ordenação (queryName)", "", "queryName do KPI");

    name = "categories";
    displayName = "Categorias";
    slices: FormattingSettingsSlice[] = [
        this.width,
        this.fontSize,
        this.fontColor,
        this.fontWeight,
        this.alignment,
        this.imageSize,
        this.imagePlacement,
        this.sortMode,
        this.sortKpiQueryName,
    ];
}

class CategoryImagesCard extends FormattingSettingsCard {
    selectedCategory = text("selectedCategory", "Categoria selecionada", "", "Nome exato da categoria");
    imageData = new formattingSettings.TextArea({
        name: "imageData",
        displayName: "Imagem (data URI PNG/SVG ou SVG)",
        value: "",
        placeholder: "data:image/png;base64,... ou <svg>...</svg>",
    });
    imagesJson = new formattingSettings.TextArea({
        name: "imagesJson",
        displayName: "Mapa persistido (JSON)",
        value: "{}",
        placeholder: '{"Categoria":"data:image/png;base64,..."}',
    });

    name = "categoryImages";
    displayName = "Imagens das categorias";
    description =
        "Não há tipo oficial de upload de arquivo no capabilities.json. Persista data URI/SVG em texto. Limite recomendado ~24KB por imagem.";
    slices: FormattingSettingsSlice[] = [this.selectedCategory, this.imageData, this.imagesJson];
}

class GrandTotalCard extends FormattingSettingsCard {
    show = toggle("show", "Exibir Total Geral", defaultStyle.grandTotalShow);
    label = text("label", "Texto", defaultStyle.grandTotalLabel);
    displayMode = dropdown("displayMode", "Exibição", defaultStyle.grandTotalDisplayMode, DISPLAY_MODES);
    imageData = new formattingSettings.TextArea({
        name: "imageData",
        displayName: "Imagem (data URI/SVG)",
        value: "",
        placeholder: "data:image/png;base64,...",
    });
    fontSize = num("fontSize", "Tamanho da fonte", defaultStyle.grandTotalFontSize);
    fontColor = color("fontColor", "Cor da fonte", defaultStyle.grandTotalFontColor);
    background = color("background", "Cor de fundo", defaultStyle.grandTotalBackground);
    rowHeight = num("rowHeight", "Altura da linha", defaultStyle.grandTotalRowHeight);
    alignment = dropdown("alignment", "Alinhamento", defaultStyle.grandTotalAlignment, ALIGNS);
    imageSize = num("imageSize", "Tamanho da imagem", defaultStyle.grandTotalImageSize);

    name = "grandTotal";
    displayName = "Total Geral";
    topLevelSlice = this.show;
    slices: FormattingSettingsSlice[] = [
        this.label,
        this.displayMode,
        this.imageData,
        this.fontSize,
        this.fontColor,
        this.background,
        this.rowHeight,
        this.alignment,
        this.imageSize,
    ];
}

class RowsCard extends FormattingSettingsCard {
    defaultBackground = color("defaultBackground", "Fundo padrão", defaultStyle.rowDefaultBackground);
    evenBackground = color("evenBackground", "Linhas pares", defaultStyle.rowEvenBackground);
    oddBackground = color("oddBackground", "Linhas ímpares", defaultStyle.rowOddBackground);
    zebra = toggle("zebra", "Efeito zebra", defaultStyle.zebra);
    borderColor = color("borderColor", "Cor das bordas", defaultStyle.rowBorderColor);
    borderWidth = num("borderWidth", "Espessura das bordas", defaultStyle.rowBorderWidth);
    borderRadius = num("borderRadius", "Arredondamento", defaultStyle.rowBorderRadius);
    rowGap = num("rowGap", "Espaçamento vertical", defaultStyle.rowGap);
    rowHeight = num("rowHeight", "Altura das linhas", defaultStyle.rowHeight);

    name = "rows";
    displayName = "Cores das linhas";
    slices: FormattingSettingsSlice[] = [
        this.defaultBackground,
        this.evenBackground,
        this.oddBackground,
        this.zebra,
        this.borderColor,
        this.borderWidth,
        this.borderRadius,
        this.rowGap,
        this.rowHeight,
    ];
}

class HeaderCard extends FormattingSettingsCard {
    fontSize = num("fontSize", "Tamanho", defaultStyle.headerFontSize);
    fontColor = color("fontColor", "Cor", defaultStyle.headerFontColor);
    background = color("background", "Fundo", defaultStyle.headerBackground);
    fontWeight = dropdown("fontWeight", "Peso", defaultStyle.headerFontWeight, WEIGHTS);

    name = "header";
    displayName = "Cabeçalho";
    slices: FormattingSettingsSlice[] = [this.fontSize, this.fontColor, this.background, this.fontWeight];
}

class SubTotalsCard extends FormattingSettingsCard {
    rowSubtotals = toggle("rowSubtotals", "Solicitar subtotais (DAX)", true);
    rowSubtotalsType = dropdown("rowSubtotalsType", "Posição do total", "Top", [
        { value: "Top", displayName: "Topo" },
        { value: "Bottom", displayName: "Base" },
    ]);

    name = "subTotals";
    displayName = "Subtotais";
    slices: FormattingSettingsSlice[] = [this.rowSubtotals, this.rowSubtotalsType];
}

class TooltipCard extends FormattingSettingsCard {
    enabled = toggle("enabled", "Tooltip na coluna de categorias", true);

    name = "tooltip";
    displayName = "Tooltip";
    description = "O tooltip de página do Power BI é acionado somente sobre o nome/imagem da categoria.";
    slices: FormattingSettingsSlice[] = [this.enabled];
}

class KpiMappingCard extends FormattingSettingsCard {
    mappingJson = new formattingSettings.TextArea({
        name: "mappingJson",
        displayName: "Mapeamento KPI→complementos (JSON)",
        value: "{}",
        placeholder: '{"queryNameKPI":{"complements":["q1","q2"],"layout":"auto"}}',
    });

    name = "kpiMapping";
    displayName = "Informações Complementares";
    description =
        "Associe até 4 complementos por KPI usando queryName. Prefira também os controles por coluna no card Indicadores (quando disponíveis via seletor de medida).";
    slices: FormattingSettingsSlice[] = [this.mappingJson];
}

/** Card estático de defaults; overrides por KPI usam objects.kpiStyle com seletor de metadata. */
class KpiDefaultsCard extends FormattingSettingsCard {
    title = text("title", "Título exibido (override)", "");
    layout = dropdown("layout", "Layout da célula", "auto", LAYOUTS);
    complement1 = text("complement1", "Complemento 1 (queryName)", "");
    complement2 = text("complement2", "Complemento 2 (queryName)", "");
    complement3 = text("complement3", "Complemento 3 (queryName)", "");
    complement4 = text("complement4", "Complemento 4 (queryName)", "");
    complement1Label = text("complement1Label", "Rótulo complemento 1", "");
    complement2Label = text("complement2Label", "Rótulo complemento 2", "");
    complement3Label = text("complement3Label", "Rótulo complemento 3", "");
    complement4Label = text("complement4Label", "Rótulo complemento 4", "");
    widthMode = dropdown("widthMode", "Modo de largura", "auto", WIDTH_MODES);
    columnWidth = num("columnWidth", "Largura (px)", 140);
    minWidth = num("minWidth", "Largura mínima", 96);
    maxWidth = num("maxWidth", "Largura máxima", 320);
    primaryFontSize = num("primaryFontSize", "Fonte valor principal", 14);
    complementFontSize = num("complementFontSize", "Fonte complementos", 11);
    labelFontSize = num("labelFontSize", "Fonte rótulos", 9);
    primaryColor = color("primaryColor", "Cor valor principal", "#1F1F1F");
    complementColor = color("complementColor", "Cor complementos", "#4A4A4A");
    labelColor = color("labelColor", "Cor rótulos", "#6B6B6B");
    headerColor = color("headerColor", "Cor cabeçalho", "#5A5A5A");
    backgroundColor = color("backgroundColor", "Fundo da célula", "#FFFFFF");
    cellPadding = num("cellPadding", "Espaçamento interno", 8);
    cfEnabled = toggle("cfEnabled", "Formatação condicional", false);
    cfApplyTo = dropdown("cfApplyTo", "Aplicar CF a", "value", CF_APPLY);
    cfThresholdHigh = num("cfThresholdHigh", "Limite alto (≥)", 1);
    cfThresholdMid = num("cfThresholdMid", "Limite médio (≥)", 0.9);
    cfColorHigh = color("cfColorHigh", "Cor alta", "#107C10");
    cfColorMid = color("cfColorMid", "Cor média", "#F7B500");
    cfColorLow = color("cfColorLow", "Cor baixa", "#D13438");
    cfAsPercent = toggle("cfAsPercent", "Tratar valor como percentual", true);

    name = "kpiStyle";
    displayName = "Indicadores (KPIs)";
    description =
        "Para configurar um KPI específico, selecione a medida no visual e ajuste estas propriedades (seletor por coluna). Complementos: informe o queryName da medida do well Informações complementares.";
    slices: FormattingSettingsSlice[] = [
        this.title,
        this.layout,
        this.complement1,
        this.complement1Label,
        this.complement2,
        this.complement2Label,
        this.complement3,
        this.complement3Label,
        this.complement4,
        this.complement4Label,
        this.widthMode,
        this.columnWidth,
        this.minWidth,
        this.maxWidth,
        this.primaryFontSize,
        this.complementFontSize,
        this.labelFontSize,
        this.primaryColor,
        this.complementColor,
        this.labelColor,
        this.headerColor,
        this.backgroundColor,
        this.cellPadding,
        this.cfEnabled,
        this.cfApplyTo,
        this.cfThresholdHigh,
        this.cfThresholdMid,
        this.cfColorHigh,
        this.cfColorMid,
        this.cfColorLow,
        this.cfAsPercent,
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    general = new GeneralCard();
    categories = new CategoriesCard();
    categoryImages = new CategoryImagesCard();
    grandTotal = new GrandTotalCard();
    header = new HeaderCard();
    rows = new RowsCard();
    kpiStyle = new KpiDefaultsCard();
    kpiMapping = new KpiMappingCard();
    subTotals = new SubTotalsCard();
    tooltip = new TooltipCard();

    cards = [
        this.general,
        this.categories,
        this.categoryImages,
        this.grandTotal,
        this.header,
        this.rows,
        this.kpiStyle,
        this.kpiMapping,
        this.subTotals,
        this.tooltip,
    ];

    public toResolvedStyle(): ResolvedVisualStyle {
        const imagesJson = this.categoryImages.imagesJson.value || "{}";
        let images = parseImagesJson(imagesJson);
        const selected = this.categoryImages.selectedCategory.value?.trim() || "";
        const imageData = this.categoryImages.imageData.value || "";
        if (selected) {
            images = upsertCategoryImage(images, selected, imageData);
        }

        return {
            fontFamily: this.general.fontFamily.value || defaultStyle.fontFamily,
            fontSize: this.general.fontSize.value,
            fontColor: this.general.fontColor.value.value,
            fontWeight: String(this.general.fontWeight.value.value),
            background: this.general.background.value.value,
            borderColor: this.general.borderColor.value.value,
            borderWidth: this.general.borderWidth.value,
            borderRadius: this.general.borderRadius.value,
            rowHeight: this.rows.rowHeight.value || this.general.rowHeight.value,
            rowGap: this.rows.rowGap.value || this.general.rowGap.value,
            categoryWidth: this.categories.width.value,
            categoryFontSize: this.categories.fontSize.value,
            categoryFontColor: this.categories.fontColor.value.value,
            categoryFontWeight: String(this.categories.fontWeight.value.value),
            categoryAlignment: String(this.categories.alignment.value.value) as Align,
            imageSize: this.categories.imageSize.value,
            imagePlacement: String(this.categories.imagePlacement.value.value) as ImagePlacement,
            sortMode: String(this.categories.sortMode.value.value) as SortMode,
            sortKpiQueryName: this.categories.sortKpiQueryName.value || "",
            grandTotalShow: this.grandTotal.show.value,
            grandTotalLabel: this.grandTotal.label.value || defaultStyle.grandTotalLabel,
            grandTotalDisplayMode: String(this.grandTotal.displayMode.value.value) as DisplayMode,
            grandTotalImageData: this.grandTotal.imageData.value || "",
            grandTotalFontSize: this.grandTotal.fontSize.value,
            grandTotalFontColor: this.grandTotal.fontColor.value.value,
            grandTotalBackground: this.grandTotal.background.value.value,
            grandTotalRowHeight: this.grandTotal.rowHeight.value,
            grandTotalAlignment: String(this.grandTotal.alignment.value.value) as Align,
            grandTotalImageSize: this.grandTotal.imageSize.value,
            rowDefaultBackground: this.rows.defaultBackground.value.value,
            rowEvenBackground: this.rows.evenBackground.value.value,
            rowOddBackground: this.rows.oddBackground.value.value,
            zebra: this.rows.zebra.value,
            rowBorderColor: this.rows.borderColor.value.value,
            rowBorderWidth: this.rows.borderWidth.value,
            rowBorderRadius: this.rows.borderRadius.value,
            headerFontSize: this.header.fontSize.value,
            headerFontColor: this.header.fontColor.value.value,
            headerBackground: this.header.background.value.value,
            headerFontWeight: String(this.header.fontWeight.value.value),
            tooltipEnabled: this.tooltip.enabled.value,
            categoryImages: images,
        };
    }

    public convertOptions() {
        const style = this.toResolvedStyle();
        return {
            totalLabel: style.grandTotalLabel,
            sortMode: style.sortMode,
            sortKpiQueryName: style.sortKpiQueryName,
            imagesJson: JSON.stringify(style.categoryImages),
        };
    }
}
