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

export function errorSummary(error: unknown): ErrorSummary {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: errorMessage(error),
            code: errorField(error, "code"),
            status: errorField(error, "status"),
            stackFirstLine: sanitizeLogString(error.stack?.split("\n")[0]),
            cause:
                "cause" in error && error.cause
                    ? errorSummary(error.cause)
                    : undefined,
        };
    }
    return {
        message: errorMessage(error),
    };
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

type ErrorSummary = {
    name?: string;
    message: string;
    code?: string;
    status?: string;
    stackFirstLine?: string;
    cause?: ErrorSummary;
};

function errorField(error: Error, field: string): string | undefined {
    const value = (error as unknown as Record<string, unknown>)[field];
    if (value === undefined || value === null) {
        return undefined;
    }
    return sanitizeLogString(String(value));
}
