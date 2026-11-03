import type {
  SellerTrustLabParamsResponse,
  SellerTrustLabPopulation,
  SellerTrustLabPopulationRequest,
  SellerTrustLabScenarioPreset,
  SellerTrustLabScenarioRequest,
  SellerTrustLabScenarioResult,
  SellerTrustLabSeller,
  SellerTrustLabSellerRequest,
} from "@tarodan/types";
import { api } from "./client";

const BASE = "/admin/seller-trust-lab";

/**
 * Seller trust lab (`AdminSellerTrustLabController`). Every call is a read:
 * the POSTs carry a request body (candidate parameters, filters) but save
 * nothing, so the page runs them as queries, not mutations.
 */
export const sellerTrustLabApi = {
  getSellerTrustLabParams: () =>
    api.get<SellerTrustLabParamsResponse>(`${BASE}/params`),
  getSellerTrustLabScenarios: () =>
    api.get<SellerTrustLabScenarioPreset[]>(`${BASE}/scenarios`),
  runSellerTrustLabScenario: (body: SellerTrustLabScenarioRequest) =>
    api.post<SellerTrustLabScenarioResult>(`${BASE}/scenario`, body),
  runSellerTrustLabSeller: (
    userId: string,
    body: SellerTrustLabSellerRequest,
  ) =>
    api.post<SellerTrustLabSeller>(
      `${BASE}/sellers/${encodeURIComponent(userId)}`,
      body,
    ),
  runSellerTrustLabPopulation: (body: SellerTrustLabPopulationRequest) =>
    api.post<SellerTrustLabPopulation>(`${BASE}/population`, body),
};
