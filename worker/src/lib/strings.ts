export function truncate(
    s: string,
    {length = 100, omission = "…"}: TruncateOptions = {}
): string {
    // Avoid splitting surrogate pairs when truncating non-BMP characters.
    const chars = Array.from(s);
    return chars.length < length
        ? s
        : `${chars.slice(0, length).join("")}${omission}`;
}

type TruncateOptions = {
    length?: number;
    omission?: string;
};
