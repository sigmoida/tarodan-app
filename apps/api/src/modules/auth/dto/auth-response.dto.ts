import { ApiProperty } from '@nestjs/swagger';

export class TokensDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Access token (15 min expiry)',
  })
  accessToken: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Refresh token (7 day expiry)',
  })
  refreshToken: string;
}

export class MembershipResponseDto {
  @ApiProperty({ example: { type: 'free', name: 'Ücretsiz' } })
  tier: {
    type: string;
    name: string;
  };

  @ApiProperty({ example: '2024-12-31T23:59:59.000Z', required: false })
  expiresAt?: string;
}

export class UserResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: '+905551234567', required: false })
  phone?: string;

  @ApiProperty({ example: 'John Doe' })
  displayName: string;

  @ApiProperty({ example: true })
  isVerified: boolean;

  @ApiProperty({ example: false })
  isSeller: boolean;

  @ApiProperty({ example: 'individual', required: false })
  sellerType?: string;

  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ type: MembershipResponseDto, required: false })
  membership?: MembershipResponseDto;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({ type: TokensDto })
  tokens: TokensDto;

  @ApiProperty({ required: false })
  message?: string;
}

export class AdminUserResponseDto extends UserResponseDto {
  @ApiProperty({ example: 'admin' })
  role: string;

  @ApiProperty({ example: { users: { read: true, write: true } } })
  permissions: Record<string, unknown>;
}

export class AdminAuthResponseDto {
  @ApiProperty({ type: AdminUserResponseDto })
  user: AdminUserResponseDto;

  @ApiProperty({ type: TokensDto })
  tokens: TokensDto;
}
