const SENSITIVE_LOG_FIELDS = [
    "access_token",
    "auth_token",
    "client_assertion",
    "client_secret",
    "code",
    "ct0",
    "id_token",
    "refresh_token",
    "request_uri",
    "state",
    "token",
];

const SENSITIVE_LOG_FIELD_PATTERN = SENSITIVE_LOG_FIELDS.join("|");

export function errorMessage(error: unknown): string {
    if (error instanceof Error) {
        return sanitizeLogString(error.message) ?? "";
    }
    if (typeof error === "string") {
        return sanitizeLogString(error) ?? "";
    }
    try {
        return sanitizeLogString(JSON.stringify(error)) ?? "";
    } catch {
        return sanitizeLogString(String(error)) ?? "";
    }
}

export function sanitizeLogString(
    value: string | null | undefined
): string | undefined {
    const queryParamPattern = new RegExp(
        `([?&](?:${SENSITIVE_LOG_FIELD_PATTERN})=)[^&\\s]+`,
        "gi"
    );
    const keyValuePattern = new RegExp(
        `\\b(${SENSITIVE_LOG_FIELD_PATTERN})=\\S+`,
        "gi"
    );
    return value
        ?.replace(queryParamPattern, "$1[redacted]")
        .replace(keyValuePattern, "$1=[redacted]");
}
