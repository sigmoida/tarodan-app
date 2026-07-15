/** @format */

import type { Metadata } from "next";
import CartClient from "./CartClient";

export const metadata: Metadata = {
  title: "Sepetim | Tarodan",
  description:
    "Sepetinizdeki ürünleri gözden geçirin ve güvenle ödemeye geçin.",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return <CartClient />;
}
