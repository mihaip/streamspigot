import type {FeedOutputType} from "$lib/status/feed";
import type {Status} from "$lib/status";

export const MAX_SEARCH_QUERY_LENGTH = 1000;

export function searchQueryError(query: string): string | null {
    if (!query.trim()) {
        return "Enter a search query.";
    }
    if (query.length > MAX_SEARCH_QUERY_LENGTH) {
        return `Search queries can be at most ${MAX_SEARCH_QUERY_LENGTH} characters.`;
    }
    return null;
}

export function searchFeedUrl(
    baseUrl: string,
    query: string,
    output?: FeedOutputType
): string {
    const url = new URL(baseUrl);
    url.searchParams.set("q", query);
    if (output && output !== "atom") {
        url.searchParams.set("output", output);
    }
    return url.toString();
}

export function sortSearchStatuses(statuses: Status[]): Status[] {
    const unique = new Map<string, Status>();
    for (const status of statuses) {
        if (!unique.has(status.id)) {
            unique.set(status.id, status);
        }
    }
    return [...unique.values()].sort(
        (a, b) =>
            Date.parse(b.createdAtIso) - Date.parse(a.createdAtIso) ||
            a.id.localeCompare(b.id)
    );
}
