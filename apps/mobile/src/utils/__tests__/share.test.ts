import { Platform } from 'react-native';
import { buildShareContent, productShareUrl, collectionShareUrl } from '../share';

describe('share urls', () => {
  it('points product links at the real tarodan.shop domain', () => {
    // EXPO_PUBLIC_WEB_URL test ortamında set değil → güvenli fallback kullanılmalı.
    expect(productShareUrl('abc123')).toBe('https://tarodan.shop/listings/abc123');
    expect(collectionShareUrl('col-1')).toBe('https://tarodan.shop/collections/col-1');
  });
});

describe('buildShareContent', () => {
  const url = 'https://tarodan.shop/listings/abc123';
  const text = 'Tomica Toyota Hilux - ₺130,38\n\nTarodan\'da bu ürüne göz atın!';

  afterEach(() => {
    Platform.OS = 'ios';
  });

  it('embeds the url in the message on iOS so "Kopyala" keeps the link', () => {
    Platform.OS = 'ios';
    const { content } = buildShareContent(text, url, 'Tomica Toyota Hilux');
    expect(content.message).toContain(url); // link metnin içinde — kopyalayınca düşmez
    expect((content as { url?: string }).url).toBe(url); // zengin önizleme için ayrı alan da kalsın
  });

  it('embeds the url in the message on Android', () => {
    Platform.OS = 'android';
    const { content } = buildShareContent(text, url, 'Tomica Toyota Hilux');
    expect(content.message).toContain(url);
  });
});
