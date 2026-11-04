"use strict";

import powerbi from "powerbi-visuals-api";
import { formatMeasureValue, ValueFormatOptions } from "./formatValue";
import { buildKpiColumns, collectMeasures } from "./kpiMapper";
import { CategoryMetaMap, findCategoryMeta, parseCategoryMetaMap } from "./categoryMeta";
import {
    ComplementValue,
    DisplayMode,
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

type PrimitiveCell = number | string | boolean;

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

/**
 * Ordem de leitura (igual à versão estável + correção do 186%):
 * 1) valueSourceIndex (evita pegar a medida errada quando a chave ≠ índice)
 * 2) chave direta sourceIndex
 * 3) N-ésima chave numérica ordenada (necessário no Total Geral / folhas de coluna)
 */
function findValueEntry(
    node: DataViewMatrixNode | undefined,
    sourceIndex: number,
): MatrixValueEntry | undefined {
    if (!node?.values) {
        return undefined;
    }
    const values = node.values as Record<string | number, MatrixValueEntry | PrimitiveCell>;
    let sourceMatch: MatrixValueEntry | undefined;
    let keyMatch: MatrixValueEntry | undefined;
    for (const [key, entry] of Object.entries(values)) {
        if (entry == null) {
            continue;
        }
        if (typeof entry !== "object") {
            if (Number(key) === sourceIndex) {
                return { value: entry };
            }
            continue;
        }
        if (
            entry.valueSourceIndex != null &&
            Number(entry.valueSourceIndex) === sourceIndex &&
            !sourceMatch
        ) {
            sourceMatch = entry;
        }
        if (Number(key) === sourceIndex && !keyMatch) {
            keyMatch = entry;
        }
    }
    return sourceMatch ?? keyMatch;
}

export function readMatrixValue(node: DataViewMatrixNode | undefined, sourceIndex: number): unknown {
    if (!node?.values || sourceIndex < 0) {
        return null;
    }
    const values = node.values as Record<string | number, MatrixValueEntry | PrimitiveCell>;

    const entry = findValueEntry(node, sourceIndex);
    if (entry && entry.value !== undefined) {
        return entry.value;
    }

    // Fallback ordinal — restaurado: no Total Geral as chaves nem sempre são 0..n.
    const numericKeys = Object.keys(values)
        .map((k) => Number(k))
        .filter((k) => Number.isFinite(k))
        .sort((a, b) => a - b);
    if (numericKeys[sourceIndex] != null) {
        const keyed = values[numericKeys[sourceIndex]] ?? values[String(numericKeys[sourceIndex])];
        if (keyed == null) {
            return null;
        }
        if (typeof keyed !== "object") {
            return keyed;
        }
        if (keyed.value !== undefined) {
            return keyed.value;
        }
    }
    return null;
}

/**
 * No Total Geral o host às vezes reparte as medidas entre isSubtotal e root.values —
 * ambos são contexto de total, não de categoria. Percorre os nós até achar valor.
 */
function readTotalMatrixValue(
    nodes: Array<DataViewMatrixNode | undefined>,
    sourceIndex: number,
): unknown {
    const seen = new Set<DataViewMatrixNode>();
    for (const node of nodes) {
        if (!node || seen.has(node)) {
            continue;
        }
        seen.add(node);
        const value = readMatrixValue(node, sourceIndex);
        if (value != null && value !== "") {
            return value;
        }
    }
    return null;
}

function readTotalValueObjects(
    nodes: Array<DataViewMatrixNode | undefined>,
    sourceIndex: number,
): powerbi.DataViewObjects | undefined {
    const seen = new Set<DataViewMatrixNode>();
    for (const node of nodes) {
        if (!node || seen.has(node)) {
            continue;
        }
        seen.add(node);
        const objects = readValueObjects(node, sourceIndex);
        if (objects) {
            return objects;
        }
    }
    return undefined;
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
    return findValueEntry(node, sourceIndex)?.objects;
}

function buildCell(
    node: DataViewMatrixNode | undefined,
    column: KpiColumnConfig,
    measures: MeasureRef[],
    formatOpts?: ValueFormatOptions,
    rawOverride?: { primary?: number | null; complements?: Array<number | null> },
    /** Só para Total Geral: nós extras de contexto de total (ex.: root). */
    totalContextNodes?: DataViewMatrixNode[],
): KpiCellData {
    const totalNodes = totalContextNodes?.length
        ? [node, ...totalContextNodes]
        : [node];
    const primaryRaw =
        rawOverride?.primary !== undefined
            ? rawOverride.primary
            : (readTotalMatrixValue(totalNodes, column.valueSourceIndex) as number | null);
    const primary = formatMeasureValue(primaryRaw, column.format, formatOpts);
    const complements: ComplementValue[] = column.complements.map((slot, i) => {
        const measure = measures.find((m) => m.queryName === slot.queryName);
        const idx = measure?.valueSourceIndex ?? -1;
        const raw =
            rawOverride?.complements && rawOverride.complements[i] !== undefined
                ? rawOverride.complements[i]
                : idx >= 0
                  ? readTotalMatrixValue(totalNodes, idx)
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
            fontSize: slot.fontSize,
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

    const valueObjects = readTotalValueObjects(totalNodes, column.valueSourceIndex);
    // Fontes de CF por complemento: objects da própria medida do slot.
    // O nó da categoria (node.objects) recebe regras com selector ["category"].
    // Não misturar objects de outras medidas — cada slot tem propriedades próprias.
    const complementSources = column.complements.map((slot) => {
        const measure = measures.find((m) => m.queryName === slot.queryName);
        const idx = measure?.valueSourceIndex ?? -1;
        if (idx < 0) {
            return [];
        }
        return totalNodes.map((n) => readValueObjects(n, idx));
    });
    const rowObjects = totalNodes.map((n) => n?.objects);
    cell = mergeCellObjectsColors(
        cell,
        column,
        valueObjects,
        rowObjects,
        complementSources,
    );
    return applyConditionalColors(cell, column);
}

/** Localiza medida SVG por queryName ou displayName (mesmo padrão das categorias). */
function findIconMeasure(
    measures: MeasureRef[],
    preferredQueryName: string | undefined,
): MeasureRef | undefined {
    const icons = measures.filter((m) => m.role === "categoryIcon");
    if (!icons.length) {
        return undefined;
    }
    const preferred = (preferredQueryName || "").trim();
    if (!preferred) {
        return undefined;
    }
    return (
        icons.find((m) => m.queryName === preferred) ||
        icons.find((m) => m.displayName === preferred) ||
        icons.find(
            (m) =>
                m.queryName.endsWith(preferred) ||
                m.queryName.includes(`[${preferred}]`) ||
                m.displayName.toLowerCase() === preferred.toLowerCase(),
        )
    );
}

function readIconRaw(node: DataViewMatrixNode | undefined, measure: MeasureRef | undefined): string {
    if (!node || !measure) {
        return "";
    }
    return unwrapMeasureText(String(readMatrixValue(node, measure.valueSourceIndex) ?? ""));
}

/**
 * Medidas de ícone costumam usar SELECTEDVALUE/HASONEVALUE e voltam em branco no
 * contexto do total, mesmo quando a linha da categoria tem o SVG. Nesse caso
 * reaproveita o primeiro valor não vazio das linhas de detalhe.
 */
function firstDetailIcon(nodes: DataViewMatrixNode[], measure: MeasureRef | undefined): string {
    if (!measure) {
        return "";
    }
    for (const node of nodes) {
        if (isSubtotalNode(node)) {
            continue;
        }
        const raw = readIconRaw(node, measure);
        if (raw) {
            return raw;
        }
        const nested = firstDetailIcon(node.children ?? [], measure);
        if (nested) {
            return nested;
        }
    }
    return "";
}

function resolveRowIconMeasure(
    metaMap: CategoryMetaMap,
    category: string,
    isTotal: boolean,
    measures: MeasureRef[],
    totalIconQueryName?: string,
): MeasureRef | undefined {
    if (isTotal) {
        return findIconMeasure(measures, totalIconQueryName);
    }
    const meta = findCategoryMeta(metaMap, category);
    return findIconMeasure(measures, meta?.iconQueryName);
}

function toRow(
    node: DataViewMatrixNode,
    index: number,
    columns: KpiColumnConfig[],
    measures: MeasureRef[],
    metaMap: CategoryMetaMap,
    totalLabel: string,
    formatOpts?: ValueFormatOptions,
    totalIconQueryName?: string,
    totalDisplayMode?: DisplayMode,
    forceTotal = false,
    /** Nós extras de contexto de total (root / outros subtotais), só quando forceTotal. */
    totalContextNodes?: DataViewMatrixNode[],
): MatrixRow {
    const isTotal = forceTotal || isSubtotalNode(node);
    const category = isTotal ? totalLabel : nodeValue(node);
    const meta = isTotal ? undefined : findCategoryMeta(metaMap, category);
    const iconMeasure = resolveRowIconMeasure(
        metaMap,
        category,
        isTotal,
        measures,
        totalIconQueryName,
    );
    const iconRaw = readIconRaw(node, iconMeasure);
    const tooltips = measures.filter((m) => m.role === "tooltips");
    const customTitle = meta?.title?.trim();
    const displayMode: DisplayMode = isTotal
        ? totalDisplayMode || "both"
        : meta?.displayMode || "text";
    const contextNodes = forceTotal ? totalContextNodes : undefined;

    return {
        category,
        categoryKey: category,
        displayTitle: isTotal ? totalLabel : customTitle || category,
        displayMode,
        iconRaw,
        iconPersisted: meta?.imageUrl,
        isTotal,
        sourceIndex: index,
        cells: columns.map((col) => buildCell(node, col, measures, formatOpts, undefined, contextNodes)),
        tooltips: buildTooltipLines(node, tooltips),
    };
}

function nodeHasAnyValue(
    node: DataViewMatrixNode | undefined,
    columns: KpiColumnConfig[],
    measures: MeasureRef[] = [],
): boolean {
    if (!node?.values) {
        return false;
    }
    const hasPrimary = columns.some((col) => readMatrixValue(node, col.valueSourceIndex) != null);
    if (hasPrimary) {
        return true;
    }
    // Total Geral também é válido quando só os complementos têm valor no subtotal.
    return columns.some((col) =>
        col.complements.some((slot) => {
            const measure = measures.find((m) => m.queryName === slot.queryName);
            const idx = measure?.valueSourceIndex ?? -1;
            return idx >= 0 && readMatrixValue(node, idx) != null;
        }),
    );
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
            const primaryIsPercent = (col.format ?? "").includes("%");
            if (!primaryIsPercent && cell.primary.raw != null && Number.isFinite(cell.primary.raw)) {
                primarySum += cell.primary.raw;
                primaryCount += 1;
            }
            cell.complements.forEach((comp, i) => {
                const slotFormat = col.complements[i]?.format ?? "";
                // Percentual não é aditivo (1,15% + 2,71% + ... = 6,94% errado).
                // O valor certo vem do subtotal DAX; sem ele, melhor em branco que errado.
                if (slotFormat.includes("%")) {
                    return;
                }
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
        displayMode: "text",
        iconRaw: "",
        isTotal: true,
        sourceIndex: -1,
        cells,
        tooltips: [],
    };
}

function sortRows(rows: MatrixRow[], sortMode: SortMode): MatrixRow[] {
    if (sortMode === "data") {
        return rows;
    }
    const copy = [...rows];
    copy.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, "pt-BR"));
    return sortMode === "alphaDesc" ? copy.reverse() : copy;
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
    categoriesJson: string;
    imagesJson?: string;
    showTotal: boolean;
    displayUnits?: number;
    precision?: number;
    grandTotalIconQueryName?: string;
    grandTotalDisplayMode?: DisplayMode;
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
    const root = matrix.rows?.root;
    const rootChildren = root?.children ?? [];

    const totalNodes = rootChildren.filter(isSubtotalNode);
    const dataNodes = rootChildren.filter((n) => !isSubtotalNode(n));

    const dataRows = dataNodes.map((node, i) =>
        toRow(
            node,
            i,
            columns,
            measures,
            metaMap,
            options.totalLabel,
            formatOpts,
            options.grandTotalIconQueryName,
            options.grandTotalDisplayMode,
        ),
    );
    const sorted = sortRows(dataRows, options.sortMode);

    let totalRow: MatrixRow | undefined;
    if (options.showTotal) {
        const subtotalNode =
            totalNodes.find((n) => nodeHasAnyValue(n, columns, measures)) ?? totalNodes[0];
        const totalContext = [...totalNodes, root].filter((n): n is DataViewMatrixNode => Boolean(n));
        if (subtotalNode && nodeHasAnyValue(subtotalNode, columns, measures)) {
            totalRow = toRow(
                subtotalNode,
                -1,
                columns,
                measures,
                metaMap,
                options.totalLabel,
                formatOpts,
                options.grandTotalIconQueryName,
                options.grandTotalDisplayMode,
                true,
                totalContext,
            );
        } else if (root && nodeHasAnyValue(root, columns, measures)) {
            totalRow = toRow(
                root,
                -1,
                columns,
                measures,
                metaMap,
                options.totalLabel,
                formatOpts,
                options.grandTotalIconQueryName,
                options.grandTotalDisplayMode,
                true,
                totalContext,
            );
        } else if (sorted.length) {
            // Fallback: soma das linhas visíveis (quando o host não envia subtotal DAX).
            totalRow = sumTotalFromRows(sorted, columns, measures, options.totalLabel, formatOpts);
        }

        if (totalRow) {
            totalRow.category = options.totalLabel;
            totalRow.categoryKey = options.totalLabel;
            totalRow.displayTitle = options.totalLabel;
            totalRow.displayMode = options.grandTotalDisplayMode || "both";
            totalRow.isTotal = true;

            // Se o subtotal DAX trouxe o KPI mas omitiu um complemento ADITIVO
            // (sem formato %), completa com a soma das linhas. Percentual nunca é
            // somado manualmente: o valor certo só existe no contexto DAX de total.
            if (sorted.length) {
                totalRow.cells = totalRow.cells.map((cell, colIndex) => {
                    const col = columns[colIndex];
                    if (!col?.complements.length) {
                        return cell;
                    }
                    let changed = false;
                    const complements = cell.complements.map((comp, i) => {
                        if (comp.value.raw != null && comp.value.text) {
                            return comp;
                        }
                        const slot = col.complements[i];
                        const slotFormat = slot?.format ?? comp.value.format ?? "";
                        if (slotFormat.includes("%")) {
                            return comp;
                        }
                        let sum = 0;
                        let count = 0;
                        for (const row of sorted) {
                            const rowComp = row.cells[colIndex]?.complements[i];
                            if (rowComp?.value.raw != null && Number.isFinite(rowComp.value.raw)) {
                                sum += rowComp.value.raw;
                                count += 1;
                            }
                        }
                        if (!count) {
                            return comp;
                        }
                        changed = true;
                        return {
                            ...comp,
                            value: formatMeasureValue(sum, slot?.format ?? comp.value.format, formatOpts),
                        };
                    });
                    return changed ? { ...cell, complements } : cell;
                });
            }

            // Contexto do total primeiro. Se a medida vier em branco (SELECTEDVALUE no total),
            // usa o mesmo SVG que já apareceu na linha da categoria.
            const totalIcon = findIconMeasure(measures, options.grandTotalIconQueryName);
            if (totalIcon) {
                const fromSub = readIconRaw(subtotalNode, totalIcon);
                const fromRoot = readIconRaw(root, totalIcon);
                const fromDetail = firstDetailIcon(dataNodes, totalIcon);
                totalRow.iconRaw = fromSub || fromRoot || totalRow.iconRaw || fromDetail || "";
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
