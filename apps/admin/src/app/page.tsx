import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';

/**
 * Root route. Server Component: resolve the session and send the user to the
 * app or the login page — no client-side auth check or loading spinner.
 */
export default async function HomePage() {
  const session = await getSession();
  redirect(session ? '/dashboard' : '/login');
}
