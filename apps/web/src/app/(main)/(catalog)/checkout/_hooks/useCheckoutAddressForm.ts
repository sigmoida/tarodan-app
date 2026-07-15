/** @format */

"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import toast from "react-hot-toast";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import { addressesApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { getFullPhoneNumber } from "@/lib/phone";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@tarodan/i18n";
import { savedAddressSchema } from "../_lib/schema";
import type { Address } from "../_lib/types";

type Translate = ReturnType<typeof useTranslations<never>>;

const EMPTY_ADDRESS: Omit<Address, "id"> = {
  title: "",
  fullName: "",
  phone: "",
  city: "",
  district: "",
  address: "",
  zipCode: "",
};

/**
 * New-address form slice: the shipping form (+ its country code) and the billing
 * form (same-as-shipping toggle, saved-billing selection, and its own form +
 * country code), plus `handleAddAddress` (create + refetch + select) and the
 * `invalidateAddresses` helper. Extracted verbatim from the checkout context.
 */
export function useCheckoutAddressForm({
  isAuthenticated,
  user,
  addresses,
  locale,
  t,
  queryClient,
  setSelectedAddressId,
  setShowAddressForm,
}: {
  isAuthenticated: boolean;
  user: { displayName?: string; phone?: string } | null | undefined;
  addresses: Address[];
  locale: Locale;
  t: Translate;
  queryClient: QueryClient;
  setSelectedAddressId: Dispatch<SetStateAction<string | null>>;
  setShowAddressForm: Dispatch<SetStateAction<boolean>>;
}) {
  // New address form
  const [newAddress, setNewAddress] =
    useState<Omit<Address, "id">>(EMPTY_ADDRESS);
  const [newAddressPhoneCountryCode, setNewAddressPhoneCountryCode] =
    useState("+90");

  // Billing address: same as shipping (default) or different
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<
    string | null
  >(null);
  const [newBillingAddress, setNewBillingAddress] =
    useState<Omit<Address, "id">>(EMPTY_ADDRESS);
  const [billingAddressPhoneCountryCode, setBillingAddressPhoneCountryCode] =
    useState("+90");

  // Pre-populate new address form with user's profile info
  useEffect(() => {
    if (isAuthenticated && user) {
      setNewAddress((prev) => ({
        ...prev,
        fullName: prev.fullName || user.displayName || "",
        phone: prev.phone || user.phone || "",
      }));
    }
  }, [isAuthenticated, user]);

  const invalidateAddresses = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.checkout.addresses() });

  const addAddressMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode: string | undefined;
      isDefault: boolean;
    }) => addressesApi.create(payload),
    onSuccess: async (response) => {
      // Handle different response structures
      let createdAddress: any = null;
      if (response.data) {
        if (
          response.data.id &&
          typeof response.data === "object" &&
          !Array.isArray(response.data)
        ) {
          createdAddress = response.data;
        } else if (
          response.data.address &&
          typeof response.data.address === "object" &&
          response.data.address.id
        ) {
          createdAddress = response.data.address;
        } else if (
          typeof response.data === "object" &&
          !Array.isArray(response.data) &&
          response.data.id
        ) {
          createdAddress = response.data;
        }
      }

      if (
        createdAddress &&
        createdAddress.id &&
        typeof createdAddress.id === "string"
      ) {
        setShowAddressForm(false);
        setNewAddress({
          title: "",
          fullName: user?.displayName || "",
          phone: user?.phone || "",
          city: "",
          district: "",
          address: "",
          zipCode: "",
        });
        // Refresh the address list, then select the newly created address.
        await invalidateAddresses();
        setSelectedAddressId(createdAddress.id);
        toast.success(t("address.addressAdded"));
      } else {
        await invalidateAddresses();
        toast.error(t("checkout.addressAddedUnverified"));
      }
    },
    onError: async (error: any) => {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        t("checkout.addressAddError");
      if (error.response?.status === 400) {
        await invalidateAddresses();
      }
      toast.error(errorMessage);
    },
  });

  const handleAddAddress = async () => {
    const parsed = savedAddressSchema(locale).safeParse(newAddress);
    if (!parsed.success) {
      toast.error(t("checkout.fillAllRequiredWithTitle"));
      return;
    }

    // Format phone number with country code
    const formattedPhone = getFullPhoneNumber(
      newAddress.phone,
      newAddressPhoneCountryCode,
    );

    addAddressMutation.mutate({
      title: (newAddress.title ?? "").trim(),
      fullName: newAddress.fullName,
      phone: formattedPhone,
      city: newAddress.city,
      district: newAddress.district,
      address: newAddress.address,
      zipCode: newAddress.zipCode || undefined,
      isDefault: addresses.length === 0, // Make first address default
    });
  };

  return {
    newAddress,
    setNewAddress,
    newAddressPhoneCountryCode,
    setNewAddressPhoneCountryCode,
    billingSameAsShipping,
    setBillingSameAsShipping,
    selectedBillingAddressId,
    setSelectedBillingAddressId,
    newBillingAddress,
    setNewBillingAddress,
    billingAddressPhoneCountryCode,
    setBillingAddressPhoneCountryCode,
    invalidateAddresses,
    handleAddAddress,
  };
}
