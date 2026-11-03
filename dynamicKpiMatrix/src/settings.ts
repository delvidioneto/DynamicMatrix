"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { defaultStyle, ResolvedVisualStyle, SortMode, DisplayMode, Align, ImagePlacement } from "./data/viewModel";
import {
    CategoryMetaMap,
    imageValueFromMeta,
    metaFromImageValue,
    parseCategoryMetaMap,
    serializeCategoryMetaMap,
    upsertCategoryMeta,
} from "./data/categoryMeta";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

const EMPTY_IMAGE: powerbi.ImageValue = { name: "", url: "", scaling: "normal" };
const PLACEHOLDER_CATEGORY = { value: "", displayName: "(selecione uma categoria)" };

const SORT_MODES = [
    { value: "data", displayName: "Ordem dos dados" },
    { value: "alphaAsc", displayName: "Alfabética A–Z" },
    { value: "alphaDesc", displayName: "Alfabética Z–A" },
    { value: "kpiAsc", displayName: "Por KPI (crescente)" },
    { value: "kpiDesc", displayName: "Por KPI (decrescente)" },
];

const DISPLAY_MODES = [
    { value: "both", displayName: "Texto e imagem" },
    { value: "text", displayName: "Somente texto" },
    { value: "image", displayName: "Somente imagem" },
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
    selectedCategory = new formattingSettings.ItemDropdown({
        name: "selectedCategory",
        displayName: "Categoria",
        items: [PLACEHOLDER_CATEGORY],
        value: PLACEHOLDER_CATEGORY,
    });
    categoryTitle = text("categoryTitle", "Título", "", "Deixe vazio para usar o nome da tabela");
    imageData = new formattingSettings.ImageUpload({
        name: "imageData",
        displayName: "Imagem",
        value: { ...EMPTY_IMAGE },
    });
    categoriesJson = new formattingSettings.TextArea({
        name: "categoriesJson",
        displayName: "Mapa persistido (avançado)",
        value: "{}",
        placeholder: '{"Categoria":{"title":"Título","imageUrl":"data:..."}}',
    });
    imagesJson = new formattingSettings.TextArea({
        name: "imagesJson",
        displayName: "Legado imagesJson",
        value: "{}",
        placeholder: "{}",
    });

    name = "categoryImages";
    displayName = "Imagens das categorias";
    description =
        "Selecione a categoria no dropdown, informe o Título (opcional) e importe a imagem. Sem título, usa o nome da tabela.";
    slices: FormattingSettingsSlice[] = [
        this.selectedCategory,
        this.categoryTitle,
        this.imageData,
        this.categoriesJson,
    ];
}

class GrandTotalCard extends FormattingSettingsCard {
    show = toggle("show", "Exibir Total Geral", defaultStyle.grandTotalShow);
    label = text("label", "Texto", defaultStyle.grandTotalLabel, "Total Geral");
    displayMode = dropdown("displayMode", "Exibição", "both", DISPLAY_MODES);
    imageData = new formattingSettings.ImageUpload({
        name: "imageData",
        displayName: "Imagem",
        value: { ...EMPTY_IMAGE },
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
    zebra = toggle("zebra", "Zebrar linhas", defaultStyle.zebra);
    defaultBackground = color("defaultBackground", "Cor de fundo", defaultStyle.rowDefaultBackground);
    evenBackground = color("evenBackground", "Cor (linhas pares)", defaultStyle.rowEvenBackground);
    oddBackground = color("oddBackground", "Cor (linhas ímpares)", defaultStyle.rowOddBackground);
    borderColor = color("borderColor", "Cor da borda", defaultStyle.rowBorderColor);
    borderWidth = num("borderWidth", "Espessura da borda", defaultStyle.rowBorderWidth);
    borderRadius = num("borderRadius", "Arredondamento", defaultStyle.rowBorderRadius);
    rowHeight = num("rowHeight", "Altura da linha", defaultStyle.rowHeight);
    rowGap = num("rowGap", "Espaçamento entre linhas", defaultStyle.rowGap);

    name = "rows";
    displayName = "Linhas";
    description = "Zebra, cores, borda, espessura e arredondamento das linhas.";
    slices: FormattingSettingsSlice[] = [
        this.zebra,
        this.defaultBackground,
        this.evenBackground,
        this.oddBackground,
        this.borderColor,
        this.borderWidth,
        this.borderRadius,
        this.rowHeight,
        this.rowGap,
    ];
}

class ColumnsCard extends FormattingSettingsCard {
    background = color("background", "Cor de fundo", defaultStyle.columnBackground);
    borderColor = color("borderColor", "Cor da borda", defaultStyle.columnBorderColor);
    borderWidth = num("borderWidth", "Espessura da borda", defaultStyle.columnBorderWidth);
    borderRadius = num("borderRadius", "Arredondamento", defaultStyle.columnBorderRadius);
    columnWidth = num("columnWidth", "Largura da coluna", defaultStyle.columnWidth);
    columnGap = num("columnGap", "Espaçamento entre colunas", defaultStyle.columnGap);

    name = "columns";
    displayName = "Colunas";
    description =
        "Borda, espessura, arredondamento e largura das colunas. O fundo zebrado continua vindo das Linhas.";
    slices: FormattingSettingsSlice[] = [
        this.background,
        this.borderColor,
        this.borderWidth,
        this.borderRadius,
        this.columnWidth,
        this.columnGap,
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

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    general = new GeneralCard();
    categories = new CategoriesCard();
    categoryImages = new CategoryImagesCard();
    grandTotal = new GrandTotalCard();
    header = new HeaderCard();
    rows = new RowsCard();
    columns = new ColumnsCard();
    subTotals = new SubTotalsCard();
    tooltip = new TooltipCard();

    cards = [
        this.general,
        this.categories,
        this.categoryImages,
        this.grandTotal,
        this.header,
        this.rows,
        this.columns,
        this.subTotals,
        this.tooltip,
    ];

    public getSelectedCategoryName(): string {
        return String(this.categoryImages.selectedCategory.value?.value ?? "").trim();
    }

    public getCategoryMetaMap(): CategoryMetaMap {
        return parseCategoryMetaMap(
            this.categoryImages.categoriesJson.value,
            this.categoryImages.imagesJson.value,
        );
    }

    /** Mescla título/imagem da categoria selecionada no mapa persistente. */
    public buildSyncedCategoriesJson(): string {
        const selected = this.getSelectedCategoryName();
        let map = this.getCategoryMetaMap();
        if (selected) {
            const imageMeta = metaFromImageValue(this.categoryImages.imageData.value);
            map = upsertCategoryMeta(map, selected, {
                title: this.categoryImages.categoryTitle.value || "",
                imageUrl: imageMeta.imageUrl || "",
                imageName: imageMeta.imageName || "",
            });
        }
        return serializeCategoryMetaMap(map);
    }

    public syncCategoryEditorFromMap(categoryNames: string[]): void {
        const items = [
            PLACEHOLDER_CATEGORY,
            ...categoryNames.map((name) => ({ value: name, displayName: name })),
        ];
        this.categoryImages.selectedCategory.items = items;

        const selected = this.getSelectedCategoryName();
        const match = items.find((i) => i.value === selected) ?? PLACEHOLDER_CATEGORY;
        this.categoryImages.selectedCategory.value = match;

        const map = this.getCategoryMetaMap();
        const meta = selected ? map[selected] : undefined;
        this.categoryImages.categoryTitle.value = meta?.title || "";
        this.categoryImages.imageData.value = imageValueFromMeta(meta);
    }

    public toResolvedStyle(): ResolvedVisualStyle {
        const map = parseCategoryMetaMap(this.buildSyncedCategoriesJson());
        const images: Record<string, string> = {};
        const titles: Record<string, string> = {};
        for (const [key, meta] of Object.entries(map)) {
            if (meta.imageUrl) {
                images[key] = meta.imageUrl;
            }
            if (meta.title) {
                titles[key] = meta.title;
            }
        }

        const grandImage = metaFromImageValue(this.grandTotal.imageData.value).imageUrl || "";
        const label = (this.grandTotal.label.value || "").trim() || defaultStyle.grandTotalLabel;

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
            grandTotalLabel: label,
            grandTotalDisplayMode: String(this.grandTotal.displayMode.value.value) as DisplayMode,
            grandTotalImageData: grandImage,
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
            columnBackground: this.columns.background.value.value,
            columnBorderColor: this.columns.borderColor.value.value,
            columnBorderWidth: this.columns.borderWidth.value,
            columnBorderRadius: this.columns.borderRadius.value,
            columnWidth: this.columns.columnWidth.value,
            columnGap: this.columns.columnGap.value,
            headerFontSize: this.header.fontSize.value,
            headerFontColor: this.header.fontColor.value.value,
            headerBackground: this.header.background.value.value,
            headerFontWeight: String(this.header.fontWeight.value.value),
            tooltipEnabled: this.tooltip.enabled.value,
            categoryImages: images,
            categoryTitles: titles,
        };
    }

    public convertOptions() {
        const style = this.toResolvedStyle();
        return {
            totalLabel: style.grandTotalLabel,
            sortMode: style.sortMode,
            sortKpiQueryName: style.sortKpiQueryName,
            categoriesJson: this.buildSyncedCategoriesJson(),
            imagesJson: this.categoryImages.imagesJson.value || "{}",
            showTotal: style.grandTotalShow,
        };
    }
}
