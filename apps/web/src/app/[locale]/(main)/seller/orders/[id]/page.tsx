/** @format */

import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

type Props = { params: Promise<{ id: string }> };

/** Email templates link to /seller/orders/:orderId — forward to the order detail. */
export default async function SellerOrderPage({ params }: Props) {
  const { id } = await params;
  redirect({ href: `/profile/orders/${id}`, locale: await getLocale() });
}
