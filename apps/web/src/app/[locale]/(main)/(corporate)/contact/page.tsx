/** @format */

import type { Metadata } from "next";
import ContactClient from "./_components/ContactClient";

export const metadata: Metadata = {
  title: "İletişim · Tarodan",
  description:
    "Tarodan ekibine ulaşın — sorularınız, önerileriniz ve destek talepleriniz için iletişim formu.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return <ContactClient />;
}
