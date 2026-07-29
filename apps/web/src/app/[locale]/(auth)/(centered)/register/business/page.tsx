import type { Metadata } from "next";
import { RegisterBusinessForm } from "../../../_components/RegisterBusinessForm";

export const metadata: Metadata = {
  title: "Şirket Hesabı Kaydı · Tarodan",
  description: "Tarodan şirket hesabınızı oluşturun.",
  robots: { index: false, follow: false },
};

export default function BusinessRegisterPage() {
  return <RegisterBusinessForm />;
}
