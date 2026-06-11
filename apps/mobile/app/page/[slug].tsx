import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import { theme } from '@tarodan/ui-native';
import { pagesApi } from '../../src/services/api';
import { ScreenHeader, ScreenLoader, ErrorState } from '../../src/components/common';
import { formatRelativeDate } from '../../src/utils/format';

const { colors } = theme;

interface PageData {
  id: string;
  slug: string;
  title: string;
  content: string;
  updatedAt?: string;
}

export default function CMSPageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  useWindowDimensions();

  const { data, isLoading, error, refetch } = useQuery<PageData | null>({
    queryKey: ['cms-page', slug],
    queryFn: async () => {
      if (!slug) return null;
      const response = await pagesApi.getBySlug(slug);
      const payload = (response.data as any)?.data ?? response.data;
      return payload ?? null;
    },
    enabled: !!slug,
  });

  const htmlWrapper = (content: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: ${colors.text.heading};
            font-size: 15px;
            line-height: 1.6;
            margin: 0;
            padding: 16px;
            background: ${colors.surface.DEFAULT};
          }
          h1, h2, h3 { color: ${colors.text.heading}; margin-top: 20px; }
          h1 { font-size: 22px; }
          h2 { font-size: 18px; }
          h3 { font-size: 16px; }
          p { margin: 10px 0; }
          a { color: ${colors.primary[600]!}; text-decoration: none; }
          ul, ol { padding-left: 20px; }
          li { margin: 6px 0; }
          img { max-width: 100%; height: auto; border-radius: 8px; }
          hr { border: none; border-top: 1px solid ${colors.border.DEFAULT}; margin: 16px 0; }
          blockquote {
            margin: 16px 0;
            padding: 8px 16px;
            border-left: 3px solid ${colors.primary[600]!};
            background: ${colors.primary[50]!};
            border-radius: 4px;
            color: ${colors.text.heading};
          }
          code {
            background: ${colors.surface.alt};
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Menlo', 'Courier New', monospace;
            font-size: 13px;
          }
        </style>
      </head>
      <body>${content}</body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={data?.title || 'Sayfa'}
        subtitle={data?.updatedAt ? `Güncellendi: ${formatRelativeDate(data.updatedAt)}` : undefined}
      />

      {isLoading ? (
        <ScreenLoader />
      ) : error || !data ? (
        <ErrorState
          fullscreen
          title="Sayfa bulunamadı"
          message="Aradığınız içerik şu anda görüntülenemiyor."
          onRetry={() => refetch()}
        />
      ) : (
        <WebView
          originWhitelist={['*']}
          source={{ html: htmlWrapper(data.content || '') }}
          style={styles.webview}
          startInLoadingState
          renderLoading={() => <ScreenLoader />}
          javaScriptEnabled
          scalesPageToFit={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
});
