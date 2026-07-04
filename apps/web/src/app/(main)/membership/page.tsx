/** @format */

import { redirect } from 'next/navigation';

// Membership plans live on the pricing page; this route just forwards there.
export default function MembershipPage() {
	redirect('/pricing');
}
