import type { Dispatch, SetStateAction } from 'react';
import { Input } from '@tarodan/ui';
import { useTranslation } from '@/i18n';
import type { EditListingFormData } from '../_lib/types';

interface PriceStockSectionProps {
  formData: EditListingFormData;
  setFormData: Dispatch<SetStateAction<EditListingFormData>>;
  commissionPreview: { sellerFeeAmount: number; sellerNetAmount: number } | null;
  commissionPreviewLoading: boolean;
}

export default function PriceStockSection({
  formData,
  setFormData,
  commissionPreview,
  commissionPreviewLoading,
}: PriceStockSectionProps) {
  const { locale } = useTranslation();

  return (
    <>
      {/* Price & Quantity */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-body mb-2">
            Fiyat (₺) <span className="text-danger-500">*</span>
          </label>
          <Input
            type="number"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            className="h-12 px-4 rounded-xl"
            placeholder="0.00"
            required
            min={1}
            max={9999999}
            step="0.01"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-body mb-2">
            Stok Miktarı
          </label>
          <Input
            type="number"
            value={formData.quantity === '' || formData.quantity === null || formData.quantity === undefined ? '' : formData.quantity}
            onChange={(e) => {
              const value = e.target.value;
              const newQuantity = value === '' ? '' : Number(value);
              setFormData({ ...formData, quantity: newQuantity });
            }}
            className="h-12 px-4 rounded-xl"
            placeholder="Sınırsız"
            min={1}
          />
          <p className="text-xs text-muted mt-1.5">
            Boş bırakırsanız sınırsız stok olur
          </p>
        </div>
      </div>
      {(commissionPreviewLoading || commissionPreview) && (
        <div className="p-3 bg-surface rounded-xl border border-border-subtle text-sm">
          <p className="text-muted font-medium mb-1">{locale === 'en' ? 'Estimated (per sale)' : 'Tahmini (satış başına)'}</p>
          {commissionPreviewLoading ? (
            <span className="text-subtle">{locale === 'en' ? 'Calculating...' : 'Hesaplanıyor...'}</span>
          ) : commissionPreview ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted">{locale === 'en' ? 'Platform deduction' : 'Platform kesintisi'}: ₺{commissionPreview.sellerFeeAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className="text-success-700 font-medium">{locale === 'en' ? 'Net to you' : 'Net kazanç'}: ₺{commissionPreview.sellerNetAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
