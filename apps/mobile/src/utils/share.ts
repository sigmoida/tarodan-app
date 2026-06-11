import { Platform } from 'react-native';
import type { ShareContent, ShareOptions } from 'react-native';

const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://tarodan.com').replace(/\/+$/, '');

export const productShareUrl = (id: string) => `${WEB_URL}/listings/${id}`;
export const collectionShareUrl = (id: string) => `${WEB_URL}/collections/${id}`;

// iOS'ta url ayrı alan olarak share sheet'e gider; Android sadece message okur.
export function buildShareContent(
  text: string,
  url: string,
  title?: string,
): { content: ShareContent; options: ShareOptions } {
  return Platform.OS === 'ios'
    ? { content: { message: text, url, title }, options: { subject: title } }
    : { content: { message: `${text}\n${url}`, title }, options: { dialogTitle: title } };
}
