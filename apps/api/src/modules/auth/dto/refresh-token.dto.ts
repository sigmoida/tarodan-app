import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'Refresh token. Tarayıcı istemcilerde httpOnly cookie ile geldiği için opsiyoneldir; mobil/eski istemciler body ile gönderir.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
