import { Platform } from 'react-native';
import type { ShareContent, ShareOptions } from 'react-native';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://tarodan.shop').replace(/\/+$/, '');

export const productShareUrl = (id: string) => `${WEB_URL}/listings/${id}`;
export const collectionShareUrl = (id: string) => `${WEB_URL}/collections/${id}`;

// Link her iki platformda da message'a gömülür → "Kopyala" seçilince link düşmez.
// iOS'ta ayrıca ayrı `url` alanı kalır (zengin önizleme/şablon için).
export function buildShareContent(
  text: string,
  url: string,
  title?: string,
): { content: ShareContent; options: ShareOptions } {
  return Platform.OS === 'ios'
    ? { content: { message: `${text}\n${url}`, url, title }, options: { subject: title } }
    : { content: { message: `${text}\n${url}`, title }, options: { dialogTitle: title } };
}
