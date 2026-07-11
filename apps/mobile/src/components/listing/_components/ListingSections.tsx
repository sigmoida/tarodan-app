import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme, DateField } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';
import { CONDITIONS } from '../_lib/constants';
import type { ListingFormController } from '../_hooks/useListingForm';

const { colors } = theme;

type SectionProps = { f: ListingFormController };

// ---------------------------------------------------------------------------
// Header + banners (page title, IBAN prompt, limits, reactivate/deleted panels)
// ---------------------------------------------------------------------------
export function ListingHeaderBanners({ f }: SectionProps) {
  return (
    <>
      {!f.isEdit && (
        <>
          <Text style={styles.pageTitle}>Yeni İlan Oluştur</Text>
          <Text style={styles.pageSubtitle}>Ürününüzü koleksiyoncularla buluşturun</Text>
        </>
      )}

      {/* Bank Account Banner (create only) */}
      {!f.isEdit && !f.bankAccountQuery.isLoading && !f.hasBankAccount && (
        <View style={styles.ibanBanner}>
          <Text style={styles.ibanBannerTitle}>İlan vermeden önce banka hesabı ekleyin</Text>
          <Text style={styles.ibanBannerBody}>
            Satışlarınızdan elde edeceğiniz tutarın aktarılabilmesi için IBAN gereklidir.
          </Text>
          <TouchableOpacity
            style={styles.ibanBannerButton}
            onPress={() => router.push('/settings/bank-account')}
          >
            <Text style={styles.ibanBannerButtonText}>IBAN Ekle</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Listing Limits (create only) */}
      {!f.isEdit && f.limitsLoading ? (
        <View style={styles.limitsPlaceholder}>
          <ActivityIndicator size="small" color={colors.primary[600]!} />
        </View>
      ) : !f.isEdit && f.listingLimits ? (
        <View
          style={[
            styles.limitsCard,
            f.listingLimits.isPremium
              ? styles.limitsPremium
              : f.listingLimits.canCreateListing
              ? styles.limitsOk
              : styles.limitsExceeded,
          ]}
        >
          <View style={styles.limitsRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.limitsTitle,
                  f.listingLimits.isPremium
                    ? styles.limitsTitlePremium
                    : f.listingLimits.canCreateListing
                    ? styles.limitsTitleOk
                    : styles.limitsTitleExceeded,
                ]}
              >
                {f.listingLimits.maxListings === -1
                  ? `Mevcut İlan: ${f.listingLimits.currentCount} (Sınırsız)`
                  : `İlan Hakkı: ${f.listingLimits.currentCount} / ${f.listingLimits.maxListings}`}
              </Text>
              {f.listingLimits.remainingListings !== -1 && (
                <Text style={styles.limitsRemaining}>Kalan: {f.listingLimits.remainingListings}</Text>
              )}
            </View>
            {!f.listingLimits.canCreateListing && (
              <TouchableOpacity style={styles.upgradeButton} onPress={() => router.push('/(tabs)/profile')}>
                <Text style={styles.upgradeButtonText}>Premium'a Geç</Text>
              </TouchableOpacity>
            )}
          </View>

          {f.listingLimits.maxListings > 0 && (
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(
                      100,
                      (f.listingLimits.currentCount / f.listingLimits.maxListings) * 100
                    )}%`,
                  },
                  f.listingLimits.canCreateListing ? styles.progressFillOk : styles.progressFillExceeded,
                ]}
              />
            </View>
          )}
        </View>
      ) : null}

      {/* Reactivation panel (edit, sold) */}
      {f.isEdit && f.status === 'sold' && (
        <View style={[styles.card, styles.reactivateCard]}>
          <Text style={styles.reactivateTitle}>Bu ilan satıldı</Text>
          <Text style={styles.hint}>Stok girerek ilanı yeniden satışa açabilirsiniz.</Text>
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={f.reactivateQuantity}
            onChangeText={f.setReactivateQuantity}
            placeholder="Stok miktarı"
            placeholderTextColor={colors.text.subtle}
            keyboardType="number-pad"
          />
          <TouchableOpacity
            style={[styles.submitButton, { marginTop: 12 }, f.reactivating && styles.submitButtonDisabled]}
            onPress={f.handleReactivate}
            disabled={f.reactivating}
          >
            {f.reactivating ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>Onaya Gönder</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Kaldırılmış ürün: düzenlenemez/yeniden açılamaz (yönetici kaldırması) */}
      {f.isEdit && f.status === 'deleted' && (
        <View style={[styles.card, styles.reactivateCard]}>
          <Text style={styles.reactivateTitle}>Bu ürün kaldırıldı</Text>
          <Text style={styles.hint}>
            Bu ürün yönetici tarafından kaldırılmış ve yeniden açılamaz. Tekrar satmak
            için yeni bir ilan oluşturabilirsiniz.
          </Text>
        </View>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
export function ListingImagesSection({ f }: SectionProps) {
  const maxImages = f.limits?.maxImagesPerListing || 5;
  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeader}>GÖRSELLER</Text>

      {f.imageKeys.length < maxImages ? (
        <TouchableOpacity style={styles.imageUploadArea} onPress={f.pickImages} disabled={f.uploadingImages}>
          {f.uploadingImages ? (
            <ActivityIndicator size="small" color={colors.primary[600]!} />
          ) : (
            <>
              <Text style={styles.imageUploadIcon}>📷</Text>
              <Text style={styles.imageUploadLabel}>Görsel yüklemek için dokunun</Text>
            </>
          )}
          <Text style={styles.imageUploadCount}>
            {f.imageKeys.length} / {maxImages} yüklendi
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.imageMaxReached}>
          <Text style={styles.imageMaxReachedText}>Maksimum görsel sayısına ulaştınız</Text>
        </View>
      )}

      {f.imageUris.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
          {f.imageUris.map((uri, index) => (
            <View key={`img-${index}`} style={styles.imageThumbWrap}>
              <Image source={{ uri }} style={styles.imageThumb} />
              {index === 0 && (
                <View style={styles.coverBadge}>
                  <Text style={styles.coverBadgeText}>Kapak</Text>
                </View>
              )}
              <TouchableOpacity style={styles.imageRemoveBtn} onPress={() => f.removeImage(index)}>
                <Text style={styles.imageRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Basic info (title, description)
// ---------------------------------------------------------------------------
export function ListingBasicInfoSection({ f }: SectionProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeader}>TEMEL BİLGİLER</Text>

      <Text style={styles.label}>
        Başlık <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={f.title}
        onChangeText={f.setTitle}
        placeholder="Örn: Hot Wheels '69 Camaro Z28"
        placeholderTextColor={colors.text.subtle}
        maxLength={200}
      />
      <Text style={styles.charCount}>{f.title.length}/200</Text>

      <Text style={[styles.label, { marginTop: 16 }]}>Açıklama</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={f.description}
        onChangeText={f.setDescription}
        placeholder="Ürün hakkında detaylı bilgi..."
        placeholderTextColor={colors.text.subtle}
        multiline
        maxLength={5000}
        textAlignVertical="top"
      />
      <Text style={styles.charCount}>{f.description.length}/5000</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Product details (category, condition, brand, model, scale, material,
// manufacturer, year, manufacturer-scoped attribute groups)
// ---------------------------------------------------------------------------
export function ListingDetailsSection({ f }: SectionProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeader}>ÜRÜN DETAYLARI</Text>

      <Text style={styles.label}>
        Kategori <Text style={styles.required}>*</Text>
      </Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => {
          f.setCategorySearch('');
          f.setShowCategoryPicker(true);
        }}
      >
        <Text style={f.selectedCategory ? styles.pickerValue : styles.pickerPlaceholder}>
          {f.selectedCategory?.name || 'Kategori Seçin'}
        </Text>
        <Text style={styles.pickerArrow}>›</Text>
      </TouchableOpacity>

      <Text style={[styles.label, { marginTop: 16 }]}>
        Durum <Text style={styles.required}>*</Text>
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {CONDITIONS.map((c) => (
          <TouchableOpacity
            key={c.value}
            style={[styles.chip, f.condition === c.value && styles.chipActive]}
            onPress={() => f.setCondition(c.value)}
          >
            <Text style={[styles.chipText, f.condition === c.value && styles.chipTextActive]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[styles.label, { marginTop: 16 }]}>Marka</Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => {
          f.setBrandSearch('');
          f.setShowBrandPicker(true);
        }}
        disabled={f.brandsLoading}
      >
        <Text style={f.selectedBrand ? styles.pickerValue : styles.pickerPlaceholder}>
          {f.brandsLoading ? 'Yükleniyor...' : f.selectedBrand?.name || 'Marka Seçin'}
        </Text>
        <Text style={styles.pickerArrow}>›</Text>
      </TouchableOpacity>

      <Text style={[styles.label, { marginTop: 16 }]}>Model</Text>
      <TouchableOpacity
        style={[styles.pickerButton, !f.brandId && styles.pickerDisabled]}
        onPress={() => f.setShowModelPicker(true)}
        disabled={!f.brandId || f.modelsLoading}
      >
        <Text style={f.selectedModel ? styles.pickerValue : styles.pickerPlaceholder}>
          {!f.brandId
            ? 'Önce marka seçin'
            : f.modelsLoading
            ? 'Yükleniyor...'
            : f.models.length === 0
            ? 'Bu markaya ait model yok'
            : f.selectedModel?.name || 'Model Seçin'}
        </Text>
        <Text style={styles.pickerArrow}>›</Text>
      </TouchableOpacity>

      <Text style={[styles.label, { marginTop: 16 }]}>Ölçek</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {f.effectiveScales.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, f.scale === s && styles.chipActive]}
            onPress={() => f.setScale(s)}
          >
            <Text style={[styles.chipText, f.scale === s && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[styles.label, { marginTop: 16 }]}>Malzeme</Text>
      <TouchableOpacity style={styles.pickerButton} onPress={() => f.setShowMaterialPicker(true)}>
        <Text style={f.selectedMaterial ? styles.pickerValue : styles.pickerPlaceholder}>
          {f.selectedMaterial?.label || 'Malzeme Seçin'}
        </Text>
        <Text style={styles.pickerArrow}>›</Text>
      </TouchableOpacity>

      <Text style={[styles.label, { marginTop: 16 }]}>Üretici</Text>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => {
          f.setManufacturerSearch('');
          f.setShowManufacturerPicker(true);
        }}
      >
        <Text style={f.selectedManufacturer ? styles.pickerValue : styles.pickerPlaceholder}>
          {f.selectedManufacturer?.name || 'Üretici Seçin'}
        </Text>
        <Text style={styles.pickerArrow}>›</Text>
      </TouchableOpacity>

      <Text style={[styles.label, { marginTop: 16 }]}>Çıkış Yılı</Text>
      <TouchableOpacity style={styles.pickerButton} onPress={() => f.setShowYearPicker(true)}>
        <Text style={f.year ? styles.pickerValue : styles.pickerPlaceholder}>{f.year || 'Yıl Seçin'}</Text>
        <Text style={styles.pickerArrow}>›</Text>
      </TouchableOpacity>

      {/* Manufacturer-scoped extra attribute groups */}
      {f.manufacturerAttrGroups.map((group) => {
        const selected = f.customAttributes[group.slug] ?? [];
        const summary =
          selected.length === 0
            ? `${group.name} seçin`
            : selected.length === 1
            ? group.attributes.find((a) => a.slug === selected[0])?.label ?? `1 seçili`
            : `${selected.length} seçili`;
        return (
          <View key={group.slug}>
            <Text style={[styles.label, { marginTop: 16 }]}>{group.name}</Text>
            <TouchableOpacity style={styles.pickerButton} onPress={() => f.setShowAttrGroupPicker(group.slug)}>
              <Text style={selected.length > 0 ? styles.pickerValue : styles.pickerPlaceholder}>{summary}</Text>
              <Text style={styles.pickerArrow}>›</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Options (trade, set/bundle, pre-order, status)
// ---------------------------------------------------------------------------
export function ListingOptionsSection({ f }: SectionProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeader}>SEÇENEKLER</Text>

      <View
        style={[
          styles.toggleRow,
          f.limits?.canTrade ? styles.toggleRowEnabled : styles.toggleRowDisabled,
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Takas Aktif</Text>
          <Text style={styles.toggleHint}>
            {f.limits?.canTrade
              ? 'Bu ürünü takas için de açık tutar'
              : 'Takas özelliği Temel veya üstü üyelik gerektirir'}
          </Text>
        </View>
        {f.limits?.canTrade ? (
          <Switch
            value={f.isTradeEnabled}
            onValueChange={f.setIsTradeEnabled}
            trackColor={{ false: colors.gray[300], true: colors.warning[500]! }}
            thumbColor={colors.white}
          />
        ) : (
          <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.upgradeLinkText}>Premium →</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.toggleRow, styles.toggleRowDisabled, { marginTop: 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Set / Paket</Text>
          <Text style={styles.toggleHint}>Tek ilanda birden fazla model (örn. 5'li paket)</Text>
        </View>
        <Switch
          value={f.isSet}
          onValueChange={f.setIsSet}
          trackColor={{ false: colors.gray[300], true: colors.info[600]! }}
          thumbColor={colors.white}
        />
      </View>

      {f.isSet && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.label}>Set Parça Sayısı</Text>
          <TextInput
            style={styles.input}
            value={f.bundleSize}
            onChangeText={(t) => f.setBundleSize(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="örn. 5"
            placeholderTextColor={colors.gray[400]}
          />
          <Text style={styles.toggleHint}>
            Setteki toplam parça sayısı. Her parçanın marka/model/renk gibi
            ayrıntılarını açıklamada belirtin.
          </Text>
        </View>
      )}

      {/* Pre-order (edit only) */}
      {f.isEdit && (
        <View style={[styles.toggleRow, styles.toggleRowDisabled, { marginTop: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Ön Sipariş</Text>
            <Text style={styles.toggleHint}>Ürün henüz elinizde değilse ön sipariş olarak işaretleyin</Text>
          </View>
          <Switch
            value={f.isPreorder}
            onValueChange={f.setIsPreorder}
            trackColor={{ false: colors.gray[300], true: colors.primary[600]! }}
            thumbColor={colors.white}
          />
        </View>
      )}

      {/* Status (edit only, active/inactive) */}
      {f.isEdit && (f.status === 'active' || f.status === 'inactive') && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.label}>İlan Durumu</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, f.status === 'active' && styles.chipActive]}
              onPress={() => f.setStatus('active')}
            >
              <Text style={[styles.chipText, f.status === 'active' && styles.chipTextActive]}>Aktif</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, f.status === 'inactive' && styles.chipActive]}
              onPress={() => f.setStatus('inactive')}
            >
              <Text style={[styles.chipText, f.status === 'inactive' && styles.chipTextActive]}>Pasif</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pricing (price, quantity, discount, commission preview)
// ---------------------------------------------------------------------------
export function ListingPricingSection({ f }: SectionProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeader}>FİYATLANDIRMA</Text>

      <Text style={styles.label}>
        Fiyat (₺) <Text style={styles.required}>*</Text>
      </Text>
      <TextInput
        style={styles.input}
        value={f.price}
        onChangeText={f.setPrice}
        placeholder="0.00"
        placeholderTextColor={colors.text.subtle}
        keyboardType="decimal-pad"
      />

      <Text style={[styles.label, { marginTop: 16 }]}>Stok Miktarı</Text>
      <TextInput
        style={styles.input}
        value={f.quantity}
        onChangeText={f.setQuantity}
        placeholder={f.isEdit ? 'Sınırsız' : '1'}
        placeholderTextColor={colors.text.subtle}
        keyboardType="number-pad"
      />
      <Text style={styles.hint}>
        {f.isEdit ? 'Boş bırakırsanız sınırsız stok' : 'Boş bırakırsanız 1 adet'}
      </Text>
      {f.isEdit && f.reservedQty > 0 && (
        <Text style={styles.reservedHint}>
          {f.reservedQty} adedi aktif takas/sipariş için rezerve — ilanda alıcılara{' '}
          {Math.max(0, (Number(f.quantity) || 0) - f.reservedQty)} adet "satışta" görünür.
        </Text>
      )}

      {/* Discount (edit only) */}
      {f.isEdit && (
        <View style={styles.discountBox}>
          <Text style={styles.label}>İndirimli Fiyat (₺)</Text>
          <TextInput
            style={styles.input}
            value={f.salePrice}
            onChangeText={f.setSalePrice}
            placeholder="İndirim yoksa boş bırakın"
            placeholderTextColor={colors.text.subtle}
            keyboardType="decimal-pad"
          />
          {f.discountPercent > 0 && (
            <Text style={styles.discountPercent}>%{f.discountPercent} indirim</Text>
          )}
          <View style={{ marginTop: 12 }}>
            <DateField
              label="İndirim Başlangıcı"
              value={f.saleStartDate}
              onChange={f.setSaleStartDate}
              placeholder="Tarih seçin"
            />
          </View>
          <DateField
            label="İndirim Bitişi"
            value={f.saleEndDate}
            onChange={f.setSaleEndDate}
            placeholder="Tarih seçin"
            minimumDate={f.saleStartDate ? new Date(f.saleStartDate) : undefined}
          />
        </View>
      )}

      {/* Commission preview */}
      {(f.commissionLoading || f.commissionPreview) && (
        <View style={styles.commissionCard}>
          <Text style={styles.commissionTitle}>Tahmini (satış başına)</Text>
          {f.commissionLoading ? (
            <ActivityIndicator size="small" color={colors.text.subtle} style={{ marginTop: 4 }} />
          ) : f.commissionPreview ? (
            <View style={styles.commissionRow}>
              <Text style={styles.commissionFee}>
                Platform kesintisi: ₺
                {(f.commissionPreview.sellerFeeAmount ?? 0).toLocaleString('tr-TR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
              <Text style={styles.commissionNet}>
                Net kazanç: ₺
                {(f.commissionPreview.sellerNetAmount ?? 0).toLocaleString('tr-TR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Submit + delete
// ---------------------------------------------------------------------------
export function ListingSubmitRow({ f }: SectionProps) {
  return (
    <>
      <View style={styles.submitRow}>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>İptal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, f.isSubmitting && styles.submitButtonDisabled]}
          onPress={f.handleSubmit}
          disabled={f.isSubmitting}
        >
          {f.isSubmitting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>{f.isEdit ? 'Değişiklikleri Kaydet' : 'İlanı Oluştur'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Delete (edit only) */}
      {f.isEdit && (
        <TouchableOpacity style={styles.deleteButton} onPress={f.handleDelete} disabled={f.isSubmitting}>
          <Ionicons name="trash-outline" size={18} color={colors.danger[600]!} />
          <Text style={styles.deleteButtonText}>İlanı Sil</Text>
        </TouchableOpacity>
      )}
    </>
  );
}
