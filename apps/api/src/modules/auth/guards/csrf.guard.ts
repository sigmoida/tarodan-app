import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { timingSafeEqual } from "crypto";
import { Request } from "express";
import {
  COOKIE_NAMES,
  CSRF_COOKIE_NAME,
  readCookie,
} from "../utils/auth-cookies";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const AUTH_COOKIE_NAMES = [
  COOKIE_NAMES.user.access,
  COOKIE_NAMES.user.refresh,
  COOKIE_NAMES.admin.access,
  COOKIE_NAMES.admin.refresh,
];

function tokensMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

/**
 * Protects the API's cookie-authentication fallback with a double-submit token.
 * Bearer-only requests, including native clients and server-side BFF calls, do
 * not carry API auth cookies and remain outside this browser-specific control.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) return true;

    const usesAuthCookie = readCookie(req, AUTH_COOKIE_NAMES) !== null;
    if (!usesAuthCookie) return true;

    const cookieToken = readCookie(req, [CSRF_COOKIE_NAME]);
    const rawHeader = req.headers["x-csrf-token"];
    const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (
      !cookieToken ||
      typeof headerToken !== "string" ||
      !tokensMatch(cookieToken, headerToken)
    ) {
      throw new ForbiddenException("Invalid CSRF token");
    }

    return true;
  }
}
