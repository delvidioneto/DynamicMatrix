"use strict";

import {
    estimateDataUriBytes,
    isDataImageUri,
    isHttpImageUrl,
    MAX_PERSISTED_IMAGE_BYTES,
    sanitizeSvg,
} from "./SvgSanitizer";

export type ResolvedImage =
    | { kind: "img"; src: string }
    | { kind: "svg"; html: string }
    | { kind: "none" };

/** Remove aspas externas típicas de medidas DAX (`"<svg…>"`). */
export function unwrapMeasureText(raw: string | undefined): string {
    if (!raw) {
        return "";
    }
    let s = raw.trim();
    for (let i = 0; i < 2; i++) {
        if (
            (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
            (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
        ) {
            s = s.slice(1, -1).trim();
            continue;
        }
        break;
    }
    return s;
}

export function resolveImageSource(raw: string | undefined): ResolvedImage {
    const value = unwrapMeasureText(raw);
    if (!value) {
        return { kind: "none" };
    }

    // SVG inline (com ou sem wrapper de aspas já removido).
    if (value.toLowerCase().includes("<svg")) {
        const html = sanitizeSvg(value);
        return html ? { kind: "svg", html } : { kind: "none" };
    }

    if (isDataImageUri(value)) {
        if (value.toLowerCase().includes("image/svg+xml")) {
            try {
                const comma = value.indexOf(",");
                const payload = value.slice(comma + 1);
                const decoded = value.toLowerCase().includes(";base64,")
                    ? atob(payload)
                    : decodeURIComponent(payload);
                const html = sanitizeSvg(decoded);
                return html ? { kind: "svg", html } : { kind: "none" };
            } catch {
                // Se falhar o decode, ainda tenta como <img src="data:...">.
                return { kind: "img", src: value };
            }
        }
        return { kind: "img", src: value };
    }

    if (isHttpImageUrl(value) || value.startsWith("/") || value.startsWith("blob:")) {
        return { kind: "img", src: value };
    }

    return { kind: "none" };
}

export function validatePersistedImage(dataUri: string): { ok: boolean; reason?: string } {
    if (!dataUri?.trim()) {
        return { ok: true };
    }
    const value = unwrapMeasureText(dataUri);
    if (!(isDataImageUri(value) || value.toLowerCase().includes("<svg"))) {
        return { ok: false, reason: "Use PNG/SVG data URI ou marcação SVG." };
    }
    const bytes = estimateDataUriBytes(value);
    if (bytes > MAX_PERSISTED_IMAGE_BYTES) {
        return {
            ok: false,
            reason: `Imagem acima do limite recomendado (${MAX_PERSISTED_IMAGE_BYTES} bytes). Reduza o arquivo.`,
        };
    }
    return { ok: true };
}

export function upsertCategoryImage(
    images: Record<string, string>,
    category: string,
    imageData: string,
): Record<string, string> {
    const next = { ...images };
    if (!category) {
        return next;
    }
    if (!imageData?.trim()) {
        delete next[category];
        return next;
    }
    const check = validatePersistedImage(imageData);
    if (!check.ok) {
        return next;
    }
    next[category] = unwrapMeasureText(imageData);
    return next;
}

/** Converte o valor bruto do dataView (texto/JSON/ImageValue) em ImageValue. */
export function coerceImageValue(
    raw: unknown,
): { name: string; url: string; scaling: string } {
    const empty = { name: "", url: "", scaling: "normal" };
    if (raw == null || raw === "") {
        return empty;
    }
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.startsWith("{")) {
            try {
                const parsed = JSON.parse(trimmed) as { name?: string; url?: string; scaling?: string };
                return {
                    name: parsed.name || "image",
                    url: unwrapMeasureText(parsed.url || ""),
                    scaling: parsed.scaling || "normal",
                };
            } catch {
                return { name: "image", url: unwrapMeasureText(trimmed), scaling: "normal" };
            }
        }
        return { name: "image", url: unwrapMeasureText(trimmed), scaling: "normal" };
    }
    if (typeof raw === "object") {
        const o = raw as { name?: string; url?: string; scaling?: string };
        if (typeof o.url === "string" || typeof o.name === "string") {
            return {
                name: o.name || "image",
                url: unwrapMeasureText(o.url || ""),
                scaling: o.scaling || "normal",
            };
        }
    }
    return empty;
}

export function imageValueToStorage(value: { name?: string; url?: string; scaling?: string } | string | undefined): string {
    const coerced = coerceImageValue(value);
    if (!coerced.url) {
        return "";
    }
    // Persistir só a URL/data URI (texto) — compatível com capabilities type:text.
    return coerced.url;
}
