import { Button, Input } from "@tarodan/ui";

interface StatusBannersProps {
  status: string;
  reactivateQuantity: string;
  setReactivateQuantity: (value: string) => void;
  reactivating: boolean;
  handleReactivate: () => void;
}

export default function StatusBanners({
  status,
  reactivateQuantity,
  setReactivateQuantity,
  reactivating,
  handleReactivate,
}: StatusBannersProps) {
  return (
    <>
      {(status === "sold" || status === "inactive") && (
        <div className="mb-6 p-5 bg-warning-50 border border-warning-200 rounded-xl">
          <h2 className="text-lg font-semibold text-warning-800 mb-2">
            {status === "sold" ? "Bu ürün satılmış" : "Bu ürün stokta yok"}
          </h2>
          <p className="text-sm text-warning-700 mb-4">
            Yeniden satışa açmak için stok miktarı belirleyin. İlanınız onaya
            gönderilir; admin onayından sonra yeniden yayına girer.
          </p>
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-warning-800 mb-1">
                Stok Miktarı
              </label>
              <Input
                type="number"
                min="1"
                value={reactivateQuantity}
                onChange={(e) => setReactivateQuantity(e.target.value)}
                className="w-28 border-warning-300 focus:ring-warning-500"
              />
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleReactivate}
              disabled={reactivating}
            >
              {reactivating ? "İşleniyor..." : "Onaya Gönder"}
            </Button>
          </div>
        </div>
      )}

      {status === "reserved" && (
        <div className="mb-6 p-5 bg-info-50 border border-info-200 rounded-xl">
          <h2 className="text-lg font-semibold text-info-800 mb-2">
            Bu ürün rezerve edilmiş
          </h2>
          <p className="text-sm text-info-700">
            Rezerve edilmiş ürünler düzenlenemez. Rezervasyon tamamlandıktan
            veya iptal edildikten sonra düzenleme yapabilirsiniz.
          </p>
        </div>
      )}

      {status === "deleted" && (
        <div className="mb-6 p-5 bg-danger-50 border border-danger-200 rounded-xl">
          <h2 className="text-lg font-semibold text-danger-800 mb-2">
            Bu ürün kaldırıldı
          </h2>
          <p className="text-sm text-danger-700">
            Bu ürün yönetici tarafından kaldırılmış ve yeniden açılamaz. Tekrar
            satmak için yeni bir ilan oluşturabilirsiniz.
          </p>
        </div>
      )}
    </>
  );
}
