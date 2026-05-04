import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '../../src/components/common';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme';
import { pagesApi } from '../../src/services/api';

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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Yükleniyor...</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>Sayfa yükleniyor...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Hata</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={56} color={TarodanColors.error} />
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
            <Ionicons name="refresh" size={18} color={TarodanColors.textOnPrimary} />
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {page?.title || 'Sayfa'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {page?.updatedAt && (
          <Text style={styles.lastUpdated}>
            Son güncelleme: {formatDate(page.updatedAt)}
          </Text>
        )}

        <Text style={styles.pageTitle}>{page?.title}</Text>
        <Text style={styles.pageContent}>{page?.content}</Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  lastUpdated: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 16,
  },
  pageContent: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    lineHeight: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textPrimary,
    marginTop: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textOnPrimary,
  },
  goBackLink: {
    marginTop: 12,
  },
  goBackText: {
    fontSize: 14,
    color: TarodanColors.primary,
    fontWeight: '500',
  },
});
