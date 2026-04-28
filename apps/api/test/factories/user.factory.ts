import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TestingModule } from '@nestjs/testing';
import { AdminRole } from '@prisma/client';
import { getPrisma } from '../test-utils/db';

export interface CreatedTestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
  isSeller: boolean;
  accessToken: string;
}

export interface CreatedTestAdmin extends CreatedTestUser {
  adminRole: AdminRole;
}

export async function createUser(
  module: TestingModule,
  opts: Partial<{
    email: string;
    password: string;
    displayName: string;
    isSeller: boolean;
    isEmailVerified: boolean;
    isVerified: boolean;
    sellerType: 'platform' | 'business' | 'individual';
  }> = {},
): Promise<CreatedTestUser> {
  const prisma = getPrisma();
  const email = opts.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = opts.password ?? 'TestPass123!';
  const displayName = opts.displayName ?? 'Test User';
  const isSeller = opts.isSeller ?? false;
  const passwordHash = await bcrypt.hash(password, 4); // low cost for fast tests

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      isSeller,
      isEmailVerified: opts.isEmailVerified ?? true,
      isVerified: opts.isVerified ?? true,
      sellerType: isSeller ? (opts.sellerType ?? 'individual') as any : null,
      birthDate: new Date('1990-01-01'),
    },
  });

  const accessToken = await signAccessToken(module, {
    sub: user.id,
    email: user.email,
    isSeller: user.isSeller,
  });

  return {
    id: user.id,
    email,
    password,
    displayName,
    isSeller,
    accessToken,
  };
}

async function signAccessToken(
  module: TestingModule,
  payload: { sub: string; email: string; isSeller: boolean },
): Promise<string> {
  const jwtService = module.get(JwtService);
  const configService = module.get(ConfigService);
  const secret = configService.get<string>('JWT_SECRET');
  return jwtService.signAsync(
    { ...payload, type: 'access' },
    { secret, expiresIn: '1h' },
  );
}

export function authHeader(user: { accessToken: string }): { Authorization: string } {
  return { Authorization: `Bearer ${user.accessToken}` };
}

export async function createAdminUser(
  module: TestingModule,
  opts: Partial<{
    email: string;
    role: AdminRole;
  }> = {},
): Promise<CreatedTestAdmin> {
  const base = await createUser(module, {
    email: opts.email,
    displayName: 'Admin User',
    isSeller: false,
  });
  const role = opts.role ?? AdminRole.super_admin;

  const prisma = getPrisma();
  await prisma.adminUser.create({
    data: {
      userId: base.id,
      role,
      isActive: true,
    },
  });

  // Re-issue token with isAdmin: true so AdminJwtStrategy validates it.
  const jwtService = module.get(JwtService);
  const configService = module.get(ConfigService);
  const secret =
    configService.get<string>('ADMIN_JWT_SECRET') ?? configService.get<string>('JWT_SECRET');
  const accessToken = await jwtService.signAsync(
    { sub: base.id, email: base.email, isAdmin: true, role, type: 'access' },
    { secret, expiresIn: '1h' },
  );

  return { ...base, accessToken, adminRole: role };
}
