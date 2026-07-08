import type { Dispatch, SetStateAction } from 'react';
import Link from 'next/link';
import { Button, Toggle } from '@tarodan/ui';
import type { MembershipLimits } from '@/stores/authStore';
import type { EditListingFormData } from '../_lib/types';

interface OptionsSectionProps {
  formData: EditListingFormData;
  setFormData: Dispatch<SetStateAction<EditListingFormData>>;
  limits: MembershipLimits | null;
}

export default function OptionsSection({ formData, setFormData, limits }: OptionsSectionProps) {
  return (
    <>
      {/* Trade Toggle */}
      <div className={`flex items-center justify-between p-4 rounded-xl border ${limits?.canTrade
          ? 'bg-success-50 border-success-200'
          : 'bg-surface border-border'
        }`}>
        <div>
          <label className="font-medium text-heading">Takas Aktif</label>
          <p className="text-sm text-muted">
            {limits?.canTrade
              ? 'Bu ürünü takas için de açık tutar'
              : 'Takas özelliği Temel veya üstü üyelik gerektirir'}
          </p>
        </div>
        {limits?.canTrade ? (
          <Toggle
            checked={formData.isTradeEnabled}
            onChange={(val) => setFormData({ ...formData, isTradeEnabled: val })}
            size="md"
          />
        ) : (
          <Link href="/membership" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            Premium'a Geç →
          </Link>
        )}
      </div>

      {/* Ön Sipariş */}
      <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border">
        <div>
          <label className="font-medium text-heading">Ön Sipariş</label>
          <p className="text-sm text-muted">Ürün henüz stokta değil; çıkınca gönderilecek</p>
        </div>
        <Button variant="secondary" type="button"
          onClick={() => setFormData({ ...formData, isPreorder: !formData.isPreorder })}
          className={`relative w-14 h-8 rounded-full transition-colors ${formData.isPreorder ? 'bg-primary-500' : 'bg-border-strong'}`}>
          <span className={`absolute top-1 left-1 w-6 h-6 bg-surface-elevated rounded-full shadow transition-transform ${formData.isPreorder ? 'translate-x-6' : 'translate-x-0'}`} />
        </Button>
      </div>

      {/* Set / Paket */}
      <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-border">
        <div>
          <label className="font-medium text-heading">Set / Paket</label>
          <p className="text-sm text-muted">Tek ilanda birden fazla model (örn. 5'li paket, garaj seti)</p>
        </div>
        <Button variant="secondary" type="button"
          onClick={() => setFormData({ ...formData, isSet: !formData.isSet })}
          className={`relative w-14 h-8 rounded-full transition-colors ${formData.isSet ? 'bg-info-500' : 'bg-border-strong'}`}>
          <span className={`absolute top-1 left-1 w-6 h-6 bg-surface-elevated rounded-full shadow transition-transform ${formData.isSet ? 'translate-x-6' : 'translate-x-0'}`} />
        </Button>
      </div>

      {formData.isSet && (
        <div className="p-4 bg-surface rounded-xl border border-border">
          <label className="block text-sm font-medium text-body mb-1.5">Set Parça Sayısı</label>
          <input
            type="number"
            min={2}
            value={formData.bundleSize ?? ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                bundleSize: e.target.value ? parseInt(e.target.value, 10) : undefined,
              })
            }
            placeholder="örn. 5"
            className="w-full px-3 py-2 rounded border border-border bg-surface-elevated text-body"
          />
          <p className="text-sm text-muted mt-1">
            Setteki toplam parça sayısı. Her parçanın marka/model/renk gibi ayrıntılarını açıklamada belirtin.
          </p>
        </div>
      )}
    </>
  );
}
