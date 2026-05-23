export const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export type FeederPrefs = {
    timeZone?: string;
};

export function resolveFeederPrefs(
    prefs: FeederPrefs | undefined
): Required<FeederPrefs> {
    return {
        timeZone: prefs?.timeZone ?? DEFAULT_TIME_ZONE,
    };
}
