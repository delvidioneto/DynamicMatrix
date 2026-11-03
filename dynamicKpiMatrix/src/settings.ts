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
} from "./data/viewModel";
import {
    CategoryMetaMap,
    imageValueFromMeta,
    metaFromImageValue,
    parseCategoryMetaMap,
    serializeCategoryMetaMap,
    upsertCategoryMeta,
} from "./data/categoryMeta";
import { coerceImageValue, imageValueToStorage, unwrapMeasureText } from "./services/ImageManager";

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

const IMAGE_TYPES = [
    { value: "png", displayName: "PNG (upload)" },
    { value: "svg", displayName: "SVG (medida/texto)" },
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

function asImageType(value: unknown): ImageSourceType {
    return String(value) === "svg" ? "svg" : "png";
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
    imageType = dropdown("imageType", "Tipo de imagem", "png", IMAGE_TYPES);
    imageData = new formattingSettings.ImageUpload({
        name: "imageData",
        displayName: "Upload PNG",
        value: { ...EMPTY_IMAGE },
    });
    /** Persistência textual do PNG (o parser do ImageUpload descarta objetos sem .solid). */
    imageUrl = text("imageUrl", "URL/data URI (avançado)", "", "data:image/png;base64,...");
    svgMarkup = new formattingSettings.TextArea({
        name: "svgMarkup",
        displayName: "SVG (texto)",
        value: "",
        placeholder: '"<svg>...</svg>" ou cole o SVG; também pode usar o campo Ícone da categoria',
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
        "Selecione a categoria, escolha PNG (upload) ou SVG (medida/texto entre aspas). A imagem é redimensionada à coluna.";
    slices: FormattingSettingsSlice[] = [
        this.selectedCategory,
        this.categoryTitle,
        this.imageType,
        this.imageData,
        this.svgMarkup,
        this.categoriesJson,
    ];

    public onPreProcess(): void {
        const isPng = asImageType(this.imageType.value?.value) === "png";
        this.imageData.visible = isPng;
        this.svgMarkup.visible = !isPng;
        this.imageUrl.visible = false;
        this.imagesJson.visible = false;
    }
}

class GrandTotalCard extends FormattingSettingsCard {
    show = toggle("show", "Exibir Total Geral", defaultStyle.grandTotalShow);
    label = text("label", "Texto", defaultStyle.grandTotalLabel, "Total Geral");
    displayMode = dropdown("displayMode", "Exibição", "both", DISPLAY_MODES);
    imageType = dropdown("imageType", "Tipo de imagem", "png", IMAGE_TYPES);
    imageData = new formattingSettings.ImageUpload({
        name: "imageData",
        displayName: "Upload PNG",
        value: { ...EMPTY_IMAGE },
    });
    imageUrl = text("imageUrl", "URL/data URI persistido", "", "data:image/png;base64,...");
    svgMarkup = new formattingSettings.TextArea({
        name: "svgMarkup",
        displayName: "SVG (texto)",
        value: "",
        placeholder: '"<svg>...</svg>" ou use a medida Ícone da categoria no total',
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
        this.imageType,
        this.imageData,
        this.svgMarkup,
        this.fontSize,
        this.fontColor,
        this.background,
        this.rowHeight,
        this.alignment,
        this.imageSize,
    ];

    public onPreProcess(): void {
        const isPng = asImageType(this.imageType.value?.value) === "png";
        this.imageData.visible = isPng;
        this.svgMarkup.visible = !isPng;
        this.imageUrl.visible = false;
    }
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
    showBorder = toggle("showBorder", "Borda", defaultStyle.columnShowBorder);
    borderColor = color("borderColor", "Cor da borda", defaultStyle.columnBorderColor);
    borderWidth = num("borderWidth", "Espessura da borda", defaultStyle.columnBorderWidth);
    borderRadius = num("borderRadius", "Arredondamento", defaultStyle.columnBorderRadius);
    columnWidth = num("columnWidth", "Largura da coluna", defaultStyle.columnWidth);
    columnGap = num("columnGap", "Espaçamento entre colunas", defaultStyle.columnGap);

    name = "columns";
    displayName = "Colunas";
    description =
        "Largura respeita o maior texto (mesmo com 0). Borda pode ser ligada/desligada.";
    slices: FormattingSettingsSlice[] = [
        this.background,
        this.showBorder,
        this.borderColor,
        this.borderWidth,
        this.borderRadius,
        this.columnWidth,
        this.columnGap,
    ];

    public onPreProcess(): void {
        const on = this.showBorder.value;
        this.borderColor.visible = on;
        this.borderWidth.visible = on;
    }
}

class ValuesCard extends FormattingSettingsCard {
    fontSize = num("fontSize", "Tamanho do texto", defaultStyle.valueFontSize);
    fontColor = color("fontColor", "Cor do texto", defaultStyle.valueFontColor);
    alignment = dropdown("alignment", "Alinhamento", defaultStyle.valueAlignment, ALIGNS);
    displayUnits = new formattingSettings.AutoDropdown({
        name: "displayUnits",
        displayName: "Unidades de exibição",
        value: defaultStyle.valueDisplayUnits,
    });
    precision = num("precision", "Casas decimais", defaultStyle.valuePrecision);

    name = "values";
    displayName = "Valores";
    description =
        "Tamanho, alinhamento e unidades de exibição (Automático, Nenhum, Milhares, Milhões, Bilhões, Trilhões).";
    slices: FormattingSettingsSlice[] = [
        this.fontSize,
        this.fontColor,
        this.alignment,
        this.displayUnits,
        this.precision,
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
    values = new ValuesCard();
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
        this.values,
        this.grandTotal,
        this.header,
        this.rows,
        this.columns,
        this.subTotals,
        this.tooltip,
    ];

    /**
     * Recupera ImageUpload / selectedCategory a partir dos objects brutos.
     * O util oficial descarta ImageValue (objeto sem .solid) e o dropdown
     * falha se a lista de itens ainda não tem as categorias.
     */
    public hydrateFromDataViewObjects(objects: powerbi.DataViewObjects | undefined): void {
        if (!objects) {
            return;
        }

        const catObj = objects.categoryImages as Record<string, unknown> | undefined;
        if (catObj) {
            const selectedRaw = catObj.selectedCategory;
            const selectedName =
                typeof selectedRaw === "string"
                    ? selectedRaw.trim()
                    : String((selectedRaw as { value?: string } | undefined)?.value ?? "").trim();
            if (selectedName) {
                this.ensureSelectedCategoryItem(selectedName);
            }

            if (catObj.imageType != null) {
                const t = asImageType(catObj.imageType);
                this.categoryImages.imageType.value =
                    IMAGE_TYPES.find((i) => i.value === t) ?? IMAGE_TYPES[0];
            }

            const upload = coerceImageValue(catObj.imageData);
            const urlText = unwrapMeasureText(String(catObj.imageUrl ?? ""));
            const svgText = unwrapMeasureText(String(catObj.svgMarkup ?? ""));
            if (upload.url) {
                this.categoryImages.imageData.value = upload;
                this.categoryImages.imageUrl.value = upload.url;
            } else if (urlText) {
                this.categoryImages.imageData.value = {
                    name: "image",
                    url: urlText,
                    scaling: "normal",
                };
                this.categoryImages.imageUrl.value = urlText;
            }
            if (svgText) {
                this.categoryImages.svgMarkup.value = svgText;
            }
        }

        const gtObj = objects.grandTotal as Record<string, unknown> | undefined;
        if (gtObj) {
            if (gtObj.imageType != null) {
                const t = asImageType(gtObj.imageType);
                this.grandTotal.imageType.value = IMAGE_TYPES.find((i) => i.value === t) ?? IMAGE_TYPES[0];
            }
            const upload = coerceImageValue(gtObj.imageData);
            const urlText = unwrapMeasureText(String(gtObj.imageUrl ?? ""));
            const svgText = unwrapMeasureText(String(gtObj.svgMarkup ?? ""));
            if (upload.url) {
                this.grandTotal.imageData.value = upload;
                this.grandTotal.imageUrl.value = upload.url;
            } else if (urlText) {
                this.grandTotal.imageData.value = {
                    name: "image",
                    url: urlText,
                    scaling: "normal",
                };
                this.grandTotal.imageUrl.value = urlText;
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

    public getSelectedCategoryName(): string {
        return String(this.categoryImages.selectedCategory.value?.value ?? "").trim();
    }

    public getCategoryImageType(): ImageSourceType {
        return asImageType(this.categoryImages.imageType.value?.value);
    }

    public getGrandTotalImageType(): ImageSourceType {
        return asImageType(this.grandTotal.imageType.value?.value);
    }

    public getCategoryMetaMap(): CategoryMetaMap {
        return parseCategoryMetaMap(
            this.categoryImages.categoriesJson.value,
            this.categoryImages.imagesJson.value,
        );
    }

    /** Imagem efetiva do editor da categoria selecionada (PNG upload ou SVG texto). */
    public getEditorImagePayload(): { imageUrl: string; imageName: string } {
        if (this.getCategoryImageType() === "svg") {
            const svg = unwrapMeasureText(this.categoryImages.svgMarkup.value || "");
            return { imageUrl: svg, imageName: svg ? "svg" : "" };
        }
        const fromUpload = imageValueToStorage(this.categoryImages.imageData.value);
        const fromUrl = unwrapMeasureText(this.categoryImages.imageUrl.value || "");
        const imageUrl = fromUpload || fromUrl;
        return {
            imageUrl,
            imageName: this.categoryImages.imageData.value?.name || (imageUrl ? "image" : ""),
        };
    }

    /** Mescla título/imagem da categoria selecionada no mapa persistente. */
    public buildSyncedCategoriesJson(): string {
        const selected = this.getSelectedCategoryName();
        let map = this.getCategoryMetaMap();
        if (selected) {
            const payload = this.getEditorImagePayload();
            map = upsertCategoryMeta(map, selected, {
                title: this.categoryImages.categoryTitle.value || "",
                imageUrl: payload.imageUrl || "",
                imageName: payload.imageName || "",
            });
        }
        return serializeCategoryMetaMap(map);
    }

    public syncCategoryEditorFromMap(categoryNames: string[], preferredSelected?: string): void {
        const items = [
            PLACEHOLDER_CATEGORY,
            ...categoryNames.map((name) => ({ value: name, displayName: name })),
        ];
        this.categoryImages.selectedCategory.items = items;

        const selected =
            (preferredSelected && categoryNames.includes(preferredSelected)
                ? preferredSelected
                : "") ||
            this.getSelectedCategoryName() ||
            "";
        const match = items.find((i) => i.value === selected) ?? PLACEHOLDER_CATEGORY;
        this.categoryImages.selectedCategory.value = match;

        const map = this.getCategoryMetaMap();
        const meta = selected ? map[selected] : undefined;
        this.categoryImages.categoryTitle.value = meta?.title || "";

        const imageUrl = meta?.imageUrl || "";
        if (this.getCategoryImageType() === "svg") {
            this.categoryImages.svgMarkup.value = imageUrl.includes("<svg") ? imageUrl : "";
            this.categoryImages.imageData.value = { ...EMPTY_IMAGE };
            this.categoryImages.imageUrl.value = "";
        } else {
            this.categoryImages.imageData.value = imageValueFromMeta(meta);
            this.categoryImages.imageUrl.value = imageUrl;
            this.categoryImages.svgMarkup.value = "";
        }
    }

    /** Imagem do Total Geral: PNG persistido ou SVG texto. */
    public getGrandTotalImagePayload(): string {
        if (this.getGrandTotalImageType() === "svg") {
            return unwrapMeasureText(this.grandTotal.svgMarkup.value || "");
        }
        const fromUpload = imageValueToStorage(this.grandTotal.imageData.value);
        const fromUrl = unwrapMeasureText(this.grandTotal.imageUrl.value || "");
        return fromUpload || fromUrl;
    }

    /**
     * Diff de propriedades de imagem a persistir (evita loop de update).
     * Compare com o último snapshot conhecido via `previous`.
     */
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
        const catType = this.getCategoryImageType();
        if (selected && selected !== (previous.selectedCategory || "")) {
            merge.push({
                objectName: "categoryImages",
                selector: undefined,
                properties: {
                    selectedCategory: selected,
                },
            });
        }
        if (catType !== (previous.categoryType || "")) {
            merge.push({
                objectName: "categoryImages",
                selector: undefined,
                properties: {
                    imageType: catType,
                },
            });
        }
        if (catType === "png") {
            const payload = this.getEditorImagePayload();
            if (payload.imageUrl && payload.imageUrl !== (previous.categoryImageUrl || "")) {
                merge.push({
                    objectName: "categoryImages",
                    selector: undefined,
                    properties: {
                        imageUrl: payload.imageUrl,
                    },
                });
            }
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
        for (const [key, meta] of Object.entries(map)) {
            if (meta.imageUrl) {
                images[key] = meta.imageUrl;
            }
            if (meta.title) {
                titles[key] = meta.title;
            }
        }

        const grandImage = this.getGrandTotalImagePayload();
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
            categoryImageType: this.getCategoryImageType(),
            sortMode: String(this.categories.sortMode.value.value) as SortMode,
            sortKpiQueryName: this.categories.sortKpiQueryName.value || "",
            grandTotalShow: this.grandTotal.show.value,
            grandTotalLabel: label,
            grandTotalDisplayMode: String(this.grandTotal.displayMode.value.value) as DisplayMode,
            grandTotalImageType: this.getGrandTotalImageType(),
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
            displayUnits: style.valueDisplayUnits,
            precision: style.valuePrecision,
        };
    }
}

// re-export helpers used by tests / visual
void metaFromImageValue;
