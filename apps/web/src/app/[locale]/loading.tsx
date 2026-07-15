import { PageLoading } from "@/components/PageLoading";

/**
 * Root-level loading UI. Shown while the segment below root streams. Renders the
 * shared {@link PageLoading} (a client component wrapping the single
 * `@tarodan/ui` `Spinner`). This file stays a Server Component and renders the
 * client spinner as a boundary — its SSR HTML shows instantly during streaming.
 */
export default function Loading() {
  return <PageLoading fullScreen />;
}
