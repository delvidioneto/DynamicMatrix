"use strict";

import powerbi from "powerbi-visuals-api";
import { formatMeasureValue, ValueFormatOptions } from "./formatValue";
import { buildKpiColumns, collectMeasures } from "./kpiMapper";
import { CategoryMetaMap, findCategoryMeta, parseCategoryMetaMap } from "./categoryMeta";
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
import { applyConditionalColors, mergeCellObjectsColors } from "../services/ConditionalFormatting";
import { unwrapMeasureText } from "../services/ImageManager";

import DataView = powerbi.DataView;
import DataViewMatrixNode = powerbi.DataViewMatrixNode;

type MatrixValueEntry = {
    value?: unknown;
    valueSourceIndex?: number;
    objects?: powerbi.DataViewObjects;
};

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

export function readMatrixValue(node: DataViewMatrixNode | undefined, sourceIndex: number): unknown {
    if (!node) {
        return null;
    }
    const values = node.values as Record<string | number, MatrixValueEntry> | undefined;
    if (!values) {
        return null;
    }

    const direct = values[sourceIndex] ?? values[String(sourceIndex)];
    if (direct && direct.value !== undefined) {
        return direct.value;
    }

    for (const entry of Object.values(values)) {
        if (entry && entry.valueSourceIndex === sourceIndex && entry.value !== undefined) {
            return entry.value;
        }
    }

    const numericKeys = Object.keys(values)
        .map((k) => Number(k))
        .filter((k) => Number.isFinite(k))
        .sort((a, b) => a - b);
    if (numericKeys[sourceIndex] != null) {
        const keyed = values[numericKeys[sourceIndex]] ?? values[String(numericKeys[sourceIndex])];
        if (keyed && keyed.value !== undefined) {
            return keyed.value;
        }
    }

    return null;
}

function buildTooltipLines(node: DataViewMatrixNode, tooltipMeasures: MeasureRef[]): TooltipLine[] {
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

function readValueObjects(
    node: DataViewMatrixNode | undefined,
    sourceIndex: number,
): powerbi.DataViewObjects | undefined {
    if (!node?.values) {
        return undefined;
    }
    const values = node.values as Record<string | number, MatrixValueEntry>;
    const direct = values[sourceIndex] ?? values[String(sourceIndex)];
    if (direct?.objects) {
        return direct.objects;
    }
    for (const entry of Object.values(values)) {
        if (entry && entry.valueSourceIndex === sourceIndex && entry.objects) {
            return entry.objects;
        }
    }
    return undefined;
}

function buildCell(
    node: DataViewMatrixNode | undefined,
    column: KpiColumnConfig,
    measures: MeasureRef[],
    formatOpts?: ValueFormatOptions,
    rawOverride?: { primary?: number | null; complements?: Array<number | null> },
): KpiCellData {
    const primaryRaw =
        rawOverride?.primary !== undefined
            ? rawOverride.primary
            : (readMatrixValue(node, column.valueSourceIndex) as number | null);
    const primary = formatMeasureValue(primaryRaw, column.format, formatOpts);
    const complements: ComplementValue[] = column.complements.map((slot, i) => {
        const measure = measures.find((m) => m.queryName === slot.queryName);
        const idx = measure?.valueSourceIndex ?? -1;
        const raw =
            rawOverride?.complements && rawOverride.complements[i] !== undefined
                ? rawOverride.complements[i]
                : idx >= 0
                  ? readMatrixValue(node, idx)
                  : null;
        return {
            slotIndex: slot.slotIndex,
            label: slot.label,
            displayName: slot.displayName,
            queryName: slot.queryName,
            value: formatMeasureValue(raw, slot.format ?? measure?.format, formatOpts),
            fontColor: slot.fontColor,
            backColor: slot.backColor,
            dataBars: slot.dataBars,
            dataBarColor: slot.dataBarColor,
            icons: slot.icons,
            webUrl: slot.webUrl,
        };
    });

    let cell: KpiCellData = {
        queryName: column.queryName,
        primary,
        complements,
        layout: column.layout,
        backgroundColor: column.backgroundColor,
        primaryColor: column.primaryColor,
    };

    const valueObjects = readValueObjects(node, column.valueSourceIndex);
    cell = mergeCellObjectsColors(cell, column, valueObjects);
    return applyConditionalColors(cell, column);
}

function toRow(
    node: DataViewMatrixNode,
    index: number,
    columns: KpiColumnConfig[],
    measures: MeasureRef[],
    metaMap: CategoryMetaMap,
    totalLabel: string,
    formatOpts?: ValueFormatOptions,
    iconMeasure?: MeasureRef,
): MatrixRow {
    const isTotal = isSubtotalNode(node);
    const category = isTotal ? totalLabel : nodeValue(node);
    const meta = isTotal ? undefined : findCategoryMeta(metaMap, category);
    const iconRaw = iconMeasure
        ? unwrapMeasureText(String(readMatrixValue(node, iconMeasure.valueSourceIndex) ?? ""))
        : "";
    const tooltips = measures.filter((m) => m.role === "tooltips");
    const customTitle = meta?.title?.trim();

    return {
        category,
        categoryKey: category,
        displayTitle: isTotal ? totalLabel : customTitle || category,
        iconRaw,
        iconPersisted: meta?.imageUrl,
        isTotal,
        sourceIndex: index,
        cells: columns.map((col) => buildCell(node, col, measures, formatOpts)),
        tooltips: buildTooltipLines(node, tooltips),
    };
}

function nodeHasAnyValue(node: DataViewMatrixNode | undefined, columns: KpiColumnConfig[]): boolean {
    if (!node?.values) {
        return false;
    }
    return columns.some((col) => readMatrixValue(node, col.valueSourceIndex) != null);
}

function sumTotalFromRows(
    rows: MatrixRow[],
    columns: KpiColumnConfig[],
    measures: MeasureRef[],
    totalLabel: string,
    formatOpts?: ValueFormatOptions,
): MatrixRow {
    const cells = columns.map((col) => {
        let primarySum = 0;
        let primaryCount = 0;
        const complementSums = col.complements.map(() => ({ sum: 0, count: 0 }));

        for (const row of rows) {
            const cell = row.cells.find((c) => c.queryName === col.queryName);
            if (!cell) {
                continue;
            }
            if (cell.primary.raw != null && Number.isFinite(cell.primary.raw)) {
                primarySum += cell.primary.raw;
                primaryCount += 1;
            }
            cell.complements.forEach((comp, i) => {
                if (comp.value.raw != null && Number.isFinite(comp.value.raw)) {
                    complementSums[i].sum += comp.value.raw;
                    complementSums[i].count += 1;
                }
            });
        }

        return buildCell(
            undefined,
            col,
            measures,
            formatOpts,
            {
                primary: primaryCount ? primarySum : null,
                complements: complementSums.map((c) => (c.count ? c.sum : null)),
            },
        );
    });

    return {
        category: totalLabel,
        categoryKey: totalLabel,
        displayTitle: totalLabel,
        iconRaw: "",
        isTotal: true,
        sourceIndex: -1,
        cells,
        tooltips: [],
    };
}

function sortRows(rows: MatrixRow[], sortMode: SortMode, sortKpiQueryName: string): MatrixRow[] {
    if (sortMode === "data") {
        return rows;
    }
    const copy = [...rows];
    if (sortMode === "alphaAsc" || sortMode === "alphaDesc") {
        copy.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, "pt-BR"));
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
    categoriesJson: string;
    imagesJson?: string;
    showTotal: boolean;
    displayUnits?: number;
    precision?: number;
    categoryIconQueryName?: string;
    grandTotalIconQueryName?: string;
}

function pickIconMeasure(
    measures: MeasureRef[],
    preferredQueryName: string | undefined,
): MeasureRef | undefined {
    const icons = measures.filter((m) => m.role === "categoryIcon");
    if (!icons.length) {
        return undefined;
    }
    if (preferredQueryName) {
        const match = icons.find((m) => m.queryName === preferredQueryName);
        if (match) {
            return match;
        }
    }
    return icons[0];
}

export function convertDataView(dataView: DataView | undefined, options: ConvertOptions): VisualViewModel {
    if (!dataView?.matrix) {
        return {
            columns: [],
            rows: [],
            complementOptions: [],
            iconMeasureOptions: [],
            categoryNames: [],
            emptyMessage: "Adicione uma categoria e ao menos um valor.",
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
    const metaMap = parseCategoryMetaMap(options.categoriesJson, options.imagesJson);
    const formatOpts: ValueFormatOptions = {
        displayUnits: options.displayUnits,
        precision: options.precision,
    };
    const categoryIcon = pickIconMeasure(measures, options.categoryIconQueryName);
    const totalIcon = pickIconMeasure(measures, options.grandTotalIconQueryName);
    const root = matrix.rows?.root;
    const rootChildren = root?.children ?? [];

    const totalNodes = rootChildren.filter(isSubtotalNode);
    const dataNodes = rootChildren.filter((n) => !isSubtotalNode(n));

    const dataRows = dataNodes.map((node, i) =>
        toRow(node, i, columns, measures, metaMap, options.totalLabel, formatOpts, categoryIcon),
    );
    const sorted = sortRows(dataRows, options.sortMode, options.sortKpiQueryName);

    let totalRow: MatrixRow | undefined;
    if (options.showTotal) {
        const subtotalNode = totalNodes.find((n) => nodeHasAnyValue(n, columns)) ?? totalNodes[0];
        if (subtotalNode && nodeHasAnyValue(subtotalNode, columns)) {
            totalRow = toRow(
                subtotalNode,
                -1,
                columns,
                measures,
                metaMap,
                options.totalLabel,
                formatOpts,
                totalIcon,
            );
        } else if (root && nodeHasAnyValue(root, columns)) {
            totalRow = toRow(root, -1, columns, measures, metaMap, options.totalLabel, formatOpts, totalIcon);
            totalRow.isTotal = true;
        } else if (sorted.length) {
            // Fallback: soma das linhas visíveis (quando o host não envia subtotal DAX).
            totalRow = sumTotalFromRows(sorted, columns, measures, options.totalLabel, formatOpts);
        }

        if (totalRow) {
            totalRow.category = options.totalLabel;
            totalRow.categoryKey = options.totalLabel;
            totalRow.displayTitle = options.totalLabel;
            totalRow.isTotal = true;
            // Garante ícone do total mesmo no fallback de soma.
            if (!totalRow.iconRaw && totalIcon) {
                totalRow.iconRaw = "";
            }
        }
    }

    const complementOptions = measures
        .filter((m) => m.role === "complements")
        .map((m) => ({ queryName: m.queryName, displayName: m.displayName }));
    const iconMeasureOptions = measures
        .filter((m) => m.role === "categoryIcon")
        .map((m) => ({ queryName: m.queryName, displayName: m.displayName }));

    if (!columns.length && !sorted.length) {
        return {
            columns,
            rows: sorted,
            totalRow,
            complementOptions,
            iconMeasureOptions,
            categoryNames: sorted.map((r) => r.category),
            emptyMessage: "Adicione medidas ao campo Valores.",
        };
    }

    return {
        columns,
        rows: sorted,
        totalRow,
        complementOptions,
        iconMeasureOptions,
        categoryNames: sorted.map((r) => r.category),
    };
}
