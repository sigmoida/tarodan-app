/** @format */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
