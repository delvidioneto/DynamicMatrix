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
 * Cores avaliadas pelo host (fx / fillRule).
 *
 * Complementos: a regra fica no metadata do KPI e o host devolve a cor nos
 * objects do valor desse indicador (`selector: ["kpis"]`). Cada slot lê só
 * `complement${slotIndex}*` dessa célula. A cor da linha e a cor da medida de
 * complemento ficam de fora, para o indicador A não pintar o indicador B.
 * A cor constante da coluna entra quando a célula não traz cor avaliada.
 * O Complemento 1 não altera o Complemento 2.
 *
 * Valor principal e fundo da célula leem a célula do KPI e, em seguida, o nó
 * da categoria.
 */
export function mergeCellObjectsColors(
    cell: KpiCellData,
    column: KpiColumnConfig,
    valueObjects: powerbi.DataViewObjects | undefined,
    extraSources: Array<powerbi.DataViewObjects | undefined> = [],
): KpiCellData {
    const primarySources = [valueObjects, ...extraSources];
    const primaryFromCf = firstCfColor(primarySources, "primaryColor");
    const bgFromCf = firstCfColor(primarySources, "backgroundColor");

    const complements = cell.complements.map((comp) => {
        const i = comp.slotIndex;
        const fontColor = firstCfColor([valueObjects], `complement${i}FontColor`) ?? comp.fontColor;
        const backColor = firstCfColor([valueObjects], `complement${i}BackColor`) ?? comp.backColor;
        const dataBarColor = firstCfColor([valueObjects], `complement${i}DataBarColor`) ?? comp.dataBarColor;
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
