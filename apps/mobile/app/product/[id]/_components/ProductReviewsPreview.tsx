import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProductReview } from '../_lib/types';

const { colors } = theme;

/** Değerlendirme bölümü: ilk 2 yorum + "Tümünü Gör". */
export function ProductReviewsPreview({
  reviews,
  onSeeAll,
}: {
  reviews: ProductReview[] | undefined;
  onSeeAll: () => void;
}) {
  const list = Array.isArray(reviews) ? reviews : [];
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Değerlendirmeler</Text>
        <Pressable onPress={onSeeAll}>
          <Text style={styles.seeAll}>Tümünü Gör</Text>
        </Pressable>
      </View>

      {list.slice(0, 2).map((review) => {
        const score = review.score ?? review.rating ?? 0;
        const reviewerName =
          review.user?.displayName ?? (review as any).userName ?? (review as any).reviewer?.displayName ?? 'Kullanıcı';
        const reviewText = review.review ?? review.comment;
        const dateStr = review.createdAt ?? review.date;
        return (
          <View key={review.id} style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewerName}>{reviewerName}</Text>
              <View style={styles.ratingStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= score ? 'star' : 'star-outline'}
                    size={14}
                    color={colors.warning[500]!}
                  />
                ))}
              </View>
            </View>
            {review.title ? <Text style={styles.reviewTitle}>{review.title}</Text> : null}
            {reviewText ? <Text style={styles.reviewComment}>{reviewText}</Text> : null}
            {dateStr ? <Text style={styles.reviewDate}>{new Date(dateStr).toLocaleDateString('tr-TR')}</Text> : null}
          </View>
        );
      })}

      {list.length === 0 && <Text style={styles.noReviews}>Henüz değerlendirme yok</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text.heading, marginBottom: 12 },
  seeAll: { fontSize: 14, color: colors.primary[600]!, fontWeight: '500' },
  reviewCard: { backgroundColor: colors.gray[50], borderRadius: 8, padding: 12, marginBottom: 8 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reviewerName: { fontSize: 14, fontWeight: '600', color: colors.text.heading },
  ratingStars: { flexDirection: 'row', gap: 2 },
  reviewTitle: { fontSize: 14, fontWeight: '700', color: colors.text.heading, marginBottom: 2 },
  reviewComment: { fontSize: 14, color: colors.text.heading, lineHeight: 20 },
  reviewDate: { fontSize: 12, color: colors.text.muted, marginTop: 8 },
  noReviews: { fontSize: 14, color: colors.text.muted, fontStyle: 'italic' },
});
