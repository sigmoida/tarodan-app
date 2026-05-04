import React from 'react';
import { View, StyleSheet, useWindowDimensions, ScrollView } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import { pagesApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, ScreenLoader, ErrorState, Text } from '../../src/components/common';
import { formatRelativeDate } from '../../src/utils/format';

interface PageData {
  id: string;
  slug: string;
  title: string;
  content: string;
  updatedAt?: string;
}

export default function CMSPageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();

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
            color: ${TarodanColors.textPrimary};
            font-size: 15px;
            line-height: 1.6;
            margin: 0;
            padding: 16px;
            background: ${TarodanColors.background};
          }
          h1, h2, h3 { color: ${TarodanColors.textPrimary}; margin-top: 20px; }
          h1 { font-size: 22px; }
          h2 { font-size: 18px; }
          h3 { font-size: 16px; }
          p { margin: 10px 0; }
          a { color: ${TarodanColors.primary}; text-decoration: none; }
          ul, ol { padding-left: 20px; }
          li { margin: 6px 0; }
          img { max-width: 100%; height: auto; border-radius: 8px; }
          hr { border: none; border-top: 1px solid ${TarodanColors.border}; margin: 16px 0; }
          blockquote {
            margin: 16px 0;
            padding: 8px 16px;
            border-left: 3px solid ${TarodanColors.primary};
            background: ${TarodanColors.primaryLight};
            border-radius: 4px;
            color: ${TarodanColors.textPrimary};
          }
          code {
            background: ${TarodanColors.surfaceVariant};
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
    <SafeAreaView style={styles.container} edges={['top']}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  webview: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
});
