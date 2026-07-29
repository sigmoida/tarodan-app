"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AtSymbolIcon, BuildingOffice2Icon } from "@heroicons/react/24/outline";
import { Button, Input, Spinner } from "@tarodan/ui";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { webKeys } from "@/lib/query/keys";
import { AuthCard } from "../../../_components/AuthCard";
import { PasswordChecklist } from "../../../_components/PasswordChecklist";

export default function CorporateInvitationPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const invitation = useQuery({
    queryKey: webKeys.detail("corporate-invitation", token),
    queryFn: () => api.get("/auth/corporate-invitation", { params: { token } }),
    enabled: Boolean(token),
    retry: false,
  });

  const activate = useMutation({
    mutationFn: () =>
      api.post("/auth/corporate-invitation/activate", {
        token,
        username: username.trim().toLowerCase(),
        password,
      }),
    onSuccess: () => {
      toast.success(t("auth.corporateAccountCreated"));
      router.push("/login");
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message || t("common.error")),
  });

  if (invitation.isLoading) return <Spinner size="lg" />;

  if (!token || invitation.isError) {
    return (
      <AuthCard
        title={t("auth.invalidLink")}
        description={t("auth.corporateInvitationInvalid")}
      >
        <div />
      </AuthCard>
    );
  }

  const company = invitation.data?.data;
  const passwordValid =
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password);

  return (
    <AuthCard
      title={t("auth.createCorporateAccount")}
      description={company?.companyTitle}
    >
      <div className="mb-5 flex items-center gap-3 border border-border-subtle bg-surface p-4">
        <BuildingOffice2Icon className="h-6 w-6 text-primary-600" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-heading">
            {company?.companyTitle}
          </p>
          <p className="truncate text-xs text-muted">{company?.companyEmail}</p>
        </div>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== confirmPassword) {
            toast.error(t("validation.passwordMatch"));
            return;
          }
          activate.mutate();
        }}
      >
        <Input
          label={t("auth.username")}
          value={username}
          onChange={(event) =>
            setUsername(event.target.value.toLowerCase().replace(/\s/g, ""))
          }
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9](?:[a-z0-9._]*[a-z0-9])?"
          helperText={t("auth.usernameImmutableHint")}
          leftAdornment={<AtSymbolIcon className="h-4 w-4" />}
          required
        />
        <Input
          label={t("auth.password")}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
        <Input
          label={t("auth.confirmPassword")}
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
        <PasswordChecklist password={password} />
        <Button
          type="submit"
          className="w-full"
          isLoading={activate.isPending}
          disabled={
            username.length < 3 ||
            !passwordValid ||
            password !== confirmPassword
          }
        >
          {t("auth.createCorporateAccount")}
        </Button>
      </form>
    </AuthCard>
  );
}
