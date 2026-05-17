import {WorkerKV} from "$lib/kv";
import {errorToMessage, TwitterFetcher} from "$lib/tweeter-feeder/fetcher";
import {TweeterFeederKV} from "$lib/tweeter-feeder/kv";
import type {TweeterFeederSession} from "$lib/tweeter-feeder/types";
import type {RequestHandler} from "@sveltejs/kit";

export const GET: RequestHandler = async event => {
    const tweeterKV = new TweeterFeederKV(WorkerKV.fromEvent(event));
    let sessions: TweeterFeederSession[];
    try {
        sessions = await tweeterKV.getSessions();
    } catch (e) {
        return json(
            {
                ok: false,
                error: errorToMessage(e),
            },
            500
        );
    }

    const fetcher = new TwitterFetcher(tweeterKV, sessions);
    const checks = [];
    for (let i = 0; i < sessions.length; i++) {
        checks.push(await checkSession(fetcher, sessions[i], i + 1));
    }
    const ok = checks.length > 0 && checks.every(check => check.ok);
    return json(
        {
            ok,
            checkedAtIso: new Date().toISOString(),
            sessionCount: sessions.length,
            checks,
        },
        ok ? 200 : 500
    );
};

async function checkSession(
    fetcher: TwitterFetcher,
    session: TweeterFeederSession,
    index: number
): Promise<SessionCheck> {
    const base = {
        index,
        username: session.username ?? null,
        expectedId: session.id ?? null,
    };
    if (!session.username || !session.id) {
        return {
            ...base,
            ok: false,
            error: "Session must include username and id for status checks",
        };
    }

    const startedAt = Date.now();
    try {
        const user = await fetcher.fetchUserForSession(session);
        const matchedId = user.id === session.id;
        return {
            ...base,
            ok: matchedId,
            elapsedMs: Date.now() - startedAt,
            actualId: user.id,
            matchedId,
            displayName: user.displayName,
            profileUrl: user.url,
            error: matchedId
                ? undefined
                : `Expected id ${session.id}, got ${user.id}`,
        };
    } catch (e) {
        return {
            ...base,
            ok: false,
            elapsedMs: Date.now() - startedAt,
            error: errorToMessage(e),
        };
    }
}

type SessionCheck = {
    index: number;
    username: string | null;
    expectedId: string | null;
    ok: boolean;
    elapsedMs?: number;
    actualId?: string;
    matchedId?: boolean;
    displayName?: string;
    profileUrl?: string;
    error?: string;
};

function json(value: unknown, status: number): Response {
    return new Response(`${JSON.stringify(value, null, 2)}\n`, {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
        },
    });
}
