"use strict";

import type {
    CellLayout,
    KpiCellData,
    KpiColumnConfig,
    MatrixRow,
    ResolvedVisualStyle,
    VisualViewModel,
} from "../data/viewModel";
import { resolveImageSource, unwrapMeasureText } from "../services/ImageManager";
import { isDataImageUri, isHttpImageUrl } from "../services/SvgSanitizer";

export interface TooltipPayloadItem {
    displayName: string;
    value: string;
    header?: string;
}

function esc(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function tipAttr(header: string, row: MatrixRow): string {
    const lines = [
        { displayName: "Categoria", value: row.displayTitle || row.category },
        ...row.tooltips,
    ].filter((l) => l.value);
    if (!lines.length) {
        return "";
    }
    const payload: TooltipPayloadItem[] = lines.map((line, i) =>
        i === 0
            ? { displayName: line.displayName, value: line.value, header }
            : { displayName: line.displayName, value: line.value },
    );
    return ` data-tip="${encodeURIComponent(JSON.stringify(payload))}" data-row-index="${row.sourceIndex}"`;
}

export function parseCellTooltip(raw: string | undefined): TooltipPayloadItem[] {
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(decodeURIComponent(raw)) as TooltipPayloadItem[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function columnWidthCss(col: KpiColumnConfig, style: ResolvedVisualStyle): string {
    // Largura pedida pelo usuário (pode ser 0), mas nunca menor que o maior texto.
    const preferred = Math.max(
        0,
        col.widthMode === "fixed" ? col.columnWidth : style.columnWidth || col.columnWidth || 0,
    );
    return `max(${preferred}px, max-content)`;
}

function categoryWidthCss(style: ResolvedVisualStyle): string {
    const preferred = Math.max(0, style.categoryWidth || 0);
    return `max(${preferred}px, max-content)`;
}

function resolveLayout(cell: KpiCellData, col: KpiColumnConfig): CellLayout {
    if (col.layout !== "auto") {
        return col.layout;
    }
    if (cell.complements.length <= 1) {
        return "vertical";
    }
    if (col.widthMode === "fixed" && col.columnWidth < 130) {
        return "vertical";
    }
    return cell.complements.length >= 3 ? "horizontal" : "vertical";
}

function fitImageSize(preferred: number, columnWidth: number): number {
    const maxByColumn = Math.max(12, columnWidth - 16);
    return Math.max(12, Math.min(preferred || 22, maxByColumn));
}

function imageHtml(
    raw: string | undefined,
    size: number,
    className: string,
    columnWidth: number,
): string {
    const resolved = resolveImageSource(raw);
    const box = fitImageSize(size, columnWidth);
    if (resolved.kind === "img") {
        return (
            `<img class="${className}" src="${esc(resolved.src)}" alt="" ` +
            `width="${box}" height="${box}" ` +
            `style="width:${box}px;height:${box}px;max-width:100%;object-fit:contain" />`
        );
    }
    if (resolved.kind === "svg") {
        return (
            `<span class="${className} dkm-svg" style="width:${box}px;height:${box}px;max-width:100%">` +
            `${resolved.html}</span>`
        );
    }
    return "";
}

function isRasterSource(raw: string | undefined): boolean {
    const v = unwrapMeasureText(raw);
    return Boolean(v && (isDataImageUri(v) || isHttpImageUrl(v)) && !v.toLowerCase().includes("<svg"));
}

function pickCategoryImageSource(
    row: MatrixRow,
    style: ResolvedVisualStyle,
    isTotal: boolean,
): string {
    const measure = unwrapMeasureText(row.iconRaw);
    const persisted = unwrapMeasureText(row.iconPersisted);
    const configured = unwrapMeasureText(style.grandTotalImageData);

    if (isTotal) {
        if (style.grandTotalImageType === "svg") {
            // Preferência: SVG configurado no painel → medida Ícone da categoria no total.
            if (configured.toLowerCase().includes("<svg")) {
                return configured;
            }
            if (measure.toLowerCase().includes("<svg")) {
                return measure;
            }
            return configured || measure || persisted;
        }
        // PNG: upload/persistido; medida só se for raster.
        if (configured) {
            return configured;
        }
        if (isRasterSource(measure)) {
            return measure;
        }
        return persisted;
    }

    if (style.categoryImageType === "svg") {
        if (measure.toLowerCase().includes("<svg")) {
            return measure;
        }
        if (persisted.toLowerCase().includes("<svg")) {
            return persisted;
        }
        return measure || persisted;
    }

    // PNG por categoria: upload persistido; medida raster como fallback.
    if (persisted) {
        return persisted;
    }
    if (isRasterSource(measure)) {
        return measure;
    }
    return "";
}

function categoryCellHtml(row: MatrixRow, style: ResolvedVisualStyle, isTotal: boolean): string {
    const iconSource = pickCategoryImageSource(row, style, isTotal);
    const preferredSize = isTotal ? style.grandTotalImageSize : style.imageSize;
    const icon = imageHtml(iconSource, preferredSize, "dkm-icon", style.categoryWidth);

    const label = isTotal
        ? style.grandTotalLabel || row.displayTitle || "Total Geral"
        : row.displayTitle || row.category;

    const mode = isTotal ? style.grandTotalDisplayMode || "both" : "both";
    const showText = mode === "text" || mode === "both";
    const showImage = (mode === "image" || mode === "both") && Boolean(icon);
    const place = style.imagePlacement;
    const tip = !isTotal && style.tooltipEnabled ? tipAttr(label, row) : "";
    const tipClass = tip ? " dkm-tip" : "";

    const textHtml = showText ? `<span class="dkm-cat-text">${esc(label)}</span>` : "";
    const inner = `${showImage ? icon : ""}${textHtml}`;

    return `<div class="dkm-cat${tipClass}${place === "above" ? " dkm-cat-above" : ""}"${tip}>${inner}</div>`;
}

function iconGlyph(
    icons: string | undefined,
    raw: number | null,
): string {
    if (!icons || icons === "none" || raw == null || !Number.isFinite(raw)) {
        return "";
    }
    const high = raw >= 1 || raw >= 100;
    const mid = raw >= 0.9 || (raw >= 90 && raw < 100);
    if (icons === "traffic") {
        const color = high ? "#107C10" : mid ? "#F7B500" : "#D13438";
        return `<span class="dkm-icon-set" style="color:${color}" aria-hidden="true">●</span>`;
    }
    if (icons === "triangles") {
        const glyph = high ? "▲" : mid ? "◆" : "▼";
        const color = high ? "#107C10" : mid ? "#F7B500" : "#D13438";
        return `<span class="dkm-icon-set" style="color:${color}" aria-hidden="true">${glyph}</span>`;
    }
    // directional
    const glyph = high ? "↑" : mid ? "→" : "↓";
    const color = high ? "#107C10" : mid ? "#F7B500" : "#D13438";
    return `<span class="dkm-icon-set" style="color:${color}" aria-hidden="true">${glyph}</span>`;
}

function safeHttpUrl(raw: string | undefined): string | undefined {
    if (!raw?.trim()) {
        return undefined;
    }
    const t = raw.trim();
    if (/^https?:\/\//i.test(t)) {
        return t;
    }
    return undefined;
}

function dataBarWidthPct(raw: number | null): number {
    if (raw == null || !Number.isFinite(raw)) {
        return 0;
    }
    // Percentuais (0–1 ou 0–100) e valores absolutos escalados de forma simples.
    if (Math.abs(raw) <= 1) {
        return Math.max(0, Math.min(100, Math.abs(raw) * 100));
    }
    if (Math.abs(raw) <= 100) {
        return Math.max(0, Math.min(100, Math.abs(raw)));
    }
    return Math.max(0, Math.min(100, Math.log10(Math.abs(raw) + 1) * 25));
}

function kpiCellHtml(cell: KpiCellData, col: KpiColumnConfig, style: ResolvedVisualStyle): string {
    const layout = resolveLayout(cell, col);
    const primarySize = col.primaryFontSize ?? style.valueFontSize ?? Math.max(style.fontSize + 2, 14);
    const compSize = col.complementFontSize ?? Math.max((style.valueFontSize || style.fontSize) - 3, 10);
    const labelSize = col.labelFontSize ?? Math.max(style.fontSize - 2, 9);
    const primaryColor = cell.primaryColor ?? col.primaryColor ?? style.valueFontColor ?? style.fontColor;
    const fallbackCompColor = col.complementColor ?? "#4A4A4A";
    const labelColor = col.labelColor ?? "#6B6B6B";
    const bg = cell.backgroundColor ?? col.backgroundColor ?? "transparent";
    const pad = col.cellPadding;
    const align = style.valueAlignment || "left";
    const bw = Math.max(0, style.valueBorderWidth || 0);
    const bc = style.valueBorderColor || "#D0D0D0";
    const br = Math.max(0, style.valueBorderRadius || 0);
    const borderCss =
        `border-style:solid;` +
        `border-color:${bc};` +
        `border-left-width:${style.valueBorderLeft ? bw : 0}px;` +
        `border-right-width:${style.valueBorderRight ? bw : 0}px;` +
        `border-top-width:${style.valueBorderTop ? bw : 0}px;` +
        `border-bottom-width:${style.valueBorderBottom ? bw : 0}px;` +
        `border-radius:${br}px;`;

    const comps = cell.complements
        .filter((c) => c.value.text)
        .map((c) => {
            const fontColor = c.fontColor ?? fallbackCompColor;
            const back = c.backColor ? `background:${c.backColor};` : "";
            const icon = iconGlyph(c.icons, c.value.raw);
            const href = safeHttpUrl(c.webUrl) ?? safeHttpUrl(String(c.value.raw ?? ""));
            const valueInner = href
                ? `<a class="dkm-comp-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(c.value.text)}</a>`
                : esc(c.value.text);
            const barPct = c.dataBars ? dataBarWidthPct(c.value.raw) : 0;
            const barColor = c.dataBarColor ?? "#118DFF";
            const bar =
                c.dataBars && barPct > 0
                    ? `<span class="dkm-data-bar" style="width:${barPct}%;background:${barColor}"></span>`
                    : "";
            return (
                `<div class="dkm-comp" style="${back}">` +
                `<span class="dkm-comp-label" style="font-size:${labelSize}px;color:${labelColor}">${esc(c.label)}</span>` +
                `<span class="dkm-comp-value-wrap">` +
                bar +
                `<span class="dkm-comp-value" style="font-size:${compSize}px;color:${fontColor}">${icon}${valueInner}</span>` +
                `</span></div>`
            );
        })
        .join("");

    const primary = cell.primary.text
        ? `<div class="dkm-primary" style="font-size:${primarySize}px;color:${primaryColor};font-weight:${style.fontWeight === "400" ? "700" : style.fontWeight}">${esc(cell.primary.text)}</div>`
        : `<div class="dkm-primary dkm-blank">—</div>`;

    return (
        `<div class="dkm-kpi dkm-layout-${layout}" style="background:${bg};padding:${pad}px;text-align:${align};align-items:${align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start"};${borderCss}">` +
        primary +
        (comps ? `<div class="dkm-comps">${comps}</div>` : "") +
        `</div>`
    );
}

function rowBackground(style: ResolvedVisualStyle, index: number, isTotal: boolean): string {
    if (isTotal) {
        return style.grandTotalBackground;
    }
    if (!style.zebra) {
        return style.rowDefaultBackground || style.columnBackground;
    }
    return index % 2 === 0 ? style.rowEvenBackground : style.rowOddBackground;
}

function renderRow(
    row: MatrixRow,
    columns: KpiColumnConfig[],
    style: ResolvedVisualStyle,
    index: number,
): string {
    const isTotal = row.isTotal;
    const height = isTotal ? style.grandTotalRowHeight : style.rowHeight;
    const bg = rowBackground(style, index, isTotal);
    const fontSize = isTotal ? style.grandTotalFontSize : style.categoryFontSize;
    const fontColor = isTotal ? style.grandTotalFontColor : style.categoryFontColor;
    const fontWeight = isTotal ? "700" : style.categoryFontWeight;
    const align = isTotal ? style.grandTotalAlignment : style.categoryAlignment;
    const rowRadius = style.rowBorderRadius;
    const colRadius = style.columnBorderRadius;

    const cells = columns
        .map((col, i) => {
            const cell = row.cells[i] ?? {
                queryName: col.queryName,
                primary: { raw: null, text: "" },
                complements: [],
                layout: col.layout,
            };
            const isLast = i === columns.length - 1;
            return (
                `<div class="dkm-cell dkm-kpi-cell${isLast ? " dkm-cell-last" : ""}">` +
                kpiCellHtml(cell, col, style) +
                `</div>`
            );
        })
        .join("");

    return (
        `<div class="dkm-row${isTotal ? " dkm-row-total" : ""}" style="--row-bg:${bg};--row-border-color:${style.rowBorderColor};--row-border-width:${style.rowBorderWidth}px;--row-radius:${rowRadius}px;--col-border-color:${style.columnBorderColor};--col-border-width:${style.columnBorderWidth}px;--col-radius:${colRadius}px;--col-gap:${style.columnGap}px;min-height:${height}px;margin-bottom:${style.rowGap}px">` +
        `<div class="dkm-cell dkm-cat-cell" style="font-size:${fontSize}px;color:${fontColor};font-weight:${fontWeight};text-align:${align}">${categoryCellHtml(row, style, isTotal)}</div>` +
        cells +
        `</div>`
    );
}

function renderHeader(columns: KpiColumnConfig[], style: ResolvedVisualStyle): string {
    const heads = columns
        .map((col) => {
            const color = col.headerColor ?? style.headerFontColor;
            return `<div class="dkm-cell dkm-head-cell" style="color:${color}">${esc(col.title || col.displayName)}</div>`;
        })
        .join("");
    return (
        `<div class="dkm-row dkm-header" style="background:${style.headerBackground};font-size:${style.headerFontSize}px;font-weight:${style.headerFontWeight};color:${style.headerFontColor}">` +
        `<div class="dkm-cell dkm-cat-cell dkm-head-cell"></div>` +
        heads +
        `</div>`
    );
}

export function buildMatrixHtml(view: VisualViewModel, style: ResolvedVisualStyle): string {
    if (view.emptyMessage && !view.columns.length) {
        return `<div class="dkm-empty">${esc(view.emptyMessage)}</div>`;
    }

    const templateColumns = [
        categoryWidthCss(style),
        ...view.columns.map((col) => columnWidthCss(col, style)),
    ].join(" ");

    const bodyRows = view.rows.map((row, i) => renderRow(row, view.columns, style, i)).join("");
    const total =
        style.grandTotalShow && view.totalRow
            ? renderRow(view.totalRow, view.columns, style, -1)
            : "";

    // Cabeçalho + Total Geral ficam em bloco sticky no topo (sempre visíveis).
    return (
        `<div class="dkm-root" style="font-family:${esc(style.fontFamily)},Segoe UI,Arial,sans-serif;background:${style.background};color:${style.fontColor};font-size:${style.fontSize}px;--cat-width:${style.categoryWidth}px;--grid-cols:${templateColumns};--header-bg:${style.headerBackground};--total-bg:${style.grandTotalBackground};--col-bg:${style.columnBackground};--col-border-color:${style.columnBorderColor};--col-border-width:${style.columnBorderWidth}px;--col-radius:${style.columnBorderRadius}px;--col-gap:${style.columnGap}px;--row-border-color:${style.rowBorderColor};--row-border-width:${style.rowBorderWidth}px;--row-radius:${style.rowBorderRadius}px">` +
        `<div class="dkm-scroll">` +
        `<div class="dkm-freeze">` +
        `<div class="dkm-grid dkm-grid-freeze" style="grid-template-columns:${templateColumns};column-gap:${style.columnGap}px">` +
        renderHeader(view.columns, style) +
        total +
        `</div></div>` +
        `<div class="dkm-grid dkm-grid-body" style="grid-template-columns:${templateColumns};column-gap:${style.columnGap}px">` +
        bodyRows +
        `</div></div></div>`
    );
}
