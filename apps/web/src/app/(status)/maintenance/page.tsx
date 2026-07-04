'use client';

import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';
import StatusScreen from '../_components/StatusScreen';
import SocialLinks from '../_components/SocialLinks';

export default function MaintenancePage() {
  const { t } = useTranslation();
  return (
    <StatusScreen
      icon={WrenchScrewdriverIcon}
      tone="warning"
      title={t('utility.maintenance.title')}
      description={t('utility.maintenance.description')}
    >
      <p className="text-sm text-muted mb-6">
        {t('utility.maintenance.estimatedTime')}: ~30 dakika
      </p>
      <SocialLinks title={t('utility.maintenance.socialTitle')} />
    </StatusScreen>
  );
}
