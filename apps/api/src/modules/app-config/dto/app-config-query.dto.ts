import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Optional query for GET /app-config. When BOTH `platform` and `appVersion` are
 * supplied, the endpoint additionally computes `updateRequired`/`updateAvailable`
 * for that client; otherwise it just advertises the raw version thresholds.
 */
export class AppConfigQueryDto {
  @ApiPropertyOptional({ enum: ['ios', 'android'], description: 'İstemci platformu' })
  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: 'ios' | 'android';

  @ApiPropertyOptional({ example: '1.2.0', description: 'İstemcinin app sürümü (semver, ör. 1.2.0)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+){0,3}([-+].*)?$/, {
    message: 'appVersion geçerli bir sürüm olmalı (ör. 1.2.0)',
  })
  appVersion?: string;
}
