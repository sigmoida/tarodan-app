import { router } from 'expo-router';

// Her navigasyona benzersiz token: Ara sekmesi kalıcı olduğundan token değişimi
// ekrana "taze geçiş, filtreyi yeniden uygula" sinyali verir.
export const navToken = () => `&t=${Date.now()}`;

export const goSearch = (query: string) => {
  if (query.trim()) router.navigate(`/search?q=${encodeURIComponent(query)}${navToken()}`);
};

export const goScale = (scale: string) =>
  router.navigate(`/search?scale=${encodeURIComponent(scale)}${navToken()}`);

// Anasayfa "Markalar" şeridi aslında üreticiler — web ile aynı: manufacturer ismi ile filtrele.
export const goBrand = (brand: { id: string; name: string }) =>
  router.navigate(`/search?manufacturer=${encodeURIComponent(brand.name)}${navToken()}`);

export const goCategory = (cat: { id: string; name: string }) =>
  router.navigate(
    `/search?categoryId=${encodeURIComponent(cat.id)}&category=${encodeURIComponent(cat.name)}${navToken()}`,
  );
