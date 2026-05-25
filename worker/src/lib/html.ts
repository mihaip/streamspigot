export function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeHtmlAttribute(s: string): string {
    return escapeHtml(s).replace(/"/g, "&quot;");
}
