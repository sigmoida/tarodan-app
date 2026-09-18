import type {
  InvoiceProcess,
  InvoiceProcessKind,
  InvoiceProcessRef,
} from "@tarodan/types";

/**
 * Detail page of each process kind. The API sends the id of the record the
 * page is keyed by (`InvoiceProcessRef.targetId`), never a URL — routes are
 * the admin's business. A closed record, so a new kind fails to compile here.
 */
const PROCESS_PATHS: Record<InvoiceProcessKind, (id: string) => string> = {
  order: (id) => `/operations/orders/${id}`,
  offer: (id) => `/operations/offers/${id}`,
  trade: (id) => `/operations/trades/${id}`,
  refund_request: (id) => `/operations/refund-requests/${id}`,
  boost: (id) => `/marketing/boost-purchases/${id}`,
  membership: (id) => `/accounts/users/${id}`,
};

export const invoiceProcessHref = (ref: InvoiceProcessRef): string =>
  PROCESS_PATHS[ref.kind](encodeURIComponent(ref.targetId));

const PROCESS_KINDS = Object.keys(PROCESS_PATHS) as InvoiceProcessKind[];

const isRef = (raw: unknown): raw is InvoiceProcessRef => {
  const ref = raw as Partial<InvoiceProcessRef> | null;
  return (
    !!ref &&
    PROCESS_KINDS.includes(ref.kind as InvoiceProcessKind) &&
    typeof ref.targetId === "string" &&
    ref.targetId.length > 0 &&
    (ref.label === null || typeof ref.label === "string")
  );
};

/**
 * Narrows the list response's `process` field. Refs of an unknown kind (an
 * API ahead of this build) are dropped rather than linked to a wrong page.
 */
export function readInvoiceProcess(raw: unknown): InvoiceProcess | null {
  const value = raw as { kind?: unknown; refs?: unknown } | null;
  if (!value || !Array.isArray(value.refs)) return null;
  const refs = value.refs.filter(isRef);
  return refs.length > 0 ? { kind: refs[0].kind, refs } : null;
}
