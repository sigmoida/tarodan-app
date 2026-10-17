import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsString } from "class-validator";
import {
  SIMULATION_TARGET_KINDS,
  type SimulationTargetKind,
} from "../helpers/shipment-simulation.helper";
import {
  SIMULATED_CARRIER_STEPS,
  type SimulatedCarrierStep,
} from "../../surat-cargo/helpers/surat-simulated-reading";

/** Test Araçları kargo simülasyonu: hangi koliye hangi taşıyıcı olayı. */
export class SimulateShipmentDto {
  @ApiProperty({ enum: [...SIMULATION_TARGET_KINDS] })
  @IsIn(SIMULATION_TARGET_KINDS)
  kind!: SimulationTargetKind;

  @ApiProperty({
    description: "Shipment / RefundRequest / TradeShipment kimliği",
  })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ enum: [...SIMULATED_CARRIER_STEPS] })
  @IsIn(SIMULATED_CARRIER_STEPS)
  step!: SimulatedCarrierStep;
}
