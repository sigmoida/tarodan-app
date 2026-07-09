/** @format */

import { redirect } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

/** Email templates link to /seller/orders/:orderId — forward to the order detail. */
export default async function SellerOrderPage({ params }: Props) {
	const { id } = await params;
	redirect(`/profile/orders/${id}`);
}
