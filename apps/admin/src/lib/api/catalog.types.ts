import type {
  ListingRemovalActor,
  ListingRemovalReasonFilter,
} from "@tarodan/types";

/**
 * `POST /admin/products/:id/reject` gövdesi. `reason` satıcıya giden
 * gerekçedir (kalıcı yazılır); `violationCode` kaldırma kaydının ihlal kodu —
 * API'de opsiyonel (eski çağıranlar), panel formunda zorunlu.
 */
export interface RejectProductPayload {
  reason: string;
  violationCode?: string;
}

/**
 * `DELETE /admin/products/:id` gövdesi — yönetici kaldırmasının ihlal kodu ve
 * açıklaması (`other` kodunda açıklama zorunlu; kural @tarodan/types).
 */
export interface RemoveProductPayload {
  violationCode?: string;
  note?: string;
}

/** `GET /admin/products-export` filtreleri — listeyle aynı adlar. */
export interface ProductExportParams {
  status?: string;
  categoryId?: string;
  sellerId?: string;
  removalReason?: ListingRemovalReasonFilter;
  removalActor?: ListingRemovalActor;
}
