import { PageLoading } from '@/components/PageLoading';

/**
 * Root-level loading UI. Shown while the segment below root streams — notably
 * during the login → dashboard transition, while the (admin) layout resolves the
 * session + permissions server-side (otherwise the screen goes blank for ~1-2s).
 *
 * Uses the shared, dependency-free {@link PageLoading} (inline SVG) so it stays a
 * Server Component and renders instantly, without pulling the client-only
 * `@tarodan/ui` barrel.
 */
export default function Loading() {
  return <PageLoading fullScreen />;
}
