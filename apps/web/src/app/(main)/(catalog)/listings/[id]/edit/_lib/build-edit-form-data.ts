import type { EditListingFormData, SaleData } from './types';

// Pure merge helper: map a fetched listing onto the edit form's shape. The
// API is the single source of truth (no localStorage draft); `prev` only backs
// up a field the API didn't return.

export function buildListingFormData(
  prev: EditListingFormData,
  listing: any,
): { newFormData: EditListingFormData; previewUrls: any[] } {
  const materialFromAttrs = (listing as any).attributes?.find(
    (a: any) => a.label === 'Malzeme' || a.group === 'Malzeme' || a.group === 'material',
  )?.name;
  const scaleFromAttrs = (listing as any).attributes?.find(
    (a: any) => a.label === 'Ölçek' || a.group === 'Ölçek',
  )?.value;
  const hasActiveSale =
    (listing as any).oldPrice != null &&
    Number((listing as any).oldPrice) > Number(listing.price);
  const displayPrice = hasActiveSale
    ? String(Number((listing as any).oldPrice))
    : listing.price?.toString() || '';

  const newFormData: EditListingFormData = {
    title: listing.title || prev.title || '',
    description: listing.description || prev.description || '',
    price: displayPrice || prev.price || '',
    categoryId: listing.categoryId || listing.category?.id || prev.categoryId || '',
    condition: listing.condition || prev.condition || 'very_good',
    brandId: listing.brand?.id || prev.brandId || '',
    carModelId: listing.carModel?.id || prev.carModelId || '',
    scale: listing.scale || scaleFromAttrs || prev.scale || '1:64',
    material: materialFromAttrs ?? (listing as any).material ?? prev.material ?? '',
    manufacturerId: (listing as any).manufacturer?.id ?? prev.manufacturerId ?? '',
    year:
      (listing as any).year ??
      ((listing as any).releaseDate
        ? new Date((listing as any).releaseDate).getFullYear()
        : prev.year || ''),
    isTradeEnabled:
      listing.isTradeEnabled ?? listing.trade_available ?? prev.isTradeEnabled ?? false,
    isPreorder: (listing as any).isPreorder ?? prev.isPreorder ?? false,
    isSet: (listing as any).isSet ?? prev.isSet ?? false,
    bundleSize: (listing as any).bundleSize ?? prev.bundleSize ?? undefined,
    quantity:
      listing.quantity !== undefined && listing.quantity !== null
        ? String(listing.quantity)
        : prev.quantity ?? '',
    images:
      listing.images?.map((img: any) => ({
        cardKey: img.cardKey ?? img.url,
        detailKey: img.detailKey ?? img.url,
      })) ||
      prev.images ||
      [],
    status: listing.status || prev.status || 'active',
  };

  const previewUrls =
    listing.images?.map((img: any) => img.cardUrl ?? img.detailUrl ?? img.url ?? img) || [];

  return { newFormData, previewUrls };
}

export function buildSaleDataFromListing(listing: any): { saleData: SaleData; saleActive: boolean } {
  // A+oldPrice: form'da Eski fiyat = oldPrice (veya legacy originalPrice), İndirimli fiyat = price (A)
  const orig = (listing as any).oldPrice != null ? Number((listing as any).oldPrice) : (listing.originalPrice != null ? Number(listing.originalPrice) : null);
  const onSale = (listing as any).oldPrice != null && listing.price != null || (listing as any).isOnSale === true;
  const sale = onSale ? Number(listing.price) : (listing.salePrice != null ? Number(listing.salePrice) : null);
  const start = listing.saleStartDate ? (typeof listing.saleStartDate === 'string' ? listing.saleStartDate.split('T')[0] : new Date(listing.saleStartDate).toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];
  const end = listing.saleEndDate ? (typeof listing.saleEndDate === 'string' ? listing.saleEndDate.split('T')[0] : new Date(listing.saleEndDate).toISOString().split('T')[0]) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const saleActive = orig != null && sale != null && sale > 0 && orig > sale;
  return {
    saleData: {
      originalPrice: orig != null ? String(orig) : '',
      salePrice: saleActive ? String(sale) : '',
      saleStartDate: start,
      saleEndDate: end,
    },
    saleActive,
  };
}
