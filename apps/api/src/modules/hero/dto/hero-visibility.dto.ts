import { IsBoolean, ValidateIf } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import type { HeroHomeVisibilityDto } from "@tarodan/types";

/** Alan yok = dokunma; `null` reddedilir (anahtar açık ya da kapalıdır). */
const IsOptionalNotNull = () => ValidateIf((_, value) => value !== undefined);

/** `PATCH /admin/hero-slides/visibility` — ana sayfa hero'su istemci başına. */
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
