"use strict";

import type { FormattedValue } from "./viewModel";

function isPercentFormat(format?: string): boolean {
    return Boolean(format && format.includes("%"));
}

function isCurrencyFormat(format?: string): boolean {
    if (!format) {
        return false;
    }
    return format.includes("$") || format.toLowerCase().includes("currency") || /¤/.test(format);
}

/** Compactação pt-BR para valores monetários grandes. */
export function formatCompactMoney(value: number): string {
    const abs = Math.abs(value);
    let scaled = value;
    let suffix = "";
    if (abs >= 1e12) {
        scaled = value / 1e9;
        suffix = " T";
    } else if (abs >= 1e9) {
        scaled = value / 1e6;
        suffix = " B";
    } else if (abs >= 1e6) {
        scaled = value / 1e3;
        suffix = " MM";
    }
    const rounded = Math.round(scaled);
    const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `$${rounded < 0 ? "-" : ""}${grouped}${suffix}`;
}

export function formatMeasureValue(raw: unknown, format?: string): FormattedValue {
    if (raw == null || raw === "") {
        return { raw: null, text: "", format };
    }
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return { raw: null, text: String(raw), format };
    }

    if (isPercentFormat(format)) {
        const pct = Math.abs(raw) <= 2 ? raw * 100 : raw;
        return { raw, text: `${pct.toFixed(2)}%`, format };
    }

    if (isCurrencyFormat(format) || Math.abs(raw) >= 1000) {
        if (isCurrencyFormat(format) || Math.abs(raw) >= 100000) {
            return { raw, text: formatCompactMoney(raw), format };
        }
        return {
            raw,
            text: raw.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
            format,
        };
    }

    return {
        raw,
        text: Number.isInteger(raw)
            ? raw.toLocaleString("pt-BR")
            : raw.toLocaleString("pt-BR", { maximumFractionDigits: 4 }),
        format,
    };
}

export function normalizeCfRatio(raw: number | null, asPercent: boolean): number | null {
    if (raw == null || !Number.isFinite(raw)) {
        return null;
    }
    if (!asPercent) {
        return raw;
    }
    return Math.abs(raw) <= 2 ? raw : raw / 100;
}
