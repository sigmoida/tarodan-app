import { PageLoading } from '@/components/PageLoading';

/**
 * Root-level loading UI. Shown while the segment below root streams — notably
 * during the login → dashboard transition, while the (admin) layout resolves the
 * session + permissions server-side (otherwise the screen goes blank for ~1-2s).
 *
 * Renders the shared {@link PageLoading} (a client component wrapping the single
 * `@tarodan/ui` `Spinner`). This file stays a Server Component and renders the
 * client spinner as a boundary — its SSR HTML shows instantly during streaming.
 */
export default function Loading() {
  return <PageLoading fullScreen />;
}
