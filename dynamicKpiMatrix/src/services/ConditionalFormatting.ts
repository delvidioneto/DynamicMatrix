"use strict";

import powerbi from "powerbi-visuals-api";
import { normalizeCfRatio } from "../data/formatValue";
import { readProp, solidColor } from "../data/kpiMapper";
import type { ComplementValue, KpiCellData, KpiColumnConfig } from "../data/viewModel";

export function resolveRuleColor(
    ratio: number | null,
    column: KpiColumnConfig,
): string | undefined {
    if (!column.cfEnabled || ratio == null) {
        return undefined;
    }
    if (ratio >= column.cfThresholdHigh) {
        return column.cfColorHigh;
    }
    if (ratio >= column.cfThresholdMid) {
        return column.cfColorMid;
    }
    return column.cfColorLow;
}

function readCfColor(
    objects: powerbi.DataViewObjects | undefined,
    propertyName: string,
): string | undefined {
    return solidColor(readProp(objects, "kpiStyle", propertyName));
}

function firstCfColor(
    sources: Array<powerbi.DataViewObjects | undefined>,
    propertyName: string,
): string | undefined {
    for (const objects of sources) {
        const color = readCfColor(objects, propertyName);
        if (color) {
            return color;
        }
    }
    return undefined;
}

/**
 * Cores avaliadas pelo host (fx).
 * A regra com seletor de categoria chega em `node.objects`.
 * A cor da medida pode chegar no valor do complemento ou no valor do KPI.
 * A primeira cor encontrada ganha da cor constante da coluna.
 */
export function mergeCellObjectsColors(
    cell: KpiCellData,
    column: KpiColumnConfig,
    valueObjects: powerbi.DataViewObjects | undefined,
    extraSources: Array<powerbi.DataViewObjects | undefined> = [],
    complementSources: Array<Array<powerbi.DataViewObjects | undefined> | undefined> = [],
): KpiCellData {
    const shared = [valueObjects, ...extraSources];
    const primaryFromCf = firstCfColor(shared, "primaryColor");
    const bgFromCf = firstCfColor(shared, "backgroundColor");

    const complements = cell.complements.map((comp, index) => {
        const i = comp.slotIndex;
        const sources = [...(complementSources[index] ?? []), ...shared];
        const fontColor = firstCfColor(sources, `complement${i}FontColor`) ?? comp.fontColor;
        const backColor = firstCfColor(sources, `complement${i}BackColor`) ?? comp.backColor;
        const dataBarColor = firstCfColor(sources, `complement${i}DataBarColor`) ?? comp.dataBarColor;
        return { ...comp, fontColor, backColor, dataBarColor };
    });

    return {
        ...cell,
        primaryColor: primaryFromCf ?? cell.primaryColor ?? column.primaryColor,
        backgroundColor: bgFromCf ?? cell.backgroundColor ?? column.backgroundColor,
        complements,
    };
}

export function applyConditionalColors(cell: KpiCellData, column: KpiColumnConfig): KpiCellData {
    if (!column.cfEnabled) {
        return cell;
    }
    const ratio = normalizeCfRatio(cell.primary.raw, column.cfAsPercent);
    const color = resolveRuleColor(ratio, column);
    if (!color) {
        return cell;
    }

    const next: KpiCellData = { ...cell };
    if (column.cfApplyTo === "value" || column.cfApplyTo === "both") {
        next.primaryColor = color;
    }
    if (column.cfApplyTo === "background" || column.cfApplyTo === "both") {
        next.backgroundColor = color + "22";
    }
    return next;
}

export function withComplementDefaults(
    comps: ComplementValue[],
    column: KpiColumnConfig,
): ComplementValue[] {
    return comps.map((c) => ({
        ...c,
        fontColor: c.fontColor ?? column.complementColor,
    }));
}
