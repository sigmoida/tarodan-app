import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '../stores/authStore';
import { theme, Text, Button, Modal, Input, Textarea } from '@tarodan/ui-native';

const { colors } = theme;

interface RatingModalProps {
  visible: boolean;
  onDismiss: () => void;
  type: 'product' | 'seller';
  orderId: string;
  productId?: string;
  sellerId?: string;
  productTitle?: string;
  sellerName?: string;
  onSuccess?: () => void;
}

export default function RatingModal({
  visible,
  onDismiss,
  type,
  orderId,
  productId,
  sellerId,
  productTitle,
  sellerName,
  onSuccess,
}: RatingModalProps) {
  const queryClient = useQueryClient();
  const { limits } = useAuthStore();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [review, setReview] = useState('');

  // Character limit for free members
  const maxReviewChars = limits?.maxReviewChars || 500;

  // Product rating mutation
  const productRatingMutation = useMutation({
    mutationFn: async () => {
      return api.post('/ratings/products', {
        productId,
        orderId,
        score: rating,
        title: title || undefined,
        review: review || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onSuccess?.();
      handleClose();
    },
  });

  // Seller rating mutation
  const sellerRatingMutation = useMutation({
    mutationFn: async () => {
      return api.post('/ratings/users', {
        receiverId: sellerId,
        orderId,
        score: rating,
        comment: review || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller', sellerId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onSuccess?.();
      handleClose();
    },
  });

  const handleSubmit = () => {
    if (rating === 0) return;

    if (type === 'product') {
      productRatingMutation.mutate();
    } else {
      sellerRatingMutation.mutate();
    }
  };

  const handleClose = () => {
    setRating(0);
    setTitle('');
    setReview('');
    onDismiss();
  };

  const isPending = productRatingMutation.isPending || sellerRatingMutation.isPending;
  const error = productRatingMutation.error || sellerRatingMutation.error;

  return (
    <Modal
      isOpen={visible}
      onClose={handleClose}
      title={type === 'product' ? 'Ürünü Değerlendir' : 'Satıcıyı Değerlendir'}
    >
      <ScrollView style={styles.scrollArea} keyboardShouldPersistTaps="handled">
        {/* Target info */}
        <Text style={styles.targetInfo}>
          {type === 'product' ? productTitle : sellerName}
        </Text>

        {/* Star Rating */}
        <View style={styles.starsContainer}>
          <Text style={styles.label}>Puan</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                style={styles.starButton}
              >
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={40}
                  color={star <= rating ? colors.warning[500]! : colors.text.subtle}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ratingText}>
            {rating === 0 && 'Puan seçin'}
            {rating === 1 && 'Çok Kötü'}
            {rating === 2 && 'Kötü'}
            {rating === 3 && 'Orta'}
            {rating === 4 && 'İyi'}
            {rating === 5 && 'Mükemmel'}
          </Text>
        </View>

        {/* Title (Product only) */}
        {type === 'product' && (
          <Input
            label="Başlık (opsiyonel)"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            containerStyle={styles.input}
          />
        )}

        {/* Review */}
        <Textarea
          label={type === 'product' ? 'Yorumunuz (opsiyonel)' : 'Yorumunuz (opsiyonel)'}
          value={review}
          onChangeText={(text: string) => setReview(text.slice(0, maxReviewChars))}
          rows={4}
          containerStyle={styles.input}
        />
        <View style={styles.charCountContainer}>
          <Text style={styles.charCount}>
            {review.length}/{maxReviewChars}
          </Text>
          {limits?.maxReviewChars === 500 && (
            <Text style={styles.charLimitNote}>
              Premium üyeler 2000 karakter yazabilir
            </Text>
          )}
        </View>

        {/* Rating Criteria (for seller) */}
        {type === 'seller' && (
          <View style={styles.criteriaSection}>
            <Text style={styles.criteriaTitle}>
              Değerlendirme Kriterleri:
            </Text>
            <View style={styles.criteriaItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success[600]!} />
              <Text style={styles.criteriaText}>Ürün Doğruluğu (%40)</Text>
            </View>
            <View style={styles.criteriaItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success[600]!} />
              <Text style={styles.criteriaText}>İletişim (%20)</Text>
            </View>
            <View style={styles.criteriaItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success[600]!} />
              <Text style={styles.criteriaText}>Kargo (%20)</Text>
            </View>
            <View style={styles.criteriaItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success[600]!} />
              <Text style={styles.criteriaText}>Takas Adaleti (%20)</Text>
            </View>
          </View>
        )}

        {/* Error */}
        {error && (
          <Text style={styles.errorText}>
            {(error as any).response?.data?.message || 'Değerlendirme gönderilemedi'}
          </Text>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Button variant="ghost" title="İptal" onPress={handleClose} disabled={isPending} />
        <Button
          variant="primary"
          title="Gönder"
          onPress={handleSubmit}
          isLoading={isPending}
          disabled={rating === 0 || isPending}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    maxHeight: 480,
  },
  targetInfo: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: theme.spacing[4],
    color: colors.primary[600]!,
  },
  starsContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing[6],
  },
  label: {
    marginBottom: theme.spacing[2],
    color: colors.text.muted,
  },
  stars: {
    flexDirection: 'row',
    gap: theme.spacing[2],
  },
  starButton: {
    padding: theme.spacing[1],
  },
  ratingText: {
    marginTop: theme.spacing[2],
    fontSize: 14,
    color: colors.text.muted,
  },
  input: {
    marginBottom: theme.spacing[2],
  },
  charCountContainer: {
    marginBottom: theme.spacing[4],
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: colors.text.muted,
  },
  charLimitNote: {
    textAlign: 'right',
    fontSize: 11,
    color: colors.primary[600]!,
  },
  criteriaSection: {
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  criteriaTitle: {
    marginBottom: theme.spacing[2],
    color: colors.text.muted,
    fontSize: 12,
  },
  criteriaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[1],
  },
  criteriaText: {
    marginLeft: theme.spacing[2],
    fontSize: 13,
    color: colors.text.heading,
  },
  errorText: {
    textAlign: 'center',
    color: colors.danger[600]!,
    marginBottom: theme.spacing[2],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
});
