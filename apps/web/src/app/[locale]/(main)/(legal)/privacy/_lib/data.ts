/** @format */

import { getServerApiOrigin } from "@/lib/api/origin";

const API_BASE = getServerApiOrigin();

/** Server fetch for the CMS "privacy" page (revalidated hourly). */
export async function getPrivacyPage() {
  try {
    const res = await fetch(`${API_BASE}/api/pages/privacy`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
