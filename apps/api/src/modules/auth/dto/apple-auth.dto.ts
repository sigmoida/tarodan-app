import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AppleAuthDto {
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}
