/** @format */

import { redirect } from 'next/navigation';

/** Seller registration = business/company signup — handled by /register/business. */
export default function SellerRegisterPage() {
	redirect('/register/business');
}
