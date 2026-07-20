const DEVELOPMENT_API_ORIGIN = "http://localhost:3001";

export function getPublicApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return DEVELOPMENT_API_ORIGIN;
  throw new Error("NEXT_PUBLIC_API_URL is required in production");
}

export function getServerApiOrigin(): string {
  const configured =
    process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return DEVELOPMENT_API_ORIGIN;
  throw new Error(
    "API_INTERNAL_URL or NEXT_PUBLIC_API_URL is required in production",
  );
}
