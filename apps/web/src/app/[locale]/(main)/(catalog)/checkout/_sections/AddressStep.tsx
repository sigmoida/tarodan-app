/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { PlusIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { Button, Input, Radio, Textarea } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import CityDistrictSelector from "@/components/CityDistrictSelector";
import { PhoneInput } from "../_components/PhoneInput";
import { useCheckout } from "../_context/CheckoutContext";

export default function AddressStep() {
  const {
    t,
    isAuthenticated,
    addresses,
    selectedAddressId,
    setSelectedAddressId,
    showAddressForm,
    setShowAddressForm,
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
    guestName,
    setGuestName,
    guestEmail,
    setGuestEmail,
    guestPhone,
    setGuestPhone,
    guestPhoneCountryCode,
    setGuestPhoneCountryCode,
    addressStepValid,
    handleAddressStepContinue,
    handleAddAddress,
  } = useCheckout();

  return (
    <SectionCard title={t("checkout.shippingAddress")} className="p-6">
      {isAuthenticated ? (
        <>
          {/* Saved Addresses */}
          {addresses.length > 0 && (
            <div className="space-y-3 mb-4">
              {addresses.map((addr) => (
                <label
                  key={addr.id}
                  className={`block p-4 border-2 rounded cursor-pointer transition-all ${
                    selectedAddressId === addr.id
                      ? "border-primary-500 bg-primary-50"
                      : "border-border hover:border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Radio
                      name="address"
                      value={addr.id}
                      checked={selectedAddressId === addr.id}
                      onChange={() => setSelectedAddressId(addr.id)}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-semibold">{addr.fullName}</p>
                      <p className="text-muted text-sm">{addr.phone}</p>
                      <p className="text-muted text-sm">
                        {addr.address}, {addr.district}/{addr.city}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Add New Address */}
          {showAddressForm ? (
            <div className="border-2 border-dashed border-border rounded p-4 space-y-4">
              <Input
                type="text"
                placeholder={t("checkout.addressTitlePlaceholder")}
                value={newAddress.title || ""}
                onChange={(e) =>
                  setNewAddress({ ...newAddress, title: e.target.value })
                }
                className="rounded-[4px]"
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  type="text"
                  placeholder={t("checkout.fullName")}
                  value={newAddress.fullName}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, fullName: e.target.value })
                  }
                  className="rounded-[4px]"
                />
                <PhoneInput
                  countryCode={newAddressPhoneCountryCode}
                  onCountryCodeChange={setNewAddressPhoneCountryCode}
                  phone={newAddress.phone}
                  onPhoneChange={(phone) =>
                    setNewAddress({ ...newAddress, phone })
                  }
                />
              </div>
              <CityDistrictSelector
                city={newAddress.city}
                district={newAddress.district}
                onCityChange={(city) =>
                  setNewAddress((prev) => ({ ...prev, city, district: "" }))
                }
                onDistrictChange={(district) =>
                  setNewAddress((prev) => ({ ...prev, district }))
                }
                cityPlaceholder={t("common.selectCity") + " *"}
                districtPlaceholder={t("common.selectDistrict") + " *"}
              />
              <Textarea
                placeholder={t("common.openAddress")}
                rows={3}
                value={newAddress.address}
                onChange={(e) =>
                  setNewAddress({ ...newAddress, address: e.target.value })
                }
                className="input"
              />
              <div className="flex gap-2">
                <Button onClick={handleAddAddress}>{t("common.save")}</Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowAddressForm(false)}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setShowAddressForm(true)}
              className="p-4 border-2 border-dashed rounded text-muted hover:border-primary-500 hover:text-primary-500 items-center justify-center gap-2"
            >
              <PlusIcon className="w-5 h-5" />
              {t("checkout.addNewAddress")}
            </Button>
          )}
        </>
      ) : (
        /* Guest Checkout Form */
        <div className="space-y-4">
          <div className="bg-warning-50 border border-warning-200 rounded p-4 mb-4">
            <p className="text-sm text-warning-800">
              {t("checkout.guestShoppingNotice")}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              type="text"
              placeholder={t("checkout.guestName") + " *"}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="rounded-[4px]"
              required
            />
            <Input
              type="email"
              placeholder={t("checkout.guestEmail") + " *"}
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="rounded-[4px]"
              required
            />
          </div>

          <PhoneInput
            countryCode={guestPhoneCountryCode}
            onCountryCodeChange={setGuestPhoneCountryCode}
            phone={guestPhone}
            onPhoneChange={setGuestPhone}
            placeholder={
              guestPhoneCountryCode === "+90" ? "5XX XXX XX XX *" : "Telefon *"
            }
            required
          />

          <hr className="my-4" />
          <h3 className="font-semibold">{t("checkout.shippingAddress")}</h3>

          <Input
            type="text"
            placeholder={t("checkout.addressTitlePlaceholder")}
            value={newAddress.title || ""}
            onChange={(e) =>
              setNewAddress({ ...newAddress, title: e.target.value })
            }
            className="rounded-[4px]"
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              type="text"
              placeholder={t("checkout.fullName") + " *"}
              value={newAddress.fullName}
              onChange={(e) =>
                setNewAddress({ ...newAddress, fullName: e.target.value })
              }
              className="rounded-[4px]"
            />
            <PhoneInput
              countryCode={newAddressPhoneCountryCode}
              onCountryCodeChange={setNewAddressPhoneCountryCode}
              phone={newAddress.phone}
              onPhoneChange={(phone) => setNewAddress({ ...newAddress, phone })}
            />
          </div>
          <CityDistrictSelector
            city={newAddress.city}
            district={newAddress.district}
            onCityChange={(city) =>
              setNewAddress((prev) => ({ ...prev, city, district: "" }))
            }
            onDistrictChange={(district) =>
              setNewAddress((prev) => ({ ...prev, district }))
            }
            cityPlaceholder={t("common.selectCity") + " *"}
            districtPlaceholder={t("common.selectDistrict") + " *"}
          />
          <Textarea
            placeholder={t("common.openAddress") + " *"}
            rows={3}
            value={newAddress.address}
            onChange={(e) =>
              setNewAddress({ ...newAddress, address: e.target.value })
            }
            className="input"
          />

          <Link
            href="/login"
            className="text-primary-500 hover:underline text-sm"
          >
            Üye misiniz? Giriş yapın →
          </Link>
        </div>
      )}

      {/* Billing address: same as shipping or different */}
      <div className="mt-6 pt-6 border-t border-border">
        <h3 className="font-semibold text-heading mb-3 flex items-center gap-2">
          <ShieldCheckIcon className="w-5 h-5 text-primary-500" />
          {t("checkout.billingAddress")}
        </h3>
        <div className="mb-3">
          <Radio
            name="billingSame"
            checked={billingSameAsShipping}
            onChange={() => {
              setBillingSameAsShipping(true);
              setSelectedBillingAddressId(null);
            }}
            label={t("checkout.billingSameAsShippingLabel")}
          />
        </div>
        <Radio
          name="billingSame"
          checked={!billingSameAsShipping}
          onChange={() => setBillingSameAsShipping(false)}
          label={t("checkout.differentBilling")}
        />

        {!billingSameAsShipping && (
          <div className="mt-4 p-4 bg-surface rounded space-y-4">
            <p className="text-sm text-muted">
              {t("checkout.enterBillingAddress")}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                type="text"
                placeholder={t("checkout.fullName") + " *"}
                value={newBillingAddress.fullName}
                onChange={(e) =>
                  setNewBillingAddress((prev) => ({
                    ...prev,
                    fullName: e.target.value,
                  }))
                }
                className="rounded-[4px]"
              />
              <PhoneInput
                countryCode={billingAddressPhoneCountryCode}
                onCountryCodeChange={setBillingAddressPhoneCountryCode}
                phone={newBillingAddress.phone}
                onPhoneChange={(phone) =>
                  setNewBillingAddress((prev) => ({ ...prev, phone }))
                }
              />
            </div>
            <CityDistrictSelector
              city={newBillingAddress.city}
              district={newBillingAddress.district}
              onCityChange={(city) =>
                setNewBillingAddress((prev) => ({
                  ...prev,
                  city,
                  district: "",
                }))
              }
              onDistrictChange={(district) =>
                setNewBillingAddress((prev) => ({ ...prev, district }))
              }
              cityPlaceholder={t("common.selectCity")}
              districtPlaceholder={t("common.selectDistrict")}
            />
            <Textarea
              placeholder={t("common.openAddress") + " *"}
              rows={2}
              value={newBillingAddress.address}
              onChange={(e) =>
                setNewBillingAddress((prev) => ({
                  ...prev,
                  address: e.target.value,
                }))
              }
              className="input"
            />
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          type="button"
          onClick={() => void handleAddressStepContinue()}
          disabled={!addressStepValid}
        >
          Devam Et
        </Button>
      </div>
    </SectionCard>
  );
}
