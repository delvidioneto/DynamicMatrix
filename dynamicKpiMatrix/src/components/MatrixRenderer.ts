"use strict";

import type {
    CellLayout,
    KpiCellData,
    KpiColumnConfig,
    MatrixRow,
    ResolvedVisualStyle,
    VisualViewModel,
} from "../data/viewModel";
import { resolveImageSource } from "../services/ImageManager";

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
    if (col.widthMode === "fixed") {
        return `${col.columnWidth}px`;
    }
    const base = style.columnWidth || col.columnWidth || 140;
    const min = Math.min(col.minWidth || 96, base);
    const max = Math.max(col.maxWidth || base, base);
    return `${Math.min(Math.max(base, min), max)}px`;
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

function imageHtml(raw: string | undefined, size: number, className: string): string {
    const resolved = resolveImageSource(raw);
    if (resolved.kind === "img") {
        return `<img class="${className}" src="${esc(resolved.src)}" alt="" width="${size}" height="${size}" />`;
    }
    if (resolved.kind === "svg") {
        return `<span class="${className} dkm-svg" style="width:${size}px;height:${size}px">${resolved.html}</span>`;
    }
    return "";
}

function categoryCellHtml(row: MatrixRow, style: ResolvedVisualStyle, isTotal: boolean): string {
    const iconSource = isTotal
        ? style.grandTotalImageData || row.iconPersisted || row.iconRaw
        : row.iconPersisted || row.iconRaw;
    const icon = imageHtml(
        iconSource,
        isTotal ? style.grandTotalImageSize : style.imageSize,
        "dkm-icon",
    );

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

function kpiCellHtml(cell: KpiCellData, col: KpiColumnConfig, style: ResolvedVisualStyle): string {
    const layout = resolveLayout(cell, col);
    const primarySize = col.primaryFontSize ?? Math.max(style.fontSize + 2, 14);
    const compSize = col.complementFontSize ?? Math.max(style.fontSize - 1, 10);
    const labelSize = col.labelFontSize ?? Math.max(style.fontSize - 2, 9);
    const primaryColor = cell.primaryColor ?? col.primaryColor ?? style.fontColor;
    const complementColor = col.complementColor ?? "#4A4A4A";
    const labelColor = col.labelColor ?? "#6B6B6B";
    const bg = cell.backgroundColor ?? col.backgroundColor ?? "transparent";
    const pad = col.cellPadding;

    const comps = cell.complements
        .filter((c) => c.value.text)
        .map(
            (c) =>
                `<div class="dkm-comp">` +
                `<span class="dkm-comp-label" style="font-size:${labelSize}px;color:${labelColor}">${esc(c.label)}</span>` +
                `<span class="dkm-comp-value" style="font-size:${compSize}px;color:${complementColor}">${esc(c.value.text)}</span>` +
                `</div>`,
        )
        .join("");

    const primary = cell.primary.text
        ? `<div class="dkm-primary" style="font-size:${primarySize}px;color:${primaryColor};font-weight:${style.fontWeight === "400" ? "700" : style.fontWeight}">${esc(cell.primary.text)}</div>`
        : `<div class="dkm-primary dkm-blank">—</div>`;

    return (
        `<div class="dkm-kpi dkm-layout-${layout}" style="background:${bg};padding:${pad}px">` +
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
        `${style.categoryWidth}px`,
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
