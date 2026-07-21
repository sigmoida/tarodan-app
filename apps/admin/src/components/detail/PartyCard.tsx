import Link from "next/link";
import { SectionCard } from "./SectionCard";

/**
 * A person card (buyer / seller / initiator / receiver) — the same
 * "name link + email + phone" shape repeated across every detail page.
 */
export function PartyCard({
  title,
  name,
  userHref,
  email,
  phone,
}: {
  title: string;
  name: string;
  /** When set, the name links to the user detail page. */
  userHref?: string;
  email?: string | null;
  phone?: string | null;
}) {
  return (
    <SectionCard title={title} bodyClassName="space-y-1">
      {userHref ? (
        <Link
          href={userHref}
          className="block font-medium text-primary-600 hover:text-primary-700"
        >
          {name}
        </Link>
      ) : (
        <span className="block font-medium text-heading">{name}</span>
      )}
      {email && <p className="text-sm text-muted">{email}</p>}
      {phone && <p className="text-sm text-muted">{phone}</p>}
    </SectionCard>
  );
}
