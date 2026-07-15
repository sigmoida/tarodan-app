// Optimistic ekleme sırasında gerçek itemId gelene kadar kullanılan geçici işaret.
// invalidate sonrası sunucudan gelen gerçek id ile değişir.
export const OPTIMISTIC = '__optimistic__';

export interface Listing {
  id: string;
  title: string;
  price: number;
  status: string;
  images: Array<{ url: string }>;
}
