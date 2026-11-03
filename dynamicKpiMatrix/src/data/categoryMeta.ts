"use strict";

export interface CategoryMeta {
    title?: string;
    imageUrl?: string;
    imageName?: string;
}

export type CategoryMetaMap = Record<string, CategoryMeta>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Aceita mapa novo { cat: { title, imageUrl } } ou legado { cat: "dataUri" }. */
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
                const title = typeof value.title === "string" ? value.title : result[key]?.title;
                const imageUrl =
                    typeof value.imageUrl === "string"
                        ? value.imageUrl
                        : typeof value.image === "string"
                          ? value.image
                          : result[key]?.imageUrl;
                const imageName =
                    typeof value.imageName === "string" ? value.imageName : result[key]?.imageName;
                result[key] = {
                    ...(title ? { title } : {}),
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

export function upsertCategoryMeta(
    map: CategoryMetaMap,
    category: string,
    patch: CategoryMeta,
): CategoryMetaMap {
    if (!category) {
        return { ...map };
    }
    const next = { ...map };
    const current = { ...(next[category] ?? {}) };
    if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (title) {
            current.title = title;
        } else {
            delete current.title;
        }
    }
    if (patch.imageUrl !== undefined) {
        const imageUrl = patch.imageUrl.trim();
        if (imageUrl) {
            current.imageUrl = imageUrl;
        } else {
            delete current.imageUrl;
            delete current.imageName;
        }
    }
    if (patch.imageName !== undefined) {
        if (patch.imageName.trim()) {
            current.imageName = patch.imageName.trim();
        } else {
            delete current.imageName;
        }
    }
    if (!current.title && !current.imageUrl) {
        delete next[category];
    } else {
        next[category] = current;
    }
    return next;
}

export function imageValueFromMeta(meta: CategoryMeta | undefined): { name: string; url: string; scaling: string } {
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
