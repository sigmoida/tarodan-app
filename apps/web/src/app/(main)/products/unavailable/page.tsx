/** @format */

import { redirect } from 'next/navigation';

/** /products/unavailable needs a product id; without one, go to the listings. */
export default function UnavailableIndexPage() {
	redirect('/listings');
}
