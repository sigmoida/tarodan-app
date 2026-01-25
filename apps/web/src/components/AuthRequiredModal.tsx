'use client';

import { useRouter } from 'next/navigation';
import { XMarkIcon, UserIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';

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
    const currentPath = redirectPath || window.location.pathname + window.location.search;
    router.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
  };

  const handleRegister = () => {
    const currentPath = redirectPath || window.location.pathname + window.location.search;
    router.push(`/register?redirect=${encodeURIComponent(currentPath)}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 transition-colors z-10"
        >
          <XMarkIcon className="w-6 h-6 text-gray-400" />
        </button>

        {/* Content */}
        <div className="p-8 text-center">
          {/* Icon */}
          <div className="w-20 h-20 mx-auto mb-6 bg-primary-50 rounded-full flex items-center justify-center">
            {icon || (
              <UserIcon className="w-10 h-10 text-primary-500" />
            )}
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            {title || t('auth.authRequired')}
          </h2>

          {/* Message */}
          <p className="text-gray-600 mb-8">
            {message}
          </p>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleLogin}
              className="w-full py-3 px-4 bg-primary-500 text-white font-semibold rounded-xl hover:bg-primary-600 transition-colors flex items-center justify-center gap-2"
            >
              <UserIcon className="w-5 h-5" />
              {t('common.login')}
            </button>
            
            <button
              onClick={handleRegister}
              className="w-full py-3 px-4 bg-gray-100 text-gray-800 font-semibold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <UserPlusIcon className="w-5 h-5" />
              {t('auth.freeSignUp')}
            </button>
          </div>

          {/* Benefits hint */}
          <p className="mt-6 text-sm text-gray-500">
            {t('auth.memberBenefits')}
          </p>
        </div>
      </div>
    </div>
  );
}
