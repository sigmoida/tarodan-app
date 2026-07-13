import { View } from 'react-native';
import { Button, Card, Divider, Switch, Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../_lib/styles';
import { formatDate, formatTL } from '../_lib/helpers';
import type { MembershipManageController } from '../_hooks/useMembershipManage';

const { colors } = theme;

/** Mevcut plan kartı — tier rozeti, durum, dönem/ödeme bilgileri, otomatik yenileme. */
export function CurrentPlanCard({ f }: { f: MembershipManageController }) {
  const { data, tierName, isPaid, isCancelled, autoRenew } = f;

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.tierBadge}>
          <Ionicons name="sparkles-outline" size={16} color={colors.primary[600]!} />
          <Text style={styles.tierText}>{tierName}</Text>
        </View>
        {isPaid ? (
          isCancelled ? (
            <View style={styles.activeRow}>
              <Ionicons name="close-circle" size={18} color={colors.warning[600]!} />
              <Text style={[styles.activeText, { color: colors.warning[600]! }]}>İptal Edildi</Text>
            </View>
          ) : (
            <View style={styles.activeRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />
              <Text style={styles.activeText}>Aktif</Text>
            </View>
          )
        ) : null}
      </View>

      {isPaid && isCancelled ? (
        <View style={styles.cancelledNote}>
          <Ionicons name="information-circle-outline" size={16} color={colors.warning[600]!} />
          <Text style={styles.cancelledNoteText}>
            Üyeliğiniz iptal edildi. {formatDate(data?.currentPeriodEnd)} tarihine kadar
            özelliklerinizi kullanmaya devam edebilirsiniz.
          </Text>
        </View>
      ) : null}

      {isPaid ? (
        <>
          <Divider style={{ marginVertical: 12 }} />
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Başlangıç</Text>
            <Text style={styles.kvValue}>{formatDate(data?.currentPeriodStart)}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>Bitiş</Text>
            <Text style={styles.kvValue}>{formatDate(data?.currentPeriodEnd)}</Text>
          </View>
          {data?.nextBillingDate ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Sonraki Ödeme</Text>
              <Text style={styles.kvValue}>
                {formatDate(data.nextBillingDate)}
                {data.nextBillingAmount != null ? ` · ${formatTL(data.nextBillingAmount)}` : ''}
              </Text>
            </View>
          ) : null}

          <Divider style={{ marginVertical: 12 }} />

          {/* Auto-renew toggle */}
          <View style={styles.autoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.autoTitle}>Otomatik Yenileme</Text>
              <Text style={styles.autoSub}>
                {autoRenew
                  ? 'Dönem sonunda yenileme hatırlatması gönderilecek — tek tıkla yenileyebilirsiniz.'
                  : 'Kapalı — dönem sonunda üyeliğiniz sona erecek.'}
              </Text>
            </View>
            <Switch
              value={autoRenew}
              onValueChange={f.handleToggleAutoRenew}
              disabled={f.autoRenewMutation.isPending}
            />
          </View>
        </>
      ) : (
        <Text style={styles.helperText}>
          Şu anda ücretsiz üyeliği kullanıyorsunuz. Daha fazla özellik için planınızı yükseltin.
        </Text>
      )}
    </Card>
  );
}

/** Plan değiştir / iptal / yükselt aksiyonları + yardım kutusu. */
export function ManageActions({ f }: { f: MembershipManageController }) {
  return (
    <>
      {f.isPaid ? (
        <>
          <Button
            variant="primary"
            title="Plan Değiştir"
            icon="swap-vertical"
            onPress={() => router.push('/membership' as any)}
            style={styles.actionBtn}
          />
          {!f.isCancelled && (
            <Button
              variant="outline"
              title="Üyeliği İptal Et"
              icon="close-circle-outline"
              onPress={f.handleCancel}
              isLoading={f.cancelMutation.isPending}
              disabled={f.cancelMutation.isPending}
              style={{ ...styles.actionBtn, borderColor: colors.danger[600]! }}
            />
          )}
        </>
      ) : (
        <Button
          variant="primary"
          title="Üyeliği Yükselt"
          icon="arrow-up"
          onPress={() => router.push('/membership' as any)}
          style={styles.actionBtn}
        />
      )}

      <View style={styles.helpBox}>
        <Ionicons name="information-circle-outline" size={18} color={colors.info[600]!} />
        <Text style={styles.helpText}>
          Üyelik ile ilgili sorularınız için destek ekibimizle iletişime geçebilirsiniz.
        </Text>
      </View>
    </>
  );
}
