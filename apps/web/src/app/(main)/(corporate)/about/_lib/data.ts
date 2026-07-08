/** @format */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
