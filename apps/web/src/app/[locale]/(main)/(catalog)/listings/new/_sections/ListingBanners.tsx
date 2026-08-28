/** @format */

"use client";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { useNewListing } from "../_context/NewListingContext";
import { useTranslations } from "next-intl";

/** Listing-quota banner shown above the form. */
export function LimitBanner() {
  const t = useTranslations();
  const { limitsLoading, listingLimits } = useNewListing();

  if (limitsLoading) {
    return (
      <div className="mb-5 p-3 bg-surface rounded-lg animate-pulse">
        <div className="h-4 bg-border-subtle rounded-lg w-1/3" />
      </div>
    );
  }
  if (!listingLimits) return null;

  const box = listingLimits.isPremium
    ? "bg-warning-50 border-warning-200"
    : listingLimits.canCreateListing
      ? "bg-success-50 border-success-200"
      : "bg-danger-50 border-danger-200";
  const text = listingLimits.isPremium
    ? "text-warning-800"
    : listingLimits.canCreateListing
      ? "text-success-800"
      : "text-danger-800";

  return (
    <div className={`mb-5 p-3 rounded-lg border text-sm ${box}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`font-medium ${text}`}>
            {listingLimits.maxListings === -1
              ? t("page.new.listingbanners.mevcutIlanCurrentCountSinirsiz", {
                  currentCount: listingLimits.currentCount,
                })
              : t("page.new.listingbanners.ilanHakkiCurrentCountMaxListings", {
                  currentCount: listingLimits.currentCount,
                  maxListings: listingLimits.maxListings,
                })}
          </p>
          {listingLimits.remainingListings !== -1 && (
            <p className="text-xs text-muted mt-0.5">
              Kalan: {listingLimits.remainingListings}
            </p>
          )}
        </div>
        {!listingLimits.canCreateListing && !listingLimits.isPremium && (
          <ButtonLink href="/membership">
            {t("page.new.listingbanners.premiumAGec")}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

/** IBAN gate — a listing can't be created before a bank account exists. */
export function BankGate() {
  const t = useTranslations();
  const { bankAccountLoading, hasBankAccount } = useNewListing();
  if (bankAccountLoading || hasBankAccount) return null;

  return (
    <div className="mb-5 p-4 rounded-lg border bg-danger-50 border-danger-200">
      <p className="font-medium text-danger-800 mb-1">
        {t("page.new.listingbanners.ilanVermedenOnceBankaHesabiEklemelisiniz")}
      </p>
      <p className="text-sm text-danger-700 mb-3">
        {t(
          "page.new.listingbanners.satislarinizdanEldeEdeceginizTutarinSizeAktarilabilmesi",
        )}
      </p>
      <ButtonLink href="/profile">
        {t("page.new.listingbanners.ibanEkle")}
      </ButtonLink>
    </div>
  );
}

/**
 * Kargo çıkış adresi kapısı — IBAN kapısının kardeşi.
 *
 * Kargo sözleşmesi göndericiyi zorunlu tutuyor: satıcının adresi ya da geçerli
 * cep numarası yoksa sipariş ödendikten SONRA koli hiç açılamıyor ve kimse fark
 * etmiyor. Eksikliği ilan aşamasında yakalamak, satışta yakalamaktan ucuz.
 *
 * Kayıt var ama kullanılamaz durumdaysa (ör. telefon sabit hat) metin "ekle"
 * değil "düzelt" demeli — yoksa satıcı ikinci bir adres ekleyip aynı yere düşer.
 */
export function AddressGate() {
  const t = useTranslations();
  const { addressLoading, hasDispatchAddress, dispatchAddressNeedsFix } =
    useNewListing();
  if (addressLoading || hasDispatchAddress) return null;

  return (
    <div className="mb-5 p-4 rounded-lg border bg-danger-50 border-danger-200">
      <p className="font-medium text-danger-800 mb-1">
        {dispatchAddressNeedsFix
          ? t("page.new.listingbanners.kargoAdresiniDuzeltmelisiniz")
          : t(
              "page.new.listingbanners.ilanVermedenOnceKargoAdresiEklemelisiniz",
            )}
      </p>
      <p className="text-sm text-danger-700 mb-3">
        {t("address.dispatchPromptDesc")}
      </p>
      <ButtonLink href="/profile">
        {dispatchAddressNeedsFix
          ? t("address.dispatchFixButton")
          : t("address.dispatchAddButton")}
      </ButtonLink>
    </div>
  );
}
