import type { EditListingFormData, SaleData } from "./types";

export const CONDITIONS = [
  { value: "new", label: "Yeni" },
  { value: "like_new", label: "Sıfır Gibi" },
  { value: "very_good", label: "Mükemmel" },
  { value: "good", label: "İyi" },
  { value: "fair", label: "Orta" },
];

export const createInitialFormData = (): EditListingFormData => ({
  title: "",
  description: "",
  price: "",
  categoryId: "",
  condition: "very_good",
  brandId: "",
  carModelId: "",
  scale: "1:64",
  material: "",
  manufacturerId: "",
  year: "",
  isTradeEnabled: false,
  isPreorder: false,
  isSet: false,
  bundleSize: undefined,
  quantity: "",
  shippingDesi: 1,
  images: [],
  status: "active",
});

export const createInitialSaleData = (): SaleData => ({
  originalPrice: "",
  salePrice: "",
  saleStartDate: new Date().toISOString().split("T")[0],
  saleEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0],
});

export const getYearOptions = (): number[] => {
  const currentYear = new Date().getFullYear();
  return Array.from(
    { length: currentYear - 1950 + 1 },
    (_, i) => currentYear - i,
  );
};
