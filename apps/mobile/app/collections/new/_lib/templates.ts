export const COLLECTION_TEMPLATES = [
  { id: 'ferrari', name: 'Ferrari Koleksiyonu', icon: '🏎️' },
  { id: 'vintage', name: 'Vintage Arabalar', icon: '🚗' },
  { id: 'trucks', name: 'Kamyonlar', icon: '🚚' },
  { id: 'f1', name: 'Formula 1', icon: '🏁' },
  { id: 'muscle', name: 'Muscle Cars', icon: '💪' },
  { id: 'custom', name: 'Özel Koleksiyon', icon: '⭐' },
] as const;

export type CollectionTemplate = (typeof COLLECTION_TEMPLATES)[number];
