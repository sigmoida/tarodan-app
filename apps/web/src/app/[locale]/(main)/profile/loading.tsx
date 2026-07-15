import { PageLoading } from "@/components/PageLoading";

/**
 * Account-area loading UI. The profile layout is server-gated (`getSession()`),
 * so every entry into `/profile/*` has a server round-trip — this shows the
 * shared spinner in the content column meanwhile instead of a blank wait.
 * Stays a Server Component rendering the client `PageLoading` as a boundary.
 */
export default function ProfileLoading() {
  return <PageLoading />;
}
