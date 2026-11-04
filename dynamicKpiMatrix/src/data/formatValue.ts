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
    if (!format) {
        return false;
    }
    if (format.includes("%")) {
        return true;
    }
    const trimmed = format.trim();
    return /^P\d*$/i.test(trimmed) || /percent/i.test(trimmed);
}

function isCurrencyFormat(format?: string): boolean {
    if (!format) {
        return false;
    }
    return format.includes("$") || format.toLowerCase().includes("currency") || /¤/.test(format);
}

function currencyPrefix(format?: string): string {
    if (!format || !isCurrencyFormat(format)) {
        return "";
    }
    if (format.includes("R$")) {
        return "R$";
    }
    return "$";
}

function isForcedDisplayUnit(displayUnits: number | undefined): boolean {
    return (
        displayUnits != null &&
        displayUnits !== DisplayUnits.Auto &&
        displayUnits !== DisplayUnits.None
    );
}

function resolvePrecision(precision: number | undefined, fallback: number): number {
    if (precision == null || !Number.isFinite(precision) || precision < 0) {
        return fallback;
    }
    return Math.min(10, Math.floor(precision));
}

/**
 * Casas decimais do formato da medida (DAX / Power BI).
 * `$#,0` → 0; `$#,0.00` → 2; `0%` → 0; `0.00%` → 2.
 * undefined = o formato não declara casas (aí vale a precisão do visual).
 */
function precisionFromFormat(format?: string): number | undefined {
    if (!format) {
        return undefined;
    }
    const section = format
        .split(";")[0]
        .replace(/"[^"]*"/g, "")
        .replace(/\\./g, "");
    const percentIdx = section.lastIndexOf("%");
    const target = percentIdx >= 0 ? section.slice(0, percentIdx) : section;
    const dot = target.lastIndexOf(".");
    if (dot >= 0) {
        const frac = target.slice(dot + 1).match(/^[0#]+/);
        if (frac) {
            return Math.min(10, frac[0].length);
        }
    }
    if (/[0#]/.test(target)) {
        return 0;
    }
    return undefined;
}

/**
 * Prioridade: formato da medida > precisão do visual > fallback.
 * A precisão do painel não sobrescreve `$#,0` / `0%` etc.
 */
function effectivePrecision(
    format: string | undefined,
    visualPrecision: number | undefined,
    fallback: number,
): { digits: number; fromFormat: boolean } {
    const fromFormat = precisionFromFormat(format);
    if (fromFormat !== undefined) {
        return { digits: fromFormat, fromFormat: true };
    }
    return { digits: resolvePrecision(visualPrecision, fallback), fromFormat: false };
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
    exact: boolean,
): string {
    const scaled = divisor === 1 ? value : value / divisor;
    const text = scaled.toLocaleString("pt-BR", {
        minimumFractionDigits: exact ? precision : Number.isInteger(scaled) && precision === 0 ? 0 : undefined,
        maximumFractionDigits: precision,
    });
    const withSuffix = suffix ? `${text}${suffix}` : text;
    return currency ? `$${withSuffix}` : withSuffix;
}

/**
 * Formato da medida, sem unidade/precisão do visual.
 * %, moeda, decimal e texto seguem o format string; sem format = número geral.
 */
function formatByMeasure(raw: number, format?: string): string {
    if (isPercentFormat(format)) {
        const digits = precisionFromFormat(format) ?? 2;
        return `${(raw * 100).toFixed(digits)}%`;
    }
    const prefix = currencyPrefix(format);
    const digits = precisionFromFormat(format);
    if (digits !== undefined) {
        const text = raw.toLocaleString("pt-BR", {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });
        return prefix ? `${prefix}${text}` : text;
    }
    if (Number.isInteger(raw)) {
        const text = raw.toLocaleString("pt-BR");
        return prefix ? `${prefix}${text}` : text;
    }
    const text = raw.toLocaleString("pt-BR", { maximumFractionDigits: 12 });
    return prefix ? `${prefix}${text}` : text;
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

    // Sem unidade forçada (Auto/Nenhum/ausente): só o formato da medida.
    // Unidades de Valores só entram quando o usuário escolhe milhares/milhões/etc.
    if (!isForcedDisplayUnit(options?.displayUnits) || isPercentFormat(format)) {
        return { raw, text: formatByMeasure(raw, format), format };
    }

    const { divisor, suffix } = unitFromSetting(options!.displayUnits as number, Math.abs(raw));
    const fromFormat = precisionFromFormat(format);
    const { digits } = effectivePrecision(
        format,
        options?.precision,
        divisor === 1 ? (Number.isInteger(raw) ? 0 : 2) : 2,
    );
    return {
        raw,
        text: formatScaled(raw, divisor, suffix, digits, isCurrencyFormat(format), fromFormat !== undefined),
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
