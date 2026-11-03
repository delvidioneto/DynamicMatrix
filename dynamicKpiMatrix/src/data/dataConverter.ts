"use strict";

import powerbi from "powerbi-visuals-api";
import { formatMeasureValue } from "./formatValue";
import { buildKpiColumns, collectMeasures, parseImagesJson } from "./kpiMapper";
import {
    ComplementValue,
    KpiCellData,
    KpiColumnConfig,
    MatrixRow,
    MeasureRef,
    SortMode,
    TooltipLine,
    VisualViewModel,
} from "./viewModel";
import { applyConditionalColors } from "../services/ConditionalFormatting";

import DataView = powerbi.DataView;
import DataViewMatrixNode = powerbi.DataViewMatrixNode;

function nodeValue(node: DataViewMatrixNode | undefined): string {
    if (!node) {
        return "";
    }
    const levelValues = (node as { levelValues?: Array<{ value?: unknown }> }).levelValues;
    if (levelValues?.length) {
        return String(levelValues[0].value ?? "");
    }
    if (node.value != null) {
        return String(node.value);
    }
    return "";
}

function isSubtotalNode(node: DataViewMatrixNode): boolean {
    return Boolean((node as { isSubtotal?: boolean }).isSubtotal);
}

function readMatrixValue(
    node: DataViewMatrixNode,
    sourceIndex: number,
): unknown {
    const values = node.values as Record<string | number, { value?: unknown }> | undefined;
    if (!values) {
        return null;
    }
    const entry = values[sourceIndex] ?? values[String(sourceIndex)];
    return entry?.value ?? null;
}

function buildTooltipLines(
    node: DataViewMatrixNode,
    tooltipMeasures: MeasureRef[],
): TooltipLine[] {
    return tooltipMeasures
        .map((m) => {
            const formatted = formatMeasureValue(readMatrixValue(node, m.valueSourceIndex), m.format);
            return {
                displayName: m.displayName,
                value: formatted.text,
            };
        })
        .filter((line) => line.value !== "");
}

function buildCell(
    node: DataViewMatrixNode,
    column: KpiColumnConfig,
    measures: MeasureRef[],
): KpiCellData {
    const primaryRaw = readMatrixValue(node, column.valueSourceIndex);
    const primary = formatMeasureValue(primaryRaw, column.format);
    const complements: ComplementValue[] = column.complements.map((slot) => {
        const measure = measures.find((m) => m.queryName === slot.queryName);
        const idx = measure?.valueSourceIndex ?? -1;
        const raw = idx >= 0 ? readMatrixValue(node, idx) : null;
        return {
            label: slot.label,
            displayName: slot.displayName,
            queryName: slot.queryName,
            value: formatMeasureValue(raw, slot.format ?? measure?.format),
        };
    });

    const cell: KpiCellData = {
        queryName: column.queryName,
        primary,
        complements,
        layout: column.layout,
        backgroundColor: column.backgroundColor,
        primaryColor: column.primaryColor,
    };
    return applyConditionalColors(cell, column);
}

function toRow(
    node: DataViewMatrixNode,
    index: number,
    columns: KpiColumnConfig[],
    measures: MeasureRef[],
    images: Record<string, string>,
    totalLabel: string,
): MatrixRow {
    const category = isSubtotalNode(node) ? totalLabel : nodeValue(node);
    const iconMeasure = measures.find((m) => m.role === "categoryIcon");
    const iconRaw = iconMeasure
        ? String(readMatrixValue(node, iconMeasure.valueSourceIndex) ?? "")
        : "";
    const tooltips = measures.filter((m) => m.role === "tooltips");

    return {
        category,
        categoryKey: category,
        iconRaw,
        iconPersisted: images[category],
        isTotal: isSubtotalNode(node),
        sourceIndex: index,
        cells: columns.map((col) => buildCell(node, col, measures)),
        tooltips: buildTooltipLines(node, tooltips),
    };
}

function sortRows(rows: MatrixRow[], sortMode: SortMode, sortKpiQueryName: string): MatrixRow[] {
    if (sortMode === "data") {
        return rows;
    }
    const copy = [...rows];
    if (sortMode === "alphaAsc" || sortMode === "alphaDesc") {
        copy.sort((a, b) => a.category.localeCompare(b.category, "pt-BR"));
        return sortMode === "alphaDesc" ? copy.reverse() : copy;
    }

    const kpiKey = sortKpiQueryName;
    copy.sort((a, b) => {
        const av = a.cells.find((c) => c.queryName === kpiKey)?.primary.raw;
        const bv = b.cells.find((c) => c.queryName === kpiKey)?.primary.raw;
        const an = av == null ? Number.NEGATIVE_INFINITY : av;
        const bn = bv == null ? Number.NEGATIVE_INFINITY : bv;
        return an - bn;
    });
    return sortMode === "kpiDesc" ? copy.reverse() : copy;
}

function columnObjectsMap(dataView: DataView): Map<string, powerbi.DataViewObjects | undefined> {
    const map = new Map<string, powerbi.DataViewObjects | undefined>();
    const columns = dataView.metadata?.columns ?? [];
    for (const col of columns) {
        const q = col.queryName ?? col.displayName;
        if (q) {
            map.set(q, col.objects);
        }
    }
    return map;
}

export interface ConvertOptions {
    totalLabel: string;
    sortMode: SortMode;
    sortKpiQueryName: string;
    imagesJson: string;
}

export function convertDataView(dataView: DataView | undefined, options: ConvertOptions): VisualViewModel {
    if (!dataView?.matrix) {
        return {
            columns: [],
            rows: [],
            complementOptions: [],
            categoryNames: [],
            emptyMessage: "Adicione uma categoria e ao menos um KPI principal.",
        };
    }

    const matrix = dataView.matrix;
    const valueSources = matrix.valueSources ?? [];
    const measures = collectMeasures(valueSources);
    const columns = buildKpiColumns(
        measures,
        dataView.metadata?.objects,
        columnObjectsMap(dataView),
    );
    const images = parseImagesJson(options.imagesJson);
    const rootChildren = matrix.rows?.root?.children ?? [];

    const totalNodes = rootChildren.filter(isSubtotalNode);
    const dataNodes = rootChildren.filter((n) => !isSubtotalNode(n));

    const dataRows = dataNodes.map((node, i) =>
        toRow(node, i, columns, measures, images, options.totalLabel),
    );
    const sorted = sortRows(dataRows, options.sortMode, options.sortKpiQueryName);

    let totalRow: MatrixRow | undefined;
    if (totalNodes.length) {
        totalRow = toRow(totalNodes[0], -1, columns, measures, images, options.totalLabel);
        totalRow.category = options.totalLabel;
        totalRow.categoryKey = options.totalLabel;
        totalRow.isTotal = true;
    }

    const complementOptions = measures
        .filter((m) => m.role === "complements")
        .map((m) => ({ queryName: m.queryName, displayName: m.displayName }));

    if (!columns.length && !sorted.length) {
        return {
            columns,
            rows: sorted,
            totalRow,
            complementOptions,
            categoryNames: sorted.map((r) => r.category),
            emptyMessage: "Adicione medidas ao campo KPIs principais.",
        };
    }

    return {
        columns,
        rows: sorted,
        totalRow,
        complementOptions,
        categoryNames: sorted.map((r) => r.category),
    };
}
