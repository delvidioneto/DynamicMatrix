"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import {
    defaultStyle,
    ResolvedVisualStyle,
    SortMode,
    DisplayMode,
    Align,
    ImagePlacement,
    ImageSourceType,
    VerticalBorderHeight,
} from "./data/viewModel";
import {
    CategoryMetaMap,
    findCategoryMeta,
    mergeCategoryNames,
    metaFromImageValue,
    parseCategoryMetaMap,
    serializeCategoryMetaMap,
    upsertCategoryMeta,
} from "./data/categoryMeta";
import { coerceImageValue, imageValueToStorage, unwrapMeasureText } from "./services/ImageManager";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;
import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsGroup = formattingSettings.Group;

const EMPTY_IMAGE: powerbi.ImageValue = { name: "", url: "", scaling: "normal" };
const PLACEHOLDER_CATEGORY = { value: "", displayName: "(selecione uma categoria)" };

const SORT_MODES = [
    { value: "data", displayName: "Ordem dos dados" },
    { value: "alphaAsc", displayName: "Alfabética A–Z" },
    { value: "alphaDesc", displayName: "Alfabética Z–A" },
];

const DISPLAY_MODES = [
    { value: "text", displayName: "Somente texto" },
    { value: "image", displayName: "Somente imagem" },
    { value: "both", displayName: "Texto e imagem" },
];

const NONE_ICON = { value: "", displayName: "(nenhuma medida SVG)" };

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

const VERTICAL_BORDER_HEIGHTS = [
    { value: "full", displayName: "Completa" },
    { value: "content", displayName: "Somente área do valor" },
    { value: "custom", displayName: "Personalizada" },
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

function dropdown(
    name: string,
    displayName: string,
    value: string,
    items: Array<{ value: string; displayName: string }>,
) {
    return new formattingSettings.ItemDropdown({
        name,
        displayName,
        value: items.find((i) => i.value === value) ?? items[0],
        items,
    });
}

function asDisplayMode(value: unknown, fallback: DisplayMode = "text"): DisplayMode {
    const raw = String(
        (value as { value?: string } | undefined)?.value ?? value ?? "",
    ).trim();
    if (raw === "text" || raw === "image" || raw === "both") {
        return raw;
    }
    return fallback;
}

class GeneralCard extends FormattingSettingsCompositeCard {
    fontFamily = new formattingSettings.FontPicker({
        name: "fontFamily",
        displayName: "Família da fonte",
        value: defaultStyle.fontFamily,
    });
    fontSize = num("fontSize", "Tamanho padrão", defaultStyle.fontSize);
    fontColor = color("fontColor", "Cor padrão", defaultStyle.fontColor);
    fontWeight = dropdown("fontWeight", "Peso da fonte", defaultStyle.fontWeight, WEIGHTS);
    background = color("background", "Fundo do visual", defaultStyle.background);
    /** Mantidos ocultos para hidratar relatórios já salvos. A borda do contêiner não é desenhada. */
    borderColor = color("borderColor", "Cor da borda", defaultStyle.borderColor);
    borderWidth = num("borderWidth", "Espessura da borda", defaultStyle.borderWidth);
    borderRadius = num("borderRadius", "Arredondamento", defaultStyle.borderRadius);
    rowHeight = num("rowHeight", "Altura padrão das linhas", defaultStyle.rowHeight);
    rowGap = num("rowGap", "Espaçamento vertical", defaultStyle.rowGap);

    name = "general";
    displayName = "Aparência do visual";
    groups: FormattingSettingsGroup[] = [
        new FormattingSettingsGroup({
            name: "generalTypography",
            displayName: "Tipografia",
            collapsible: true,
            slices: [this.fontFamily, this.fontSize, this.fontColor, this.fontWeight],
        }),
        new FormattingSettingsGroup({
            name: "generalContainer",
            displayName: "Contêiner",
            collapsible: true,
            slices: [
                this.background,
                this.borderColor,
                this.borderWidth,
                this.borderRadius,
                this.rowHeight,
                this.rowGap,
            ],
        }),
    ];

    public onPreProcess(): void {
        this.borderColor.visible = false;
        this.borderWidth.visible = false;
        this.borderRadius.visible = false;
        this.rowHeight.visible = false;
        this.rowGap.visible = false;
    }
}

class CategoriesColumnGroup extends FormattingSettingsGroup {
    width = num("width", "Largura da coluna", defaultStyle.categoryWidth);
    showRightBorder = toggle(
        "showRightBorder",
        "Borda direita",
        defaultStyle.categoryShowRightBorder,
    );
    sortMode = dropdown("sortMode", "Ordenação", defaultStyle.sortMode, SORT_MODES);

    name = "categoriesColumn";
    displayName = "Coluna";
    collapsible = true;
    slices: FormattingSettingsSlice[] = [this.width, this.showRightBorder, this.sortMode];

    constructor() {
        super({ name: "categoriesColumn", displayName: "Coluna", slices: [] });
    }
}

class CategoriesTextGroup extends FormattingSettingsGroup {
    fontSize = num("fontSize", "Tamanho da fonte", defaultStyle.categoryFontSize);
    fontColor = color("fontColor", "Cor da fonte", defaultStyle.categoryFontColor);
    fontWeight = dropdown("fontWeight", "Peso da fonte", defaultStyle.categoryFontWeight, WEIGHTS);
    alignment = dropdown("alignment", "Alinhamento", defaultStyle.categoryAlignment, ALIGNS);

    name = "categoriesText";
    displayName = "Texto";
    collapsible = true;
    slices: FormattingSettingsSlice[] = [this.fontSize, this.fontColor, this.fontWeight, this.alignment];

    constructor() {
        super({ name: "categoriesText", displayName: "Texto", slices: [] });
    }
}

class CategoriesIconGroup extends FormattingSettingsGroup {
    imageSize = num("imageSize", "Tamanho da imagem", defaultStyle.imageSize);
    imagePlacement = dropdown("imagePlacement", "Posição da imagem", defaultStyle.imagePlacement, IMAGE_PLACES);

    name = "categoriesIcon";
    displayName = "Ícone";
    collapsible = true;
    slices: FormattingSettingsSlice[] = [this.imageSize, this.imagePlacement];

    constructor() {
        super({ name: "categoriesIcon", displayName: "Ícone", slices: [] });
    }
}

class CategoriesImagensGroup extends FormattingSettingsGroup {
    selectedCategory = new formattingSettings.ItemDropdown({
        name: "selectedCategory",
        displayName: "Categoria",
        items: [PLACEHOLDER_CATEGORY],
        value: PLACEHOLDER_CATEGORY,
    });
    categoryDisplayMode = dropdown("categoryDisplayMode", "Exibição", "text", DISPLAY_MODES);
    categoryTitle = text("categoryTitle", "Texto", "", "Texto exibido na célula");
    categoryIconMeasure = new formattingSettings.ItemDropdown({
        name: "categoryIconMeasure",
        displayName: "SVG",
        items: [NONE_ICON],
        value: NONE_ICON,
    });
    // Persistência (oculta)
    categoriesJson = new formattingSettings.TextArea({
        name: "categoriesJson",
        displayName: "Mapa persistido",
        value: "{}",
        placeholder: "{}",
    });
    imagesJson = new formattingSettings.TextArea({
        name: "imagesJson",
        displayName: "Legado imagesJson",
        value: "{}",
        placeholder: "{}",
    });

    name = "categoriesContent";
    displayName = "Por categoria";
    collapsible = true;
    slices: FormattingSettingsSlice[] = [
        this.selectedCategory,
        this.categoryDisplayMode,
        this.categoryTitle,
        this.categoryIconMeasure,
        this.categoriesJson,
        this.imagesJson,
    ];

    constructor() {
        super({ name: "categoriesContent", displayName: "Por categoria", slices: [] });
    }

    public applyVisibility(): void {
        const selected = String(this.selectedCategory.value?.value ?? "").trim();
        const hasSelection = Boolean(selected);
        const mode = asDisplayMode(this.categoryDisplayMode.value, "text");
        this.categoryDisplayMode.visible = hasSelection;
        this.categoryTitle.visible = hasSelection && (mode === "text" || mode === "both");
        this.categoryIconMeasure.visible = hasSelection && (mode === "image" || mode === "both");
        this.categoriesJson.visible = false;
        this.imagesJson.visible = false;
    }
}

class CategoriesCard extends FormattingSettingsCompositeCard {
    coluna = new CategoriesColumnGroup();
    texto = new CategoriesTextGroup();
    icone = new CategoriesIconGroup();
    imagens = new CategoriesImagensGroup();

    name = "categories";
    displayName = "Categorias";
    groups = [this.coluna, this.texto, this.icone, this.imagens];

    public onPreProcess(): void {
        this.imagens.applyVisibility();
    }
}

class GrandTotalCard extends FormattingSettingsCompositeCard {
    show = toggle("show", "Exibir Total Geral", defaultStyle.grandTotalShow);
    displayMode = dropdown("displayMode", "Exibição", "both", DISPLAY_MODES);
    label = text("label", "Texto", defaultStyle.grandTotalLabel, "Total Geral");
    iconMeasure = new formattingSettings.ItemDropdown({
        name: "iconMeasure",
        displayName: "SVG",
        items: [NONE_ICON],
        value: NONE_ICON,
    });
    imageType = dropdown("imageType", "Tipo de imagem", "svg", [
        { value: "svg", displayName: "SVG" },
        { value: "png", displayName: "PNG" },
    ]);
    imageData = new formattingSettings.ImageUpload({
        name: "imageData",
        displayName: "Upload PNG",
        value: { ...EMPTY_IMAGE },
    });
    imageUrl = text("imageUrl", "URL ou data URI", "", "");
    svgMarkup = new formattingSettings.TextArea({
        name: "svgMarkup",
        displayName: "SVG (texto)",
        value: "",
        placeholder: "",
    });
    fontSize = num("fontSize", "Tamanho da fonte", defaultStyle.grandTotalFontSize);
    fontColor = color("fontColor", "Cor da fonte", defaultStyle.grandTotalFontColor);
    background = color("background", "Cor de fundo", defaultStyle.grandTotalBackground);
    rowHeight = num("rowHeight", "Altura da linha", defaultStyle.grandTotalRowHeight);
    alignment = dropdown("alignment", "Alinhamento", defaultStyle.grandTotalAlignment, ALIGNS);
    imageSize = num("imageSize", "Tamanho máx. da imagem", defaultStyle.grandTotalImageSize);

    name = "grandTotal";
    displayName = "Total Geral";
    topLevelSlice = this.show;
    groups: FormattingSettingsGroup[] = [
        new FormattingSettingsGroup({
            name: "grandTotalContent",
            displayName: "Conteúdo",
            collapsible: true,
            slices: [
                this.displayMode,
                this.label,
                this.iconMeasure,
                this.imageType,
                this.imageData,
                this.imageUrl,
                this.svgMarkup,
            ],
        }),
        new FormattingSettingsGroup({
            name: "grandTotalText",
            displayName: "Texto",
            collapsible: true,
            slices: [this.fontSize, this.fontColor, this.alignment],
        }),
        new FormattingSettingsGroup({
            name: "grandTotalCell",
            displayName: "Célula",
            collapsible: true,
            slices: [this.background, this.rowHeight],
        }),
        new FormattingSettingsGroup({
            name: "grandTotalIcon",
            displayName: "Ícone",
            collapsible: true,
            slices: [this.imageSize],
        }),
    ];

    public onPreProcess(): void {
        const mode = asDisplayMode(this.displayMode.value, "both");
        this.label.visible = mode === "text" || mode === "both";
        this.iconMeasure.visible = mode === "image" || mode === "both";
        this.imageType.visible = false;
        this.imageData.visible = false;
        this.imageUrl.visible = false;
        this.svgMarkup.visible = false;
    }
}

class RowsCard extends FormattingSettingsCompositeCard {
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
    groups: FormattingSettingsGroup[] = [
        new FormattingSettingsGroup({
            name: "rowsBackground",
            displayName: "Fundo",
            collapsible: true,
            slices: [this.zebra, this.defaultBackground, this.evenBackground, this.oddBackground],
        }),
        new FormattingSettingsGroup({
            name: "rowsBorder",
            displayName: "Borda",
            collapsible: true,
            slices: [this.borderColor, this.borderWidth, this.borderRadius],
        }),
        new FormattingSettingsGroup({
            name: "rowsSize",
            displayName: "Tamanho",
            collapsible: true,
            slices: [this.rowHeight, this.rowGap],
        }),
    ];

    public onPreProcess(): void {
        const on = this.zebra.value;
        this.evenBackground.visible = on;
        this.oddBackground.visible = on;
    }
}

class ColumnsCard extends FormattingSettingsCompositeCard {
    background = color("background", "Cor de fundo", defaultStyle.columnBackground);
    showBorder = toggle("showBorder", "Borda", defaultStyle.columnShowBorder);
    borderColor = color("borderColor", "Cor da borda", defaultStyle.columnBorderColor);
    borderWidth = num("borderWidth", "Espessura da borda", defaultStyle.columnBorderWidth);
    borderRadius = num("borderRadius", "Arredondamento", defaultStyle.columnBorderRadius);
    columnWidth = num("columnWidth", "Largura da coluna", defaultStyle.columnWidth);
    columnGap = num("columnGap", "Espaçamento entre colunas", defaultStyle.columnGap);

    name = "columns";
    displayName = "Colunas";
    groups: FormattingSettingsGroup[] = [
        new FormattingSettingsGroup({
            name: "columnsMeasures",
            displayName: "Medidas",
            description: "A largura acompanha o maior texto quando o valor é 0.",
            collapsible: true,
            slices: [this.columnWidth, this.columnGap],
        }),
        new FormattingSettingsGroup({
            name: "columnsBackground",
            displayName: "Fundo",
            collapsible: true,
            slices: [this.background],
        }),
        new FormattingSettingsGroup({
            name: "columnsBorder",
            displayName: "Borda",
            collapsible: true,
            slices: [this.showBorder, this.borderColor, this.borderWidth, this.borderRadius],
        }),
    ];

    public onPreProcess(): void {
        const on = this.showBorder.value;
        this.borderColor.visible = on;
        this.borderWidth.visible = on;
    }
}

class ValuesCard extends FormattingSettingsCompositeCard {
    fontSize = num("fontSize", "Tamanho do texto", defaultStyle.valueFontSize);
    fontColor = color("fontColor", "Cor do texto", defaultStyle.valueFontColor);
    alignment = dropdown("alignment", "Alinhamento", defaultStyle.valueAlignment, ALIGNS);
    displayUnits = new formattingSettings.AutoDropdown({
        name: "displayUnits",
        displayName: "Unidades de exibição",
        value: defaultStyle.valueDisplayUnits,
    });
    precision = num("precision", "Casas decimais", defaultStyle.valuePrecision);
    borderLeft = toggle("borderLeft", "Borda esquerda", defaultStyle.valueBorderLeft);
    borderRight = toggle("borderRight", "Borda direita", defaultStyle.valueBorderRight);
    borderTop = toggle("borderTop", "Borda superior", defaultStyle.valueBorderTop);
    borderBottom = toggle("borderBottom", "Borda inferior", defaultStyle.valueBorderBottom);
    verticalBorderHeight = dropdown(
        "verticalBorderHeight",
        "Altura da borda vertical",
        defaultStyle.valueVerticalBorderHeight,
        VERTICAL_BORDER_HEIGHTS,
    );
    verticalBorderCustomHeight = num(
        "verticalBorderCustomHeight",
        "Altura personalizada (px)",
        defaultStyle.valueVerticalBorderCustomHeight,
    );
    borderPadding = num(
        "borderPadding",
        "Espaçamento da borda",
        defaultStyle.valueBorderPadding,
    );
    borderColor = color("borderColor", "Cor da borda", defaultStyle.valueBorderColor);
    borderWidth = num("borderWidth", "Espessura da borda", defaultStyle.valueBorderWidth);
    borderRadius = num("borderRadius", "Arredondamento da borda", defaultStyle.valueBorderRadius);

    name = "values";
    displayName = "Valores";
    groups: FormattingSettingsGroup[] = [
        new FormattingSettingsGroup({
            name: "valuesText",
            displayName: "Texto",
            collapsible: true,
            slices: [this.fontSize, this.fontColor, this.alignment],
        }),
        new FormattingSettingsGroup({
            name: "valuesNumber",
            displayName: "Número",
            collapsible: true,
            slices: [this.displayUnits, this.precision],
        }),
        new FormattingSettingsGroup({
            name: "valuesBorder",
            displayName: "Borda",
            collapsible: true,
            slices: [
                this.borderLeft,
                this.borderRight,
                this.borderTop,
                this.borderBottom,
                this.verticalBorderHeight,
                this.verticalBorderCustomHeight,
                this.borderPadding,
                this.borderColor,
                this.borderWidth,
                this.borderRadius,
            ],
        }),
    ];

    public onPreProcess(): void {
        const anyBorder =
            this.borderLeft.value ||
            this.borderRight.value ||
            this.borderTop.value ||
            this.borderBottom.value;
        const anyVertical = this.borderLeft.value || this.borderRight.value;
        const vMode = String(this.verticalBorderHeight.value?.value ?? "full");
        this.verticalBorderHeight.visible = anyVertical;
        this.verticalBorderCustomHeight.visible = anyVertical && vMode === "custom";
        this.borderPadding.visible = anyBorder;
        this.borderColor.visible = anyBorder;
        this.borderWidth.visible = anyBorder;
        this.borderRadius.visible = anyBorder;
    }
}

class HeaderCard extends FormattingSettingsCompositeCard {
    fontSize = num("fontSize", "Tamanho", defaultStyle.headerFontSize);
    fontColor = color("fontColor", "Cor", defaultStyle.headerFontColor);
    background = color("background", "Fundo", defaultStyle.headerBackground);
    fontWeight = dropdown("fontWeight", "Peso", defaultStyle.headerFontWeight, WEIGHTS);

    name = "header";
    displayName = "Cabeçalho";
    groups: FormattingSettingsGroup[] = [
        new FormattingSettingsGroup({
            name: "headerText",
            displayName: "Texto",
            collapsible: true,
            slices: [this.fontSize, this.fontColor, this.fontWeight],
        }),
        new FormattingSettingsGroup({
            name: "headerBackground",
            displayName: "Fundo",
            collapsible: true,
            slices: [this.background],
        }),
    ];
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
    values = new ValuesCard();
    grandTotal = new GrandTotalCard();
    header = new HeaderCard();
    rows = new RowsCard();
    columns = new ColumnsCard();
    subTotals = new SubTotalsCard();
    tooltip = new TooltipCard();

    cards = [
        this.general,
        this.header,
        this.categories,
        this.values,
        this.rows,
        this.columns,
        this.grandTotal,
        this.subTotals,
        this.tooltip,
    ];

    /** Acesso curto ao grupo Imagens. */
    get categoryImages(): CategoriesImagensGroup {
        return this.categories.imagens;
    }

    /**
     * Recupera selectedCategory / medidas SVG a partir dos objects brutos
     * (incluindo object legado categoryImages).
     */
    public hydrateFromDataViewObjects(objects: powerbi.DataViewObjects | undefined): void {
        if (!objects) {
            return;
        }

        const catObj = objects.categories as Record<string, unknown> | undefined;
        const legacyObj = objects.categoryImages as Record<string, unknown> | undefined;
        const source = { ...(legacyObj ?? {}), ...(catObj ?? {}) };

        const selectedRaw = source.selectedCategory;
        const selectedName =
            typeof selectedRaw === "string"
                ? selectedRaw.trim()
                : String((selectedRaw as { value?: string } | undefined)?.value ?? "").trim();
        if (selectedName) {
            this.ensureSelectedCategoryItem(selectedName);
        }

        const jsonFromCat =
            typeof catObj?.categoriesJson === "string" ? catObj.categoriesJson : "";
        const jsonFromLegacy =
            typeof legacyObj?.categoriesJson === "string" ? legacyObj.categoriesJson : "";
        if (jsonFromCat.trim()) {
            this.categoryImages.categoriesJson.value = jsonFromCat;
        } else if (jsonFromLegacy.trim() && !this.categoryImages.categoriesJson.value?.trim()) {
            this.categoryImages.categoriesJson.value = jsonFromLegacy;
        }

        const imagesFromCat = typeof catObj?.imagesJson === "string" ? catObj.imagesJson : "";
        const imagesFromLegacy =
            typeof legacyObj?.imagesJson === "string" ? legacyObj.imagesJson : "";
        if (imagesFromCat.trim()) {
            this.categoryImages.imagesJson.value = imagesFromCat;
        } else if (imagesFromLegacy.trim() && !this.categoryImages.imagesJson.value?.trim()) {
            this.categoryImages.imagesJson.value = imagesFromLegacy;
        }

        const titleRaw = source.categoryTitle;
        if (typeof titleRaw === "string") {
            this.categoryImages.categoryTitle.value = titleRaw;
        }

        const modeRaw = source.categoryDisplayMode;
        if (modeRaw != null) {
            const mode = asDisplayMode(modeRaw, "text");
            const match = DISPLAY_MODES.find((i) => i.value === mode) ?? DISPLAY_MODES[0];
            this.categoryImages.categoryDisplayMode.value = match;
        }

        const iconQn =
            typeof source.categoryIconMeasure === "string"
                ? source.categoryIconMeasure.trim()
                : typeof source.iconMeasure === "string"
                  ? source.iconMeasure.trim()
                  : "";
        if (iconQn) {
            this.ensureIconMeasureItem(this.categoryImages.categoryIconMeasure, iconQn);
        }

        const gtObj = objects.grandTotal as Record<string, unknown> | undefined;
        if (gtObj) {
            if (typeof gtObj.iconMeasure === "string" && gtObj.iconMeasure.trim()) {
                this.ensureIconMeasureItem(this.grandTotal.iconMeasure, gtObj.iconMeasure.trim());
            }
            const upload = coerceImageValue(gtObj.imageData);
            const urlText = unwrapMeasureText(
                typeof gtObj.imageUrl === "string" ? gtObj.imageUrl : String(gtObj.imageUrl ?? ""),
            );
            const svgText = unwrapMeasureText(
                typeof gtObj.svgMarkup === "string" ? gtObj.svgMarkup : String(gtObj.svgMarkup ?? ""),
            );
            const resolvedUrl = upload.url || urlText;
            if (resolvedUrl) {
                this.grandTotal.imageData.value = {
                    name: upload.name || "image",
                    url: resolvedUrl,
                    scaling: upload.scaling || "normal",
                };
                this.grandTotal.imageUrl.value = resolvedUrl;
            }
            const rawUpload = this.grandTotal.imageData.value as unknown;
            if (typeof rawUpload === "string" && rawUpload.trim()) {
                const coerced = coerceImageValue(rawUpload);
                if (coerced.url) {
                    this.grandTotal.imageData.value = coerced;
                    this.grandTotal.imageUrl.value = coerced.url;
                }
            }
            if (svgText) {
                this.grandTotal.svgMarkup.value = svgText;
            }
        }
    }

    public ensureSelectedCategoryItem(name: string): void {
        if (!name) {
            return;
        }
        const items = this.categoryImages.selectedCategory.items ?? [PLACEHOLDER_CATEGORY];
        let match = items.find((i) => String(i.value) === name);
        if (!match) {
            match = { value: name, displayName: name };
            this.categoryImages.selectedCategory.items = [...items, match];
        }
        this.categoryImages.selectedCategory.value = match;
    }

    public ensureIconMeasureItem(
        dropdownCtrl: formattingSettings.ItemDropdown,
        queryName: string,
        displayName?: string,
    ): void {
        if (!queryName) {
            return;
        }
        const items = dropdownCtrl.items ?? [NONE_ICON];
        let match =
            items.find((i) => String(i.value) === queryName) ||
            items.find((i) => String(i.displayName) === queryName);
        if (!match) {
            match = { value: queryName, displayName: displayName || queryName };
            dropdownCtrl.items = [...items.filter((i) => String(i.value) !== ""), match];
            if (!dropdownCtrl.items.find((i) => String(i.value) === "")) {
                dropdownCtrl.items = [NONE_ICON, ...dropdownCtrl.items];
            }
        }
        dropdownCtrl.value = match;
    }

    /** Lê valor de ItemDropdown mesmo se o populate deixou string crua. */
    private readDropdownValue(control: formattingSettings.ItemDropdown): string {
        const raw = control.value as unknown;
        if (typeof raw === "string") {
            return raw.trim();
        }
        if (raw && typeof raw === "object" && "value" in (raw as object)) {
            return String((raw as { value?: string }).value ?? "").trim();
        }
        return "";
    }

    public syncIconMeasureOptions(
        options: Array<{ queryName: string; displayName: string }>,
        preferredGrandTotal?: string,
        preferredCategory?: string,
    ): void {
        const items = [
            NONE_ICON,
            ...options.map((o) => ({ value: o.queryName, displayName: o.displayName })),
        ];
        this.categoryImages.categoryIconMeasure.items = items;
        this.grandTotal.iconMeasure.items = items;

        const catSelected =
            (preferredCategory || "").trim() || this.readDropdownValue(this.categoryImages.categoryIconMeasure);
        this.categoryImages.categoryIconMeasure.value =
            items.find((i) => String(i.value) === catSelected) ??
            items.find((i) => String(i.displayName) === catSelected) ??
            NONE_ICON;

        const gtSelected =
            (preferredGrandTotal || "").trim() || this.readDropdownValue(this.grandTotal.iconMeasure);
        this.grandTotal.iconMeasure.value =
            items.find((i) => String(i.value) === gtSelected) ??
            items.find((i) => String(i.displayName) === gtSelected) ??
            NONE_ICON;
    }

    public getSelectedCategoryName(): string {
        return String(this.categoryImages.selectedCategory.value?.value ?? "").trim();
    }

    public getCategoryEditorDisplayMode(): DisplayMode {
        return asDisplayMode(this.categoryImages.categoryDisplayMode.value, "text");
    }

    public getCategoryEditorIconQueryName(): string {
        return this.readDropdownValue(this.categoryImages.categoryIconMeasure);
    }

    public getGrandTotalIconQueryName(): string {
        return this.readDropdownValue(this.grandTotal.iconMeasure);
    }

    public getCategoryImageType(): ImageSourceType {
        return "svg";
    }

    public getGrandTotalImageType(): ImageSourceType {
        return "svg";
    }

    public getCategoryMetaMap(): CategoryMetaMap {
        return parseCategoryMetaMap(
            this.categoryImages.categoriesJson.value,
            this.categoryImages.imagesJson.value,
        );
    }

    /** Payload legado de imagem por categoria. */
    public getEditorImagePayload(): { imageUrl: string; imageName: string } {
        const selected = this.getSelectedCategoryName();
        const fromMap = selected
            ? findCategoryMeta(this.getCategoryMetaMap(), selected)?.imageUrl || ""
            : "";
        return { imageUrl: fromMap, imageName: fromMap ? "image" : "" };
    }

    /** Mescla editor da categoria selecionada no mapa persistente (só essa chave). */
    public buildSyncedCategoriesJson(): string {
        const selected = this.getSelectedCategoryName();
        let map = this.getCategoryMetaMap();
        if (selected) {
            map = upsertCategoryMeta(map, selected, {
                title: this.categoryImages.categoryTitle.value || "",
                displayMode: this.getCategoryEditorDisplayMode(),
                iconQueryName: this.getCategoryEditorIconQueryName(),
            });
        }
        return serializeCategoryMetaMap(map);
    }

    public syncCategoryEditorFromMap(categoryNames: string[], preferredSelected?: string): void {
        const map = this.getCategoryMetaMap();
        const mergedNames = mergeCategoryNames(categoryNames, map, preferredSelected);
        const items = [
            PLACEHOLDER_CATEGORY,
            ...mergedNames.map((name) => ({ value: name, displayName: name })),
        ];
        this.categoryImages.selectedCategory.items = items;

        const selected =
            (preferredSelected && mergedNames.some((n) => n === preferredSelected)
                ? preferredSelected
                : "") ||
            this.getSelectedCategoryName() ||
            "";
        const match = items.find((i) => i.value === selected) ?? PLACEHOLDER_CATEGORY;
        this.categoryImages.selectedCategory.value = match;

        const meta = selected ? findCategoryMeta(map, selected) : undefined;
        this.categoryImages.categoryTitle.value = meta?.title || "";
        const mode = meta?.displayMode || "text";
        this.categoryImages.categoryDisplayMode.value =
            DISPLAY_MODES.find((i) => i.value === mode) ?? DISPLAY_MODES[0];

        const iconQn = meta?.iconQueryName || "";
        if (iconQn) {
            this.ensureIconMeasureItem(this.categoryImages.categoryIconMeasure, iconQn);
        } else {
            this.categoryImages.categoryIconMeasure.value = NONE_ICON;
        }

        this.categoryImages.applyVisibility();
    }

    /** Imagem do Total Geral (legado svgMarkup/url — preferir medida SVG). */
    public getGrandTotalImagePayload(): string {
        const fromUpload = imageValueToStorage(this.grandTotal.imageData.value);
        const fromUrl = unwrapMeasureText(this.grandTotal.imageUrl.value || "");
        const fromSvg = unwrapMeasureText(this.grandTotal.svgMarkup.value || "");
        return fromSvg || fromUpload || fromUrl;
    }

    public collectImagePersistProperties(previous: {
        grandImageUrl?: string;
        grandSvg?: string;
        grandType?: string;
        selectedCategory?: string;
        categoryType?: string;
        categoryImageUrl?: string;
    }): powerbi.VisualObjectInstancesToPersist {
        const merge: powerbi.VisualObjectInstance[] = [];
        const gtType = this.getGrandTotalImageType();
        const gtImage = this.getGrandTotalImagePayload();

        if (gtType === "png") {
            if (gtImage && gtImage !== (previous.grandImageUrl || "")) {
                this.grandTotal.imageUrl.value = gtImage;
                merge.push({
                    objectName: "grandTotal",
                    selector: undefined,
                    properties: {
                        imageUrl: gtImage,
                        imageType: "png",
                    },
                });
            }
        } else {
            const svg = unwrapMeasureText(this.grandTotal.svgMarkup.value || "");
            if (svg !== (previous.grandSvg || "") || previous.grandType !== "svg") {
                merge.push({
                    objectName: "grandTotal",
                    selector: undefined,
                    properties: {
                        svgMarkup: svg,
                        imageType: "svg",
                    },
                });
            }
        }

        const selected = this.getSelectedCategoryName();
        if (selected && selected !== (previous.selectedCategory || "")) {
            merge.push({
                objectName: "categories",
                selector: undefined,
                properties: {
                    selectedCategory: selected,
                },
            });
        }

        return { merge };
    }

    public snapshotImagePersistState(): {
        grandImageUrl: string;
        grandSvg: string;
        grandType: string;
        selectedCategory: string;
        categoryType: string;
        categoryImageUrl: string;
    } {
        const gtType = this.getGrandTotalImageType();
        const gtImage = this.getGrandTotalImagePayload();
        return {
            grandImageUrl: gtType === "png" ? gtImage : unwrapMeasureText(this.grandTotal.imageUrl.value || ""),
            grandSvg: gtType === "svg" ? gtImage : unwrapMeasureText(this.grandTotal.svgMarkup.value || ""),
            grandType: gtType,
            selectedCategory: this.getSelectedCategoryName(),
            categoryType: this.getCategoryImageType(),
            categoryImageUrl:
                this.getCategoryImageType() === "png" ? this.getEditorImagePayload().imageUrl : "",
        };
    }

    public toResolvedStyle(): ResolvedVisualStyle {
        const map = parseCategoryMetaMap(this.buildSyncedCategoriesJson());
        const images: Record<string, string> = {};
        const titles: Record<string, string> = {};
        const displayModes: Record<string, DisplayMode> = {};
        const iconQueryNames: Record<string, string> = {};
        for (const [key, meta] of Object.entries(map)) {
            if (meta.imageUrl) {
                images[key] = meta.imageUrl;
            }
            if (meta.title) {
                titles[key] = meta.title;
            }
            if (meta.displayMode) {
                displayModes[key] = meta.displayMode;
            }
            if (meta.iconQueryName) {
                iconQueryNames[key] = meta.iconQueryName;
            }
        }

        const grandImage = this.getGrandTotalImagePayload();
        const label = (this.grandTotal.label.value || "").trim() || defaultStyle.grandTotalLabel;
        const coluna = this.categories.coluna;
        const texto = this.categories.texto;
        const icone = this.categories.icone;

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
            categoryWidth: coluna.width.value,
            categoryFontSize: texto.fontSize.value,
            categoryFontColor: texto.fontColor.value.value,
            categoryFontWeight: String(texto.fontWeight.value.value),
            categoryAlignment: String(texto.alignment.value.value) as Align,
            imageSize: icone.imageSize.value,
            imagePlacement: String(icone.imagePlacement.value.value) as ImagePlacement,
            categoryShowRightBorder: coluna.showRightBorder.value,
            categoryImageType: this.getCategoryImageType(),
            sortMode: String(coluna.sortMode.value.value) as SortMode,
            grandTotalShow: this.grandTotal.show.value,
            grandTotalLabel: label,
            grandTotalDisplayMode: asDisplayMode(this.grandTotal.displayMode.value, "both"),
            grandTotalImageType: this.getGrandTotalImageType(),
            grandTotalIconQueryName: this.getGrandTotalIconQueryName(),
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
            columnShowBorder: this.columns.showBorder.value,
            columnBorderColor: this.columns.borderColor.value.value,
            columnBorderWidth: this.columns.showBorder.value ? this.columns.borderWidth.value : 0,
            columnBorderRadius: this.columns.borderRadius.value,
            columnWidth: Math.max(0, this.columns.columnWidth.value),
            columnGap: this.columns.columnGap.value,
            valueFontSize: this.values.fontSize.value,
            valueFontColor: this.values.fontColor.value.value,
            valueAlignment: String(this.values.alignment.value.value) as Align,
            valueDisplayUnits: Number(this.values.displayUnits.value ?? 0),
            valuePrecision: this.values.precision.value,
            valueBorderLeft: this.values.borderLeft.value,
            valueBorderRight: this.values.borderRight.value,
            valueBorderTop: this.values.borderTop.value,
            valueBorderBottom: this.values.borderBottom.value,
            valueVerticalBorderHeight: String(
                this.values.verticalBorderHeight.value.value,
            ) as VerticalBorderHeight,
            valueVerticalBorderCustomHeight: Math.max(
                1,
                this.values.verticalBorderCustomHeight.value || 24,
            ),
            valueBorderPadding: Math.max(0, this.values.borderPadding.value ?? 2),
            valueBorderColor: this.values.borderColor.value.value,
            valueBorderWidth: this.values.borderWidth.value,
            valueBorderRadius: this.values.borderRadius.value,
            headerFontSize: this.header.fontSize.value,
            headerFontColor: this.header.fontColor.value.value,
            headerBackground: this.header.background.value.value,
            headerFontWeight: String(this.header.fontWeight.value.value),
            tooltipEnabled: this.tooltip.enabled.value,
            categoryImages: images,
            categoryTitles: titles,
            categoryDisplayModes: displayModes,
            categoryIconQueryNames: iconQueryNames,
        };
    }

    public convertOptions() {
        const style = this.toResolvedStyle();
        return {
            totalLabel: style.grandTotalLabel,
            sortMode: style.sortMode,
            categoriesJson: this.buildSyncedCategoriesJson(),
            imagesJson: this.categoryImages.imagesJson.value || "{}",
            showTotal: style.grandTotalShow,
            displayUnits: style.valueDisplayUnits,
            precision: style.valuePrecision,
            grandTotalIconQueryName: style.grandTotalIconQueryName,
            grandTotalDisplayMode: style.grandTotalDisplayMode,
        };
    }
}

void metaFromImageValue;
