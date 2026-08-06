/** @format */

import type { Metadata } from "next";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { localizedCanonical } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Koleksiyoner Rehberi · Tarodan",
    description:
      "Koleksiyonunuzu Tarodan'da sergileme, paylaşma, takas etme ve satma rehberi.",
    alternates: localizedCanonical(locale, "/collectors-guide"),
  };
}

export default function CollectorsGuidePage() {
  return (
    <DocPage
      title="Koleksiyoner Rehberi"
      description="Koleksiyonunu dünyaya aç, diğer koleksiyonerlerle paylaş ve yeni hikâyelere dönüştür."
    >
      <SectionCard title="Koleksiyonum">
        <div className="space-y-4 text-sm leading-relaxed text-body">
          <p className="text-base font-semibold text-heading">
            Koleksiyonunu Dünyaya Aç.
          </p>
          <p>
            Her modelin bir hikâyesi, her koleksiyonun bir tutkusu vardır.
            Yıllar içinde özenle bir araya getirdiğin parçalar artık sadece
            raflarında değil, Türkiye&apos;nin en büyük diecast koleksiyoner
            topluluğunda da yerini alsın.
          </p>
          <p>
            Koleksiyonum, sana kendi dijital vitrinini oluşturma imkânı sunar.
            Modellerini profesyonel görsellerle sergileyebilir, koleksiyonunun
            değerini diğer koleksiyonerlerle paylaşabilir ve profilini benzersiz
            bir koleksiyon galerisine dönüştürebilirsin.
          </p>
          <p>
            Bir parçanı sadece sergilemek isteyebilirsin. Ya da doğru
            koleksiyonerle buluşarak takas yapmak veya satışa sunmak
            isteyebilirsin. Karar tamamen senin.
          </p>
          <p>
            Koleksiyonunu kategorilere ayır, en değerli parçalarını öne çıkar,
            diğer koleksiyonerlere ilham ver ve koleksiyonculuk tutkunu binlerce
            kişiyle paylaş.
          </p>
          <p>
            Tarodan&apos;da koleksiyonlar sadece sergilenmez; keşfedilir,
            konuşulur, takas edilir ve yeni hikâyelere dönüşür.
          </p>
          <p className="font-semibold text-heading">
            Sergile. Paylaş. Takas Et. Sat. Koleksiyonunu Büyüt.
          </p>
        </div>
      </SectionCard>
    </DocPage>
  );
}
