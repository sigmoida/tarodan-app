import { MetadataRoute } from "next";
import { ALLOW_INDEXING, SITE_URL } from "@/lib/seo";

// Private / app-only areas that must never be indexed, even after launch.
const DISALLOW = [
  "/api/",
  "/gateway/",
  "/bff/",
  "/profile",
  "/cart",
  "/checkout",
  "/payment",
  "/membership/checkout",
  "/track-order",
  "/listings/new",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

export default function robots(): MetadataRoute.Robots {
  // Pre-launch guard (#93): nothing is crawlable until indexing is switched on.
  if (!ALLOW_INDEXING) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
