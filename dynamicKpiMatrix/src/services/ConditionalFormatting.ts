"use strict";

import { normalizeCfRatio } from "../data/formatValue";
import type { KpiCellData, KpiColumnConfig } from "../data/viewModel";

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
