import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, Text, Button, theme } from '@tarodan/ui-native';

const { colors } = theme;

/** eLogo e-Arşiv faturası — yalnız HAZIRSA. */
export function OrderElogoInvoiceCard({
  elogoInvoice,
  onView,
  downloading,
}: {
  elogoInvoice: any;
  onView: () => void;
  downloading: boolean;
}) {
  if (!elogoInvoice?.id) return null;
  return (
    <Card variant="elevated" style={styles.card} testID="order-invoice-card">
      <Text variant="label" style={styles.sectionTitle}>Fatura</Text>
      <Text variant="caption" style={styles.hint}>
        Faturanız e-posta adresinize gönderildi
        {elogoInvoice.invoiceNumber ? ` · No: ${elogoInvoice.invoiceNumber}` : ''}
      </Text>
      <Button
        variant="outline"
        fullWidth
        onPress={onView}
        isLoading={downloading}
        disabled={downloading}
        title="Faturayı Görüntüle / İndir"
      />
    </Card>
  );
}

/** Kurumsal satıcı faturası (elle yüklenen PDF). */
export function OrderSellerInvoiceCard({
  sellerInvoice,
  onView,
  downloading,
}: {
  sellerInvoice: any;
  onView: () => void;
  downloading: boolean;
}) {
  if (!(sellerInvoice && (sellerInvoice.invoice || (sellerInvoice.canUpload && sellerInvoice.isSeller)))) return null;
  return (
    <Card variant="elevated" style={styles.card} testID="seller-invoice-card">
      <Text variant="label" style={styles.sectionTitle}>Satıcı Faturası</Text>
      {sellerInvoice.invoice ? (
        <>
          <Text variant="caption" style={styles.hint}>{sellerInvoice.invoice.fileName}</Text>
          <Button
            variant="outline"
            fullWidth
            onPress={onView}
            isLoading={downloading}
            disabled={downloading}
            title="Satıcı Faturasını Görüntüle / İndir"
          />
          {sellerInvoice.canUpload && (
            <Text variant="caption" style={{ color: colors.text.muted, marginTop: theme.spacing[2] }}>
              Faturayı değiştirmek için tarodan.com sipariş sayfasını kullanın.
            </Text>
          )}
        </>
      ) : (
        <Text variant="caption" style={{ color: colors.text.muted }}>
          Bu sipariş için fatura yüklemek üzere tarodan.com sipariş sayfasını kullanın.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing[3] },
  sectionTitle: { marginBottom: theme.spacing[3], color: colors.text.heading },
  hint: { color: colors.text.muted, marginBottom: theme.spacing[2] },
});
