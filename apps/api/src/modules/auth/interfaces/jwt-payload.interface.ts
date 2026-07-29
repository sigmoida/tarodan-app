export interface JwtPayload {
  sub: string; // User ID
  email: string;
  isSeller: boolean;
  isAdmin?: boolean;
  role?: string; // Admin role if applicable
  sessionToken?: string; // Admin access/refresh tokenlarını DB oturumuna bağlar
  type: "access" | "refresh";
  jti?: string; // Benzersiz token kimliği — aynı saniyedeki rotasyonda bile tekil token üretir
  iat?: number;
  exp?: number;
}

export interface RequestUser {
  id: string;
  email: string;
  isSeller: boolean;
  isAdmin?: boolean;
  /** Database AdminUser id; populated only by AdminJwtStrategy. */
  adminId?: string;
  /** Active admin session token; never returned by response serializers. */
  sessionToken?: string;
  role?: string;
  /** Stored locale preference; read by resolveRequestLocale (#224). */
  preferredLanguage?: string | null;
}
