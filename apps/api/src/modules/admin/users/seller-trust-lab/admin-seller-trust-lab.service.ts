import { Injectable } from "@nestjs/common";
import type {
  SellerTrustLabParamsResponse,
  SellerTrustLabPopulation,
  SellerTrustLabScenarioPreset,
  SellerTrustLabScenarioResult,
  SellerTrustLabSeller,
} from "@tarodan/types";
import { SellerTrustLabService } from "../../../seller-trust/lab/seller-trust-lab.service";
import {
  candidateParamsHash,
  normalisePopulationFilters,
  parseCandidateParams,
  parseOptionalCandidateParams,
  parseScenarioInputs,
} from "../../../seller-trust/lab/lab-request.helper";
import { AdminAuditService } from "../../ops/admin-audit.service";
import type {
  SellerTrustLabPopulationDto,
  SellerTrustLabScenarioDto,
  SellerTrustLabSellerDto,
} from "./dto/seller-trust-lab.dto";

/** Audit actions of the lab's real-data calls (Admin > Audit logs). */
export const SELLER_TRUST_LAB_AUDIT = {
  seller: "seller_trust_lab_seller",
  population: "seller_trust_lab_population",
} as const;

/**
 * Admin side of the seller trust lab: validates the request once (before
 * any read), calls the read-only lab, and writes the audit row of every
 * call that touched real data. The audit is fail-closed: it is written
 * after the result is ready and before it is returned, so a failed audit
 * write returns no result. The audit row is the only write of the lab.
 * The scenario calculator reads no real data and is not audited (D4).
 */
@Injectable()
export class AdminSellerTrustLabService {
  constructor(
    private readonly lab: SellerTrustLabService,
    private readonly audit: AdminAuditService,
  ) {}

  params(): SellerTrustLabParamsResponse {
    return this.lab.params();
  }

  scenarios(): SellerTrustLabScenarioPreset[] {
    return this.lab.scenarios();
  }

  scenario(dto: SellerTrustLabScenarioDto): SellerTrustLabScenarioResult {
    const inputs = parseScenarioInputs(dto.inputs);
    const candidate = parseOptionalCandidateParams(dto.params);
    return this.lab.scenario(inputs, candidate);
  }

  async seller(
    actorUserId: string,
    userId: string,
    dto: SellerTrustLabSellerDto,
  ): Promise<SellerTrustLabSeller> {
    const asOf = dto.asOf ?? "now";
    const candidate = parseOptionalCandidateParams(dto.params);
    const result = await this.lab.seller(userId, asOf, candidate);
    await this.audit.createRequiredAuditLog(
      actorUserId,
      SELLER_TRUST_LAB_AUDIT.seller,
      "user",
      userId,
      null,
      {
        asOf,
        candidate: candidate !== null,
        paramsHash: candidate ? candidateParamsHash(candidate) : null,
      },
    );
    return result;
  }

  async population(
    actorUserId: string,
    dto: SellerTrustLabPopulationDto,
  ): Promise<SellerTrustLabPopulation> {
    const candidate = parseCandidateParams(dto.params);
    const filters = normalisePopulationFilters(dto.filters);
    const result = await this.lab.population(candidate, filters);
    await this.audit.createRequiredAuditLog(
      actorUserId,
      SELLER_TRUST_LAB_AUDIT.population,
      "seller_trust_scores",
      "population",
      null,
      { params: candidate, filters, rowsRead: result.summary.rowsRead },
    );
    return result;
  }
}
