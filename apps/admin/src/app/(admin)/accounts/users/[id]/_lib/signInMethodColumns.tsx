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

const NOT_SORTABLE = { sortable: false } as const;

/** The linked providers: brand, the e-mail the provider reported, link date. */
export function linkedProviderColumns(
  t: Translate,
): ColumnDef<LinkedSignInProvider, unknown>[] {
  return [
    col.text<LinkedSignInProvider>(
      t("admin.users.signInMethods.columnProvider"),
      (p) => SIGN_IN_PROVIDER_NAMES[p.provider],
      NOT_SORTABLE,
    ),
    col.text<LinkedSignInProvider>(
      t("admin.users.signInMethods.providerEmail"),
      (p) => p.email,
      NOT_SORTABLE,
    ),
    col.date<LinkedSignInProvider>(
      t("admin.users.signInMethods.linkedAt"),
      (p) => p.linkedAt,
      { ...NOT_SORTABLE, withTime: true },
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
      (e) => eventLabels[e.eventType],
      NOT_SORTABLE,
    ),
    col.text<AdminSignInMethodEvent>(
      t("admin.users.signInMethods.columnProvider"),
      (e) => signInMethodEventProviderLabel(e, t),
      NOT_SORTABLE,
    ),
    col.text<AdminSignInMethodEvent>(
      t("admin.users.signInMethods.columnSource"),
      (e) => (e.source ? sourceLabels[e.source] : null),
      NOT_SORTABLE,
    ),
    col.date<AdminSignInMethodEvent>(t("common.date"), (e) => e.occurredAt, {
      ...NOT_SORTABLE,
      withTime: true,
    }),
  ];
}
