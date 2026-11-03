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
        },
    } as powerbi.DataViewObjects);

    const columns = buildKpiColumns(measures, undefined, colObjects);
    assert(columns.length === 1, "1 kpi column");
    assert(columns[0].title === "Faturamento", "title override");
    assert(columns[0].complements.length === 2, "2 complements mapped");
    assert(columns[0].complements[0].queryName === "comp1", "stable queryName");

    const synced = syncMappingJson(columns);
    assert(synced.includes("comp1"), "sync mapping json");
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
