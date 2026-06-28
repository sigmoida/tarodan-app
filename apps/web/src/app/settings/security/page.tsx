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
import { Button, Input, Modal, Spinner } from '@tarodan/ui';

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
  const [disableCode, setDisableCode] = useState('');
  const [showBackupRegenConfirm, setShowBackupRegenConfirm] = useState(false);
  const [backupRegenCode, setBackupRegenCode] = useState('');

  useEffect(() => {
    fetchTwoFactorStatus();
  }, []);

  const fetchTwoFactorStatus = async () => {
    try {
      const response = await api.get('/security/2fa/status');
      setStatus(response.data);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch 2FA status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitiate2FA = async () => {
    setError('');
    setIsLoading(true);
    
    try {
      const response = await api.post('/security/2fa/enable');
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
      const response = await api.post('/security/2fa/verify', {
        code: verificationCode,
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
    if (disableCode.length !== 6) {
      setError('Lütfen 6 haneli kodu girin');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await api.post('/security/2fa/disable', {
        code: disableCode,
      });

      setStatus({ isEnabled: false });
      setShowDisableConfirm(false);
      setDisableCode('');
    } catch (err: any) {
      setError(err.response?.data?.message || '2FA devre dışı bırakılamadı');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    if (backupRegenCode.length !== 6) {
      setError('Lütfen 6 haneli kodu girin');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await api.post('/security/2fa/backup-codes', {
        code: backupRegenCode,
      });
      setBackupCodes(response.data.backupCodes);
      setShowBackupCodes(true);
      setShowBackupRegenConfirm(false);
      setBackupRegenCode('');
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
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" color="border-danger-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-surface-elevated shadow">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center">
            <Link href="/profile" className="text-muted hover:text-body mr-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-heading">Güvenlik Ayarları</h1>
              <p className="text-muted mt-1">İki faktörlü kimlik doğrulama (2FA)</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Error Message */}
        {error && (
          <div className="bg-danger-50 border border-danger-200 text-danger-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* 2FA Status Card */}
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                status.isEnabled ? 'bg-success-100' : 'bg-surface-alt'
              }`}>
                <svg 
                  className={`w-6 h-6 ${status.isEnabled ? 'text-success-600' : 'text-subtle'}`}
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
                <h2 className="text-lg font-semibold text-heading">
                  İki Faktörlü Kimlik Doğrulama
                </h2>
                <p className="text-sm text-muted">
                  {status.isEnabled 
                    ? 'Hesabınız 2FA ile korunuyor' 
                    : 'Hesabınızı daha güvenli hale getirin'}
                </p>
              </div>
            </div>
            <div>
              {status.isEnabled ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-success-100 text-success-800">
                  Aktif
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-surface-alt text-muted">
                  Pasif
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Setup Section (when not enabled) */}
        {!status.isEnabled && !setupData && (
          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-medium text-heading mb-4">2FA'yı Etkinleştir</h3>
            <p className="text-muted mb-6">
              İki faktörlü kimlik doğrulama, hesabınıza giriş yaparken şifrenizin yanı sıra 
              telefonunuzdaki bir uygulama tarafından oluşturulan bir kod girmenizi gerektirir.
            </p>
            
            <div className="bg-primary-50 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-primary-900 mb-2">Gereksinimler:</h4>
              <ul className="text-sm text-primary-800 space-y-1">
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

            <Button
              variant="danger"
              size="lg"
              className="w-full"
              onClick={handleInitiate2FA}
              disabled={isLoading}
            >
              {isLoading ? 'Yükleniyor...' : '2FA Kurulumunu Başlat'}
            </Button>
          </div>
        )}

        {/* Setup Flow (QR Code) */}
        {setupData && (
          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-medium text-heading mb-4">2FA Kurulumu</h3>
            
            {/* Step 1: Scan QR */}
            <div className="mb-6">
              <div className="flex items-center mb-3">
                <span className="w-6 h-6 bg-danger-500 text-inverted rounded-full flex items-center justify-center text-sm font-medium mr-2">
                  1
                </span>
                <span className="font-medium text-heading">QR Kodu Tarayın</span>
              </div>
              <p className="text-sm text-muted mb-4 ml-8">
                Google Authenticator veya benzer bir uygulama ile aşağıdaki QR kodunu tarayın.
              </p>
              <div className="flex justify-center mb-4">
                <div className="p-4 bg-surface-elevated border-2 border-border rounded-lg">
                  {setupData.qrCodeUrl ? (
                    <Image
                      src={setupData.qrCodeUrl}
                      alt="2FA QR Code"
                      width={200}
                      height={200}
                    />
                  ) : (
                    <div className="w-[200px] h-[200px] bg-surface-alt flex items-center justify-center text-subtle">
                      QR Kod Yüklenemedi
                    </div>
                  )}
                </div>
              </div>
              <div className="ml-8">
                <p className="text-sm text-muted mb-2">
                  QR kodu tarayamıyorsanız, bu kodu manuel olarak girin:
                </p>
                <div className="flex items-center">
                  <code className="bg-surface-alt px-3 py-2 rounded text-sm font-mono flex-1">
                    {setupData.secret}
                  </code>
                  <Button variant="secondary" onClick={() => copyToClipboard(setupData.secret)}
                    className="ml-2 p-2 text-muted hover:text-body"
                    title="Kopyala">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </Button>
                </div>
              </div>
            </div>

            {/* Step 2: Verify */}
            <div className="mb-6">
              <div className="flex items-center mb-3">
                <span className="w-6 h-6 bg-danger-500 text-inverted rounded-full flex items-center justify-center text-sm font-medium mr-2">
                  2
                </span>
                <span className="font-medium text-heading">Doğrulama Kodunu Girin</span>
              </div>
              <p className="text-sm text-muted mb-4 ml-8">
                Uygulamanızda görünen 6 haneli kodu girin.
              </p>
              <div className="ml-8">
                <Input type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="max-w-xs px-4 py-3 text-2xl text-center tracking-widest focus:ring-danger-500 focus:border-danger-500"
                  maxLength={6} />
              </div>
            </div>

            <div className="flex space-x-4">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => setSetupData(null)}
              >
                İptal
              </Button>
              <Button
                variant="danger"
                size="lg"
                className="flex-1"
                onClick={handleVerifyAndEnable}
                disabled={isVerifying || verificationCode.length !== 6}
              >
                {isVerifying ? 'Doğrulanıyor...' : 'Doğrula ve Etkinleştir'}
              </Button>
            </div>
          </div>
        )}

        {/* Backup Codes Modal */}
        <Modal isOpen={showBackupCodes && backupCodes.length > 0} onClose={() => { setShowBackupCodes(false); setBackupCodes([]); }} title="2FA Etkinleştirildi!" maxWidth="max-w-md">
              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm text-muted mt-1">
                  Aşağıdaki yedek kodları güvenli bir yere kaydedin.
                </p>
              </div>

              <div className="bg-warning-50 border border-warning-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-warning-800">
                  ⚠️ Bu kodlar sadece bir kez gösterilecek. Telefonunuza erişiminizi kaybederseniz hesabınıza giriş yapmak için bu kodlara ihtiyacınız olacak.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {backupCodes.map((code, index) => (
                  <code
                    key={index}
                    className="bg-surface-alt px-3 py-2 rounded text-sm font-mono text-center"
                  >
                    {code}
                  </code>
                ))}
              </div>

              <Button
                variant="secondary"
                size="md"
                className="w-full mb-4"
                onClick={() => copyToClipboard(backupCodes.join('\n'))}
              >
                Tüm Kodları Kopyala
              </Button>

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => {
                  setShowBackupCodes(false);
                  setBackupCodes([]);
                }}
              >
                Tamam, Kaydettim
              </Button>
        </Modal>

        {/* Enabled State Options */}
        {status.isEnabled && (
          <div className="space-y-4">
            {/* Backup Codes */}
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-medium text-heading mb-2">Yedek Kodlar</h3>
              <p className="text-sm text-muted mb-4">
                Telefonunuza erişiminizi kaybederseniz yedek kodları kullanarak giriş yapabilirsiniz.
              </p>
              {!showBackupRegenConfirm ? (
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  onClick={() => setShowBackupRegenConfirm(true)}
                  disabled={isLoading}
                >
                  Yeni Yedek Kodlar Oluştur
                </Button>
              ) : (
                <div>
                  <p className="text-sm text-muted mb-3">
                    Onaylamak için doğrulama uygulamanızdaki 6 haneli kodu girin.
                    Eski yedek kodlarınız geçersiz olacaktır.
                  </p>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={backupRegenCode}
                    onChange={(e) => setBackupRegenCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="6 haneli kod"
                    className="px-4 py-3 mb-4 text-center tracking-widest" />
                  <div className="flex space-x-4">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="flex-1"
                      onClick={() => {
                        setShowBackupRegenConfirm(false);
                        setBackupRegenCode('');
                      }}
                    >
                      İptal
                    </Button>
                    <Button
                      variant="primary"
                      size="lg"
                      className="flex-1"
                      onClick={handleRegenerateBackupCodes}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Yükleniyor...' : 'Oluştur'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Disable 2FA */}
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-medium text-heading mb-2">2FA'yı Devre Dışı Bırak</h3>
              <p className="text-sm text-muted mb-4">
                2FA'yı devre dışı bırakmak hesabınızın güvenliğini azaltır.
              </p>
              
              {!showDisableConfirm ? (
                <Button
                  variant="danger"
                  size="lg"
                  className="w-full"
                  onClick={() => setShowDisableConfirm(true)}
                >
                  2FA'yı Devre Dışı Bırak
                </Button>
              ) : (
                <div>
                  <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-danger-800">
                      ⚠️ Bu işlem geri alınamaz. Devam etmek için doğrulama
                      uygulamanızdaki 6 haneli kodu girin.
                    </p>
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="6 haneli kod"
                    className="px-4 py-3 mb-4 text-center tracking-widest focus:ring-danger-500 focus:border-danger-500" />
                  <div className="flex space-x-4">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="flex-1"
                      onClick={() => {
                        setShowDisableConfirm(false);
                        setDisableCode('');
                      }}
                    >
                      İptal
                    </Button>
                    <Button
                      variant="danger"
                      size="lg"
                      className="flex-1"
                      onClick={handleDisable2FA}
                      disabled={isLoading}
                    >
                      {isLoading ? 'İşleniyor...' : 'Devre Dışı Bırak'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 bg-surface-alt rounded-xl p-6">
          <h3 className="font-medium text-heading mb-3">2FA Neden Önemli?</h3>
          <ul className="text-sm text-muted space-y-2">
            <li className="flex items-start">
              <svg className="w-5 h-5 text-success-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Şifreniz çalınsa bile hesabınız güvende kalır
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-success-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Phishing saldırılarına karşı ek koruma sağlar
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-success-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
