/** @format */
import { getServerApiOrigin } from "@/lib/api/origin";

const API_BASE = getServerApiOrigin();

/** Server fetch for the CMS "about" page (revalidated hourly). */
export async function getAboutPage() {
  try {
    const res = await fetch(`${API_BASE}/api/pages/about`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
