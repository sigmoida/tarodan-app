import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { getVerificationCriteria } from '../utils/membershipLimits';
import { theme, Text, Card, ProgressBar } from '@tarodan/ui-native';

const { colors } = theme;

interface VerificationStatusProps {
  compact?: boolean;
  showUpgradePrompt?: boolean;
}

export default function VerificationStatus({ compact = false, showUpgradePrompt = true }: VerificationStatusProps) {
  const { user } = useAuthStore();
  const criteria = getVerificationCriteria();

  if (!user) return null;

  const isVerified = criteria.allMet;
  const completedCount = [
    criteria.emailVerified,
    criteria.phoneVerified,
    criteria.hasTransaction,
    criteria.accountAgeOk,
    criteria.noDisputes,
    criteria.profileComplete,
  ].filter(Boolean).length;

  const progress = completedCount / 6;

  // Compact version for profile header
  if (compact) {
    return (
      <TouchableOpacity onPress={() => router.push('/settings/verification' as any)}>
        <View style={styles.compactContainer}>
          <Ionicons
            name={isVerified ? 'shield-checkmark' : 'shield-outline'}
            size={20}
            color={isVerified ? colors.success[600]! : colors.warning[600]!}
          />
          <Text style={[styles.compactText, { color: isVerified ? colors.success[600]! : colors.warning[600]! }]}>
            {isVerified ? 'Doğrulanmış Üye' : 'Doğrulama Bekliyor'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons
          name={isVerified ? 'shield-checkmark' : 'shield-half-outline'}
          size={28}
          color={isVerified ? colors.success[600]! : colors.primary[600]!}
        />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>
            {isVerified ? 'Doğrulanmış Üye' : 'Üye Doğrulama'}
          </Text>
          <Text style={styles.subtitle}>
            {isVerified
              ? 'Hesabınız doğrulandı!'
              : `${completedCount}/6 kriter tamamlandı`}
          </Text>
        </View>
      </View>

      {!isVerified && (
        <>
          <ProgressBar progress={progress} color={colors.primary[600]!} style={styles.progressBar} />

          <View style={styles.criteriaList}>
            <CriteriaItem
              label="E-posta Doğrulama"
              completed={criteria.emailVerified}
            />
            <CriteriaItem
              label="Telefon Doğrulama"
              completed={criteria.phoneVerified}
            />
            <CriteriaItem
              label="İlk İşlem (Alış/Satış)"
              completed={criteria.hasTransaction}
            />
            <CriteriaItem
              label="Hesap Yaşı (30 gün)"
              completed={criteria.accountAgeOk}
              detail={`${user.accountAge} gün`}
            />
            <CriteriaItem
              label="Şikayetsiz Hesap"
              completed={criteria.noDisputes}
            />
            <CriteriaItem
              label="Profil Tamamlama (%80+)"
              completed={criteria.profileComplete}
              detail={`%${user.profileCompletion}`}
            />
          </View>

          <View style={styles.benefits}>
            <Text style={styles.benefitsTitle}>Doğrulama Avantajları:</Text>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success[600]!} />
              <Text style={styles.benefitText}>Doğrulanmış Üye rozeti</Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success[600]!} />
              <Text style={styles.benefitText}>5.000 TL&apos;ye kadar ilan verme</Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success[600]!} />
              <Text style={styles.benefitText}>Daha yüksek güven skoru</Text>
            </View>
          </View>
        </>
      )}

      {isVerified && showUpgradePrompt && user.membershipTier === 'free' && (
        <View style={styles.upgradePrompt}>
          <Text style={styles.upgradeText}>
            Sınırsız ilan, takas ve Dijital Garaj için
          </Text>
          <TouchableOpacity onPress={() => router.push('/upgrade')}>
            <Text style={styles.upgradeLink}>Premium&apos;a Geç</Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

function CriteriaItem({
  label,
  completed,
  detail
}: {
  label: string;
  completed: boolean;
  detail?: string;
}) {
  return (
    <View style={styles.criteriaItem}>
      <Ionicons
        name={completed ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={completed ? colors.success[600]! : colors.text.subtle}
      />
      <Text style={[styles.criteriaLabel, completed && styles.criteriaLabelCompleted]}>
        {label}
      </Text>
      {detail && (
        <Text style={styles.criteriaDetail}>{detail}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    backgroundColor: colors.surface.DEFAULT,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  compactText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerText: {
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.heading,
  },
  subtitle: {
    color: colors.text.muted,
    fontSize: 12,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 16,
  },
  criteriaList: {
    marginBottom: 16,
  },
  criteriaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  criteriaLabel: {
    flex: 1,
    marginLeft: 12,
    color: colors.text.muted,
  },
  criteriaLabelCompleted: {
    color: colors.text.heading,
  },
  criteriaDetail: {
    color: colors.text.muted,
    fontSize: 12,
  },
  benefits: {
    backgroundColor: colors.success[50]!,
    padding: 12,
    borderRadius: 8,
  },
  benefitsTitle: {
    marginBottom: 8,
    color: colors.success[600]!,
    fontSize: 13,
    fontWeight: '600',
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  benefitText: {
    marginLeft: 8,
    color: colors.text.heading,
    fontSize: 13,
  },
  upgradePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  upgradeText: {
    color: colors.text.muted,
    fontSize: 12,
  },
  upgradeLink: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
});
