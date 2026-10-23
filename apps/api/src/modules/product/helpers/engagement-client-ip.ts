import type { Request } from "express";

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * The client IP a listing view or card click is counted for (deduplication):
 * the first hop of `X-Forwarded-For`, then `X-Real-IP`, then the socket
 * address, else "unknown".
 */
export function engagementClientIp(
  req: Pick<Request, "headers"> | undefined,
  ip: string | undefined,
): string {
  return (
    firstValue(req?.headers["x-forwarded-for"])?.split(",")[0]?.trim() ||
    firstValue(req?.headers["x-real-ip"]) ||
    ip ||
    "unknown"
  );
}
