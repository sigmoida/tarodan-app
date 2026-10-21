import type {
  BoostOffersResponse,
  BoostReminderRequest,
  BoostReminderResponse,
  MyBoostsResponse,
  MyBoostState,
  BoostOptionsResponse,
  InitiateBoostRequest,
  InitiateBoostResponse,
} from "@tarodan/types";
import { api } from "./client";

/**
 * Listing boost ("öne çıkarma"), bought by the listing's owner on the web
 * only (tarodan-ops ADR 0003, 0015). The shapes are the contract in
 * `@tarodan/types` (`boost.ts`).
 */
export const boostApi = {
  /** Packages, durations and prices for the owner's active listing. */
  options: (productId: string) =>
    api.get<BoostOptionsResponse>(`/products/${productId}/boost/options`),
  /**
   * Opens the boost order with both purchase consents; the card is entered
   * on `/payment/<paymentId>`. Without both consents: 400
   * `server.product.boostConsentRequired`, nothing is written.
   */
  initiate: (productId: string, body: InitiateBoostRequest) =>
    api.post<InitiateBoostResponse>(
      `/products/${productId}/boost/initiate`,
      body,
    ),
  /**
   * Whether boost sales are on (`enabled`, the API's `isBoostEnabled`) and
   * the caller's listings due the one-time boost offer. Signed-in only.
   */
  offers: () => api.get<BoostOffersResponse>("/products/boost/offers"),
  /**
   * "My boosts": `current` (running and paused, up to `limit`) or `history`
   * (ended and cancelled, paged). Signed-in only.
   */
  my: (params: { state: MyBoostState; page?: number; limit?: number }) =>
    api.get<MyBoostsResponse>("/products/boost/my", { params }),
  /**
   * The ending-soon reminder of the owner's listing. Turning it on needs
   * premium: 400 `server.product.boostReminderPremiumOnly`.
   */
  reminder: (productId: string, body: BoostReminderRequest) =>
    api.patch<BoostReminderResponse>(
      `/products/${productId}/boost/reminder`,
      body,
    ),
};
