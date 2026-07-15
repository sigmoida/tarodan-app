/** @format */

import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation primitives — the drop-in replacements for the
 * `next/link` and `next/navigation` equivalents. They read the active locale
 * from context and keep it in the URL automatically: a `<Link href="/products">`
 * rendered under `/en` points at `/en/products`, and `router.push`/`redirect`/
 * `usePathname` all speak locale-stripped paths (you pass `/products`, they
 * resolve the prefix).
 *
 * Every INTERNAL navigation in the app must import from here instead of
 * `next/link` / `next/navigation`; otherwise an English visitor following a
 * plain `next/link` would silently fall back to the prefix-free Turkish route.
 * (External `<a>` links and the API `next/navigation` bits that don't move —
 * `useSearchParams`, `notFound` — stay on the originals.)
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
