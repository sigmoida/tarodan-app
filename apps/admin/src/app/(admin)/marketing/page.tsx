import { redirect } from 'next/navigation';

/**
 * Marketing is a section shell with no page of its own — entering it (via the
 * sidebar or a direct URL) redirects to the first child route.
 */
export default function MarketingPage() {
  redirect('/marketing/ads');
}
