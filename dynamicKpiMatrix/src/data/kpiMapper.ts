"use strict";

import powerbi from "powerbi-visuals-api";
import {
    CellElementKind,
    ComplementIconSet,
    ComplementSlot,
    defaultKpiStyle,
    KpiColumnConfig,
    MeasureRef,
} from "./viewModel";

type DataViewObjects = powerbi.DataViewObjects;

function asText(value: unknown, fallback = ""): string {
    return value == null ? fallback : String(value);
}

function asNumber(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

export function solidColor(value: unknown): string | undefined {
    const fill = value as { solid?: { color?: string } } | undefined;
    return fill?.solid?.color;
}

export function readProp<T>(
    objects: DataViewObjects | undefined,
    objectName: string,
    propertyName: string,
): T | undefined {
    const obj = objects?.[objectName] as Record<string, unknown> | undefined;
    return obj?.[propertyName] as T | undefined;
}

export function parseMappingJson(raw: string | undefined): Record<string, { complements?: string[] }> {
    if (!raw?.trim()) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw) as Record<string, { complements?: string[] }>;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

export function parseImagesJson(raw: string | undefined): Record<string, string> {
    if (!raw?.trim()) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw) as Record<string, string>;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function roleOf(column: powerbi.DataViewMetadataColumn): MeasureRef["role"] | undefined {
    const roles = column.roles ?? {};
    if (roles.kpis) return "kpis";
    if (roles.complements) return "complements";
    if (roles.categoryIcon) return "categoryIcon";
    if (roles.tooltips) return "tooltips";
    return undefined;
}

export function collectMeasures(valueSources: powerbi.DataViewMetadataColumn[] | undefined): MeasureRef[] {
    const sources = valueSources ?? [];
    const result: MeasureRef[] = [];
    sources.forEach((source, index) => {
        const role = roleOf(source);
        if (!role) {
            return;
        }
        result.push({
            queryName: source.queryName ?? source.displayName ?? `measure_${index}`,
            displayName: source.displayName ?? `Medida ${index + 1}`,
            format: source.format,
            role,
            valueSourceIndex: index,
        });
    });
    return result;
}

const NONE_COMPLEMENT = "__none__";

function normalizeComplementQueryName(raw: string): string {
    const q = raw.trim();
    if (!q || q === NONE_COMPLEMENT) {
        return "";
    }
    return q;
}

function asSlotIndex(value: unknown): 1 | 2 | 3 | 4 {
    const n = Number(value);
    if (n === 2 || n === 3 || n === 4) {
        return n;
    }
    return 1;
}

function asIconSet(value: unknown): ComplementIconSet {
    const v = asText(value, "none");
    if (v === "directional" || v === "traffic" || v === "triangles") {
        return v;
    }
    return "none";
}

function asElementKind(value: unknown): CellElementKind {
    const v = asText(value, "font");
    if (v === "background" || v === "dataBars" || v === "icons" || v === "webUrl") {
        return v;
    }
    return "font";
}

function readSlotStyle(styleObjects: DataViewObjects | undefined, i: 1 | 2 | 3 | 4) {
    return {
        fontColor: solidColor(readProp(styleObjects, "kpiStyle", `complement${i}FontColor`)),
        backColor: solidColor(readProp(styleObjects, "kpiStyle", `complement${i}BackColor`)),
        dataBars: asBool(readProp(styleObjects, "kpiStyle", `complement${i}DataBars`), false),
        dataBarColor: solidColor(readProp(styleObjects, "kpiStyle", `complement${i}DataBarColor`)),
        icons: asIconSet(readProp(styleObjects, "kpiStyle", `complement${i}Icons`)),
        webUrl: asText(readProp(styleObjects, "kpiStyle", `complement${i}WebUrl`)),
    };
}

function complementSlots(
    styleObjects: DataViewObjects | undefined,
    mappingEntry: { complements?: string[] } | undefined,
    complements: MeasureRef[],
): ComplementSlot[] {
    const byQuery = new Map(complements.map((c) => [c.queryName, c]));
    const kpiStyle = styleObjects?.kpiStyle as Record<string, unknown> | undefined;
    const hasExplicitKpiStyle = Boolean(kpiStyle);

    const fromObjects = ([1, 2, 3, 4] as const).map((i) => {
        const q = normalizeComplementQueryName(
            asText(readProp(styleObjects, "kpiStyle", `complement${i}`)),
        );
        const label = asText(readProp(styleObjects, "kpiStyle", `complement${i}Label`));
        return { slotIndex: i, queryName: q, label, ...readSlotStyle(styleObjects, i) };
    });

    const fromJson = (mappingEntry?.complements ?? [])
        .map((queryName, idx) => ({
            slotIndex: (Math.min(idx + 1, 4) as 1 | 2 | 3 | 4),
            queryName: normalizeComplementQueryName(queryName),
            label: "",
            ...readSlotStyle(undefined, (Math.min(idx + 1, 4) as 1 | 2 | 3 | 4)),
        }))
        .filter((slot) => slot.queryName);

    const source = hasExplicitKpiStyle
        ? fromObjects.filter((s) => s.queryName)
        : fromObjects.some((s) => s.queryName)
          ? fromObjects.filter((s) => s.queryName)
          : fromJson;

    const seen = new Set<string>();
    const slots: ComplementSlot[] = [];
    for (const item of source.slice(0, 4)) {
        if (seen.has(item.queryName) || !byQuery.has(item.queryName)) {
            continue;
        }
        seen.add(item.queryName);
        const measure = byQuery.get(item.queryName)!;
        slots.push({
            slotIndex: item.slotIndex,
            queryName: measure.queryName,
            displayName: measure.displayName,
            label: item.label || measure.displayName,
            format: measure.format,
            fontColor: item.fontColor,
            backColor: item.backColor,
            dataBars: item.dataBars,
            dataBarColor: item.dataBarColor,
            icons: item.icons,
            webUrl: item.webUrl,
        });
    }
    return slots;
}

export { NONE_COMPLEMENT };

export function buildKpiColumns(
    measures: MeasureRef[],
    metadataObjects: DataViewObjects | undefined,
    columnObjectsByQueryName: Map<string, DataViewObjects | undefined>,
): KpiColumnConfig[] {
    const mapping = parseMappingJson(asText(readProp(metadataObjects, "kpiMapping", "mappingJson")));
    const complements = measures.filter((m) => m.role === "complements");
    const kpis = measures.filter((m) => m.role === "kpis");

    return kpis.map((kpi) => {
        const objects = columnObjectsByQueryName.get(kpi.queryName);
        const mappingEntry = mapping[kpi.queryName];
        const title = asText(readProp(objects, "kpiStyle", "title"), kpi.displayName) || kpi.displayName;
        const layout = (asText(readProp(objects, "kpiStyle", "layout"), defaultKpiStyle.layout) ||
            defaultKpiStyle.layout) as KpiColumnConfig["layout"];
        const widthMode = (asText(readProp(objects, "kpiStyle", "widthMode"), defaultKpiStyle.widthMode) ||
            defaultKpiStyle.widthMode) as KpiColumnConfig["widthMode"];

        return {
            queryName: kpi.queryName,
            displayName: kpi.displayName,
            title,
            layout,
            complements: complementSlots(objects, mappingEntry, complements),
            editingComplementSlot: asSlotIndex(readProp(objects, "kpiStyle", "editingComplementSlot")),
            editingElementKind: asElementKind(readProp(objects, "kpiStyle", "editingElementKind")),
            widthMode,
            columnWidth: asNumber(readProp(objects, "kpiStyle", "columnWidth"), defaultKpiStyle.columnWidth),
            minWidth: asNumber(readProp(objects, "kpiStyle", "minWidth"), defaultKpiStyle.minWidth),
            maxWidth: asNumber(readProp(objects, "kpiStyle", "maxWidth"), defaultKpiStyle.maxWidth),
            primaryFontSize: asNumber(readProp(objects, "kpiStyle", "primaryFontSize"), NaN) || undefined,
            complementFontSize: asNumber(readProp(objects, "kpiStyle", "complementFontSize"), NaN) || undefined,
            labelFontSize: asNumber(readProp(objects, "kpiStyle", "labelFontSize"), NaN) || undefined,
            primaryColor: solidColor(readProp(objects, "kpiStyle", "primaryColor")),
            complementColor: solidColor(readProp(objects, "kpiStyle", "complementColor")),
            labelColor: solidColor(readProp(objects, "kpiStyle", "labelColor")),
            headerColor: solidColor(readProp(objects, "kpiStyle", "headerColor")),
            backgroundColor: solidColor(readProp(objects, "kpiStyle", "backgroundColor")),
            cellPadding: asNumber(readProp(objects, "kpiStyle", "cellPadding"), defaultKpiStyle.cellPadding),
            cfEnabled: asBool(readProp(objects, "kpiStyle", "cfEnabled"), defaultKpiStyle.cfEnabled),
            cfApplyTo: (asText(readProp(objects, "kpiStyle", "cfApplyTo"), defaultKpiStyle.cfApplyTo) ||
                defaultKpiStyle.cfApplyTo) as KpiColumnConfig["cfApplyTo"],
            cfThresholdHigh: asNumber(readProp(objects, "kpiStyle", "cfThresholdHigh"), defaultKpiStyle.cfThresholdHigh),
            cfThresholdMid: asNumber(readProp(objects, "kpiStyle", "cfThresholdMid"), defaultKpiStyle.cfThresholdMid),
            cfColorHigh: solidColor(readProp(objects, "kpiStyle", "cfColorHigh")) ?? defaultKpiStyle.cfColorHigh,
            cfColorMid: solidColor(readProp(objects, "kpiStyle", "cfColorMid")) ?? defaultKpiStyle.cfColorMid,
            cfColorLow: solidColor(readProp(objects, "kpiStyle", "cfColorLow")) ?? defaultKpiStyle.cfColorLow,
            cfAsPercent: asBool(readProp(objects, "kpiStyle", "cfAsPercent"), defaultKpiStyle.cfAsPercent),
            format: kpi.format,
            valueSourceIndex: kpi.valueSourceIndex,
        };
    });
}

export function syncMappingJson(columns: KpiColumnConfig[]): string {
    const map: Record<string, { complements: string[]; title: string; layout: string }> = {};
    for (const col of columns) {
        map[col.queryName] = {
            title: col.title,
            layout: col.layout,
            complements: col.complements.map((c) => c.queryName),
        };
    }
    return JSON.stringify(map);
}
