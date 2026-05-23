import type {FeederPrefs} from "$lib/feeder/prefs";

export type SkyFeederSession = {
    sessionId: string;
    did: string;
    handle: string;
    feedId: string;
    prefs?: SkyFeederPrefs;
};

export type SkyFeederPrefs = FeederPrefs;
