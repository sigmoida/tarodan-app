export interface JwtPayload {
  sub: string; // User ID
  email: string;
  isSeller: boolean;
  isAdmin?: boolean;
  role?: string; // Admin role if applicable
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
  role?: string;
}
