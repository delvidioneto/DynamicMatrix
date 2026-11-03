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

export function resolveImageSource(raw: string | undefined): ResolvedImage {
    if (!raw?.trim()) {
        return { kind: "none" };
    }
    const value = raw.trim();

    if (value.toLowerCase().includes("<svg")) {
        const html = sanitizeSvg(value);
        return html ? { kind: "svg", html } : { kind: "none" };
    }

    if (isDataImageUri(value)) {
        if (value.toLowerCase().startsWith("data:image/svg+xml")) {
            try {
                const comma = value.indexOf(",");
                const payload = value.slice(comma + 1);
                const decoded = value.includes(";base64,")
                    ? atob(payload)
                    : decodeURIComponent(payload);
                const html = sanitizeSvg(decoded);
                return html ? { kind: "svg", html } : { kind: "none" };
            } catch {
                return { kind: "none" };
            }
        }
        return { kind: "img", src: value };
    }

    if (isHttpImageUrl(value) || value.startsWith("/")) {
        return { kind: "img", src: value };
    }

    return { kind: "none" };
}

export function validatePersistedImage(dataUri: string): { ok: boolean; reason?: string } {
    if (!dataUri?.trim()) {
        return { ok: true };
    }
    if (!(isDataImageUri(dataUri) || dataUri.trim().toLowerCase().includes("<svg"))) {
        return { ok: false, reason: "Use PNG/SVG data URI ou marcação SVG." };
    }
    const bytes = estimateDataUriBytes(dataUri);
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
    next[category] = imageData.trim();
    return next;
}
