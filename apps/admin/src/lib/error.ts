/**
 * Extracts the backend error message used by NestJS/axios responses.
 * Validation failures can contain multiple messages; keep all of them visible.
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;

  if (typeof message === "string" && message.trim()) return message;

  if (Array.isArray(message)) {
    const messages = message.filter(
      (item): item is string =>
        typeof item === "string" && Boolean(item.trim()),
    );
    if (messages.length > 0) return messages.join(" ");
  }

  return fallback;
}
