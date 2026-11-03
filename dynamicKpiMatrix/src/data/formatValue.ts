"use strict";

import type { FormattedValue } from "./viewModel";

/** Unidades nativas do Power BI (labelDisplayUnits). */
export const DisplayUnits = {
    Auto: 0,
    None: 1,
    Thousands: 1_000,
    Millions: 1_000_000,
    Billions: 1_000_000_000,
    Trillions: 1_000_000_000_000,
} as const;

export interface ValueFormatOptions {
    /** 0=Auto, 1=Nenhum, 1000, 1e6, 1e9, 1e12 */
    displayUnits?: number;
    /** Casas decimais; undefined/`NaN` = automático */
    precision?: number;
}

function isPercentFormat(format?: string): boolean {
    return Boolean(format && format.includes("%"));
}

function isCurrencyFormat(format?: string): boolean {
    if (!format) {
        return false;
    }
    return format.includes("$") || format.toLowerCase().includes("currency") || /¤/.test(format);
}

function resolvePrecision(precision: number | undefined, fallback: number): number {
    if (precision == null || !Number.isFinite(precision) || precision < 0) {
        return fallback;
    }
    return Math.min(10, Math.floor(precision));
}

function pickAutoUnit(abs: number): { divisor: number; suffix: string } {
    if (abs >= DisplayUnits.Trillions) {
        return { divisor: DisplayUnits.Trillions, suffix: "T" };
    }
    if (abs >= DisplayUnits.Billions) {
        return { divisor: DisplayUnits.Billions, suffix: "bn" };
    }
    if (abs >= DisplayUnits.Millions) {
        return { divisor: DisplayUnits.Millions, suffix: "M" };
    }
    if (abs >= DisplayUnits.Thousands) {
        return { divisor: DisplayUnits.Thousands, suffix: "K" };
    }
    return { divisor: 1, suffix: "" };
}

function unitFromSetting(displayUnits: number, abs: number): { divisor: number; suffix: string } {
    switch (displayUnits) {
        case DisplayUnits.None:
            return { divisor: 1, suffix: "" };
        case DisplayUnits.Thousands:
            return { divisor: DisplayUnits.Thousands, suffix: "K" };
        case DisplayUnits.Millions:
            return { divisor: DisplayUnits.Millions, suffix: "M" };
        case DisplayUnits.Billions:
            return { divisor: DisplayUnits.Billions, suffix: "bn" };
        case DisplayUnits.Trillions:
            return { divisor: DisplayUnits.Trillions, suffix: "T" };
        case DisplayUnits.Auto:
        default:
            return pickAutoUnit(abs);
    }
}

function formatScaled(
    value: number,
    divisor: number,
    suffix: string,
    precision: number,
    currency: boolean,
): string {
    const scaled = divisor === 1 ? value : value / divisor;
    const text = scaled.toLocaleString("pt-BR", {
        minimumFractionDigits: Number.isInteger(scaled) && precision === 0 ? 0 : undefined,
        maximumFractionDigits: precision,
    });
    const withSuffix = suffix ? `${text}${suffix}` : text;
    return currency ? `$${withSuffix}` : withSuffix;
}

/** Compactação pt-BR legada (compatível com testes de moeda). */
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

export function formatMeasureValue(
    raw: unknown,
    format?: string,
    options?: ValueFormatOptions,
): FormattedValue {
    if (raw == null || raw === "") {
        return { raw: null, text: "", format };
    }
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return { raw: null, text: String(raw), format };
    }

    const displayUnits = options?.displayUnits ?? DisplayUnits.Auto;
    const currency = isCurrencyFormat(format);

    if (isPercentFormat(format)) {
        const pct = Math.abs(raw) <= 2 ? raw * 100 : raw;
        const precision = resolvePrecision(options?.precision, 2);
        return { raw, text: `${pct.toFixed(precision)}%`, format };
    }

    // Nenhum: número completo sem compactação.
    if (displayUnits === DisplayUnits.None) {
        const precision = resolvePrecision(options?.precision, currency ? 2 : 4);
        const text = raw.toLocaleString("pt-BR", {
            maximumFractionDigits: precision,
            minimumFractionDigits: Number.isInteger(raw) ? 0 : undefined,
        });
        return { raw, text: currency ? `$${text}` : text, format };
    }

    // Auto sem unidade forçada: mantém compactação monetária legada para valores grandes.
    if (displayUnits === DisplayUnits.Auto && (currency || Math.abs(raw) >= 100_000)) {
        if (currency || Math.abs(raw) >= 100_000) {
            return { raw, text: formatCompactMoney(raw), format };
        }
    }

    if (displayUnits === DisplayUnits.Auto && Math.abs(raw) < DisplayUnits.Thousands) {
        const precision = resolvePrecision(options?.precision, Number.isInteger(raw) ? 0 : 4);
        return {
            raw,
            text: Number.isInteger(raw)
                ? raw.toLocaleString("pt-BR")
                : raw.toLocaleString("pt-BR", { maximumFractionDigits: precision }),
            format,
        };
    }

    const { divisor, suffix } = unitFromSetting(displayUnits, Math.abs(raw));
    const precision = resolvePrecision(
        options?.precision,
        divisor === 1 ? (Number.isInteger(raw) ? 0 : 2) : 2,
    );
    return {
        raw,
        text: formatScaled(raw, divisor, suffix, precision, currency),
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
