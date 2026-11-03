"use strict";

import powerbi from "powerbi-visuals-api";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import type { ComplementSlot, KpiColumnConfig } from "../data/viewModel";
import { NONE_COMPLEMENT } from "../data/kpiMapper";

const LAYOUT_ITEMS: powerbi.IEnumMember[] = [
    { value: "vertical", displayName: "Vertical" },
    { value: "horizontal", displayName: "Horizontal" },
    { value: "auto", displayName: "Automático" },
];

const SLOT_ITEMS: powerbi.IEnumMember[] = [
    { value: "1", displayName: "Complemento 1" },
    { value: "2", displayName: "Complemento 2" },
    { value: "3", displayName: "Complemento 3" },
    { value: "4", displayName: "Complemento 4" },
];

const ICON_ITEMS: powerbi.IEnumMember[] = [
    { value: "none", displayName: "Nenhum" },
    { value: "directional", displayName: "Direcional (setas)" },
    { value: "traffic", displayName: "Semáforo" },
    { value: "triangles", displayName: "Triângulos" },
];

const ELEMENT_ITEMS: powerbi.IEnumMember[] = [
    { value: "font", displayName: "Cor da fonte" },
    { value: "background", displayName: "Cor de fundo" },
    { value: "dataBars", displayName: "Barras de dados" },
    { value: "icons", displayName: "Ícones" },
    { value: "webUrl", displayName: "URL da web" },
];

type SlotIndex = 1 | 2 | 3 | 4;

function slotOf(col: KpiColumnConfig): SlotIndex {
    const n = Number(col.editingComplementSlot ?? 1);
    if (n === 2 || n === 3 || n === 4) {
        return n;
    }
    return 1;
}

function slotConfig(col: KpiColumnConfig, slot: SlotIndex): ComplementSlot | undefined {
    return col.complements.find((c) => c.slotIndex === slot) ?? col.complements[slot - 1];
}

function textSlice(
    uid: string,
    displayName: string,
    propertyName: string,
    value: string,
    queryName: string,
): powerbi.visuals.FormattingSlice {
    return {
        uid,
        displayName,
        control: {
            type: powerbi.visuals.FormattingComponent.TextInput,
            properties: {
                descriptor: {
                    objectName: "kpiStyle",
                    propertyName,
                    selector: { metadata: queryName },
                },
                value,
                placeholder: "",
            },
        },
    };
}

function numSlice(
    uid: string,
    displayName: string,
    propertyName: string,
    value: number,
    queryName: string,
): powerbi.visuals.FormattingSlice {
    return {
        uid,
        displayName,
        control: {
            type: powerbi.visuals.FormattingComponent.NumUpDown,
            properties: {
                descriptor: {
                    objectName: "kpiStyle",
                    propertyName,
                    selector: { metadata: queryName },
                },
                value,
            },
        },
    };
}

function dropdownSlice(
    uid: string,
    displayName: string,
    propertyName: string,
    value: string,
    items: powerbi.IEnumMember[],
    queryName: string,
): powerbi.visuals.FormattingSlice {
    const normalized = value == null || value === "" ? String(items[0]?.value ?? "") : String(value);
    const selected =
        items.find((i) => String(i.value) === normalized) ??
        items.find((i) => String(i.value) === NONE_COMPLEMENT) ??
        items[0];
    return {
        uid,
        displayName,
        control: {
            type: powerbi.visuals.FormattingComponent.Dropdown,
            properties: {
                descriptor: {
                    objectName: "kpiStyle",
                    propertyName,
                    selector: { metadata: queryName },
                },
                value: selected,
                items,
            },
        },
    };
}

function toggleSlice(
    uid: string,
    displayName: string,
    propertyName: string,
    value: boolean,
    queryName: string,
): powerbi.visuals.FormattingSlice {
    return {
        uid,
        displayName,
        control: {
            type: powerbi.visuals.FormattingComponent.ToggleSwitch,
            properties: {
                descriptor: {
                    objectName: "kpiStyle",
                    propertyName,
                    selector: { metadata: queryName },
                },
                value,
            },
        },
    };
}

/** ColorPicker com botão fx (formatação condicional nativa, como na Matrix). */
function colorCfSlice(
    uid: string,
    displayName: string,
    propertyName: string,
    value: string,
    queryName: string,
): powerbi.visuals.FormattingSlice {
    return {
        uid,
        displayName,
        control: {
            type: powerbi.visuals.FormattingComponent.ColorPicker,
            properties: {
                descriptor: {
                    objectName: "kpiStyle",
                    propertyName,
                    selector: dataViewWildcard.createDataViewWildcardSelector(
                        dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals,
                    ),
                    altConstantValueSelector: { metadata: queryName },
                    instanceKind: powerbi.VisualEnumerationInstanceKinds.ConstantOrRule,
                },
                value: { value },
            },
        },
    };
}

function buildComplementElementSlices(
    index: number,
    q: string,
    slot: SlotIndex,
    active: ComplementSlot | undefined,
    elementKind: string,
): powerbi.visuals.FormattingSlice[] {
    const prefix = `kpi_${index}_s${slot}`;
    switch (elementKind) {
        case "background":
            return [
                colorCfSlice(
                    `${prefix}_bg`,
                    "Cor de fundo",
                    `complement${slot}BackColor`,
                    active?.backColor ?? "#FFFFFF",
                    q,
                ),
            ];
        case "dataBars":
            return [
                toggleSlice(
                    `${prefix}_bars`,
                    "Barras de dados",
                    `complement${slot}DataBars`,
                    active?.dataBars ?? false,
                    q,
                ),
                colorCfSlice(
                    `${prefix}_barc`,
                    "Cor da barra",
                    `complement${slot}DataBarColor`,
                    active?.dataBarColor ?? "#118DFF",
                    q,
                ),
            ];
        case "icons":
            return [
                dropdownSlice(
                    `${prefix}_icons`,
                    "Ícones",
                    `complement${slot}Icons`,
                    active?.icons ?? "none",
                    ICON_ITEMS,
                    q,
                ),
            ];
        case "webUrl":
            return [
                textSlice(
                    `${prefix}_url`,
                    "URL da web",
                    `complement${slot}WebUrl`,
                    active?.webUrl ?? "",
                    q,
                ),
            ];
        case "font":
        default:
            return [
                colorCfSlice(
                    `${prefix}_fc`,
                    "Cor da fonte",
                    `complement${slot}FontColor`,
                    active?.fontColor ?? "#4A4A4A",
                    q,
                ),
            ];
    }
}

export function buildKpiContainerCard(
    columns: KpiColumnConfig[],
    complementOptions: Array<{ queryName: string; displayName: string }>,
): powerbi.visuals.FormattingCard | null {
    if (!columns.length) {
        return null;
    }

    const complementItems: powerbi.IEnumMember[] = [
        { value: NONE_COMPLEMENT, displayName: "(nenhum)" },
        ...complementOptions.map((c) => ({ value: c.queryName, displayName: c.displayName })),
    ];

    const containerItems: powerbi.visuals.FormattingContainerItem[] = columns.map((col, index) => {
        const q = col.queryName;
        const layoutValue =
            col.layout === "horizontal" || col.layout === "vertical" || col.layout === "auto"
                ? col.layout
                : "vertical";
        const slot = slotOf(col);
        const active = slotConfig(col, slot);
        const elementKind = col.editingElementKind || "font";

        return {
            displayName: col.title || col.displayName,
            uid: `kpi_item_${index}_uid`,
            groups: [
                {
                    displayName: "KPI",
                    uid: `kpi_${index}_kpiGroup_uid`,
                    slices: [
                        textSlice(`kpi_${index}_title`, "Título", "title", col.title, q),
                        dropdownSlice(
                            `kpi_${index}_layout`,
                            "Orientação dos complementos",
                            "layout",
                            layoutValue,
                            LAYOUT_ITEMS,
                            q,
                        ),
                        numSlice(
                            `kpi_${index}_width`,
                            "Largura (px)",
                            "columnWidth",
                            col.columnWidth,
                            q,
                        ),
                        numSlice(
                            `kpi_${index}_ps`,
                            "Fonte principal",
                            "primaryFontSize",
                            col.primaryFontSize ?? 14,
                            q,
                        ),
                        colorCfSlice(
                            `kpi_${index}_pc`,
                            "Cor do valor principal",
                            "primaryColor",
                            col.primaryColor ?? "#1F1F1F",
                            q,
                        ),
                        colorCfSlice(
                            `kpi_${index}_bg`,
                            "Fundo da célula",
                            "backgroundColor",
                            col.backgroundColor ?? "#FFFFFF",
                            q,
                        ),
                    ],
                },
                {
                    displayName: "Complementos",
                    uid: `kpi_${index}_compGroup_uid`,
                    slices: [
                        dropdownSlice(
                            `kpi_${index}_slot`,
                            "Complemento",
                            "editingComplementSlot",
                            String(slot),
                            SLOT_ITEMS,
                            q,
                        ),
                        dropdownSlice(
                            `kpi_${index}_measure`,
                            "Medida",
                            `complement${slot}`,
                            active?.queryName || NONE_COMPLEMENT,
                            complementItems,
                            q,
                        ),
                        textSlice(
                            `kpi_${index}_label`,
                            "Rótulo",
                            `complement${slot}Label`,
                            active?.label ?? "",
                            q,
                        ),
                        numSlice(
                            `kpi_${index}_cs`,
                            "Tamanho da fonte",
                            "complementFontSize",
                            col.complementFontSize ?? 11,
                            q,
                        ),
                        dropdownSlice(
                            `kpi_${index}_el`,
                            "Elemento da célula",
                            "editingElementKind",
                            elementKind,
                            ELEMENT_ITEMS,
                            q,
                        ),
                        ...buildComplementElementSlices(index, q, slot, active, elementKind),
                    ],
                },
            ],
        };
    });

    return {
        displayName: "Indicadores por KPI",
        uid: "kpiPerColumnCard_uid",
        groups: [
            {
                displayName: undefined,
                uid: "kpiPerColumnGroup_uid",
                slices: [],
                container: {
                    displayName: "KPI",
                    uid: "kpiPerColumnContainer_uid",
                    containerItems,
                },
            },
        ],
    };
}
