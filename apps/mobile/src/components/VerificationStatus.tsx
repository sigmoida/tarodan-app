import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Card, ProgressBar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { getVerificationCriteria } from '../utils/membershipLimits';
import { TarodanColors } from '../theme';

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
      <TouchableOpacity onPress={() => router.push('/settings/verification')}>
        <View style={styles.compactContainer}>
          <Ionicons
            name={isVerified ? 'checkmark-shield' : 'shield-outline'}
            size={20}
            color={isVerified ? TarodanColors.success : TarodanColors.warning}
          />
          <Text style={[styles.compactText, { color: isVerified ? TarodanColors.success : TarodanColors.warning }]}>
            {isVerified ? 'Doğrulanmış Üye' : 'Doğrulama Bekliyor'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <Ionicons
            name={isVerified ? 'checkmark-shield' : 'shield-half-outline'}
            size={28}
            color={isVerified ? TarodanColors.success : TarodanColors.primary}
          />
          <View style={styles.headerText}>
            <Text variant="titleMedium">
              {isVerified ? 'Doğrulanmış Üye' : 'Üye Doğrulama'}
            </Text>
            <Text variant="bodySmall" style={styles.subtitle}>
              {isVerified 
                ? 'Hesabınız doğrulandı!' 
                : `${completedCount}/6 kriter tamamlandı`}
            </Text>
          </View>
        </View>

        {!isVerified && (
          <>
            <ProgressBar progress={progress} color={TarodanColors.primary} style={styles.progressBar} />

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
              <Text variant="titleSmall" style={styles.benefitsTitle}>Doğrulama Avantajları:</Text>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={16} color={TarodanColors.success} />
                <Text style={styles.benefitText}>Doğrulanmış Üye rozeti</Text>
              </View>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={16} color={TarodanColors.success} />
                <Text style={styles.benefitText}>5.000 TL'ye kadar ilan verme</Text>
              </View>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={16} color={TarodanColors.success} />
                <Text style={styles.benefitText}>Daha yüksek güven skoru</Text>
              </View>
            </View>
          </>
        )}

        {isVerified && showUpgradePrompt && user.membershipTier === 'free' && (
          <View style={styles.upgradePrompt}>
            <Text variant="bodySmall" style={styles.upgradeText}>
              Sınırsız ilan, takas ve Dijital Garaj için
            </Text>
            <TouchableOpacity onPress={() => router.push('/upgrade')}>
              <Text style={styles.upgradeLink}>Premium'a Geç</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card.Content>
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
        color={completed ? TarodanColors.success : TarodanColors.textLight}
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
    backgroundColor: TarodanColors.background,
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
  subtitle: {
    color: TarodanColors.textSecondary,
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
    color: TarodanColors.textSecondary,
  },
  criteriaLabelCompleted: {
    color: TarodanColors.textPrimary,
  },
  criteriaDetail: {
    color: TarodanColors.textSecondary,
    fontSize: 12,
  },
  benefits: {
    backgroundColor: TarodanColors.success + '10',
    padding: 12,
    borderRadius: 8,
  },
  benefitsTitle: {
    marginBottom: 8,
    color: TarodanColors.success,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  benefitText: {
    marginLeft: 8,
    color: TarodanColors.textPrimary,
    fontSize: 13,
  },
  upgradePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  upgradeText: {
    color: TarodanColors.textSecondary,
  },
  upgradeLink: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
});
