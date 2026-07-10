export interface Product {
  id: string;
  title: string;
  price: number;
  images?: any[];
  isTradeEnabled?: boolean;
  status?: string;
}

export function firstQueryParam(v?: string | string[]) {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}
