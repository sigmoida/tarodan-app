'use client';

/**
 * Two-Factor Authentication (2FA) Setup Page
 *
 * Requirement: 2FA (TOTP) support (PROJECT.md)
 * Allows users to enable/disable TOTP-based two-factor authentication.
 */

import { Spinner } from '@tarodan/ui';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { use2FA } from './_hooks/use2FA';
import StatusCard from './_sections/StatusCard';
import SetupIntro from './_sections/SetupIntro';
import SetupFlow from './_sections/SetupFlow';
import BackupCodesModal from './_sections/BackupCodesModal';
import EnabledOptions from './_sections/EnabledOptions';
import WhyItMatters from './_sections/WhyItMatters';

export default function SecuritySettingsPage() {
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

  if (isLoading && !setupData) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-surface'>
        <Spinner size='xl' />
      </div>
    );
  }

  return (
    <PageShell className='pb-16'>
      <div className='mx-auto w-full max-w-3xl px-4'>
        <PageHeader
          title='Güvenlik Ayarları'
          description='İki faktörlü kimlik doğrulama (2FA)'
        />

        {error && (
          <div className='mb-6 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-danger-700'>
            {error}
          </div>
        )}

        <div className='space-y-6'>
          <StatusCard isEnabled={status.isEnabled} />

          {!status.isEnabled && !setupData && (
            <SetupIntro onStart={() => enable.mutate()} isLoading={enable.isPending} />
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
              regenerate={(code, options) => regenerateBackupCodes.mutate(code, options)}
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
      </div>
    </PageShell>
  );
}
