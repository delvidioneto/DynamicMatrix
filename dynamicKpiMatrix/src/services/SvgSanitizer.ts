"use strict";

const FORBIDDEN_TAGS = /<\/?(?:script|iframe|object|embed|foreignObject|link|meta|base)[^>]*>/gi;
const EVENT_ATTRS = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_URLS = /(?:href|xlink:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|\s*javascript:[^\s>]+)/gi;
const EXTERNAL_HTTP = /(?:href|xlink:href|src)\s*=\s*(?:"https?:\/\/[^"]*"|'https?:\/\/[^']*')/gi;

export function sanitizeSvg(raw: string): string {
    if (!raw) {
        return "";
    }
    let out = raw.trim();
    if (!out.toLowerCase().includes("<svg")) {
        return "";
    }
    out = out.replace(FORBIDDEN_TAGS, "");
    out = out.replace(EVENT_ATTRS, "");
    out = out.replace(DANGEROUS_URLS, "");
    out = out.replace(EXTERNAL_HTTP, "");
    return out;
}

export function isDataImageUri(value: string): boolean {
    return /^data:image\/(png|svg\+xml|jpeg|jpg|webp);base64,/i.test(value.trim());
}

export function isHttpImageUrl(value: string): boolean {
    return /^https?:\/\/.+/i.test(value.trim());
}

export function estimateDataUriBytes(dataUri: string): number {
    const comma = dataUri.indexOf(",");
    if (comma < 0) {
        return dataUri.length;
    }
    const b64 = dataUri.slice(comma + 1);
    return Math.floor((b64.length * 3) / 4);
}

/** Limite prático para persistência em objects do visual (~200KB). */
export const MAX_PERSISTED_IMAGE_BYTES = 200 * 1024;
