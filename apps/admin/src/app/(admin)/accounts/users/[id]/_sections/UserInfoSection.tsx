import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { SectionCard } from '@/components/detail/SectionCard';
import { type UserDetail } from '../types';

function Verified({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="flex items-center gap-1 text-xs text-success-700">
      <CheckCircleIcon className="h-3 w-3" /> Doğrulanmış
    </span>
  ) : (
    <span className="text-xs text-muted">Doğrulanmamış</span>
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
  return (
    <SectionCard title="Kullanıcı Bilgileri">
      <div className="grid grid-cols-2 gap-6">
        <Item label="Email">
          <p className="font-medium text-heading">{user.email}</p>
          <Verified ok={user.isEmailVerified} />
        </Item>
        <Item label="Telefon">
          <p className="font-medium text-heading">{user.phone || 'Belirtilmemiş'}</p>
          {user.phone && <Verified ok={user.isPhoneVerified} />}
        </Item>
        <Item label="Kayıt Tarihi">
          <p className="text-heading">
            {new Date(user.createdAt).toLocaleDateString('tr-TR')}
          </p>
        </Item>
        <Item label="Son Giriş">
          <p className="text-heading">
            {user.lastLoginAt
              ? new Date(user.lastLoginAt).toLocaleString('tr-TR')
              : 'Hiç giriş yapmadı'}
          </p>
        </Item>
        {user.bio && (
          <Item label="Biyografi" className="col-span-2">
            <p className="text-heading">{user.bio}</p>
          </Item>
        )}
      </div>

      {user.isSeller && (
        <div className="mt-6 border-t border-border pt-6">
          <h3 className="mb-3 text-sm font-semibold text-heading">Satıcı Bilgileri</h3>
          <div className="grid grid-cols-2 gap-4">
            <Item label="Satıcı Tipi">
              <p className="text-heading">
                {user.sellerType === 'individual' ? 'Bireysel' : 'Kurumsal'}
              </p>
            </Item>
            {user.companyName && (
              <Item label="Şirket Adı">
                <p className="text-heading">{user.companyName}</p>
              </Item>
            )}
            {user.taxId && (
              <Item label="Vergi No">
                <p className="text-heading">{user.taxId}</p>
              </Item>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-3 flex items-center gap-2">
              <h4 className="text-sm font-semibold text-heading">Banka Hesabı (IBAN)</h4>
              {user.bankAccount && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    user.bankAccount.isVerified
                      ? 'bg-success-500/10 text-success-600'
                      : 'bg-warning-500/10 text-warning-600'
                  }`}
                >
                  {user.bankAccount.isVerified ? 'Doğrulanmış' : 'Doğrulanmamış'}
                </span>
              )}
            </div>
            {user.bankAccount ? (
              <div className="grid grid-cols-2 gap-4">
                <Item label="Hesap Sahibi">
                  <p className="text-heading">{user.bankAccount.accountHolder}</p>
                </Item>
                <Item label="IBAN">
                  <p className="break-all font-mono text-heading">{user.bankAccount.iban}</p>
                </Item>
                {user.bankAccount.tcKimlikNo && (
                  <Item label="TC Kimlik No">
                    <p className="font-mono text-heading">{user.bankAccount.tcKimlikNo}</p>
                  </Item>
                )}
                {user.bankAccount.taxId && (
                  <Item label="Vergi No">
                    <p className="font-mono text-heading">{user.bankAccount.taxId}</p>
                  </Item>
                )}
                {user.bankAccount.verifiedAt && (
                  <Item label="Doğrulama Tarihi">
                    <p className="text-heading">
                      {new Date(user.bankAccount.verifiedAt).toLocaleString('tr-TR')}
                    </p>
                  </Item>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">Banka hesabı eklenmemiş</p>
            )}
          </div>
        </div>
      )}

      {user.isBanned && (
        <div className="mt-6 border-t border-border pt-6">
          <div className="rounded-lg border border-danger-500/30 bg-danger-500/10 p-4">
            <p className="font-medium text-danger-600">Ban Nedeni</p>
            <p className="mt-1 text-heading">{user.bannedReason || 'Belirtilmemiş'}</p>
            {user.bannedAt && (
              <p className="mt-2 text-sm text-danger-600">
                Ban Tarihi: {new Date(user.bannedAt).toLocaleString('tr-TR')}
              </p>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
