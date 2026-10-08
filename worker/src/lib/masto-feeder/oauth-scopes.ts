export const MASTO_FEEDER_SCOPES = [
    "read:accounts",
    "read:follows",
    "read:lists",
    "read:statuses",
    "read:search",
];

export type ScopeStatus = "ready" | "missing" | "unknown";

export type SearchPermissionCounts = {
    ready: number;
    missing: number;
    unknown: number;
};

export function appScopeStatus(scopes: string[] | undefined): ScopeStatus {
    if (!scopes) {
        return "unknown";
    }
    return MASTO_FEEDER_SCOPES.every(scope => hasScope(scopes, scope))
        ? "ready"
        : "missing";
}

export function searchScopeStatus(scopes: string[] | undefined): ScopeStatus {
    if (!scopes) {
        return "unknown";
    }
    return hasSearchScope(scopes) ? "ready" : "missing";
}

export function hasSearchScope(scopes: string[] | undefined): boolean {
    return Boolean(scopes && hasScope(scopes, "read:search"));
}

export function countSearchPermissions(
    sessions: {scopes?: string[]}[]
): SearchPermissionCounts {
    const counts: SearchPermissionCounts = {ready: 0, missing: 0, unknown: 0};
    for (const session of sessions) {
        counts[searchScopeStatus(session.scopes)]++;
    }
    return counts;
}

function hasScope(scopes: string[], scope: string): boolean {
    return scopes.includes(scope) || scopes.includes("read");
}
