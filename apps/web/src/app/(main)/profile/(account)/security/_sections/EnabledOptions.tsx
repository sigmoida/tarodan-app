'use client';

import { useState } from 'react';
import { Button, Input } from '@tarodan/ui';

type MutateFn = (code: string, options?: { onSuccess?: () => void }) => void;

export default function EnabledOptions({
  regenerate,
  isRegenerating,
  disable,
  isDisabling,
  setError,
}: {
  regenerate: MutateFn;
  isRegenerating: boolean;
  disable: MutateFn;
  isDisabling: boolean;
  setError: (message: string) => void;
}) {
  const [showRegen, setShowRegen] = useState(false);
  const [regenCode, setRegenCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const handleRegenerate = () => {
    if (regenCode.length !== 6) {
      setError('Lütfen 6 haneli kodu girin');
      return;
    }
    regenerate(regenCode, {
      onSuccess: () => {
        setShowRegen(false);
        setRegenCode('');
      },
    });
  };

  const handleDisable = () => {
    if (disableCode.length !== 6) {
      setError('Lütfen 6 haneli kodu girin');
      return;
    }
    disable(disableCode, {
      onSuccess: () => {
        setShowDisable(false);
        setDisableCode('');
      },
    });
  };

  return (
    <div className='space-y-4'>
      {/* Backup codes */}
      <div className='rounded-xl bg-surface-elevated p-6 shadow-sm'>
        <h3 className='mb-2 text-lg font-medium text-heading'>Yedek Kodlar</h3>
        <p className='mb-4 text-sm text-muted'>
          Telefonunuza erişiminizi kaybederseniz yedek kodları kullanarak giriş yapabilirsiniz.
        </p>
        {!showRegen ? (
          <Button
            variant='secondary'
            size='lg'
            className='w-full'
            onClick={() => setShowRegen(true)}
            disabled={isRegenerating}>
            Yeni Yedek Kodlar Oluştur
          </Button>
        ) : (
          <div>
            <p className='mb-3 text-sm text-muted'>
              Onaylamak için doğrulama uygulamanızdaki 6 haneli kodu girin. Eski yedek
              kodlarınız geçersiz olacaktır.
            </p>
            <Input
              type='text'
              inputMode='numeric'
              maxLength={6}
              value={regenCode}
              onChange={(e) => setRegenCode(e.target.value.replace(/\D/g, ''))}
              placeholder='6 haneli kod'
              className='mb-4 text-center tracking-widest'
            />
            <div className='flex space-x-4'>
              <Button
                variant='secondary'
                size='lg'
                className='flex-1'
                onClick={() => {
                  setShowRegen(false);
                  setRegenCode('');
                }}>
                İptal
              </Button>
              <Button
                variant='primary'
                size='lg'
                className='flex-1'
                onClick={handleRegenerate}
                disabled={isRegenerating}>
                {isRegenerating ? 'Yükleniyor...' : 'Oluştur'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Disable 2FA */}
      <div className='rounded-xl bg-surface-elevated p-6 shadow-sm'>
        <h3 className='mb-2 text-lg font-medium text-heading'>2FA'yı Devre Dışı Bırak</h3>
        <p className='mb-4 text-sm text-muted'>
          2FA'yı devre dışı bırakmak hesabınızın güvenliğini azaltır.
        </p>
        {!showDisable ? (
          <Button
            variant='danger'
            size='lg'
            className='w-full'
            onClick={() => setShowDisable(true)}>
            2FA'yı Devre Dışı Bırak
          </Button>
        ) : (
          <div>
            <div className='mb-4 rounded-lg border border-danger-200 bg-danger-50 p-4'>
              <p className='text-sm text-danger-800'>
                ⚠️ Bu işlem geri alınamaz. Devam etmek için doğrulama uygulamanızdaki 6
                haneli kodu girin.
              </p>
            </div>
            <Input
              type='text'
              inputMode='numeric'
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
              placeholder='6 haneli kod'
              className='mb-4 text-center tracking-widest'
            />
            <div className='flex space-x-4'>
              <Button
                variant='secondary'
                size='lg'
                className='flex-1'
                onClick={() => {
                  setShowDisable(false);
                  setDisableCode('');
                }}>
                İptal
              </Button>
              <Button
                variant='danger'
                size='lg'
                className='flex-1'
                onClick={handleDisable}
                disabled={isDisabling}>
                {isDisabling ? 'İşleniyor...' : 'Devre Dışı Bırak'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
