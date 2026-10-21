import {
  SIGN_IN_METHOD_EVENTS,
  SIGN_IN_METHOD_EVENT_SOURCES,
  SIGN_IN_PROVIDER_NAMES,
  type AdminSignInMethodEvent,
  type ReauthMethod,
  type SignInMethodEventSource,
  type SignInMethodEventType,
} from "@tarodan/types";
import type { Translate } from "@/lib/statusLabels";

/**
 * The admin labels of the sign-in method events and their details: one place
 * for the system logs (security tab) and the user detail history. Keyed by
 * the shared names (`@tarodan/types`), so a new event, source or method
 * without a label fails the typecheck.
 */

export const signInMethodEventLabels = (
  t: Translate,
): Record<SignInMethodEventType, string> => ({
  [SIGN_IN_METHOD_EVENTS.socialLinked]: t(
    "admin.system.logs.events.socialLinked",
  ),
  [SIGN_IN_METHOD_EVENTS.socialLinkedAuto]: t(
    "admin.system.logs.events.socialLinkedAuto",
  ),
  [SIGN_IN_METHOD_EVENTS.socialLinkReset]: t(
    "admin.system.logs.events.socialLinkReset",
  ),
  [SIGN_IN_METHOD_EVENTS.socialUnlinked]: t(
    "admin.system.logs.events.socialUnlinked",
  ),
  [SIGN_IN_METHOD_EVENTS.passwordSet]: t(
    "admin.system.logs.events.passwordSet",
  ),
  [SIGN_IN_METHOD_EVENTS.reauthFailed]: t(
    "admin.system.logs.events.reauthFailed",
  ),
  [SIGN_IN_METHOD_EVENTS.reauthLocked]: t(
    "admin.system.logs.events.reauthLocked",
  ),
});

/** Who made a provider change (`details.source`). */
export const signInMethodSourceLabels = (
  t: Translate,
): Record<SignInMethodEventSource, string> => ({
  [SIGN_IN_METHOD_EVENT_SOURCES.manual]: t(
    "admin.users.signInMethods.sourceManual",
  ),
  [SIGN_IN_METHOD_EVENT_SOURCES.login]: t(
    "admin.users.signInMethods.sourceLogin",
  ),
});

/** A step-up proof: the password, or the brand name of a provider. */
export function reauthMethodLabel(method: ReauthMethod, t: Translate): string {
  return method === "password"
    ? t("admin.users.signInMethods.password")
    : SIGN_IN_PROVIDER_NAMES[method];
}

/**
 * The "Provider" cell of a history row. Provider events carry the provider;
 * the password and step-up events carry none, and for a step-up the proof
 * (`method`) says which one was used. Null when the event names neither.
 */
export function signInMethodEventProviderLabel(
  event: Pick<AdminSignInMethodEvent, "provider" | "method">,
  t: Translate,
): string | null {
  if (event.provider) return SIGN_IN_PROVIDER_NAMES[event.provider];
  if (event.method) return reauthMethodLabel(event.method, t);
  return null;
}
