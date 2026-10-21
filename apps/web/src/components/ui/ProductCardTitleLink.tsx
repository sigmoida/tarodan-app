/** @format */

import { Link } from "@/i18n/navigation";

/**
 * The title of a listing card as its one link, stretched over the whole card
 * (`after:absolute after:inset-0`): the card is clickable everywhere, but the
 * image, the price row and the action are NOT inside the `<a>`, so the card
 * can hold buttons (the heart, the cart or boost action) without nesting
 * interactive content in a link. Those controls sit above it (`z-10`). The
 * card root must be the positioned ancestor (`relative`).
 *
 * The visible badges are `aria-hidden`; their text (`describeProductBadges`)
 * is read here, as part of the link's name. Keyboard focus shows a ring
 * around the whole card. Server- and client-safe (no hooks).
 */
export default function ProductCardTitleLink({
  href,
  title,
  badgeSummary,
  onClick,
}: {
  href: string;
  title: string;
  /** The badges as one text; nothing is added when empty. */
  badgeSummary?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="after:absolute after:inset-0 after:rounded focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary-600"
    >
      {title}
      {badgeSummary && <span className="sr-only"> {badgeSummary}</span>}
    </Link>
  );
}
