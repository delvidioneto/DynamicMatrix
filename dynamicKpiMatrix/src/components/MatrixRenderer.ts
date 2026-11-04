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

/** Estimativa de largura de texto para manter cabeçalho e corpo alinhados (px fixos). */
function estimateTextWidth(text: string | undefined, fontSize: number, padding = 20): number {
    const len = (text ?? "").length;
    if (!len) {
        return padding;
    }
    return Math.ceil(len * Math.max(fontSize, 10) * 0.62) + padding;
}

/**
 * Larguras em px compartilhadas entre freeze e body.
 * Nunca menores que o maior texto da coluna (mesmo com largura configurada = 0).
 */
function resolveGridTemplateColumns(view: VisualViewModel, style: ResolvedVisualStyle): string {
    const rows = [...view.rows, ...(view.totalRow ? [view.totalRow] : [])];

    let catW = Math.max(0, style.categoryWidth || 0);
    catW = Math.max(catW, estimateTextWidth("Categoria", style.headerFontSize));
    for (const row of rows) {
        catW = Math.max(
            catW,
            estimateTextWidth(row.displayTitle || row.category, style.categoryFontSize, 28),
        );
    }
    catW = Math.max(catW, 48);

    const colWs = view.columns.map((col, colIndex) => {
        const preferred = Math.max(
            0,
            col.widthMode === "fixed" ? col.columnWidth : style.columnWidth || col.columnWidth || 0,
        );
        const primarySize = col.primaryFontSize ?? style.valueFontSize ?? style.fontSize;
        const compSize = col.complementFontSize ?? Math.max(primarySize - 3, 10);
        const labelSize = col.labelFontSize ?? Math.max(style.fontSize - 2, 9);

        let w = preferred;
        w = Math.max(w, estimateTextWidth(col.title || col.displayName, style.headerFontSize));
        for (const row of rows) {
            const cell = row.cells[colIndex];
            if (!cell) {
                continue;
            }
            w = Math.max(w, estimateTextWidth(cell.primary.text, primarySize, 24));
            const comps = cell.complements.filter((c) => c.value.text || c.label);
            if (!comps.length) {
                continue;
            }
            const layout = resolveLayout(cell, col);
            // Horizontal: cada complemento é uma fração da célula — a coluna
            // precisa caber a soma das fatias (ex.: 2 × 80 = 160).
            if (layout === "horizontal" && comps.length > 1) {
                let sum = 0;
                for (const comp of comps) {
                    const slot = Math.max(
                        estimateTextWidth(comp.label, labelSize, 8),
                        estimateTextWidth(comp.value.text, compSize, 8),
                        24,
                    );
                    sum += slot;
                }
                // gaps entre complementos (14px) + padding típico da célula
                sum += 14 * (comps.length - 1) + (col.cellPadding || 0) * 2;
                w = Math.max(w, sum);
            } else {
                for (const comp of comps) {
                    w = Math.max(w, estimateTextWidth(comp.label, labelSize, 16));
                    w = Math.max(w, estimateTextWidth(comp.value.text, compSize, 16));
                }
            }
        }
        return Math.max(w, 48);
    });

    return [`${catW}px`, ...colWs.map((w) => `${w}px`)].join(" ");
}

function resolveLayout(cell: KpiCellData, col: KpiColumnConfig): CellLayout {
    if (col.layout !== "auto") {
        return col.layout;
    }
    // Com 2+ complementos, divide a largura da célula em frações iguais.
    return cell.complements.length >= 2 ? "horizontal" : "vertical";
}

/** Largura de cada complemento = fração da célula (ex.: 160px / 2 = 80px). */
function complementSlotWidth(
    cellWidthPx: number,
    complementCount: number,
    cellPadding: number,
    layout: CellLayout,
): number {
    const pad = Math.max(0, cellPadding || 0);
    const inner = Math.max(0, cellWidthPx - pad * 2);
    if (complementCount <= 0) {
        return inner;
    }
    if (layout !== "horizontal" || complementCount === 1) {
        return inner;
    }
    const gap = 14;
    const gaps = gap * (complementCount - 1);
    return Math.max(12, Math.floor((inner - gaps) / complementCount));
}

function parseSvgIntrinsicSize(svgHtml: string): { w: number; h: number } | undefined {
    const wAttr = svgHtml.match(/\bwidth\s*=\s*["']?\s*(\d+(?:\.\d+)?)\s*(?:px)?["']?/i);
    const hAttr = svgHtml.match(/\bheight\s*=\s*["']?\s*(\d+(?:\.\d+)?)\s*(?:px)?["']?/i);
    if (wAttr && hAttr) {
        return { w: Number(wAttr[1]), h: Number(hAttr[1]) };
    }
    const vb = svgHtml.match(
        /viewBox\s*=\s*["']?\s*[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)/i,
    );
    if (vb) {
        return { w: Number(vb[1]), h: Number(vb[2]) };
    }
    return undefined;
}

/** Fonte do rótulo: reduz até caber na largura da célula (mín. 7px). */
function fitLabelFontSize(label: string, baseSize: number, cellWidthPx: number): number {
    const available = Math.max(24, cellWidthPx - 16);
    const estimated = label.length * Math.max(baseSize, 8) * 0.58;
    if (estimated <= available) {
        return baseSize;
    }
    return Math.max(7, Math.floor(baseSize * (available / estimated)));
}

function imageHtml(
    raw: string | undefined,
    preferredSize: number,
    className: string,
    columnWidth: number,
    fillCell: boolean,
): string {
    const resolved = resolveImageSource(raw);
    const maxW = Math.max(12, columnWidth - (fillCell ? 4 : 16));
    if (resolved.kind === "img") {
        const box = Math.min(Math.max(preferredSize || 22, 12), maxW);
        return (
            `<img class="${className}" src="${esc(resolved.src)}" alt="" ` +
            `width="${box}" height="${box}" ` +
            `style="width:${fillCell ? "100%" : box + "px"};height:${fillCell ? "100%" : box + "px"};max-width:100%;object-fit:contain" />`
        );
    }
    if (resolved.kind === "svg") {
        const intrinsic = parseSvgIntrinsicSize(resolved.html);
        let w = preferredSize || 22;
        let h = preferredSize || 22;
        if (intrinsic && Number.isFinite(intrinsic.w) && Number.isFinite(intrinsic.h)) {
            w = intrinsic.w;
            h = intrinsic.h;
        }
        if (fillCell) {
            return (
                `<span class="${className} dkm-svg dkm-svg-fill" style="width:100%;height:100%;max-width:100%;max-height:100%">` +
                `${resolved.html}</span>`
            );
        }
        // Respeita tamanho do SVG na medida, limitado pela largura da coluna.
        if (w > maxW) {
            const scale = maxW / w;
            w = maxW;
            h = Math.max(12, Math.round(h * scale));
        }
        return (
            `<span class="${className} dkm-svg" style="width:${w}px;height:${h}px;max-width:100%">` +
            `${resolved.html}</span>`
        );
    }
    return "";
}

function isRasterSource(raw: string | undefined): boolean {
    const v = unwrapMeasureText(raw);
    return Boolean(v && (isDataImageUri(v) || isHttpImageUrl(v)) && !v.toLowerCase().includes("<svg"));
}

function styleCategoryImage(style: ResolvedVisualStyle, category: string): string {
    const direct = style.categoryImages?.[category];
    if (direct) {
        return unwrapMeasureText(direct);
    }
    const needle = category.trim().toLowerCase();
    const key = Object.keys(style.categoryImages || {}).find(
        (k) => k.trim().toLowerCase() === needle,
    );
    return key ? unwrapMeasureText(style.categoryImages[key]) : "";
}

function pickCategoryImageSource(
    row: MatrixRow,
    style: ResolvedVisualStyle,
    isTotal: boolean,
): string {
    const measure = unwrapMeasureText(row.iconRaw);
    const persisted = unwrapMeasureText(row.iconPersisted);
    const fromStyleMap = styleCategoryImage(style, row.category);
    const configured = unwrapMeasureText(style.grandTotalImageData);

    // Prioridade: medida SVG selecionada → legado persistido/configurado.
    if (measure) {
        return measure;
    }
    if (isTotal && configured) {
        return configured;
    }
    if (persisted) {
        return persisted;
    }
    if (fromStyleMap) {
        return fromStyleMap;
    }
    if (isRasterSource(measure)) {
        return measure;
    }
    return "";
}

function resolveCategoryDisplayMode(
    row: MatrixRow,
    style: ResolvedVisualStyle,
    isTotal: boolean,
): "text" | "image" | "both" {
    if (isTotal) {
        return style.grandTotalDisplayMode || row.displayMode || "both";
    }
    const fromStyle = style.categoryDisplayModes?.[row.category];
    if (fromStyle) {
        return fromStyle;
    }
    const needle = row.category.trim().toLowerCase();
    const key = Object.keys(style.categoryDisplayModes || {}).find(
        (k) => k.trim().toLowerCase() === needle,
    );
    if (key) {
        return style.categoryDisplayModes[key];
    }
    return row.displayMode || "text";
}

function categoryCellHtml(
    row: MatrixRow,
    style: ResolvedVisualStyle,
    isTotal: boolean,
    categoryColWidth: number,
): string {
    const iconSource = pickCategoryImageSource(row, style, isTotal);
    // Mesma regra visual das categorias: tamanho/posição de imagem + fill em modo imagem.
    const preferredSize = isTotal
        ? style.grandTotalImageSize || style.imageSize
        : style.imageSize;
    const mode = resolveCategoryDisplayMode(row, style, isTotal);
    const fillCell = mode === "image";
    const icon = imageHtml(iconSource, preferredSize, "dkm-icon", categoryColWidth, fillCell);

    const label = isTotal
        ? style.grandTotalLabel || row.displayTitle || "Total Geral"
        : row.displayTitle || row.category;

    const showText = mode === "text" || mode === "both";
    const showImage = (mode === "image" || mode === "both") && Boolean(icon);
    // Texto e imagem: SVG à esquerda do texto (placement "above" só quando ambos).
    const place = mode === "both" ? style.imagePlacement : "left";
    const tip = !isTotal && style.tooltipEnabled ? tipAttr(label, row) : "";
    const tipClass = tip ? " dkm-tip" : "";
    const fillClass = fillCell && showImage && !showText ? " dkm-cat-image-only" : "";

    const textHtml = showText ? `<span class="dkm-cat-text">${esc(label)}</span>` : "";
    const inner = `${showImage ? icon : ""}${textHtml}`;

    return `<div class="dkm-cat${tipClass}${fillClass}${place === "above" ? " dkm-cat-above" : ""}"${tip}>${inner}</div>`;
}

/**
 * Fragmento CSS de tipografia: emite apenas o que foi definido,
 * preservando herança (ex.: negrito da linha de Total Geral via CSS).
 */
function textStyleCss(
    family?: string,
    italic?: boolean,
    underline?: boolean,
    weight?: string,
): string {
    return (
        (family ? `font-family:${esc(family)};` : "") +
        (weight ? `font-weight:${weight};` : "") +
        (italic ? "font-style:italic;" : "") +
        (underline ? "text-decoration:underline;" : "")
    );
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

function kpiCellHtml(
    cell: KpiCellData,
    col: KpiColumnConfig,
    style: ResolvedVisualStyle,
    cellWidthPx: number,
): string {
    const layout = resolveLayout(cell, col);
    const primarySize = col.primaryFontSize ?? style.valueFontSize ?? Math.max(style.fontSize + 2, 14);
    const compSize = col.complementFontSize ?? Math.max((style.valueFontSize || style.fontSize) - 3, 10);
    const baseLabelSize = col.labelFontSize ?? Math.max(style.fontSize - 2, 9);
    const primaryColor = cell.primaryColor ?? col.primaryColor ?? style.valueFontColor ?? style.fontColor;
    const fallbackCompColor = col.complementColor ?? "#4A4A4A";
    const labelColor = col.labelColor ?? "#6B6B6B";
    const bg = cell.backgroundColor ?? col.backgroundColor ?? "transparent";
    const pad = col.cellPadding;
    const align = style.valueAlignment || "left";
    const bw = Math.max(0, style.valueBorderWidth || 0);
    const bc = style.valueBorderColor || "#D0D0D0";
    const br = Math.max(0, style.valueBorderRadius || 0);
    const hasLeft = Boolean(style.valueBorderLeft);
    const hasRight = Boolean(style.valueBorderRight);
    const hasTop = Boolean(style.valueBorderTop);
    const hasBottom = Boolean(style.valueBorderBottom);
    const anyBorder = hasLeft || hasRight || hasTop || hasBottom;
    // Espaço entre borda e valor (padrão 2px, ajustável em Valores).
    const borderPad = Math.max(0, style.valueBorderPadding ?? 2);
    const contentPad = anyBorder ? borderPad : pad;
    const vHeightMode = style.valueVerticalBorderHeight || "full";
    // Bordas L/R "completas" no container; content/custom usam outro mecanismo.
    const verticalOnShell = vHeightMode === "full";
    const outerBorderCss =
        `border-style:solid;` +
        `border-color:${bc};` +
        `border-left-width:${verticalOnShell && hasLeft ? bw : 0}px;` +
        `border-right-width:${verticalOnShell && hasRight ? bw : 0}px;` +
        `border-top-width:${hasTop ? bw : 0}px;` +
        `border-bottom-width:${hasBottom ? bw : 0}px;` +
        `border-radius:${br}px;`;
    const frameBorderCss =
        `border-style:solid;` +
        `border-color:${bc};` +
        `border-left-width:${hasLeft ? bw : 0}px;` +
        `border-right-width:${hasRight ? bw : 0}px;` +
        `border-top-width:0;` +
        `border-bottom-width:0;` +
        `border-radius:${br}px;` +
        `padding:${borderPad}px;`;

    // Cada complemento ocupa uma fração da largura do indicador
    // (ex.: célula 160px com 2 complementos → 80px cada).
    const visibleComps = cell.complements.filter((c) => c.value.text || c.label);
    const slotWidth = complementSlotWidth(cellWidthPx, visibleComps.length, contentPad, layout);
    const slotCss =
        layout === "horizontal" && visibleComps.length > 1
            ? `flex:0 0 ${slotWidth}px;width:${slotWidth}px;max-width:${slotWidth}px;`
            : `width:100%;max-width:100%;`;

    const comps = visibleComps
        .map((c) => {
            const fontColor = c.fontColor ?? fallbackCompColor;
            // Tipografia do complemento: só emite o que o usuário definiu —
            // undefined herda o padrão (ex.: bold do Total Geral via CSS).
            const compTypo = textStyleCss(
                c.fontFamily || style.valueFontFamily || "",
                c.italic,
                c.underline,
                c.bold === undefined ? "" : c.bold ? "700" : "400",
            );
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
            const labelSize = fitLabelFontSize(c.label || c.displayName, baseLabelSize, slotWidth);
            const valueSize = fitLabelFontSize(c.value.text || "", c.fontSize ?? compSize, slotWidth);
            return (
                `<div class="dkm-comp" style="${back}${slotCss}">` +
                `<span class="dkm-comp-label" style="font-size:${labelSize}px;color:${labelColor}">${esc(c.label || c.displayName)}</span>` +
                `<span class="dkm-comp-value-wrap">` +
                bar +
                `<span class="dkm-comp-value" style="font-size:${valueSize}px;color:${fontColor};${compTypo}">${icon}${valueInner}</span>` +
                `</span></div>`
            );
        })
        .join("");

    // Tipografia do valor principal: override por KPI > seção Valores.
    const primaryWeight =
        col.primaryBold === undefined
            ? style.valueFontWeight || "700"
            : col.primaryBold
              ? "700"
              : "400";
    const primaryTypo = textStyleCss(
        col.primaryFontFamily || style.valueFontFamily || "",
        col.primaryItalic ?? style.valueItalic,
        col.primaryUnderline ?? style.valueUnderline,
        primaryWeight,
    );
    const primary = cell.primary.text
        ? `<div class="dkm-primary" style="font-size:${primarySize}px;color:${primaryColor};${primaryTypo}">${esc(cell.primary.text)}</div>`
        : `<div class="dkm-primary dkm-blank">—</div>`;

    const bodyHtml = primary + (comps ? `<div class="dkm-comps">${comps}</div>` : "");
    const alignItems =
        align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
    // No modo "content", o espaçamento fica no frame (junto às bordas L/R).
    const shellPad =
        vHeightMode === "content" && (hasLeft || hasRight) ? Math.max(pad, 0) : contentPad;
    const shellBase =
        `background:${bg};padding:${shellPad}px;text-align:${align};` +
        `align-items:${alignItems};${outerBorderCss}`;

    // Personalizada: barras absolutas centralizadas (não afetam layout do valor).
    let customBars = "";
    if (vHeightMode === "custom" && (hasLeft || hasRight) && bw > 0) {
        const h = Math.max(1, style.valueVerticalBorderCustomHeight || 24);
        const barStyle = `height:${h}px;width:${bw}px;background:${bc};`;
        if (hasLeft) {
            customBars += `<span class="dkm-vborder dkm-vborder-l" style="${barStyle}" aria-hidden="true"></span>`;
        }
        if (hasRight) {
            customBars += `<span class="dkm-vborder dkm-vborder-r" style="${barStyle}" aria-hidden="true"></span>`;
        }
    }

    // Somente área do valor: frame interno com L/R, altura = conteúdo, centralizado na célula.
    if (vHeightMode === "content" && (hasLeft || hasRight)) {
        return (
            `<div class="dkm-kpi dkm-kpi-vcontent dkm-layout-${layout}" style="${shellBase}">` +
            `<div class="dkm-kpi-frame" style="${frameBorderCss}align-items:${alignItems}">` +
            bodyHtml +
            `</div></div>`
        );
    }

    return (
        `<div class="dkm-kpi dkm-layout-${layout}" style="position:relative;${shellBase}">` +
        customBars +
        bodyHtml +
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
    colWidthsPx: number[],
): string {
    const isTotal = row.isTotal;
    const height = isTotal ? style.grandTotalRowHeight : style.rowHeight;
    const bg = rowBackground(style, index, isTotal);
    const fontSize = isTotal ? style.grandTotalFontSize : style.categoryFontSize;
    const fontColor = isTotal ? style.grandTotalFontColor : style.categoryFontColor;
    const fontWeight = isTotal ? style.grandTotalFontWeight || "700" : style.categoryFontWeight;
    const catTypo = isTotal
        ? textStyleCss(style.grandTotalFontFamily, style.grandTotalItalic, style.grandTotalUnderline)
        : textStyleCss(style.categoryFontFamily, style.categoryItalic, style.categoryUnderline);
    const align = isTotal ? style.grandTotalAlignment : style.categoryAlignment;
    const rowRadius = style.rowBorderRadius;
    const colRadius = style.columnBorderRadius;
    const catW = colWidthsPx[0] || style.categoryWidth;

    // Só no Total: .dkm-row usa display:contents e ignora min-height do wrapper —
    // a altura tem de ir para a célula, senão o valor do complemento é cortado.
    const totalCellMinH = isTotal ? `min-height:${height}px;` : "";
    const cells = columns
        .map((col, i) => {
            const cell = row.cells[i] ?? {
                queryName: col.queryName,
                primary: { raw: null, text: "" },
                complements: [],
                layout: col.layout,
            };
            const isLast = i === columns.length - 1;
            const cellW = colWidthsPx[i + 1] || style.columnWidth || 140;
            return (
                `<div class="dkm-cell dkm-kpi-cell${isLast ? " dkm-cell-last" : ""}"${totalCellMinH ? ` style="${totalCellMinH}"` : ""}>` +
                kpiCellHtml(cell, col, style, cellW) +
                `</div>`
            );
        })
        .join("");

    return (
        `<div class="dkm-row${isTotal ? " dkm-row-total" : ""}" style="--row-bg:${bg};--row-border-color:${style.rowBorderColor};--row-border-width:${style.rowBorderWidth}px;--row-radius:${rowRadius}px;--col-border-color:${style.columnBorderColor};--col-border-width:${style.columnBorderWidth}px;--col-radius:${colRadius}px;--col-gap:${style.columnGap}px;${isTotal ? `--row-min-height:${height}px;` : ""}min-height:${height}px;margin-bottom:${style.rowGap}px">` +
        `<div class="dkm-cell dkm-cat-cell" style="${totalCellMinH}font-size:${fontSize}px;color:${fontColor};font-weight:${fontWeight};${catTypo}text-align:${align}">${categoryCellHtml(row, style, isTotal, catW)}</div>` +
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
    const headTypo = textStyleCss(
        style.headerFontFamily,
        style.headerItalic,
        style.headerUnderline,
    );
    return (
        `<div class="dkm-row dkm-header" style="background:${style.headerBackground};font-size:${style.headerFontSize}px;font-weight:${style.headerFontWeight};${headTypo}color:${style.headerFontColor}">` +
        `<div class="dkm-cell dkm-cat-cell dkm-head-cell"></div>` +
        heads +
        `</div>`
    );
}

export function buildMatrixHtml(view: VisualViewModel, style: ResolvedVisualStyle): string {
    if (view.emptyMessage && !view.columns.length) {
        return `<div class="dkm-empty">${esc(view.emptyMessage)}</div>`;
    }

    const templateColumns = resolveGridTemplateColumns(view, style);
    const colWidthsPx = templateColumns.split(" ").map((t) => Number.parseInt(t, 10) || 0);
    const catWidthPx = colWidthsPx[0] || style.categoryWidth;

    const bodyRows = view.rows
        .map((row, i) => renderRow(row, view.columns, style, i, colWidthsPx))
        .join("");
    const total =
        style.grandTotalShow && view.totalRow
            ? renderRow(view.totalRow, view.columns, style, -1, colWidthsPx)
            : "";

    // Cabeçalho + Total Geral ficam em bloco sticky no topo (sempre visíveis).
    return (
        `<div class="dkm-root" style="font-family:${esc(style.fontFamily)},Segoe UI,Arial,sans-serif;background:${style.background};color:${style.fontColor};font-size:${style.fontSize}px;--cat-width:${catWidthPx}px;--cat-border-width:${style.categoryShowRightBorder ? Math.max(style.columnBorderWidth || 1, 1) : 0}px;--cat-border-color:${style.columnBorderColor};--grid-cols:${templateColumns};--header-bg:${style.headerBackground};--total-bg:${style.grandTotalBackground};--col-bg:${style.columnBackground};--col-border-color:${style.columnBorderColor};--col-border-width:${style.columnBorderWidth}px;--col-radius:${style.columnBorderRadius}px;--col-gap:${style.columnGap}px;--row-border-color:${style.rowBorderColor};--row-border-width:${style.rowBorderWidth}px;--row-radius:${style.rowBorderRadius}px">` +
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
