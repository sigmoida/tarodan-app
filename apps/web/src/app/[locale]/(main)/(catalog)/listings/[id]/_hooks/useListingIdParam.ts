/** @format */

"use client";

import { useParams } from "next/navigation";
import { parseListingParam } from "@tarodan/types";

/**
 * The listing id behind the `[id]` segment, which is a bare UUID or
 * `<slug>-<uuid>` (ADR 0017). The server page already 404s an unparseable
 * segment, so "" (which keeps the queries disabled) only shows up on a
 * client-side navigation to a malformed URL.
 */
export function useListingIdParam(): string {
  const params = useParams<{ id: string }>();
  return parseListingParam(params.id) ?? "";
}
