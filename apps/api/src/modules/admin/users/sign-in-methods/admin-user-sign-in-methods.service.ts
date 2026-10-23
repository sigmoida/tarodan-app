import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  isSignInProvider,
  REAUTH_METHODS,
  SIGN_IN_METHOD_EVENT_FLOWS,
  SIGN_IN_METHOD_EVENT_SOURCES,
  SIGN_IN_METHOD_EVENT_TYPES,
  type AdminSignInMethodEvent,
  type AdminSignInMethodEventList,
  type SignInMethods,
} from "@tarodan/types";
import { PrismaService } from "../../../../prisma";
import { paginate, type ListQuery } from "../../../../common/list";
import { i18nMessage } from "../../../i18n";
import {
  SIGN_IN_METHODS_SELECT,
  toSignInMethods,
} from "../../../auth/sign-in-methods/sign-in-methods.mapper";

/**
 * The only columns read for the history. The IP address, the user agent, the
 * e-mail and the location are never loaded, so they cannot leak into the
 * answer (decision: no IP in the admin history for now; adding it is a KVKK
 * review item).
 */
export const SIGN_IN_METHOD_EVENT_SELECT = {
  id: true,
  eventType: true,
  createdAt: true,
  details: true,
} as const satisfies Prisma.SecurityLogSelect;

export interface SignInMethodEventRow {
  id: string;
  eventType: string;
  createdAt: Date;
  details: Prisma.JsonValue;
}

const SOURCES = Object.values(SIGN_IN_METHOD_EVENT_SOURCES);
const FLOWS = Object.values(SIGN_IN_METHOD_EVENT_FLOWS);

/** `value` when it is one of `allowed`, else null. */
function oneOf<T extends string>(
  allowed: readonly T[],
  value: unknown,
): T | null {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function detailsRecord(details: Prisma.JsonValue): Record<string, unknown> {
  return details !== null &&
    typeof details === "object" &&
    !Array.isArray(details)
    ? details
    : {};
}

/**
 * One history row. `details` is an allow-list on keys **and** values: only
 * `provider`, `source`, `method` and `flow`, each only with a value of its
 * known set, so nothing else a writer puts into `details` (today or later)
 * reaches the admin. Null for an event type outside the sign-in method events
 * (the query never loads one).
 */
export function toAdminSignInMethodEvent(
  row: SignInMethodEventRow,
): AdminSignInMethodEvent | null {
  const eventType = oneOf(SIGN_IN_METHOD_EVENT_TYPES, row.eventType);
  if (!eventType) return null;
  const details = detailsRecord(row.details);
  return {
    id: row.id,
    eventType,
    occurredAt: row.createdAt.toISOString(),
    provider: isSignInProvider(details.provider) ? details.provider : null,
    source: oneOf(SOURCES, details.source),
    method: oneOf(REAUTH_METHODS, details.method),
    flow: oneOf(FLOWS, details.flow),
  };
}

/**
 * Admin user detail: a user's sign-in methods and the history of their
 * sign-in method events. Read-only admin read models. The methods use the
 * auth read model's select and mapper (`sign-in-methods.mapper.ts`), so admin
 * and the user see the same view; the auth service with its credential writes
 * is deliberately not injected here.
 */
@Injectable()
export class AdminUserSignInMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `hasPassword` (never the hash) and the linked providers; 404 for an unknown user. */
  async getSignInMethods(userId: string): Promise<SignInMethods> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SIGN_IN_METHODS_SELECT,
    });
    if (!row) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }
    return toSignInMethods(row);
  }

  /**
   * Newest first, paged. Served by the (user_id, created_at) index. Only the
   * security log retention window is kept, so older events are gone.
   */
  async listEvents(
    userId: string,
    query: Pick<ListQuery, "page" | "limit">,
  ): Promise<AdminSignInMethodEventList> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }
    const page = await paginate(
      this.prisma.securityLog,
      {
        where: { userId, eventType: { in: [...SIGN_IN_METHOD_EVENT_TYPES] } },
        select: SIGN_IN_METHOD_EVENT_SELECT,
        // The id keeps the order stable for rows written in the same instant.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      query,
    );
    return {
      data: page.data.flatMap((row) => {
        const event = toAdminSignInMethodEvent(row);
        return event ? [event] : [];
      }),
      meta: page.meta,
    };
  }
}
