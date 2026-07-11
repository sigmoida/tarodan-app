import { View, ScrollView, RefreshControl } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';

import { styles } from './_lib/profileStyles';
import { useProfile } from './_hooks/useProfile';
import { ProfileGuestView } from './_components/ProfileGuestView';
import {
  ProfileCard,
  ProfileStatsGrid,
  ProfileGarageSection,
  ProfileQuickActions,
  ProfileMenuSections,
} from './_components/ProfileSections';

const { colors } = theme;

/**
 * Profile tab — THIN screen. The `useProfile` controller owns all queries,
 * the trust-visibility mutation, and logout/delete/guest actions; this file
 * only branches guest vs. authenticated and composes the sections.
 */
export default function ProfileScreen() {
  const f = useProfile();

  if (!f.isAuthenticated) return <ProfileGuestView f={f} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="h3" tone="inverted" weight="bold">
          Profil
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={f.refreshing}
            onRefresh={f.onRefresh}
            tintColor={colors.primary[600]!}
            colors={[colors.primary[600]!]}
          />
        }
      >
        <ProfileCard f={f} />
        <ProfileStatsGrid f={f} />
        <ProfileGarageSection f={f} />
        <ProfileQuickActions />
        <ProfileMenuSections f={f} />

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
