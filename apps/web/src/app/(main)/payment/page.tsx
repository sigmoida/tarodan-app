/** @format */

import { redirect } from 'next/navigation';

/**
 * /payment has no standalone view — payments are always scoped to a specific
 * payment id (/payment/[id]). Hitting the bare route redirects home.
 */
export default function PaymentIndexPage() {
	redirect('/');
}
