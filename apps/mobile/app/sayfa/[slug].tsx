import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { theme, Spinner, Text, ScreenHeader } from '@tarodan/ui-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { pagesApi } from '../../src/services/api';

const { colors } = theme;

// API page.content bir HTML string'idir; düz <Text> ile basıldığında etiketler ham görünür.
// page/[slug].tsx ile aynı WebView/htmlWrapper desenini kullanarak HTML'i doğru render et.
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

interface PageData {
  title: string;
  content: string;
  updatedAt?: string;
}

export default function DynamicCMSPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;

    const fetchPage = async () => {
      setLoading(true);
      setError('');
      try {
        const response: any = await pagesApi.getBySlug(slug);
        const data = response.data?.data || response.data;
        setPage(data);
      } catch (err: any) {
        if (err?.response?.status === 404) {
          setError('Sayfa bulunamadı.');
        } else {
          setError('Sayfa yüklenirken bir hata oluştu.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [slug]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Yükleniyor..." onBack={() => router.back()} />
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
          <Text style={styles.loadingText}>Sayfa yükleniyor...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Hata" onBack={() => router.back()} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={56} color={colors.danger[600]!} />
          <Text style={styles.errorTitle}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              setError('');
              pagesApi.getBySlug(slug!)
                .then((res: any) => setPage(res.data?.data || res.data))
                .catch(() => setError('Sayfa yüklenirken bir hata oluştu.'))
                .finally(() => setLoading(false));
            }}
          >
            <Ionicons name="refresh" size={18} color={colors.white} />
            <Text style={styles.retryButtonText}>Tekrar Dene</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.goBackLink} onPress={() => router.back()}>
            <Text style={styles.goBackText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={page?.title || 'Sayfa'}
        subtitle={formatDate(page?.updatedAt) ? `Son güncelleme: ${formatDate(page?.updatedAt)}` : undefined}
        onBack={() => router.back()}
      />

      <WebView
        originWhitelist={['*']}
        source={{ html: htmlWrapper(page?.content || '') }}
        style={styles.webview}
        startInLoadingState
        javaScriptEnabled
        scalesPageToFit={false}
      />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.text.muted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
    marginTop: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  goBackLink: {
    marginTop: 12,
  },
  goBackText: {
    fontSize: 14,
    color: colors.primary[600]!,
    fontWeight: '500',
  },
});
