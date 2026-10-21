import {
  SIGN_IN_PROVIDER_NAMES,
  type AdminSignInMethodEvent,
  type LinkedSignInProvider,
} from "@tarodan/types";
import { type ColumnDef } from "@/components/DataTable";
import { col } from "@/components/table";
import type { Translate } from "@/lib/statusLabels";
import {
  signInMethodEventLabels,
  signInMethodEventProviderLabel,
  signInMethodSourceLabels,
} from "@/lib/sign-in-methods";

/**
 * Columns of the user detail "Sign-in methods" section. None is sortable: the
 * API sorts the history (newest first) and takes no sort parameter, and the
 * provider list has at most one row per provider.
 */

/** The linked providers: brand, the e-mail the provider reported, link date. */
export function linkedProviderColumns(
  t: Translate,
): ColumnDef<LinkedSignInProvider, unknown>[] {
  return [
    col.text<LinkedSignInProvider>(
      t("admin.users.signInMethods.columnProvider"),
      (p) => SIGN_IN_PROVIDER_NAMES[p.provider],
    ),
    col.text<LinkedSignInProvider>(
      t("admin.users.signInMethods.providerEmail"),
      (p) => p.email,
    ),
    col.date<LinkedSignInProvider>(
      t("admin.users.signInMethods.linkedAt"),
      (p) => p.linkedAt,
      { withTime: true },
    ),
  ];
}

/**
 * The history: event, provider (or the step-up proof), source, date. No IP
 * and no user agent (the API does not send them; showing an IP is a KVKK
 * review item).
 */
export function signInMethodEventColumns(
  t: Translate,
): ColumnDef<AdminSignInMethodEvent, unknown>[] {
  const eventLabels = signInMethodEventLabels(t);
  const sourceLabels = signInMethodSourceLabels(t);
  return [
    col.text<AdminSignInMethodEvent>(
      t("admin.users.signInMethods.columnEvent"),
      (e) => eventLabels[e.eventType] ?? e.eventType,
    ),
    col.text<AdminSignInMethodEvent>(
      t("admin.users.signInMethods.columnProvider"),
      (e) => signInMethodEventProviderLabel(e, t),
    ),
    col.text<AdminSignInMethodEvent>(
      t("admin.users.signInMethods.columnSource"),
      (e) => (e.source ? sourceLabels[e.source] : null),
    ),
    col.date<AdminSignInMethodEvent>(
      t("admin.users.signInMethods.columnDate"),
      (e) => e.occurredAt,
      { withTime: true },
    ),
  ];
}
