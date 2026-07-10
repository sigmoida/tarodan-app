import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { theme, ScreenHeader } from '@tarodan/ui-native';

import { styles } from './_lib/membershipStyles';
import { useMembership } from './_hooks/useMembership';
import {
  MembershipBanners,
  MembershipCurrentPlan,
  MembershipBillingToggle,
  MembershipTierList,
} from './_components/MembershipSections';

const { colors } = theme;

/**
 * Membership plans — THIN screen. The `useMembership` controller owns the
 * membership/tiers fetch, billing period, tier visibility/guard, and price
 * getters; this file composes the header, banners, current plan, toggle, and
 * tier cards.
 */
export default function MembershipScreen() {
  const f = useMembership();

  const header = (
    <ScreenHeader
      title={f.t('mobile.membershipTitle')}
      onBack={f.guardLocked ? f.handleLockedExit : f.handleBack}
    />
  );

  if (f.loading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]!} />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <MembershipBanners f={f} />
        <MembershipCurrentPlan f={f} />
        <MembershipBillingToggle f={f} />
        <MembershipTierList f={f} />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
