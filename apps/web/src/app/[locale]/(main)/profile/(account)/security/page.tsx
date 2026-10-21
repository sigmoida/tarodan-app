/** @format */

"use client";

/**
 * Two-Factor Authentication (2FA) Setup Page
 *
 * Requirement: 2FA (TOTP) support (PROJECT.md)
 * Allows users to enable/disable TOTP-based two-factor authentication.
 */

import { useTranslations } from "next-intl";
import { Alert, Button, Spinner } from "@tarodan/ui";
import { XCircleIcon } from "@heroicons/react/24/outline";
import { Link } from "@/i18n/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useSignInMethods } from "../../_hooks/useSecurity";
import { PASSWORD_SECTION_ID } from "../../_lib/anchors";
import { use2FA } from "./_hooks/use2FA";
import StatusCard from "./_sections/StatusCard";
import SetupIntro from "./_sections/SetupIntro";
import SetupFlow from "./_sections/SetupFlow";
import BackupCodesModal from "./_modals/BackupCodesModal";
import EnabledOptions from "./_sections/EnabledOptions";
import WhyItMatters from "./_sections/WhyItMatters";

export default function SecuritySettingsPage() {
  const t = useTranslations();
  const {
    status,
    isLoading,
    error,
    setError,
    setupData,
    cancelSetup,
    backupCodes,
    showBackupCodes,
    closeBackupCodes,
    enable,
    verify,
    disable,
    regenerateBackupCodes,
  } = use2FA();
  const { methods } = useSignInMethods();
  // 2FA needs a password (the API refuses it without one): an account that
  // signs in only with Google or Apple is sent to set one first.
  const needsPassword = methods?.hasPassword === false;

  if (isLoading && !setupData) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <PageShell className="pb-16">
      <PageHeader
        title={t("profile.twoFactor.pageTitle")}
        description={t("profile.twoFactor.pageDescription")}
      />

      {error && (
        <Alert
          variant="danger"
          title={t("common.error")}
          icon={<XCircleIcon className="h-5 w-5 text-danger-600" />}
          className="mb-6"
        >
          {error}
        </Alert>
      )}

      <div className="space-y-6">
        <StatusCard isEnabled={status.isEnabled} />

        {!status.isEnabled && !setupData && needsPassword && (
          <Alert
            variant="warning"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={`/profile#${PASSWORD_SECTION_ID}`}>
                  {t("auth.setPassword")}
                </Link>
              </Button>
            }
          >
            {t("profile.security.passwordFirstFor2fa")}
          </Alert>
        )}

        {!status.isEnabled && !setupData && !needsPassword && (
          <SetupIntro
            onStart={() => enable.mutate()}
            isLoading={enable.isPending}
          />
        )}

        {setupData && (
          <SetupFlow
            setupData={setupData}
            verify={(code) => verify.mutate(code)}
            isVerifying={verify.isPending}
            onCancel={cancelSetup}
            setError={setError}
          />
        )}

        {status.isEnabled && (
          <EnabledOptions
            regenerate={(code, options) =>
              regenerateBackupCodes.mutate(code, options)
            }
            isRegenerating={regenerateBackupCodes.isPending}
            disable={(code, options) => disable.mutate(code, options)}
            isDisabling={disable.isPending}
            setError={setError}
          />
        )}

        <WhyItMatters />
      </div>

      <BackupCodesModal
        isOpen={showBackupCodes}
        codes={backupCodes}
        onClose={closeBackupCodes}
      />
    </PageShell>
  );
}
