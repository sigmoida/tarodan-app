/** @format */

"use client";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { useNewListing } from "../_context/NewListingContext";

/** Listing-quota banner shown above the form. */
export function LimitBanner() {
  const { limitsLoading, listingLimits } = useNewListing();

  if (limitsLoading) {
    return (
      <div className="mb-5 p-3 bg-surface rounded animate-pulse">
        <div className="h-4 bg-border-subtle rounded w-1/3" />
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
    <div className={`mb-5 p-3 rounded border text-sm ${box}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`font-medium ${text}`}>
            {listingLimits.maxListings === -1
              ? `Mevcut İlan: ${listingLimits.currentCount} (Sınırsız)`
              : `İlan Hakkı: ${listingLimits.currentCount} / ${listingLimits.maxListings}`}
          </p>
          {listingLimits.remainingListings !== -1 && (
            <p className="text-xs text-muted mt-0.5">
              Kalan: {listingLimits.remainingListings}
            </p>
          )}
        </div>
        {!listingLimits.canCreateListing && !listingLimits.isPremium && (
          <ButtonLink href="/membership">Premium'a Geç</ButtonLink>
        )}
      </div>
    </div>
  );
}

/** IBAN gate — a listing can't be created before a bank account exists. */
export function BankGate() {
  const { bankAccountLoading, hasBankAccount } = useNewListing();
  if (bankAccountLoading || hasBankAccount) return null;

  return (
    <div className="mb-5 p-4 rounded border bg-danger-50 border-danger-200">
      <p className="font-medium text-danger-800 mb-1">
        İlan vermeden önce banka hesabı eklemelisiniz
      </p>
      <p className="text-sm text-danger-700 mb-3">
        Satışlarınızdan elde edeceğiniz tutarın size aktarılabilmesi için IBAN
        bilgisi gereklidir.
      </p>
      <ButtonLink href="/profile">IBAN Ekle</ButtonLink>
    </div>
  );
}
