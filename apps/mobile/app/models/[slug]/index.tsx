import { View, ScrollView } from 'react-native';
import { Spinner, EmptyState } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { ScreenHeader, ThemedRefreshControl } from '@/components/common';
import { useModelDetail } from './_hooks/useModelDetail';
import { styles } from './_lib/styles';
import { ModelHero, ModelProductsGrid } from './_components/ModelSections';

export default function ModelDetailScreen() {
  const f = useModelDetail();

  if (f.modelQuery.isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Model" />
        <View style={styles.loading}>
          <Spinner size="lg" />
        </View>
      </View>
    );
  }

  if (f.modelQuery.isError || !f.model) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Model" />
        <EmptyState
          icon="sad-outline"
          title="Model bulunamadı"
          subtitle="Aradığınız model mevcut değil."
          actionLabel="Modellere Dön"
          onAction={() => router.replace('/models' as any)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={f.model.name} subtitle={f.model.brand?.name} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<ThemedRefreshControl refreshing={f.refreshing} onRefresh={f.onRefresh} />}
      >
        <ModelHero model={f.model} />
        <ModelProductsGrid f={f} />
      </ScrollView>
    </View>
  );
}
