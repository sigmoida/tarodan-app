import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Max, Min } from "class-validator";
import { CURRENT_HOME_TOUR_VERSION } from "../user-preferences.constants";

export class CompleteHomeTourDto {
  @ApiProperty({
    example: CURRENT_HOME_TOUR_VERSION,
    minimum: 1,
    maximum: CURRENT_HOME_TOUR_VERSION,
    description: "Completed home onboarding tour version",
  })
  @IsInt()
  @Min(1)
  @Max(CURRENT_HOME_TOUR_VERSION)
  version!: number;
}
