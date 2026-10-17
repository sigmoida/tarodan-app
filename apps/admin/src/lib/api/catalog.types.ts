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
