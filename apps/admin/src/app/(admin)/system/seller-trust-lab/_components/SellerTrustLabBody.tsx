"use client";

import type { SellerTrustFormulaParams } from "@tarodan/types";
import { useCandidateParams } from "../_lib/useCandidateParams";
import { CandidateParamsCard } from "./CandidateParamsCard";
import { PopulationCard } from "./PopulationCard";
import { ScenarioCard } from "./ScenarioCard";
import { SellerCard } from "./SellerCard";

/**
 * The four cards. The candidate form lives here once, so the seller,
 * scenario and population runs all read the same candidate.
 */
export function SellerTrustLabBody({ v1 }: { v1: SellerTrustFormulaParams }) {
  const candidate = useCandidateParams(v1);
  return (
    <>
      <SellerCard candidate={candidate} />
      <ScenarioCard candidate={candidate} />
      <CandidateParamsCard candidate={candidate} />
      <PopulationCard candidate={candidate} />
    </>
  );
}
