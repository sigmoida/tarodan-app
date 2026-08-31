/** @format */

"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { MapPinIcon } from "@heroicons/react/24/outline";
import { Button, Modal } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/authStore";
import { useDispatchAddress } from "@/hooks/useDispatchAddress";
import { useListingLimits } from "@tarodan/listing-form";
import { shouldStartTour } from "@/lib/userExperiencePolicy.mjs";

/**
 * Giriş sonrası kargo çıkış adresi hatırlatması.
 *
 * Adresi ya da geçerli cep numarası olmayan satıcının siparişi ödendikten sonra
 * koli HİÇ açılamıyor ve satıcı bunu fark etmiyor — üretimde tam olarak bu
 * yaşandı, dört koli iki gün kargoya verilemedi. İlan formundaki kapı yalnız
 * YENİ ilanı korur; yayında ilanı olan satıcılar oraya hiç uğramaz. Bu yüzden
 * hatırlatma girişe bağlanıyor.
 *
 * Kapatma KALICI DEĞİL: adres girilene kadar her sayfa yüklemesinde yeniden
 * çıkar. Bir kez gösterip susmak, sorunu tam da fark edilmediği için büyüten
 * davranıştı. Kapatma yalnız o anki sayfada susturur — kullanıcı ekranı
 * gezebilsin diye; kalıcı çözüm adresi girmek.
 *
 * Yalnız satıcılara çıkar: alıcının çıkış adresi olmaması normaldir.
 */
export default function SellerAddressPrompt() {
  const t = useTranslations();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const isSeller = !!user?.isSeller;
  const { hasDispatchAddress, needsFix, isLoading } = useDispatchAddress(
    isAuthenticated && isSeller,
  );

  // Yeni üyeyi karşılama ekranında adres uyarısıyla boğmuyoruz: eksiklik ancak
  // ORTADA SATILACAK BİR ŞEY varken gerçek bir risk. İlan sayısı sıfırken
  // uyarmak, henüz olmayan bir sorunu haber vermektir.
  const { listingLimits, limitsLoading } = useListingLimits(
    isAuthenticated && isSeller,
  );
  const hasListings = (listingLimits?.currentCount ?? 0) > 0;

  // Tanıtım turu açıkken modal turun spotlight'ının önüne geçiyor ve iki uyarı
  // üst üste biniyor. Tur bitince ya da atlanınca `homeTourVersion` yazılıyor ve
  // store güncelleniyor — beklemek için tek yapmamız gereken o alana bakmak.
  const homeTourPending = shouldStartTour({
    isAuthenticated,
    isLoading: authLoading,
    completedVersion: user?.homeTourVersion,
    tour: "home",
  });
  const [dismissed, setDismissed] = useState(false);

  // Adres eklenince sorgu tazelenir ve kapı kendiliğinden kapanır; ama kullanıcı
  // uyarıyı kapatıp başka sayfaya geçtiyse orada yeniden görmeli. Yol değişince
  // susturmayı sıfırla.
  useEffect(() => {
    setDismissed(false);
  }, [pathname]);

  const close = () => setDismissed(true);

  // Adresini düzenlediği sayfada uyarı göstermek, iş yaparken önünü kesmektir.
  const onAddressScreen = pathname.startsWith("/profile");
  const open =
    isAuthenticated &&
    isSeller &&
    !isLoading &&
    !limitsLoading &&
    hasListings &&
    !homeTourPending &&
    !hasDispatchAddress &&
    !dismissed &&
    !onAddressScreen;

  if (!open) return null;

  return (
    <Modal
      isOpen
      onClose={close}
      title={
        needsFix
          ? t("address.dispatchPromptFixTitle")
          : t("address.dispatchPromptTitle")
      }
      size="xl"
      closeLabel={t("common.close")}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={close}
          >
            {t("address.dispatchPromptLater")}
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/profile" onClick={close}>
              {needsFix
                ? t("address.dispatchFixButton")
                : t("address.dispatchAddButton")}
            </Link>
          </Button>
        </div>
      }
    >
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-surface-alt">
          <MapPinIcon className="h-8 w-8 text-primary-500" />
        </div>
        <p className="text-sm text-muted">{t("address.dispatchPromptDesc")}</p>
        <p className="mt-4 rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm font-medium text-danger-800">
          {t("address.dispatchPromptWarning")}
        </p>
      </div>
    </Modal>
  );
}
