"use strict";

import type { DisplayMode } from "./viewModel";

export interface CategoryMeta {
    title?: string;
    displayMode?: DisplayMode;
    /** queryName da medida SVG no well categoryIcon. */
    iconQueryName?: string;
    /** Legado (upload/data URI) — não usado no fluxo novo. */
    imageUrl?: string;
    imageName?: string;
}

export type CategoryMetaMap = Record<string, CategoryMeta>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asDisplayMode(value: unknown): DisplayMode | undefined {
    const raw = String(value ?? "").trim();
    if (raw === "text" || raw === "image" || raw === "both") {
        return raw;
    }
    return undefined;
}

/** Aceita mapa novo { cat: { title, displayMode, iconQueryName } } ou legado { cat: "dataUri" }. */
export function parseCategoryMetaMap(...rawSources: Array<string | undefined>): CategoryMetaMap {
    const result: CategoryMetaMap = {};
    for (const raw of rawSources) {
        if (!raw?.trim()) {
            continue;
        }
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (!isRecord(parsed)) {
                continue;
            }
            for (const [key, value] of Object.entries(parsed)) {
                if (typeof value === "string") {
                    result[key] = { ...(result[key] ?? {}), imageUrl: value };
                    continue;
                }
                if (!isRecord(value)) {
                    continue;
                }
                const prev = result[key] ?? {};
                const title = typeof value.title === "string" ? value.title : prev.title;
                const displayMode = asDisplayMode(value.displayMode) ?? prev.displayMode;
                const iconQueryName =
                    typeof value.iconQueryName === "string"
                        ? value.iconQueryName
                        : typeof value.iconMeasure === "string"
                          ? value.iconMeasure
                          : prev.iconQueryName;
                const imageUrl =
                    typeof value.imageUrl === "string"
                        ? value.imageUrl
                        : typeof value.image === "string"
                          ? value.image
                          : prev.imageUrl;
                const imageName =
                    typeof value.imageName === "string" ? value.imageName : prev.imageName;
                result[key] = {
                    ...(title ? { title } : {}),
                    ...(displayMode ? { displayMode } : {}),
                    ...(iconQueryName ? { iconQueryName } : {}),
                    ...(imageUrl ? { imageUrl } : {}),
                    ...(imageName ? { imageName } : {}),
                };
            }
        } catch {
            // ignore invalid json
        }
    }
    return result;
}

export function serializeCategoryMetaMap(map: CategoryMetaMap): string {
    return JSON.stringify(map ?? {});
}

/** Busca meta com match exato ou trim/case-insensitive. */
export function findCategoryMeta(map: CategoryMetaMap, category: string): CategoryMeta | undefined {
    if (!category) {
        return undefined;
    }
    if (map[category]) {
        return map[category];
    }
    const needle = category.trim().toLowerCase();
    const key = Object.keys(map).find((k) => k.trim().toLowerCase() === needle);
    return key ? map[key] : undefined;
}

export function upsertCategoryMeta(
    map: CategoryMetaMap,
    category: string,
    patch: CategoryMeta,
    options?: { clearImage?: boolean },
): CategoryMetaMap {
    if (!category) {
        return { ...map };
    }
    const next = { ...map };
    const existingKey =
        Object.keys(next).find((k) => k.trim().toLowerCase() === category.trim().toLowerCase()) ||
        category;
    const current = { ...(next[existingKey] ?? {}) };

    if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (title) {
            current.title = title;
        } else {
            delete current.title;
        }
    }
    if (patch.displayMode !== undefined) {
        current.displayMode = patch.displayMode;
    }
    if (patch.iconQueryName !== undefined) {
        const q = patch.iconQueryName.trim();
        if (q) {
            current.iconQueryName = q;
        } else {
            delete current.iconQueryName;
        }
    }
    if (patch.imageUrl !== undefined) {
        const imageUrl = patch.imageUrl.trim();
        if (imageUrl) {
            current.imageUrl = imageUrl;
        } else if (options?.clearImage) {
            delete current.imageUrl;
            delete current.imageName;
        }
        // Se imageUrl veio vazio sem clearImage, preserva a imagem já salva.
    }
    if (patch.imageName !== undefined && patch.imageName.trim()) {
        current.imageName = patch.imageName.trim();
    }

    const hasContent = Boolean(
        current.title || current.displayMode || current.iconQueryName || current.imageUrl,
    );
    if (!hasContent) {
        delete next[existingKey];
    } else {
        // Normaliza chave para o nome atual da categoria.
        if (existingKey !== category && next[existingKey]) {
            delete next[existingKey];
        }
        next[category] = current;
    }
    return next;
}

export function imageValueFromMeta(meta: CategoryMeta | undefined): {
    name: string;
    url: string;
    scaling: string;
} {
    return {
        name: meta?.imageName || "image",
        url: meta?.imageUrl || "",
        scaling: "normal",
    };
}

export function metaFromImageValue(
    value: { name?: string; url?: string; scaling?: string } | string | undefined | null,
): CategoryMeta {
    if (!value) {
        return { imageUrl: "" };
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("{")) {
            try {
                const parsed = JSON.parse(trimmed) as { name?: string; url?: string };
                return {
                    imageUrl: parsed.url || "",
                    imageName: parsed.name || "",
                };
            } catch {
                return { imageUrl: trimmed };
            }
        }
        return { imageUrl: trimmed };
    }
    return {
        imageUrl: value.url || "",
        imageName: value.name || "",
    };
}

/** Une categorias da vista com chaves já persistidas (fora do filtro). */
export function mergeCategoryNames(
    viewNames: string[],
    map: CategoryMetaMap,
    preferredSelected?: string,
): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    const push = (name: string) => {
        const key = name.trim();
        if (!key || seen.has(key.toLowerCase())) {
            return;
        }
        seen.add(key.toLowerCase());
        result.push(key);
    };
    if (preferredSelected) {
        push(preferredSelected);
    }
    for (const name of viewNames) {
        push(name);
    }
    for (const name of Object.keys(map)) {
        push(name);
    }
    return result;
}
