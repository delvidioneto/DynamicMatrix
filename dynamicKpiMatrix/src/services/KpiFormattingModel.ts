"use strict";

import powerbi from "powerbi-visuals-api";
import type { KpiColumnConfig } from "../data/viewModel";

const LAYOUT_ITEMS: powerbi.IEnumMember[] = [
    { value: "auto", displayName: "Automático" },
    { value: "vertical", displayName: "Vertical" },
    { value: "horizontal", displayName: "Horizontal" },
];

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
    const selected = items.find((i) => String(i.value) === String(value)) ?? items[0];
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

function colorSlice(
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
                    selector: { metadata: queryName },
                },
                value: { value },
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

export function buildKpiContainerCard(
    columns: KpiColumnConfig[],
    complementOptions: Array<{ queryName: string; displayName: string }>,
): powerbi.visuals.FormattingCard | null {
    if (!columns.length) {
        return null;
    }

    const complementItems: powerbi.IEnumMember[] = [
        { value: "", displayName: "(nenhum)" },
        ...complementOptions.map((c) => ({ value: c.queryName, displayName: c.displayName })),
    ];

    const containerItems: powerbi.visuals.FormattingContainerItem[] = columns.map((col, index) => {
        const q = col.queryName;
        const comps = col.complements;
        return {
            displayName: col.title || col.displayName,
            uid: `kpi_item_${index}_uid`,
            slices: [
                textSlice(`kpi_${index}_title`, "Título exibido", "title", col.title, q),
                dropdownSlice(`kpi_${index}_layout`, "Layout", "layout", col.layout, LAYOUT_ITEMS, q),
                dropdownSlice(
                    `kpi_${index}_c1`,
                    "Complemento 1",
                    "complement1",
                    comps[0]?.queryName ?? "",
                    complementItems,
                    q,
                ),
                textSlice(`kpi_${index}_c1l`, "Rótulo 1", "complement1Label", comps[0]?.label ?? "", q),
                dropdownSlice(
                    `kpi_${index}_c2`,
                    "Complemento 2",
                    "complement2",
                    comps[1]?.queryName ?? "",
                    complementItems,
                    q,
                ),
                textSlice(`kpi_${index}_c2l`, "Rótulo 2", "complement2Label", comps[1]?.label ?? "", q),
                dropdownSlice(
                    `kpi_${index}_c3`,
                    "Complemento 3",
                    "complement3",
                    comps[2]?.queryName ?? "",
                    complementItems,
                    q,
                ),
                textSlice(`kpi_${index}_c3l`, "Rótulo 3", "complement3Label", comps[2]?.label ?? "", q),
                dropdownSlice(
                    `kpi_${index}_c4`,
                    "Complemento 4",
                    "complement4",
                    comps[3]?.queryName ?? "",
                    complementItems,
                    q,
                ),
                textSlice(`kpi_${index}_c4l`, "Rótulo 4", "complement4Label", comps[3]?.label ?? "", q),
                numSlice(`kpi_${index}_width`, "Largura (px)", "columnWidth", col.columnWidth, q),
                numSlice(`kpi_${index}_min`, "Largura mínima", "minWidth", col.minWidth, q),
                numSlice(`kpi_${index}_max`, "Largura máxima", "maxWidth", col.maxWidth, q),
                numSlice(
                    `kpi_${index}_ps`,
                    "Fonte principal",
                    "primaryFontSize",
                    col.primaryFontSize ?? 14,
                    q,
                ),
                numSlice(
                    `kpi_${index}_cs`,
                    "Fonte complementos",
                    "complementFontSize",
                    col.complementFontSize ?? 11,
                    q,
                ),
                colorSlice(
                    `kpi_${index}_pc`,
                    "Cor principal",
                    "primaryColor",
                    col.primaryColor ?? "#1F1F1F",
                    q,
                ),
                colorSlice(
                    `kpi_${index}_bg`,
                    "Fundo da célula",
                    "backgroundColor",
                    col.backgroundColor ?? "#FFFFFF",
                    q,
                ),
                toggleSlice(`kpi_${index}_cf`, "Formatação condicional", "cfEnabled", col.cfEnabled, q),
                numSlice(
                    `kpi_${index}_cfh`,
                    "Limite alto",
                    "cfThresholdHigh",
                    col.cfThresholdHigh,
                    q,
                ),
                numSlice(
                    `kpi_${index}_cfm`,
                    "Limite médio",
                    "cfThresholdMid",
                    col.cfThresholdMid,
                    q,
                ),
                colorSlice(`kpi_${index}_cfch`, "Cor alta", "cfColorHigh", col.cfColorHigh, q),
                colorSlice(`kpi_${index}_cfcm`, "Cor média", "cfColorMid", col.cfColorMid, q),
                colorSlice(`kpi_${index}_cfcl`, "Cor baixa", "cfColorLow", col.cfColorLow, q),
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
