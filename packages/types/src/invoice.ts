/**
 * The process an admin invoice row was issued for, as shown under the
 * "context" badge of the admin invoice list.
 *
 * The API resolves the invoice's untyped source key into human-readable
 * references; the admin app turns each ref into a link. The link target
 * depends on the ref's kind, so the API sends ids, never URLs.
 */
export type InvoiceProcessKind =
  "order" | "offer" | "trade" | "refund_request" | "boost" | "membership";

export interface InvoiceProcessRef {
  /** Which detail page `targetId` belongs to. */
  kind: InvoiceProcessKind;
  /**
   * Human-readable reference (ORD-/TKS-/RFD-/BST-/MEM-). `null` when the
   * record has no number of its own (e.g. a membership payment without an
   * order) — the admin shows a generic link label instead.
   */
  label: string | null;
  /**
   * Id of the linked record: order id (`order`), offer id (`offer`), trade id
   * (`trade`), refund request id (`refund_request`), product boost id
   * (`boost`), member's user id (`membership`).
   */
  targetId: string;
}

export interface InvoiceProcess {
  /** The primary process — the kind of the first ref. */
  kind: InvoiceProcessKind;
  /** One or more refs; a package invoice lists every order it covers. */
  refs: InvoiceProcessRef[];
}
