/**
 * Root-level loading UI. Shown while the segment below root streams — notably
 * during the login → dashboard transition, while the (admin) layout resolves the
 * session + permissions server-side (otherwise the screen goes blank for ~1-2s).
 *
 * Kept dependency-free (inline SVG) so it stays a Server Component and renders
 * instantly, without pulling the client-only @tarodan/ui barrel.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <svg
        className="h-8 w-8 animate-spin text-primary-600"
        viewBox="0 0 24 24"
        fill="none"
        aria-label="Yükleniyor"
        role="status"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  );
}
