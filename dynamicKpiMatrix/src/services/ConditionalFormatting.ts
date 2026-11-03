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

/** Cores avaliadas pelo host (fx) em cada interseção da matrix. */
export function mergeCellObjectsColors(
    cell: KpiCellData,
    column: KpiColumnConfig,
    valueObjects: powerbi.DataViewObjects | undefined,
): KpiCellData {
    if (!valueObjects) {
        return cell;
    }

    const primaryFromCf = readCfColor(valueObjects, "primaryColor");
    const bgFromCf = readCfColor(valueObjects, "backgroundColor");

    const complements = cell.complements.map((comp) => {
        const i = comp.slotIndex;
        const fontColor =
            readCfColor(valueObjects, `complement${i}FontColor`) ?? comp.fontColor;
        const backColor =
            readCfColor(valueObjects, `complement${i}BackColor`) ?? comp.backColor;
        const dataBarColor =
            readCfColor(valueObjects, `complement${i}DataBarColor`) ?? comp.dataBarColor;
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
