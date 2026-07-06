/** @format */

import type { ReactNode } from 'react';
import ProfileShell from './_components/ProfileShell';

/**
 * Thin server shell for the account area. Renders the client `ProfileShell`
 * (sticky account nav + main column) around every `/profile/*` route so the nav
 * is present wherever you land under profile. Metadata (title / robots noindex)
 * stays per-page.
 */
export default function ProfileLayout({ children }: { children: ReactNode }) {
	return <ProfileShell>{children}</ProfileShell>;
}
