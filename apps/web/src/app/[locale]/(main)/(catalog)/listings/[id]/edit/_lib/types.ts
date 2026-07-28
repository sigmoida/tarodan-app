export interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

export interface CarModel {
  id: string;
  name: string;
  slug: string;
  brand: {
    slug: string;
  };
}

export interface EditListingFormData {
  title: string;
  description: string;
  price: string;
  categoryId: string;
  condition: string;
  brandId: string;
  carModelId: string;
  scale: string;
  material: string;
  manufacturerId: string;
  year: string | number;
  isTradeEnabled: boolean;
  isPreorder: boolean;
  isSet: boolean;
  bundleSize: number | undefined;
  quantity: string | number;
  shippingDesi: string | number;
  images: Array<{ cardKey: string; detailKey: string }>;
  status: string;
}

export interface SaleData {
  originalPrice: string;
  salePrice: string;
  saleStartDate: string;
  saleEndDate: string;
}
