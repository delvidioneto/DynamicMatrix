"use strict";

export type CellLayout = "auto" | "vertical" | "horizontal";
export type WidthMode = "auto" | "fixed";
export type Align = "left" | "center" | "right";
export type ImagePlacement = "left" | "above";
export type SortMode = "data" | "alphaAsc" | "alphaDesc";
export type DisplayMode = "text" | "image" | "both";
export type ImageSourceType = "png" | "svg";
/** Altura das bordas esquerda/direita na seção Valores. */
export type VerticalBorderHeight = "full" | "content" | "custom";
export type CfApplyTo = "value" | "background" | "both";
export type ComplementIconSet = "none" | "directional" | "traffic" | "triangles";
export type CellElementKind = "font" | "background" | "dataBars" | "icons" | "webUrl";
/** Slots ativos na UI de Indicadores (máx. 2 por KPI). */
export type ComplementSlotIndex = 1 | 2;

export interface ComplementSlot {
    slotIndex: ComplementSlotIndex;
    queryName: string;
    label: string;
    displayName: string;
    format?: string;
    fontColor?: string;
    backColor?: string;
    dataBars?: boolean;
    dataBarColor?: string;
    icons?: ComplementIconSet;
    webUrl?: string;
    fontSize?: number;
}

export interface KpiColumnConfig {
    queryName: string;
    displayName: string;
    title: string;
    layout: CellLayout;
    complements: ComplementSlot[];
    editingComplementSlot: ComplementSlotIndex;
    editingElementKind: CellElementKind;
    widthMode: WidthMode;
    columnWidth: number;
    minWidth: number;
    maxWidth: number;
    primaryFontSize?: number;
    complementFontSize?: number;
    labelFontSize?: number;
    primaryColor?: string;
    complementColor?: string;
    labelColor?: string;
    headerColor?: string;
    backgroundColor?: string;
    cellPadding: number;
    cfEnabled: boolean;
    cfApplyTo: CfApplyTo;
    cfThresholdHigh: number;
    cfThresholdMid: number;
    cfColorHigh: string;
    cfColorMid: string;
    cfColorLow: string;
    cfAsPercent: boolean;
    format?: string;
    valueSourceIndex: number;
}

export interface MeasureRef {
    queryName: string;
    displayName: string;
    format?: string;
    role: "kpis" | "complements" | "categoryIcon" | "tooltips";
    valueSourceIndex: number;
}

export interface FormattedValue {
    raw: number | null;
    text: string;
    format?: string;
}

export interface ComplementValue {
    slotIndex: ComplementSlotIndex;
    label: string;
    displayName: string;
    queryName: string;
    value: FormattedValue;
    fontColor?: string;
    backColor?: string;
    dataBars?: boolean;
    dataBarColor?: string;
    icons?: ComplementIconSet;
    webUrl?: string;
    fontSize?: number;
}

export interface KpiCellData {
    queryName: string;
    primary: FormattedValue;
    complements: ComplementValue[];
    layout: CellLayout;
    backgroundColor?: string;
    primaryColor?: string;
}

export interface TooltipLine {
    displayName: string;
    value: string;
}

export interface MatrixRow {
    category: string;
    categoryKey: string;
    /** Título exibido (customizado ou nome da categoria). */
    displayTitle: string;
    /** Modo de exibição da célula de categoria (linhas; total usa estilo global). */
    displayMode: DisplayMode;
    iconRaw: string;
    iconPersisted?: string;
    isTotal: boolean;
    sourceIndex: number;
    cells: KpiCellData[];
    tooltips: TooltipLine[];
}

export interface VisualViewModel {
    columns: KpiColumnConfig[];
    rows: MatrixRow[];
    totalRow?: MatrixRow;
    complementOptions: Array<{ queryName: string; displayName: string }>;
    /** Medidas do well SVG (categoryIcon). */
    iconMeasureOptions: Array<{ queryName: string; displayName: string }>;
    categoryNames: string[];
    emptyMessage?: string;
}

export interface ResolvedVisualStyle {
    fontFamily: string;
    fontSize: number;
    fontColor: string;
    fontWeight: string;
    background: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
    rowHeight: number;
    rowGap: number;
    categoryWidth: number;
    categoryFontSize: number;
    categoryFontColor: string;
    categoryFontWeight: string;
    categoryAlignment: Align;
    imageSize: number;
    imagePlacement: ImagePlacement;
    /** Borda direita da coluna de categorias. */
    categoryShowRightBorder: boolean;
    categoryImageType: ImageSourceType;
    sortMode: SortMode;
    grandTotalShow: boolean;
    grandTotalLabel: string;
    grandTotalDisplayMode: DisplayMode;
    grandTotalImageType: ImageSourceType;
    /** queryName da medida SVG usada no Total Geral. */
    grandTotalIconQueryName: string;
    grandTotalImageData: string;
    grandTotalFontSize: number;
    grandTotalFontColor: string;
    grandTotalBackground: string;
    grandTotalRowHeight: number;
    grandTotalAlignment: Align;
    grandTotalImageSize: number;
    rowDefaultBackground: string;
    rowEvenBackground: string;
    rowOddBackground: string;
    zebra: boolean;
    rowBorderColor: string;
    rowBorderWidth: number;
    rowBorderRadius: number;
    columnBackground: string;
    columnShowBorder: boolean;
    columnBorderColor: string;
    columnBorderWidth: number;
    columnBorderRadius: number;
    columnWidth: number;
    columnGap: number;
    valueFontSize: number;
    valueFontColor: string;
    valueAlignment: Align;
    valueDisplayUnits: number;
    valuePrecision: number;
    valueBorderLeft: boolean;
    valueBorderRight: boolean;
    valueBorderTop: boolean;
    valueBorderBottom: boolean;
    /** Completa | Somente área do valor | Personalizada — só L/R. */
    valueVerticalBorderHeight: VerticalBorderHeight;
    valueVerticalBorderCustomHeight: number;
    /** Espaço entre a borda e o conteúdo do valor (px). */
    valueBorderPadding: number;
    valueBorderColor: string;
    valueBorderWidth: number;
    valueBorderRadius: number;
    headerFontSize: number;
    headerFontColor: string;
    headerBackground: string;
    headerFontWeight: string;
    tooltipEnabled: boolean;
    /** Legado: data URI por categoria. */
    categoryImages: Record<string, string>;
    categoryTitles: Record<string, string>;
    categoryDisplayModes: Record<string, DisplayMode>;
    categoryIconQueryNames: Record<string, string>;
}

export const defaultStyle: ResolvedVisualStyle = {
    fontFamily: "Segoe UI",
    fontSize: 12,
    fontColor: "#1F1F1F",
    fontWeight: "400",
    background: "#FFFFFF",
    borderColor: "#D0D0D0",
    borderWidth: 1,
    borderRadius: 4,
    rowHeight: 64,
    rowGap: 0,
    categoryWidth: 180,
    categoryFontSize: 13,
    categoryFontColor: "#1F1F1F",
    categoryFontWeight: "600",
    categoryAlignment: "left",
    imageSize: 22,
    imagePlacement: "left",
    categoryShowRightBorder: true,
    categoryImageType: "svg",
    sortMode: "data",
    grandTotalShow: true,
    grandTotalLabel: "Total Geral",
    grandTotalDisplayMode: "both",
    grandTotalImageType: "svg",
    grandTotalIconQueryName: "",
    grandTotalImageData: "",
    grandTotalFontSize: 13,
    grandTotalFontColor: "#111111",
    grandTotalBackground: "#EEF2F6",
    grandTotalRowHeight: 68,
    grandTotalAlignment: "left",
    grandTotalImageSize: 24,
    rowDefaultBackground: "#FFFFFF",
    rowEvenBackground: "#F7F9FC",
    rowOddBackground: "#FFFFFF",
    zebra: true,
    rowBorderColor: "#E1E5EA",
    rowBorderWidth: 1,
    rowBorderRadius: 0,
    columnBackground: "#FFFFFF",
    columnShowBorder: true,
    columnBorderColor: "#E1E5EA",
    columnBorderWidth: 1,
    columnBorderRadius: 0,
    columnWidth: 140,
    columnGap: 0,
    valueFontSize: 14,
    valueFontColor: "#1F1F1F",
    valueAlignment: "left",
    valueDisplayUnits: 0,
    valuePrecision: -1,
    valueBorderLeft: false,
    valueBorderRight: false,
    valueBorderTop: false,
    valueBorderBottom: false,
    valueVerticalBorderHeight: "full",
    valueVerticalBorderCustomHeight: 24,
    valueBorderPadding: 2,
    valueBorderColor: "#D0D0D0",
    valueBorderWidth: 1,
    valueBorderRadius: 0,
    headerFontSize: 11,
    headerFontColor: "#5A5A5A",
    headerBackground: "#FFFFFF",
    headerFontWeight: "700",
    tooltipEnabled: true,
    categoryImages: {},
    categoryTitles: {},
    categoryDisplayModes: {},
    categoryIconQueryNames: {},
};

export const defaultKpiStyle = {
    layout: "vertical" as CellLayout,
    widthMode: "auto" as WidthMode,
    columnWidth: 140,
    minWidth: 96,
    maxWidth: 320,
    cellPadding: 8,
    cfEnabled: false,
    cfApplyTo: "value" as CfApplyTo,
    cfThresholdHigh: 1,
    cfThresholdMid: 0.9,
    cfColorHigh: "#107C10",
    cfColorMid: "#F7B500",
    cfColorLow: "#D13438",
    cfAsPercent: true,
};
