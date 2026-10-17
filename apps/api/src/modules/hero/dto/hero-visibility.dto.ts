import { IsBoolean } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import type { HeroHomeVisibilityDto } from "@tarodan/types";
import { IsOptionalNotNull } from "../../../common/validators/optional-not-null";

/**
 * `PATCH /admin/hero-slides/visibility` — ana sayfa hero'su istemci başına.
 * Alan yok = dokunma; `null` reddedilir (anahtar açık ya da kapalıdır).
 */
export class UpdateHeroHomeVisibilityDto implements Partial<HeroHomeVisibilityDto> {
  @ApiPropertyOptional({ description: "Show the home hero on the website" })
  @IsOptionalNotNull()
  @IsBoolean()
  web?: boolean;

  @ApiPropertyOptional({ description: "Show the home hero in the mobile app" })
  @IsOptionalNotNull()
  @IsBoolean()
  app?: boolean;
}
