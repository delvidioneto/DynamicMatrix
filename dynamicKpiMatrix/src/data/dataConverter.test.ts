"use strict";

import { convertDataView } from "./dataConverter";
import { DisplayUnits, formatMeasureValue, normalizeCfRatio } from "./formatValue";
import { buildKpiColumns, collectMeasures, parseMappingJson, syncMappingJson } from "./kpiMapper";
import { findCategoryMeta, parseCategoryMetaMap, upsertCategoryMeta } from "./categoryMeta";
import { applyConditionalColors } from "../services/ConditionalFormatting";
import { sanitizeSvg, isDataImageUri } from "../services/SvgSanitizer";
import { resolveImageSource, validatePersistedImage } from "../services/ImageManager";
import { buildMatrixHtml } from "../components/MatrixRenderer";
import { defaultKpiStyle, defaultStyle, KpiColumnConfig, KpiCellData } from "./viewModel";
import type powerbi from "powerbi-visuals-api";

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

// --- formatValue ---
{
    const pct = formatMeasureValue(1.1, "0.00%");
    assert(pct.text === "110.00%", `percent format got ${pct.text}`);
    const money = formatMeasureValue(28_400_000, "$#,0");
    assert(money.text.includes("MM") || money.text.includes("28"), `money got ${money.text}`);
    const blank = formatMeasureValue(null, "0");
    assert(blank.text === "", "blank should be empty");
    assert(normalizeCfRatio(1.02, true) === 1.02, "ratio decimal");
    assert(normalizeCfRatio(102, true) === 1.02, "ratio points");
    const none = formatMeasureValue(1_500_000, undefined, { displayUnits: DisplayUnits.None });
    assert(none.text.includes("1") && none.text.includes("500"), `none units got ${none.text}`);
    const millions = formatMeasureValue(1_500_000, undefined, {
        displayUnits: DisplayUnits.Millions,
        precision: 1,
    });
    assert(millions.text.includes("M"), `millions got ${millions.text}`);
}

// --- svg sanitize ---
{
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" onclick="alert(1)"><script>x</script><circle r="5"/></svg>`;
    const clean = sanitizeSvg(dirty);
    assert(!clean.includes("script"), "script removed");
    assert(!clean.toLowerCase().includes("onclick"), "onclick removed");
    assert(isDataImageUri("data:image/png;base64,aaa"), "png uri");
    const bad = validatePersistedImage("data:image/png;base64," + "a".repeat(400_000));
    assert(!bad.ok, "large image rejected");
    const svgImg = resolveImageSource("<svg><circle r='1'/></svg>");
    assert(svgImg.kind === "svg", "svg resolved");
    const quoted = resolveImageSource('"<svg><rect width=\'1\' height=\'1\'/></svg>"');
    assert(quoted.kind === "svg", "quoted svg from measure resolved");
}

// --- kpiMapper ---
{
    const mapping = parseMappingJson(
        JSON.stringify({
            "Sum(Sales)": { complements: ["Sum(IBP)", "Sum(Quota)", "x"] },
        }),
    );
    assert(mapping["Sum(Sales)"].complements?.length === 3, "mapping parsed");

    const sources = [
        { queryName: "kpiA", displayName: "Billing", roles: { kpis: true }, format: "$#,0" },
        { queryName: "comp1", displayName: "IBP", roles: { complements: true }, format: "0%" },
        { queryName: "comp2", displayName: "Quota", roles: { complements: true }, format: "0%" },
    ] as unknown as powerbi.DataViewMetadataColumn[];

    const measures = collectMeasures(sources);
    assert(measures.length === 3, "3 measures");

    const colObjects = new Map<string, powerbi.DataViewObjects | undefined>();
    colObjects.set("kpiA", {
        kpiStyle: {
            title: "Faturamento",
            layout: "vertical",
            complement1: "comp1",
            complement2: "comp2",
            complement1Label: "IBP",
            complement2Label: "Quota",
            complement1FontColor: { solid: { color: "#107C10" } },
            complement2FontColor: { solid: { color: "#D13438" } },
            complement1FontSize: 13,
            complement2FontSize: 9,
            complement2DataBars: true,
        },
    } as powerbi.DataViewObjects);

    const columns = buildKpiColumns(measures, undefined, colObjects);
    assert(columns.length === 1, "1 kpi column");
    assert(columns[0].title === "Faturamento", "title override");
    assert(columns[0].complements.length === 2, "2 complements mapped");
    assert(columns[0].complements[0].queryName === "comp1", "stable queryName");
    assert(columns[0].complements[0].fontColor === "#107C10", "complement 1 color");
    assert(columns[0].complements[0].fontSize === 13, "complement 1 font size");
    assert(columns[0].complements[1].fontColor === "#D13438", "complement 2 color");
    assert(columns[0].complements[1].fontSize === 9, "complement 2 font size");
    assert(columns[0].complements[1].dataBars === true, "complement 2 data bars");
    assert(columns[0].complements[0].dataBars === false, "complement 1 without bars");

    const synced = syncMappingJson(columns);
    assert(synced.includes("comp1"), "sync mapping json");

    // kpiStyle só com título não pode apagar o mapeamento JSON dos complementos
    const colObjectsTitleOnly = new Map<string, powerbi.DataViewObjects | undefined>();
    colObjectsTitleOnly.set("kpiA", {
        kpiStyle: { title: "Billing", layout: "horizontal" },
    } as powerbi.DataViewObjects);
    const columnsFromJson = buildKpiColumns(
        measures,
        {
            kpiMapping: {
                mappingJson: JSON.stringify({
                    kpiA: { complements: ["comp1", "comp2"] },
                }),
            },
        } as powerbi.DataViewObjects,
        colObjectsTitleOnly,
    );
    assert(columnsFromJson[0].complements.length === 2, "JSON complements kept when kpiStyle has no measures");
    assert(columnsFromJson[0].complements[0].queryName === "comp1", "JSON slot 1");
    assert(columnsFromJson[0].complements[1].queryName === "comp2", "JSON slot 2");
    assert(columnsFromJson[0].editingComplementSlot === 1, "default editing slot is 1");
}

// --- conditional formatting ---
{
    const column: KpiColumnConfig = {
        queryName: "kpiA",
        displayName: "Billing",
        title: "Billing",
        layout: "auto",
        complements: [],
        editingComplementSlot: 1,
        editingElementKind: "font",
        widthMode: "auto",
        columnWidth: 140,
        minWidth: 96,
        maxWidth: 320,
        cellPadding: 8,
        cfEnabled: true,
        cfApplyTo: "value",
        cfThresholdHigh: 1,
        cfThresholdMid: 0.9,
        cfColorHigh: "#107C10",
        cfColorMid: "#F7B500",
        cfColorLow: "#D13438",
        cfAsPercent: true,
        valueSourceIndex: 0,
    };
    const cell: KpiCellData = {
        queryName: "kpiA",
        primary: { raw: 0.85, text: "85.00%" },
        complements: [],
        layout: "auto",
    };
    const colored = applyConditionalColors(cell, column);
    assert(colored.primaryColor === "#D13438", `expected low color got ${colored.primaryColor}`);
    void defaultKpiStyle;
}

// --- matrix converter with subtotal ---
{
    const dataView = {
        matrix: {
            rows: {
                levels: [{ sources: [{ queryName: "cat", roles: { category: true } }] }],
                root: {
                    children: [
                        {
                            isSubtotal: true,
                            values: {
                                0: { value: 100 },
                                1: { value: 1.02 },
                            },
                        },
                        {
                            value: "Produto A",
                            values: {
                                0: { value: 40 },
                                1: { value: 1.1 },
                            },
                        },
                        {
                            value: "Produto B",
                            values: {
                                0: { value: 60 },
                                1: { value: 0.95 },
                            },
                        },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Billing", roles: { kpis: true }, format: "$#,0" },
                { queryName: "comp1", displayName: "IBP", roles: { complements: true }, format: "0.00%" },
            ],
        },
        metadata: {
            columns: [
                { queryName: "cat", roles: { category: true } },
                {
                    queryName: "kpiA",
                    roles: { kpis: true },
                    objects: {
                        kpiStyle: {
                            complement1: "comp1",
                            complement1Label: "IBP",
                        },
                    },
                },
                { queryName: "comp1", roles: { complements: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total Geral",
        sortMode: "alphaAsc",
        categoriesJson: "{}",
        imagesJson: "{}",
        showTotal: true,
    });

    assert(view.columns.length === 1, "one kpi");
    assert(view.columns[0].complements.length === 1, "complement associated");
    assert(view.rows.length === 2, "two categories");
    assert(view.rows[0].category === "Produto A", "alpha sort");
    assert(view.rows[0].displayMode === "text", "default category display mode");
    assert(view.totalRow, "total row from matrix subtotal");
    assert(view.totalRow!.isTotal, "total flagged");
    assert(view.totalRow!.displayTitle === "Total Geral", "total title");
    assert(view.totalRow!.cells[0].primary.raw === 100, "DAX total not sum of rows");
}

// Fallback: soma das linhas quando não há subtotal
{
    const dataView = {
        matrix: {
            rows: {
                root: {
                    children: [
                        { value: "A", values: { 0: { value: 10 }, 1: { value: 1 } } },
                        { value: "B", values: { 0: { value: 15 }, 1: { value: 2 } } },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Billing", roles: { kpis: true }, format: "$#,0" },
                { queryName: "comp1", displayName: "IBP", roles: { complements: true }, format: "0%" },
            ],
        },
        metadata: {
            columns: [
                {
                    queryName: "kpiA",
                    roles: { kpis: true },
                    objects: { kpiStyle: { complement1: "comp1" } },
                },
                { queryName: "comp1", roles: { complements: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total Geral",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: true,
    });
    assert(view.totalRow, "fallback total exists");
    assert(view.totalRow!.cells[0].primary.raw === 25, `sum primary got ${view.totalRow!.cells[0].primary.raw}`);
    assert(view.totalRow!.cells[0].complements.length === 1, "total keeps complement slot");
    assert(view.totalRow!.cells[0].complements[0].value.raw == null, "percent complement is not summed");
    assert(view.totalRow!.cells[0].complements[0].label === "IBP", "total complement keeps label");
}

// Total Geral: complementos vêm do subtotal DAX (contexto de total)
{
    const dataView = {
        matrix: {
            rows: {
                root: {
                    children: [
                        {
                            isSubtotal: true,
                            values: {
                                0: { value: 100 },
                                1: { value: 0.55 },
                                2: { value: 0.8 },
                            },
                        },
                        {
                            value: "A",
                            values: {
                                0: { value: 40 },
                                1: { value: 0.4 },
                                2: { value: 0.7 },
                            },
                        },
                        {
                            value: "B",
                            values: {
                                0: { value: 60 },
                                1: { value: 0.6 },
                                2: { value: 0.9 },
                            },
                        },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Delivery", roles: { kpis: true } },
                { queryName: "ibp", displayName: "IBP %", roles: { complements: true }, format: "0%" },
                { queryName: "quota", displayName: "Quota %", roles: { complements: true }, format: "0%" },
            ],
        },
        metadata: {
            columns: [
                {
                    queryName: "kpiA",
                    roles: { kpis: true },
                    objects: {
                        kpiStyle: {
                            complement1: "ibp",
                            complement2: "quota",
                            complement1Label: "IBP",
                            complement2Label: "Quota",
                            editingComplementSlot: "2",
                        },
                    },
                },
                { queryName: "ibp", roles: { complements: true } },
                { queryName: "quota", roles: { complements: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total Geral",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: true,
    });
    assert(view.columns[0].editingComplementSlot === 2, "editing slot persisted per KPI");
    assert(view.totalRow, "total from subtotal");
    assert(view.totalRow!.cells[0].complements.length === 2, "total has both complements");
    assert(view.totalRow!.cells[0].complements[0].value.raw === 0.55, "total complement 1 from DAX");
    assert(view.totalRow!.cells[0].complements[1].value.raw === 0.8, "total complement 2 from DAX");
    assert(view.rows[0].cells[0].complements[0].value.raw === 0.4, "row complement independent");
}

// Total Geral: KPI no isSubtotal, complementos só em root.values (ambos contexto de total)
{
    const dataView = {
        matrix: {
            rows: {
                root: {
                    values: {
                        0: { value: 100, valueSourceIndex: 0 },
                        1: { value: 0.62, valueSourceIndex: 1 },
                        2: { value: 0.91, valueSourceIndex: 2 },
                    },
                    objects: {
                        kpiStyle: {
                            complement1FontColor: { solid: { color: "#107C10" } },
                            complement2FontColor: { solid: { color: "#D13438" } },
                        },
                    },
                    children: [
                        {
                            isSubtotal: true,
                            values: {
                                0: { value: 100, valueSourceIndex: 0 },
                            },
                        },
                        {
                            value: "Surgery",
                            values: {
                                0: { value: 40, valueSourceIndex: 0 },
                                1: { value: 0.4, valueSourceIndex: 1 },
                                2: { value: 0.7, valueSourceIndex: 2 },
                            },
                        },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Delivery", roles: { kpis: true } },
                { queryName: "ibp", displayName: "IBP %", roles: { complements: true }, format: "0%" },
                { queryName: "quota", displayName: "Quota %", roles: { complements: true }, format: "0%" },
            ],
        },
        metadata: {
            columns: [
                {
                    queryName: "kpiA",
                    roles: { kpis: true },
                    objects: {
                        kpiStyle: {
                            complement1: "ibp",
                            complement2: "quota",
                            complement1Label: "IBP",
                            complement2Label: "Quota",
                        },
                    },
                },
                { queryName: "ibp", roles: { complements: true } },
                { queryName: "quota", roles: { complements: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total Geral",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: true,
    });
    const totalCell = view.totalRow!.cells[0];
    assert(totalCell.primary.raw === 100, "total primary from subtotal");
    assert(totalCell.complements.length === 2, "total has two complement slots");
    assert(totalCell.complements[0].value.raw === 0.62, "comp1 from root total context");
    assert(totalCell.complements[1].value.raw === 0.91, "comp2 from root total context");
    assert(totalCell.complements[0].fontColor === "#107C10", "comp1 CF from total objects");
    assert(totalCell.complements[1].fontColor === "#D13438", "comp2 CF from total objects");
    assert(view.rows[0].cells[0].complements[0].value.raw === 0.4, "category row unchanged");
}

// Total Geral: valueSourceIndex como string no subtotal (host) — rótulo existia, valor sumia
{
    const dataView = {
        matrix: {
            rows: {
                root: {
                    children: [
                        {
                            isSubtotal: true,
                            values: {
                                0: { value: 100, valueSourceIndex: "0" },
                                1: { value: 0.53, valueSourceIndex: "1" },
                                2: { value: 0.77, valueSourceIndex: "2" },
                            },
                        },
                        {
                            value: "A",
                            values: {
                                0: { value: 40 },
                                1: { value: 0.4 },
                                2: { value: 0.7 },
                            },
                        },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Delivery", roles: { kpis: true } },
                {
                    queryName: "ibp",
                    displayName: "IBP %",
                    roles: { complements: true },
                    format: "0%",
                },
                {
                    queryName: "quota",
                    displayName: "Quota %",
                    roles: { complements: true },
                    format: "0%",
                },
            ],
        },
        metadata: {
            columns: [
                {
                    queryName: "kpiA",
                    roles: { kpis: true },
                    objects: {
                        kpiStyle: {
                            complement1: "ibp",
                            complement2: "quota",
                            complement1Label: "IBP",
                            complement2Label: "Quota",
                        },
                    },
                },
                { queryName: "ibp", roles: { complements: true } },
                { queryName: "quota", roles: { complements: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total Geral",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: true,
    });
    const totalCell = view.totalRow!.cells[0];
    assert(totalCell.complements[0].label === "IBP", "total shows complement title");
    assert(totalCell.complements[0].value.raw === 0.53, "total complement value with string valueSourceIndex");
    assert(totalCell.complements[0].value.text.length > 0, "total complement value text not empty");
    assert(totalCell.complements[1].value.raw === 0.77, "total complement 2 value with string valueSourceIndex");
}

// Total Geral: chaves de values não são 0..n e sem valueSourceIndex (folha de coluna)
{
    const dataView = {
        matrix: {
            rows: {
                root: {
                    children: [
                        {
                            isSubtotal: true,
                            values: {
                                10: { value: 250 },
                                11: { value: 0.48 },
                                12: { value: 0.81 },
                            },
                        },
                        {
                            value: "A",
                            values: {
                                10: { value: 100 },
                                11: { value: 0.4 },
                                12: { value: 0.7 },
                            },
                        },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Delivery", roles: { kpis: true } },
                {
                    queryName: "ibp",
                    displayName: "IBP %",
                    roles: { complements: true },
                    format: "0%",
                },
                {
                    queryName: "quota",
                    displayName: "Quota %",
                    roles: { complements: true },
                    format: "0%",
                },
            ],
        },
        metadata: {
            columns: [
                {
                    queryName: "kpiA",
                    roles: { kpis: true },
                    objects: {
                        kpiStyle: {
                            complement1: "ibp",
                            complement2: "quota",
                            complement1Label: "IBP",
                            complement2Label: "Quota",
                        },
                    },
                },
                { queryName: "ibp", roles: { complements: true } },
                { queryName: "quota", roles: { complements: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total Geral",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: true,
    });
    const totalCell = view.totalRow!.cells[0];
    assert(totalCell.primary.raw === 250, "total primary via ordinal keys");
    assert(totalCell.complements[0].label === "IBP", "complement title on total");
    assert(totalCell.complements[0].value.raw === 0.48, "complement 1 value via ordinal keys on total");
    assert(totalCell.complements[1].value.raw === 0.81, "complement 2 value via ordinal keys on total");
    assert(view.rows[0].cells[0].complements[0].value.raw === 0.4, "category still works with ordinal keys");
}

// Indicador percentual: a chave da célula não é o índice da medida
{
    const dataView = {
        matrix: {
            rows: {
                root: {
                    children: [
                        {
                            value: "A",
                            values: {
                                0: { value: 0.53, valueSourceIndex: 1 },
                                1: { value: 1.86, valueSourceIndex: 0 },
                            },
                        },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Billing", roles: { kpis: true }, format: "#,0" },
                { queryName: "pct", displayName: "Atingimento", roles: { complements: true }, format: "0%" },
            ],
        },
        metadata: {
            columns: [
                { queryName: "kpiA", roles: { kpis: true }, objects: { kpiStyle: { complement1: "pct" } } },
                { queryName: "pct", roles: { complements: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: false,
    });
    const comp = view.rows[0].cells[0].complements[0];
    assert(comp.value.raw === 0.53, `complement raw got ${comp.value.raw}`);
    assert(comp.value.text.startsWith("53"), `complement text got ${comp.value.text}`);
    assert(view.rows[0].cells[0].primary.raw === 1.86, "primary stays on its measure");
}

// Non-additive total proof: average-like values must come from subtotal node, not average of rows
{
    const dataView = {
        matrix: {
            rows: {
                root: {
                    children: [
                        { isSubtotal: true, values: { 0: { value: 0.99 } } },
                        { value: "A", values: { 0: { value: 1.1 } } },
                        { value: "B", values: { 0: { value: 0.8 } } },
                    ],
                },
            },
            valueSources: [{ queryName: "pct", displayName: "Hit%", roles: { kpis: true }, format: "0%" }],
        },
        metadata: { columns: [{ queryName: "pct", roles: { kpis: true } }] },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: true,
    });
    assert(view.totalRow!.cells[0].primary.raw === 0.99, "uses matrix subtotal, not mean of 1.1 and 0.8");
    const mean = (1.1 + 0.8) / 2;
    assert(view.totalRow!.cells[0].primary.raw !== mean, "explicitly not arithmetic mean");
}

// Per-category SVG measure + custom title (identity preserved)
{
    const svgA = "<svg id='a'><circle r='1'/></svg>";
    const svgB = "<svg id='b'><rect width='1' height='1'/></svg>";
    const svgTotal = "<svg id='t'><path d='M0 0'/></svg>";
    const dataView = {
        matrix: {
            rows: {
                root: {
                    children: [
                        {
                            isSubtotal: true,
                            values: {
                                0: { value: 100 },
                                1: { value: svgTotal },
                                2: { value: svgA },
                                3: { value: svgB },
                            },
                        },
                        {
                            value: "Surgery",
                            values: {
                                0: { value: 40 },
                                1: { value: svgTotal },
                                2: { value: svgA },
                                3: { value: svgB },
                            },
                        },
                        {
                            value: "Orthopaedics",
                            values: {
                                0: { value: 60 },
                                1: { value: svgTotal },
                                2: { value: svgA },
                                3: { value: svgB },
                            },
                        },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Billing", roles: { kpis: true } },
                { queryName: "svgTotal", displayName: "SVG Total", roles: { categoryIcon: true } },
                { queryName: "svgSurgery", displayName: "SVG Surgery", roles: { categoryIcon: true } },
                { queryName: "svgOrtho", displayName: "SVG Ortho", roles: { categoryIcon: true } },
            ],
        },
        metadata: {
            columns: [
                { queryName: "kpiA", roles: { kpis: true } },
                { queryName: "svgTotal", roles: { categoryIcon: true } },
                { queryName: "svgSurgery", roles: { categoryIcon: true } },
                { queryName: "svgOrtho", roles: { categoryIcon: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const categoriesJson = JSON.stringify({
        Surgery: {
            title: "Cirurgia",
            displayMode: "both",
            iconQueryName: "svgSurgery",
        },
        Orthopaedics: {
            displayMode: "image",
            iconQueryName: "svgOrtho",
        },
        HiddenCat: {
            title: "Fora do filtro",
            displayMode: "text",
        },
    });

    const view = convertDataView(dataView, {
        totalLabel: "Total LATAM",
        sortMode: "data",
        categoriesJson,
        showTotal: true,
        grandTotalIconQueryName: "svgTotal",
        grandTotalDisplayMode: "both",
    });

    assert(view.rows.length === 2, "two visible categories");
    const surgery = view.rows.find((r) => r.category === "Surgery");
    const ortho = view.rows.find((r) => r.category === "Orthopaedics");
    assert(surgery, "surgery row");
    assert(surgery!.displayTitle === "Cirurgia", "custom title");
    assert(surgery!.category === "Surgery", "identity preserved");
    assert(surgery!.displayMode === "both", "surgery mode");
    assert(surgery!.iconRaw.includes("id='a'"), "surgery svg measure");
    assert(ortho!.displayMode === "image", "ortho mode");
    assert(ortho!.iconRaw.includes("id='b'"), "ortho svg measure");
    assert(view.totalRow!.iconRaw.includes("id='t'"), "total svg measure");
    assert(view.totalRow!.displayMode === "both", "total display mode");
    assert(view.totalRow!.displayTitle === "Total LATAM", "total label");
    assert(view.iconMeasureOptions.length === 3, "three svg measures in well");

    // Sem seleção de medida: sem ícone genérico
    const noIcon = convertDataView(dataView, {
        totalLabel: "Total",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: true,
    });
    assert(!noIcon.rows[0].iconRaw, "no generic icon fallback");
    assert(!noIcon.totalRow!.iconRaw, "no total icon without selection");
}

// Total Geral: SVG no root quando o subtotal não traz a medida de ícone
{
    const svgTotal = "<svg id='root-total'><circle r='2'/></svg>";
    const dataView = {
        matrix: {
            rows: {
                root: {
                    values: {
                        0: { value: 100 },
                        1: { value: svgTotal },
                    },
                    children: [
                        { value: "A", values: { 0: { value: 40 }, 1: { value: "" } } },
                        { value: "B", values: { 0: { value: 60 }, 1: { value: "" } } },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Billing", roles: { kpis: true } },
                { queryName: "svgTotal", displayName: "SVG Total", roles: { categoryIcon: true } },
            ],
        },
        metadata: {
            columns: [
                { queryName: "kpiA", roles: { kpis: true } },
                { queryName: "svgTotal", roles: { categoryIcon: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total Geral",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: true,
        grandTotalIconQueryName: "svgTotal",
        grandTotalDisplayMode: "image",
    });
    assert(view.totalRow, "total from root values");
    assert(view.totalRow!.iconRaw.includes("id='root-total'"), "total svg from root node");
    assert(view.totalRow!.displayMode === "image", "total image-only mode");
}

// Cor condicional (fx) vem no objeto da linha, não na célula do KPI
{
    const dataView = {
        matrix: {
            rows: {
                root: {
                    children: [
                        {
                            value: "A",
                            objects: {
                                kpiStyle: {
                                    complement1FontColor: { solid: { color: "#F5A623" } },
                                },
                            },
                            values: {
                                0: { value: 10 },
                                1: { value: 0.07 },
                            },
                        },
                        {
                            value: "B",
                            values: {
                                0: { value: 20 },
                                1: {
                                    value: 0.7,
                                    objects: {
                                        kpiStyle: {
                                            complement1FontColor: { solid: { color: "#107C10" } },
                                        },
                                    },
                                },
                            },
                        },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Billing", roles: { kpis: true } },
                { queryName: "pct", displayName: "Hit", roles: { complements: true }, format: "0%" },
            ],
        },
        metadata: {
            columns: [
                { queryName: "kpiA", roles: { kpis: true }, objects: { kpiStyle: { complement1: "pct" } } },
                { queryName: "pct", roles: { complements: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: false,
    });
    const rowA = view.rows.find((r) => r.category === "A");
    const rowB = view.rows.find((r) => r.category === "B");
    assert(rowA!.cells[0].complements[0].fontColor === "#F5A623", "rule color from row objects");
    assert(rowA!.cells[0].complements[0].value.text.startsWith("7"), "7% display");
    assert(rowB!.cells[0].complements[0].fontColor === "#107C10", "rule color from complement value");
}

// Formatação condicional independente por complemento (slots 1 e 2)
{
    const dataView = {
        matrix: {
            rows: {
                root: {
                    children: [
                        {
                            value: "A",
                            objects: {
                                kpiStyle: {
                                    complement1FontColor: { solid: { color: "#AA0000" } },
                                    complement2FontColor: { solid: { color: "#00AA00" } },
                                    complement1BackColor: { solid: { color: "#FFEEEE" } },
                                    complement2DataBarColor: { solid: { color: "#0000AA" } },
                                },
                            },
                            values: {
                                0: { value: 10 },
                                1: { value: 0.4 },
                                2: { value: 0.9 },
                            },
                        },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Delivery", roles: { kpis: true } },
                { queryName: "c1", displayName: "IBP", roles: { complements: true }, format: "0%" },
                { queryName: "c2", displayName: "Quota", roles: { complements: true }, format: "0%" },
            ],
        },
        metadata: {
            columns: [
                {
                    queryName: "kpiA",
                    roles: { kpis: true },
                    objects: {
                        kpiStyle: {
                            complement1: "c1",
                            complement2: "c2",
                            complement1FontColor: { solid: { color: "#111111" } },
                            complement2FontColor: { solid: { color: "#222222" } },
                            complement2DataBars: true,
                        },
                    },
                },
                { queryName: "c1", roles: { complements: true } },
                { queryName: "c2", roles: { complements: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total",
        sortMode: "data",
        categoriesJson: "{}",
        showTotal: false,
    });
    const comps = view.rows[0].cells[0].complements;
    assert(comps[0].fontColor === "#AA0000", "slot 1 font from its own rule");
    assert(comps[1].fontColor === "#00AA00", "slot 2 font from its own rule");
    assert(comps[0].backColor === "#FFEEEE", "slot 1 back color independent");
    assert(comps[1].dataBarColor === "#0000AA", "slot 2 bar color independent");
    assert(comps[0].dataBars !== true, "slot 1 bars stay off");
    assert(comps[1].dataBars === true, "slot 2 bars stay on");
}

// Total Geral: a medida volta em branco no subtotal e o SVG só existe na linha
{
    const svgSurgery = "<svg id='surgery'><circle r='3'/></svg>";
    const dataView = {
        matrix: {
            rows: {
                root: {
                    values: {
                        0: { value: 100 },
                        1: { value: null },
                    },
                    children: [
                        {
                            isSubtotal: true,
                            values: {
                                0: { value: 100 },
                                1: { value: null },
                            },
                        },
                        {
                            value: "Surgery",
                            values: {
                                0: { value: 40 },
                                1: { value: svgSurgery },
                            },
                        },
                        {
                            value: "Ortho",
                            values: {
                                0: { value: 60 },
                                1: { value: null },
                            },
                        },
                    ],
                },
            },
            valueSources: [
                { queryName: "kpiA", displayName: "Billing", roles: { kpis: true } },
                { queryName: "svgSurgery", displayName: "SVG Surgery", roles: { categoryIcon: true } },
            ],
        },
        metadata: {
            columns: [
                { queryName: "kpiA", roles: { kpis: true } },
                { queryName: "svgSurgery", roles: { categoryIcon: true } },
            ],
        },
    } as unknown as powerbi.DataView;

    const view = convertDataView(dataView, {
        totalLabel: "Total Geral",
        sortMode: "data",
        categoriesJson: JSON.stringify({
            Surgery: { displayMode: "both", iconQueryName: "svgSurgery" },
        }),
        showTotal: true,
        grandTotalIconQueryName: "svgSurgery",
        grandTotalDisplayMode: "both",
    });
    assert(view.rows.find((r) => r.category === "Surgery")!.iconRaw.includes("id='surgery'"), "category keeps svg");
    assert(view.totalRow!.iconRaw.includes("id='surgery'"), "total reuses category svg when total context is blank");
}

// --- renderer ---
{
    const html = buildMatrixHtml(
        {
            columns: [
                {
                    queryName: "kpiA",
                    displayName: "Billing",
                    title: "Billing",
                    layout: "vertical",
                    complements: [{ slotIndex: 1, queryName: "c1", label: "IBP", displayName: "IBP" }],
                    editingComplementSlot: 1,
                    editingElementKind: "font",
                    widthMode: "auto",
                    columnWidth: 140,
                    minWidth: 96,
                    maxWidth: 320,
                    cellPadding: 8,
                    cfEnabled: false,
                    cfApplyTo: "value",
                    cfThresholdHigh: 1,
                    cfThresholdMid: 0.9,
                    cfColorHigh: "#0f0",
                    cfColorMid: "#ff0",
                    cfColorLow: "#f00",
                    cfAsPercent: true,
                    valueSourceIndex: 0,
                },
            ],
            rows: [
                {
                    category: "Produto A",
                    categoryKey: "Produto A",
                    displayTitle: "Produto A",
                    displayMode: "text",
                    iconRaw: "",
                    isTotal: false,
                    sourceIndex: 0,
                    cells: [
                        {
                            queryName: "kpiA",
                            primary: { raw: 40, text: "$40" },
                            complements: [
                                {
                                    slotIndex: 1,
                                    label: "IBP",
                                    displayName: "IBP",
                                    queryName: "c1",
                                    value: { raw: 1.1, text: "110.00%" },
                                },
                            ],
                            layout: "vertical",
                        },
                    ],
                    tooltips: [],
                },
            ],
            totalRow: {
                category: "Total Geral",
                categoryKey: "Total Geral",
                displayTitle: "Total Geral",
                displayMode: "text",
                iconRaw: "",
                isTotal: true,
                sourceIndex: -1,
                cells: [
                    {
                        queryName: "kpiA",
                        primary: { raw: 100, text: "$100" },
                        complements: [],
                        layout: "vertical",
                    },
                ],
                tooltips: [],
            },
            complementOptions: [],
            iconMeasureOptions: [],
            categoryNames: ["Produto A"],
        },
        defaultStyle,
    );
    assert(html.includes("Produto A"), "category rendered");
    assert(html.includes("Total Geral"), "total rendered");
    assert(html.includes("dkm-freeze"), "sticky freeze block");
    assert(html.includes("dkm-tip"), "category tip class");
    assert(html.includes("Billing"), "header");
    assert(html.includes("110.00%"), "complement value");
}

// category meta title override + independent display/svg
{
    let map = parseCategoryMetaMap('{"A":{"title":"Alpha","imageUrl":"data:image/png;base64,xx"}}');
    assert(map.A.title === "Alpha", "title parsed");
    const found = findCategoryMeta(map, " a ");
    assert(found?.title === "Alpha", "case/trim meta lookup");
    map = upsertCategoryMeta(map, "A", { title: "Alpha", imageUrl: "" });
    assert(Boolean(map.A.imageUrl), "empty imageUrl does not wipe without clearImage");
    map = upsertCategoryMeta(map, "A", { title: "" });
    assert(!map.A?.title, "title cleared");

    map = upsertCategoryMeta(map, "Surgery", {
        title: "Cirurgia",
        displayMode: "both",
        iconQueryName: "svgSurgery",
    });
    map = upsertCategoryMeta(map, "Orthopaedics", {
        displayMode: "image",
        iconQueryName: "svgOrtho",
    });
    assert(map.Surgery.displayMode === "both", "surgery mode stored");
    assert(map.Orthopaedics.iconQueryName === "svgOrtho", "ortho svg stored");
    map = upsertCategoryMeta(map, "Surgery", { title: "Cirurgia LATAM" });
    assert(map.Orthopaedics.iconQueryName === "svgOrtho", "editing surgery does not touch ortho");
    assert(map.Surgery.title === "Cirurgia LATAM", "surgery title updated");
}

console.log("All Dynamic KPI Matrix tests passed.");
