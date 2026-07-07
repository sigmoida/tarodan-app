/** @format */

import { redirect } from 'next/navigation';

/**
 * Membership management now lives at /membership. This legacy route forwards
 * there so old links keep working.
 */
export default function MembershipManageRedirect() {
	redirect('/membership');
}
