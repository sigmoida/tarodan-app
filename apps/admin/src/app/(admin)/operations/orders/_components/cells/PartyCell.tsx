import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AdminOrderParty } from "@tarodan/types";
import { CellUser } from "@/components/table";

/** Kullanıcı sayfası; misafir ortak sistem hesabıdır, link üretilmez. */
export const partyHref = (party: AdminOrderParty): string | undefined =>
  party.isGuest ? undefined : `/accounts/users/${party.id}`;

/**
 * Alıcı ya da satıcı: ad, kullanıcı kodu (B…/K…) ve e-posta. Teklifte de
 * teklif veren alıcı, teklif alan satıcıdır — ayrı etiket yoktur.
 */
export function PartyCell({ party }: { party: AdminOrderParty }) {
  const t = useTranslations();
  return (
    <CellUser
      name={party.displayName || t("admin.operations.orders.file.guestBuyer")}
      secondary={
        party.code ??
        (party.isGuest
          ? t("admin.operations.orders.file.guestBuyer")
          : undefined)
      }
      tertiary={party.email ?? undefined}
      href={partyHref(party)}
    />
  );
}

/** Paket başlığındaki tek satırlık satıcı etiketi. */
export function PartyInline({ party }: { party: AdminOrderParty }) {
  const href = partyHref(party);
  const label = (
    <>
      <span className="truncate font-medium text-body">
        {party.displayName}
      </span>
      {party.code && (
        <span className="shrink-0 font-mono text-muted">{party.code}</span>
      )}
    </>
  );
  return href ? (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-1.5 hover:text-primary-600 hover:underline"
    >
      {label}
    </Link>
  ) : (
    <span className="flex min-w-0 items-center gap-1.5">{label}</span>
  );
}
