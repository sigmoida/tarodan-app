import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import { MaskedValue } from "@/components/MaskedValue";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
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
      variant={ok ? "success" : "default"}
      icon={ok ? <CheckCircleIcon className="h-3.5 w-3.5" /> : undefined}
    >
      {label}
    </Badge>
  );
}

function Item({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm text-muted">{label}</p>
      {children}
    </div>
  );
}

export function UserInfoSection({ user }: { user: UserDetail }) {
  const t = useTranslations();
  return (
    <SectionCard title={t("admin.users.detail.infoTitle")}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Item label={t("admin.users.detail.emailLabel")}>
          <p className="font-medium text-heading">{user.email}</p>
          <Verified kind="email" ok={user.isEmailVerified} />
        </Item>
        <Item label={t("common.phone")}>
          <p className="font-medium text-heading">
            {user.phone || t("admin.operations.common.notSpecified")}
          </p>
          {user.phone && <Verified kind="phone" ok={user.isPhoneVerified} />}
        </Item>
        <Item label={t("admin.users.registeredAt")}>
          <p className="text-heading">{fmtDate(user.createdAt)}</p>
        </Item>
        <Item label={t("admin.users.lastLogin")}>
          <p className="text-heading">
            {user.lastLoginAt
              ? fmtDateTime(user.lastLoginAt)
              : t("admin.users.neverLoggedIn")}
          </p>
        </Item>
        {user.bio && (
          <Item
            label={t("admin.users.detail.bioLabel")}
            className="sm:col-span-2"
          >
            <p className="text-heading">{user.bio}</p>
          </Item>
        )}
      </div>

      {user.isSeller && (
        <div className="mt-6 border-t border-border pt-6">
          <h3 className="mb-3 text-sm font-semibold text-heading">
            {t("admin.users.detail.sellerInfoTitle")}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Item label={t("admin.users.detail.sellerTypeLabel")}>
              <p className="text-heading">
                {user.sellerType === "individual"
                  ? t("admin.users.detail.individual")
                  : t("admin.users.detail.corporate")}
              </p>
            </Item>
            {user.companyName && (
              <Item label={t("admin.users.detail.companyNameLabel")}>
                <p className="text-heading">{user.companyName}</p>
              </Item>
            )}
            {user.taxId && (
              <Item label={t("admin.users.detail.taxIdLabel")}>
                <p className="text-heading">{user.taxId}</p>
              </Item>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-3 flex items-center gap-2">
              <h4 className="text-sm font-semibold text-heading">
                {t("admin.users.detail.bankAccountTitle")}
              </h4>
              {user.bankAccount && (
                <Badge
                  size="sm"
                  variant={user.bankAccount.isVerified ? "success" : "warning"}
                >
                  {user.bankAccount.isVerified
                    ? t("profile.bank.verified")
                    : t("profile.bank.unverified")}
                </Badge>
              )}
            </div>
            {user.bankAccount ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Item label={t("admin.users.detail.accountHolderLabel")}>
                  <p className="text-heading">
                    {user.bankAccount.accountHolder}
                  </p>
                </Item>
                <Item label={t("admin.users.detail.ibanLabel")}>
                  <MaskedValue value={user.bankAccount.iban} />
                </Item>
                {user.bankAccount.tcKimlikNo && (
                  <Item label={t("admin.users.detail.tcKimlikNoLabel")}>
                    <MaskedValue value={user.bankAccount.tcKimlikNo} />
                  </Item>
                )}
                {user.bankAccount.taxId && (
                  <Item label={t("admin.users.detail.taxIdLabel")}>
                    <p className="font-mono text-heading">
                      {user.bankAccount.taxId}
                    </p>
                  </Item>
                )}
                {user.bankAccount.verifiedAt && (
                  <Item label={t("admin.users.detail.verifiedAtLabel")}>
                    <p className="text-heading">
                      {fmtDateTime(user.bankAccount.verifiedAt)}
                    </p>
                  </Item>
                )}
              </div>
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
          <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 p-4">
            <p className="font-medium text-danger-600">
              {t("admin.users.detail.banReasonLabel")}
            </p>
            <p className="mt-1 text-heading">
              {user.bannedReason || t("admin.operations.common.notSpecified")}
            </p>
            {user.bannedAt && (
              <p className="mt-2 text-sm text-danger-600">
                {t("admin.users.detail.banDateLabel")}{" "}
                {fmtDateTime(user.bannedAt)}
              </p>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
