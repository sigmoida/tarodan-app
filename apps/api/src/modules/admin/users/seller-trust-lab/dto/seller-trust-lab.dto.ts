import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import {
  SELLER_TRUST_LAB_AS_OF,
  SELLER_TRUST_LEVELS,
  type SellerTrustLabAsOf,
  type SellerTrustLabPopulationFilters,
  type SellerTrustLevel,
} from "@tarodan/types";

/**
 * Bodies of the seller trust lab. `params` and `inputs` are taken as raw
 * JSON (`@Allow`) and validated once, by the shared validators of
 * `@tarodan/types`, in `lab-request.helper.ts`: one rule for the API and the
 * admin form, a 400 naming the field, and the validated copy is what the
 * lab computes with.
 */

const PARAMS_DESCRIPTION =
  "Candidate SellerTrustFormulaParams (weights, priors, zeroAt, saturation, tenure, minimums). Windows, the late grace and the per-counterparty cap are not parameters.";

export class SellerTrustLabScenarioDto {
  @ApiProperty({ description: "Hypothetical SellerTrustInputs" })
  @Allow()
  inputs!: unknown;

  @ApiPropertyOptional({ description: PARAMS_DESCRIPTION })
  @Allow()
  params?: unknown;
}

export class SellerTrustLabSellerDto {
  @ApiPropertyOptional({ enum: SELLER_TRUST_LAB_AS_OF, default: "now" })
  @IsOptional()
  @IsIn(SELLER_TRUST_LAB_AS_OF)
  asOf?: SellerTrustLabAsOf;

  @ApiPropertyOptional({ description: PARAMS_DESCRIPTION })
  @Allow()
  params?: unknown;
}

export class SellerTrustLabPopulationFiltersDto implements SellerTrustLabPopulationFilters {
  @ApiPropertyOptional({ enum: SELLER_TRUST_LEVELS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SELLER_TRUST_LEVELS.length)
  @IsIn(SELLER_TRUST_LEVELS, { each: true })
  levels?: SellerTrustLevel[];

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minTransactions?: number;
}

export class SellerTrustLabPopulationDto {
  @ApiProperty({ description: PARAMS_DESCRIPTION })
  @Allow()
  params!: unknown;

  @ApiPropertyOptional({ type: SellerTrustLabPopulationFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SellerTrustLabPopulationFiltersDto)
  filters?: SellerTrustLabPopulationFiltersDto;
}
