/** @format */

"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon } from "@heroicons/react/24/outline";
import { Button, Spinner } from "@tarodan/ui";
import {
  Form,
  FormDatePicker,
  FormInput,
  FormPhone,
  FormTextarea,
  useZodForm,
} from "@tarodan/ui/form";
import OptimizedImage from "@/components/OptimizedImage";
import UserAvatar from "@/components/UserAvatar";
import SectionCard from "@/components/ui/SectionCard";
import { useAuthStore } from "@/stores/authStore";
import { profileInfoSchema, type ProfileInfoValues } from "../_lib/schemas";
import {
  useProfileInfo,
  useUpdateProfile,
  useUploadAvatar,
} from "../_hooks/useProfileInfo";

const EMPTY: ProfileInfoValues = {
  displayName: "",
  phone: "",
  birthDate: "",
  bio: "",
  companyName: "",
  taxId: "",
  taxOffice: "",
};

/** Personal (+ business) info — independent query, RHF+zod form, own save button. */
export default function ProfileInfoSection() {
  const { isAuthenticated, user } = useAuthStore();
  const { profile, isLoading } = useProfileInfo(isAuthenticated);
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();

  const isBusiness =
    (profile?.membershipTier ?? user?.membershipTier) === "business";
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  const form = useZodForm(profileInfoSchema, { defaultValues: EMPTY });

  useEffect(() => {
    if (!profile) return;
    form.reset({
      displayName: profile.displayName || "",
      phone: profile.phone || "",
      birthDate: profile.birthDate
        ? new Date(profile.birthDate).toISOString().split("T")[0]
        : "",
      bio: profile.bio || "",
      companyName: profile.companyName || "",
      taxId: profile.taxId || "",
      taxOffice: "",
    });
    if (profile.avatarUrl) setPhoto((p) => p ?? profile.avatarUrl!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const onSubmit = (values: ProfileInfoValues) => {
    const payload: Record<string, unknown> = { ...values };
    if (!isBusiness) {
      delete payload.companyName;
      delete payload.taxId;
      delete payload.taxOffice;
    }
    updateProfile.mutate(payload);
  };

  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return;
    uploadAvatar.mutate(file, { onSuccess: (url) => setPhoto(url) });
  };

  return (
    <SectionCard
      title="Profil Bilgileri"
      action={
        <Button
          type="button"
          size="sm"
          onClick={form.handleSubmit(onSubmit)}
          isLoading={updateProfile.isPending}
        >
          Kaydet
        </Button>
      }
    >
      <div className="mb-5 flex items-center gap-4">
        <div className="relative">
          <div className="h-20 w-20 overflow-hidden rounded-xl bg-surface-alt">
            {photo ? (
              <OptimizedImage
                src={photo}
                alt="Profil"
                fill
                className="object-cover"
                logContext={{ page: "profile-avatar" }}
              />
            ) : (
              <UserAvatar
                displayName={profile?.displayName}
                avatarUrl={profile?.avatarUrl}
                size="lg"
                className="!h-full !w-full"
              />
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={uploadAvatar.isPending}
            className="absolute -bottom-2 -right-2 h-9 w-9 rounded-lg p-0"
          >
            {uploadAvatar.isPending ? (
              <Spinner size="sm" />
            ) : (
              <CameraIcon className="h-4 w-4" />
            )}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickPhoto}
            className="hidden"
          />
        </div>
        <div>
          <p className="font-medium text-heading">
            {profile?.displayName || "—"}
          </p>
          <p className="text-sm text-muted">{profile?.email}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      ) : (
        <Form form={form} onSubmit={onSubmit} className="space-y-4">
          <FormInput
            name="displayName"
            label="Görünen İsim"
            placeholder="Adınız"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <FormPhone name="phone" label="Telefon" />
            <FormDatePicker name="birthDate" label="Doğum Tarihi" />
          </div>
          <FormTextarea name="bio" label="Hakkımda" rows={4} maxLength={500} />

          {isBusiness && (
            <div className="space-y-4 rounded-lg border border-border-subtle bg-surface p-4">
              <p className="text-sm font-semibold text-heading">
                İşletme Bilgileri
              </p>
              <FormInput
                name="companyName"
                label="Şirket / Ticari Unvan"
                placeholder="ABC Ltd. Şti."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FormInput
                  name="taxId"
                  label="Vergi Kimlik No"
                  placeholder="1234567890"
                />
                <FormInput
                  name="taxOffice"
                  label="Vergi Dairesi"
                  placeholder="Kadıköy VD"
                />
              </div>
            </div>
          )}
        </Form>
      )}
    </SectionCard>
  );
}
