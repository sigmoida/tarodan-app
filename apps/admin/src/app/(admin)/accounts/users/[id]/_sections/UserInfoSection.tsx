import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Alert, Badge } from "@tarodan/ui";
import { MaskedValue } from "@/components/MaskedValue";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { type UserDetail } from "../types";

/** "Doğrulanmış" tek başına neyin doğrulandığını söylemiyordu; rozet kanalını da söyler. */
function Verified({ kind, ok }: { kind: "email" | "phone"; ok: boolean }) {
  const t = useTranslations();
  const label =
    kind === "email"
      ? ok
        ? t("admin.users.emailVerified")
        : t("admin.users.emailNotVerified")
      : ok
        ? t("admin.users.phoneVerified")
        : t("admin.users.phoneNotVerified");
  return (
    <Badge
      className="mt-1"
      size="sm"
      variant={ok ? "success" : "outline"}
      icon={ok ? <CheckCircleIcon className="h-3.5 w-3.5" /> : undefined}
    >
      {label}
    </Badge>
  );
}

export function UserInfoSection({ user }: { user: UserDetail }) {
  const t = useTranslations();
  return (
    <SectionCard title={t("admin.users.detail.infoTitle")}>
      <DataList columns={2}>
        <Field layout="stacked" label={t("admin.users.detail.emailLabel")}>
          <p className="font-medium text-heading">{user.email}</p>
          <Verified kind="email" ok={user.isEmailVerified} />
          {user.isTestAccount && (
            <Badge className="mt-1" size="sm" variant="warning">
              {t("admin.users.testAccount")} —{" "}
              {t("admin.users.testAccountHint")}
            </Badge>
          )}
        </Field>
        <Field layout="stacked" label={t("common.phone")}>
          <p className="font-medium text-heading">
            {user.phone || t("admin.operations.common.notSpecified")}
          </p>
          {user.phone && <Verified kind="phone" ok={user.isPhoneVerified} />}
        </Field>
        <Field layout="stacked" label={t("admin.users.registeredAt")}>
          <p className="text-heading">{fmtDate(user.createdAt)}</p>
        </Field>
        <Field layout="stacked" label={t("admin.users.lastLogin")}>
          <p className="text-heading">
            {user.lastLoginAt
              ? fmtDateTime(user.lastLoginAt)
              : t("admin.users.neverLoggedIn")}
          </p>
        </Field>
      </DataList>

      {user.isSeller && (
        <div className="mt-6 border-t border-border pt-6">
          <SectionTitle as="h3" size="sm" className="mb-3">
            {t("admin.users.detail.sellerInfoTitle")}
          </SectionTitle>
          <DataList columns={2}>
            <Field
              layout="stacked"
              label={t("admin.users.detail.sellerTypeLabel")}
            >
              <p className="text-heading">
                {user.sellerType === "individual"
                  ? t("admin.users.detail.individual")
                  : t("admin.users.detail.corporate")}
              </p>
            </Field>
            {user.companyName && (
              <Field
                layout="stacked"
                label={t("admin.users.detail.companyNameLabel")}
              >
                <p className="text-heading">{user.companyName}</p>
              </Field>
            )}
            {user.taxId && (
              <Field
                layout="stacked"
                label={t("admin.users.detail.taxIdLabel")}
              >
                <p className="text-heading">{user.taxId}</p>
              </Field>
            )}
          </DataList>

          <div className="mt-4 border-t border-border pt-4">
            <SectionTitle as="h4" size="sm" className="mb-3">
              {t("admin.users.detail.bankAccountTitle")}
            </SectionTitle>
            {user.bankAccount ? (
              <DataList columns={2}>
                <Field
                  layout="stacked"
                  label={t("admin.users.detail.accountHolderLabel")}
                >
                  <p className="text-heading">
                    {user.bankAccount.accountHolder}
                  </p>
                </Field>
                <Field
                  layout="stacked"
                  label={t("admin.users.detail.ibanLabel")}
                >
                  <MaskedValue value={user.bankAccount.iban} />
                </Field>
                {user.bankAccount.tcKimlikNo && (
                  <Field
                    layout="stacked"
                    label={t("admin.users.detail.tcKimlikNoLabel")}
                  >
                    <MaskedValue value={user.bankAccount.tcKimlikNo} />
                  </Field>
                )}
                {user.bankAccount.taxId && (
                  <Field
                    layout="stacked"
                    label={t("admin.users.detail.taxIdLabel")}
                  >
                    <p className="font-mono text-heading">
                      {user.bankAccount.taxId}
                    </p>
                  </Field>
                )}
              </DataList>
            ) : (
              <p className="text-sm text-muted">
                {t("admin.users.detail.noBankAccount")}
              </p>
            )}
          </div>
        </div>
      )}

      {user.isBanned && (
        <div className="mt-6 border-t border-border pt-6">
          <Alert
            variant="danger"
            title={t("admin.users.detail.banReasonLabel")}
          >
            <p className="text-heading">
              {user.bannedReason || t("admin.operations.common.notSpecified")}
            </p>
            {user.bannedAt && (
              <p className="mt-2 text-sm">
                {t("admin.users.detail.banDateLabel")}{" "}
                {fmtDateTime(user.bannedAt)}
              </p>
            )}
          </Alert>
        </div>
      )}
    </SectionCard>
  );
}
