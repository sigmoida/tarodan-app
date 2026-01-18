import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, Portal, Dialog, Button, TextInput, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { TarodanColors } from '../theme';

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
    <Portal>
      <Dialog visible={visible} onDismiss={handleClose} style={styles.dialog}>
        <Dialog.Title style={styles.title}>
          {type === 'product' ? 'Ürünü Değerlendir' : 'Satıcıyı Değerlendir'}
        </Dialog.Title>
        
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView>
            {/* Target info */}
            <Text style={styles.targetInfo}>
              {type === 'product' ? productTitle : sellerName}
            </Text>

            {/* Star Rating */}
            <View style={styles.starsContainer}>
              <Text variant="bodyMedium" style={styles.label}>Puan</Text>
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
                      color={star <= rating ? TarodanColors.warning : TarodanColors.textLight}
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
              <TextInput
                label="Başlık (opsiyonel)"
                value={title}
                onChangeText={setTitle}
                maxLength={100}
                style={styles.input}
                mode="outlined"
              />
            )}

            {/* Review */}
            <TextInput
              label={type === 'product' ? 'Yorumunuz (opsiyonel)' : 'Yorumunuz (opsiyonel)'}
              value={review}
              onChangeText={(text) => setReview(text.slice(0, maxReviewChars))}
              multiline
              numberOfLines={4}
              style={styles.input}
              mode="outlined"
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
                <Text variant="bodySmall" style={styles.criteriaTitle}>
                  Değerlendirme Kriterleri:
                </Text>
                <View style={styles.criteriaItem}>
                  <Ionicons name="checkmark-circle" size={16} color={TarodanColors.success} />
                  <Text style={styles.criteriaText}>Ürün Doğruluğu (%40)</Text>
                </View>
                <View style={styles.criteriaItem}>
                  <Ionicons name="checkmark-circle" size={16} color={TarodanColors.success} />
                  <Text style={styles.criteriaText}>İletişim (%20)</Text>
                </View>
                <View style={styles.criteriaItem}>
                  <Ionicons name="checkmark-circle" size={16} color={TarodanColors.success} />
                  <Text style={styles.criteriaText}>Kargo (%20)</Text>
                </View>
                <View style={styles.criteriaItem}>
                  <Ionicons name="checkmark-circle" size={16} color={TarodanColors.success} />
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
        </Dialog.ScrollArea>

        <Dialog.Actions>
          <Button onPress={handleClose} disabled={isPending}>
            İptal
          </Button>
          <Button 
            mode="contained" 
            onPress={handleSubmit} 
            loading={isPending}
            disabled={rating === 0 || isPending}
          >
            Gönder
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '80%',
  },
  title: {
    textAlign: 'center',
  },
  scrollArea: {
    paddingHorizontal: 0,
  },
  targetInfo: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: TarodanColors.primary,
    paddingHorizontal: 24,
  },
  starsContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  label: {
    marginBottom: 8,
    color: TarodanColors.textSecondary,
  },
  stars: {
    flexDirection: 'row',
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
  ratingText: {
    marginTop: 8,
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  input: {
    marginHorizontal: 24,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  charCountContainer: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  charCount: {
    textAlign: 'right',
    fontSize: 12,
    color: TarodanColors.textSecondary,
  },
  charLimitNote: {
    textAlign: 'right',
    fontSize: 11,
    color: TarodanColors.primary,
  },
  criteriaSection: {
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 16,
  },
  criteriaTitle: {
    marginBottom: 8,
    color: TarodanColors.textSecondary,
  },
  criteriaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  criteriaText: {
    marginLeft: 8,
    fontSize: 13,
    color: TarodanColors.textPrimary,
  },
  errorText: {
    textAlign: 'center',
    color: TarodanColors.error,
    marginHorizontal: 24,
    marginBottom: 8,
  },
});
