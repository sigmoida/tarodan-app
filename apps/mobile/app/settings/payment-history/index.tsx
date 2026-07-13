import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { ScreenHeader, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePaymentHistory } from './_hooks/usePaymentHistory';
import { styles } from './_lib/styles';
import { PaymentHistoryItem } from './_components/PaymentHistoryItem';

export default function PaymentHistoryScreen() {
  const f = usePaymentHistory();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (!f.isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Ödeme Geçmişi" onBack={back} />
        <View style={styles.centeredContainer}>
          <Ionicons name="log-in-outline" size={48} color={theme.colors.gray[400]} />
          <Text style={styles.emptyTitle}>Giriş Yapın</Text>
          <Text style={styles.emptySubtitle}>Ödeme geçmişinizi görmek için giriş yapın</Text>
          <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.loginButtonText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ödeme Geçmişi" onBack={back} />

      {f.isLoading ? (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary[500]} />
        </View>
      ) : (
        <FlatList
          data={f.payments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PaymentHistoryItem item={item} onPress={f.handlePaymentPress} />}
          contentContainerStyle={f.payments.length === 0 ? styles.emptyListContainer : styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={f.isRefreshing}
              onRefresh={() => f.fetchPayments(true)}
              colors={[theme.colors.primary[500]]}
              tintColor={theme.colors.primary[500]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={48} color={theme.colors.gray[400]} />
              </View>
              <Text style={styles.emptyTitle}>Ödeme geçmişiniz bulunmuyor</Text>
              <Text style={styles.emptySubtitle}>Yaptığınız ödemeler burada listelenecektir</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
