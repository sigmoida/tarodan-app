'use client';

import { useRouter } from 'next/navigation';
import { XMarkIcon, UserIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';import { Button } from '@tarodan/ui';


interface AuthRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  icon?: React.ReactNode;
  redirectPath?: string;
}

export default function AuthRequiredModal({
  isOpen,
  onClose,
  title,
  message,
  icon,
  redirectPath,
}: AuthRequiredModalProps) {
  const router = useRouter();
  const { t } = useTranslation();

  if (!isOpen) return null;

  const handleLogin = () => {
    onClose(); // Close modal first
    const currentPath = redirectPath || window.location.pathname + window.location.search;
    router.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
  };

  const handleRegister = () => {
    onClose(); // Close modal first
    const currentPath = redirectPath || window.location.pathname + window.location.search;
    router.push(`/register?redirect=${encodeURIComponent(currentPath)}`);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-6 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white shadow-2xl max-w-sm sm:max-w-md w-full mx-auto overflow-hidden" style={{borderRadius:'6px'}}>
        {/* Close button */}
        <Button variant="secondary" onClick={onClose}
          className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 transition-colors z-10"
          style={{borderRadius:'4px'}}>
          <XMarkIcon className="w-5 h-5 text-gray-400" />
        </Button>

        {/* Content */}
        <div className="p-6 sm:p-8 text-center">
          {/* Icon */}
          <div className="w-16 h-16 mx-auto mb-5 bg-primary-50 flex items-center justify-center" style={{borderRadius:'50%'}}>
            {icon || (
              <UserIcon className="w-8 h-8 text-primary-500" />
            )}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {title || t('auth.authRequired')}
          </h2>

          {/* Message */}
          <p className="text-sm text-gray-600 mb-6">
            {message}
          </p>

          {/* Buttons */}
          <div className="space-y-2.5">
            <Button variant="secondary" onClick={handleLogin}
              className="w-full py-2.5 px-4 bg-primary-500 text-white font-semibold text-sm hover:bg-primary-600 transition-colors flex items-center justify-center gap-2"
              style={{borderRadius:'4px'}}>
              <UserIcon className="w-4 h-4" />
              {t('common.login')}
            </Button>
            
            <Button variant="secondary" onClick={handleRegister}
              className="w-full py-2.5 px-4 bg-gray-100 text-gray-800 font-semibold text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
              style={{borderRadius:'4px'}}>
              <UserPlusIcon className="w-4 h-4" />
              {t('auth.freeSignUp')}
            </Button>
          </div>

          {/* Benefits hint */}
          <p className="mt-5 text-xs text-gray-500">
            {t('auth.memberBenefits')}
          </p>
        </div>
      </div>
    </div>
  );
}
