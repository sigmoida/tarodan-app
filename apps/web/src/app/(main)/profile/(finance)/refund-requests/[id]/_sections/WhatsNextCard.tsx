/** @format */

"use client";

import SectionCard from "@/components/ui/SectionCard";
import { useTranslations } from "next-intl";

const NEXT_COPY: Record<string, { tr: string; en: string }> = {
  pending_review: {
    tr: "Satıcının 48 saat içinde cevap vermesi gerekiyor. Cevap gelmezse talep otomatik olarak onaylanacak.",
    en: "The seller has 48 hours to respond. If they don't, the request will be auto-approved.",
  },
  approved: {
    tr: "Talebiniz onaylandı, iade şu anda işleniyor.",
    en: "Your request was approved. Refund is being processed.",
  },
  wait_for_delivery: {
    tr: "Ürünün size teslim edildiği anda otomatik olarak ücretsiz Sürat iade kargosu açılacak ve size takip numarası verilecek.",
    en: "Once your package is marked as delivered, we'll automatically open a free Sürat return shipment for you.",
  },
  return_shipment_open: {
    tr: "Paketi en yakın Sürat şubesine bırakın. Satıcıya ulaştığı anda paranız otomatik iade edilecek.",
    en: "Drop the package off at any Sürat branch. Once it reaches the seller, your refund will be triggered automatically.",
  },
  return_in_transit: {
    tr: "Paketiniz yolda — yukarıdaki Sürat takip linkinden ilerleyişi izleyebilirsiniz.",
    en: "Your package is on its way. Track it via the link above.",
  },
  return_delivered: {
    tr: "Paket satıcıya teslim edildi. Para iadesi şu anda işleniyor — birkaç dakika içinde tamamlanır.",
    en: "The seller has received the package. Your refund is being processed.",
  },
  disputed: {
    tr: "Admin ekibimiz dosyayı inceleyip 1-3 iş günü içinde size dönecek.",
    en: "An admin will review the case and contact you within 1-3 business days.",
  },
};

export default function WhatsNextCard({
  status,
  locale,
}: {
  status: string;
  locale: string;
}) {
  const t = useTranslations();
  const copy = NEXT_COPY[status];
  if (!copy) return null;

  return (
    <SectionCard title={t("refund.whatsNext")}>
      <p className="text-sm leading-relaxed text-muted">
        {locale === "en" ? copy.en : copy.tr}
      </p>
    </SectionCard>
  );
}
