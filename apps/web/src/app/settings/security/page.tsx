'use client';

/**
 * Two-Factor Authentication (2FA) Setup Page
 * 
 * Requirement: 2FA (TOTP) support (PROJECT.md)
 * Allows users to enable/disable TOTP-based two-factor authentication
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import api from '@/lib/api';

interface TwoFactorStatus {
  isEnabled: boolean;
  backupCodesCount?: number;
}

interface SetupResponse {
  qrCodeUrl: string;
  secret: string;
  backupCodes: string[];
}

export default function SecuritySettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<TwoFactorStatus>({ isEnabled: false });
  const [isLoading, setIsLoading] = useState(true);
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  useEffect(() => {
    fetchTwoFactorStatus();
  }, []);

  const fetchTwoFactorStatus = async () => {
    try {
      const response = await api.get('/auth/2fa/status');
      setStatus(response.data);
    } catch (err) {
      console.error('Failed to fetch 2FA status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitiate2FA = async () => {
    setError('');
    setIsLoading(true);
    
    try {
      const response = await api.post('/auth/2fa/setup');
      setSetupData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || '2FA kurulumu başlatılamadı');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAndEnable = async () => {
    if (verificationCode.length !== 6) {
      setError('Lütfen 6 haneli kodu girin');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const response = await api.post('/auth/2fa/verify', {
        token: verificationCode,
      });

      setBackupCodes(response.data.backupCodes || setupData?.backupCodes || []);
      setShowBackupCodes(true);
      setStatus({ isEnabled: true, backupCodesCount: 10 });
      setSetupData(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Doğrulama başarısız');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disablePassword) {
      setError('Şifrenizi girin');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await api.post('/auth/2fa/disable', {
        password: disablePassword,
      });

      setStatus({ isEnabled: false });
      setShowDisableConfirm(false);
      setDisablePassword('');
    } catch (err: any) {
      setError(err.response?.data?.message || '2FA devre dışı bırakılamadı');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/2fa/backup-codes/regenerate');
      setBackupCodes(response.data.backupCodes);
      setShowBackupCodes(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Yedek kodlar oluşturulamadı');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (isLoading && !setupData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center">
            <Link href="/profile" className="text-gray-500 hover:text-gray-700 mr-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Güvenlik Ayarları</h1>
              <p className="text-gray-600 mt-1">İki faktörlü kimlik doğrulama (2FA)</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* 2FA Status Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                status.isEnabled ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                <svg 
                  className={`w-6 h-6 ${status.isEnabled ? 'text-green-600' : 'text-gray-400'}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" 
                  />
                </svg>
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  İki Faktörlü Kimlik Doğrulama
                </h2>
                <p className="text-sm text-gray-600">
                  {status.isEnabled 
                    ? 'Hesabınız 2FA ile korunuyor' 
                    : 'Hesabınızı daha güvenli hale getirin'}
                </p>
              </div>
            </div>
            <div>
              {status.isEnabled ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  Aktif
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                  Pasif
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Setup Section (when not enabled) */}
        {!status.isEnabled && !setupData && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">2FA'yı Etkinleştir</h3>
            <p className="text-gray-600 mb-6">
              İki faktörlü kimlik doğrulama, hesabınıza giriş yaparken şifrenizin yanı sıra 
              telefonunuzdaki bir uygulama tarafından oluşturulan bir kod girmenizi gerektirir.
            </p>
            
            <div className="bg-orange-50 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-orange-900 mb-2">Gereksinimler:</h4>
              <ul className="text-sm text-orange-800 space-y-1">
                <li className="flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Google Authenticator veya benzer bir TOTP uygulaması
                </li>
                <li className="flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Akıllı telefon (iOS veya Android)
                </li>
              </ul>
            </div>

            <button
              onClick={handleInitiate2FA}
              disabled={isLoading}
              className="w-full bg-red-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Yükleniyor...' : '2FA Kurulumunu Başlat'}
            </button>
          </div>
        )}

        {/* Setup Flow (QR Code) */}
        {setupData && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">2FA Kurulumu</h3>
            
            {/* Step 1: Scan QR */}
            <div className="mb-6">
              <div className="flex items-center mb-3">
                <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-medium mr-2">
                  1
                </span>
                <span className="font-medium text-gray-900">QR Kodu Tarayın</span>
              </div>
              <p className="text-sm text-gray-600 mb-4 ml-8">
                Google Authenticator veya benzer bir uygulama ile aşağıdaki QR kodunu tarayın.
              </p>
              <div className="flex justify-center mb-4">
                <div className="p-4 bg-white border-2 border-gray-200 rounded-lg">
                  {setupData.qrCodeUrl ? (
                    <Image
                      src={setupData.qrCodeUrl}
                      alt="2FA QR Code"
                      width={200}
                      height={200}
                    />
                  ) : (
                    <div className="w-[200px] h-[200px] bg-gray-100 flex items-center justify-center text-gray-400">
                      QR Kod Yüklenemedi
                    </div>
                  )}
                </div>
              </div>
              <div className="ml-8">
                <p className="text-sm text-gray-600 mb-2">
                  QR kodu tarayamıyorsanız, bu kodu manuel olarak girin:
                </p>
                <div className="flex items-center">
                  <code className="bg-gray-100 px-3 py-2 rounded text-sm font-mono flex-1">
                    {setupData.secret}
                  </code>
                  <button
                    onClick={() => copyToClipboard(setupData.secret)}
                    className="ml-2 p-2 text-gray-500 hover:text-gray-700"
                    title="Kopyala"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2: Verify */}
            <div className="mb-6">
              <div className="flex items-center mb-3">
                <span className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-medium mr-2">
                  2
                </span>
                <span className="font-medium text-gray-900">Doğrulama Kodunu Girin</span>
              </div>
              <p className="text-sm text-gray-600 mb-4 ml-8">
                Uygulamanızda görünen 6 haneli kodu girin.
              </p>
              <div className="ml-8">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full max-w-xs px-4 py-3 text-2xl text-center tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  maxLength={6}
                />
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => setSetupData(null)}
                className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleVerifyAndEnable}
                disabled={isVerifying || verificationCode.length !== 6}
                className="flex-1 bg-red-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isVerifying ? 'Doğrulanıyor...' : 'Doğrula ve Etkinleştir'}
              </button>
            </div>
          </div>
        )}

        {/* Backup Codes Modal */}
        {showBackupCodes && backupCodes.length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">2FA Etkinleştirildi!</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Aşağıdaki yedek kodları güvenli bir yere kaydedin.
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ Bu kodlar sadece bir kez gösterilecek. Telefonunuza erişiminizi kaybederseniz hesabınıza giriş yapmak için bu kodlara ihtiyacınız olacak.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {backupCodes.map((code, index) => (
                  <code
                    key={index}
                    className="bg-gray-100 px-3 py-2 rounded text-sm font-mono text-center"
                  >
                    {code}
                  </code>
                ))}
              </div>

              <button
                onClick={() => copyToClipboard(backupCodes.join('\n'))}
                className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors mb-4"
              >
                Tüm Kodları Kopyala
              </button>

              <button
                onClick={() => {
                  setShowBackupCodes(false);
                  setBackupCodes([]);
                }}
                className="w-full bg-red-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                Tamam, Kaydettim
              </button>
            </div>
          </div>
        )}

        {/* Enabled State Options */}
        {status.isEnabled && (
          <div className="space-y-4">
            {/* Backup Codes */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Yedek Kodlar</h3>
              <p className="text-sm text-gray-600 mb-4">
                Telefonunuza erişiminizi kaybederseniz yedek kodları kullanarak giriş yapabilirsiniz.
              </p>
              <button
                onClick={handleRegenerateBackupCodes}
                disabled={isLoading}
                className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Yükleniyor...' : 'Yeni Yedek Kodlar Oluştur'}
              </button>
            </div>

            {/* Disable 2FA */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">2FA'yı Devre Dışı Bırak</h3>
              <p className="text-sm text-gray-600 mb-4">
                2FA'yı devre dışı bırakmak hesabınızın güvenliğini azaltır.
              </p>
              
              {!showDisableConfirm ? (
                <button
                  onClick={() => setShowDisableConfirm(true)}
                  className="w-full bg-red-100 text-red-700 py-3 px-4 rounded-lg font-medium hover:bg-red-200 transition-colors"
                >
                  2FA'yı Devre Dışı Bırak
                </button>
              ) : (
                <div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-red-800">
                      ⚠️ Bu işlem geri alınamaz. Devam etmek için şifrenizi girin.
                    </p>
                  </div>
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="Şifrenizi girin"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                  <div className="flex space-x-4">
                    <button
                      onClick={() => {
                        setShowDisableConfirm(false);
                        setDisablePassword('');
                      }}
                      className="flex-1 bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                    >
                      İptal
                    </button>
                    <button
                      onClick={handleDisable2FA}
                      disabled={isLoading}
                      className="flex-1 bg-red-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      {isLoading ? 'İşleniyor...' : 'Devre Dışı Bırak'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 bg-gray-100 rounded-xl p-6">
          <h3 className="font-medium text-gray-900 mb-3">2FA Neden Önemli?</h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Şifreniz çalınsa bile hesabınız güvende kalır
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Phishing saldırılarına karşı ek koruma sağlar
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Hesap erişiminde ek bir doğrulama katmanı ekler
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
