"use strict";

import { convertDataView } from "./dataConverter";
import { formatMeasureValue, normalizeCfRatio } from "./formatValue";
import { buildKpiColumns, collectMeasures, parseMappingJson, syncMappingJson } from "./kpiMapper";
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
}

// --- svg sanitize ---
{
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" onclick="alert(1)"><script>x</script><circle r="5"/></svg>`;
    const clean = sanitizeSvg(dirty);
    assert(!clean.includes("script"), "script removed");
    assert(!clean.toLowerCase().includes("onclick"), "onclick removed");
    assert(isDataImageUri("data:image/png;base64,aaa"), "png uri");
    const bad = validatePersistedImage("data:image/png;base64," + "a".repeat(50_000));
    assert(!bad.ok, "large image rejected");
    const svgImg = resolveImageSource("<svg><circle r='1'/></svg>");
    assert(svgImg.kind === "svg", "svg resolved");
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
        sortKpiQueryName: "",
        imagesJson: "{}",
    });

    assert(view.columns.length === 1, "one kpi");
    assert(view.columns[0].complements.length === 1, "complement associated");
    assert(view.rows.length === 2, "two categories");
    assert(view.rows[0].category === "Produto A", "alpha sort");
    assert(view.totalRow, "total row from matrix subtotal");
    assert(view.totalRow!.isTotal, "total flagged");
    assert(view.totalRow!.cells[0].primary.raw === 100, "DAX total not sum of rows");
    // If we summed rows we'd get 100 too in this sample — change assertion with non-additive:
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
        sortKpiQueryName: "",
        imagesJson: "{}",
    });
    assert(view.totalRow!.cells[0].primary.raw === 0.99, "uses matrix subtotal, not mean of 1.1 and 0.8");
    const mean = (1.1 + 0.8) / 2;
    assert(view.totalRow!.cells[0].primary.raw !== mean, "explicitly not arithmetic mean");
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
                    complements: [{ queryName: "c1", label: "IBP", displayName: "IBP" }],
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
                    iconRaw: "",
                    isTotal: false,
                    sourceIndex: 0,
                    cells: [
                        {
                            queryName: "kpiA",
                            primary: { raw: 40, text: "$40" },
                            complements: [
                                {
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
            categoryNames: ["Produto A"],
        },
        defaultStyle,
    );
    assert(html.includes("Produto A"), "category rendered");
    assert(html.includes("Total Geral"), "total rendered");
    assert(html.includes("dkm-tip"), "category tip class");
    assert(html.includes("Billing"), "header");
    assert(html.includes("110.00%"), "complement value");
}

console.log("All Dynamic KPI Matrix tests passed.");
