import React from "react";
import { View, Image, TouchableOpacity } from "react-native";
import {
  Input,
  Radio,
  Switch,
  Spinner,
  Divider,
  Text,
  theme,
} from "@tarodan/ui-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { PhoneInput } from "@/components/common";
import { transformImageUrl } from "@/utils/imageUrl";
import { formatPrice, asLabel } from "@/utils/format";
import { AddressSelector } from "./AddressSelector";
import { styles } from "../_lib/styles";
import type { useCheckout } from "../_hooks/useCheckout";

const { colors } = theme;
type Ctrl = ReturnType<typeof useCheckout>;

/** Adım 1: konuk iletişim + teslimat adresi + fatura adresi (toggle). */
export function Step1Address({ c }: { c: Ctrl }) {
  return (
    <>
      {!c.isAuthenticated ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons
              name="person-outline"
              size={24}
              color={colors.primary[600]!}
            />
            <Text style={styles.sectionTitle}>İletişim Bilgileri</Text>
          </View>
          <View style={styles.guestNotice}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={colors.warning[600]!}
            />
            <Text style={styles.guestNoticeText}>
              Üye olmadan alışveriş yapıyorsunuz. Siparişinizi takip etmek için
              e-posta adresinizi girin.
            </Text>
          </View>
          <Input
            label="Ad Soyad *"
            value={c.guestName}
            onChangeText={c.setGuestName}
            containerStyle={styles.input}
            testID="guest-name-input"
          />
          <Input
            label="E-posta *"
            value={c.guestEmail}
            onChangeText={c.setGuestEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            containerStyle={styles.input}
            testID="guest-email-input"
          />
          <PhoneInput
            label="Telefon *"
            countryCode={c.guestPhoneCountryCode}
            onCountryCodeChange={c.setGuestPhoneCountryCode}
            phone={c.guestPhone}
            onPhoneChange={c.setGuestPhone}
            containerStyle={styles.input}
          />
          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => router.push("/(auth)/login" as any)}
          >
            <Text style={styles.loginLinkText}>Üye misiniz? Giriş yapın →</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons
            name="location-outline"
            size={24}
            color={colors.primary[600]!}
          />
          <Text style={styles.sectionTitle}>Teslimat Adresi</Text>
        </View>
        <AddressSelector
          isAuthenticated={c.isAuthenticated}
          addresses={c.addresses}
          selectedId={c.selectedAddressId}
          setSelectedId={c.setSelectedAddressId}
          inline={c.shippingAddress}
          setInline={c.setShippingAddress}
        />
      </View>

      <View style={styles.section}>
        <View
          style={[styles.sectionHeader, { justifyContent: "space-between" }]}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Ionicons
              name="receipt-outline"
              size={24}
              color={colors.primary[600]!}
            />
            <Text style={styles.sectionTitle}>Fatura Adresi</Text>
          </View>
          <Switch
            value={c.billingDifferent}
            onValueChange={c.setBillingDifferent}
          />
        </View>
        {c.billingDifferent ? (
          <AddressSelector
            isBilling
            isAuthenticated={c.isAuthenticated}
            addresses={c.addresses}
            selectedId={c.selectedBillingAddressId}
            setSelectedId={c.setSelectedBillingAddressId}
            inline={c.billingAddress}
            setInline={c.setBillingAddress}
          />
        ) : (
          <Text style={styles.helperText}>
            Teslimat adresi ile aynı kullanılacak.
          </Text>
        )}
      </View>
    </>
  );
}

/** Adım 2: kargo (tek firma) + ödeme yöntemi bilgilendirme. */
export function Step2Payment({ c }: { c: Ctrl }) {
  return (
    <>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="car-outline" size={24} color={colors.primary[600]!} />
          <Text style={styles.sectionTitle}>Kargo Seçimi</Text>
        </View>
        <View style={[styles.optionCard, styles.optionCardActive]}>
          <Radio checked onChange={() => {}} />
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>Sürat Kargo</Text>
            <Text style={styles.optionDescription}>2-4 iş günü teslimat</Text>
          </View>
          {c.shippingLoading ? (
            <Spinner size="sm" />
          ) : (
            <Text style={styles.optionPrice}>
              {formatPrice(c.shippingCost)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons
            name="card-outline"
            size={24}
            color={colors.primary[600]!}
          />
          <Text style={styles.sectionTitle}>Ödeme Yöntemi</Text>
        </View>
        <View style={styles.paytrNotice}>
          <Ionicons name="lock-closed" size={18} color={colors.success[600]!} />
          <Text style={styles.paytrNoticeText}>
            Ödemeniz PayTR güvenli altyapısı üzerinden alınır. Kart bilgileriniz
            Tarodan'a kaydedilmez; bir sonraki adımda PayTR'nin 3D Secure ödeme
            sayfası açılır.
          </Text>
        </View>
      </View>
    </>
  );
}

/** Adım 3: sipariş özeti (ürünler) + güvenlik notu. */
export function Step3Confirm({ c }: { c: Ctrl }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons
          name="receipt-outline"
          size={24}
          color={colors.primary[600]!}
        />
        <Text style={styles.sectionTitle}>Sipariş Özeti</Text>
      </View>

      {c.items.map((item) => (
        <View key={item.id} style={styles.orderItem}>
          <Image
            source={{ uri: transformImageUrl(item.imageUrl) }}
            style={styles.orderItemImage}
          />
          <View style={styles.orderItemInfo}>
            <Text style={styles.orderItemTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.orderItemMeta}>
              {asLabel(item.brand)} · {asLabel(item.scale)} · x{item.quantity}
            </Text>
          </View>
          <Text style={styles.orderItemPrice}>
            {formatPrice(
              c.quotedLineTotals[item.productId] ?? item.price * item.quantity,
            )}
          </Text>
        </View>
      ))}

      <Divider style={{ marginVertical: theme.spacing[3] }} />

      <View style={styles.securityNotice}>
        <Ionicons
          name="shield-checkmark"
          size={20}
          color={colors.success[600]!}
        />
        <View style={styles.securityContent}>
          <Text style={styles.securityTitle}>Güvenli Alışveriş</Text>
          <Text style={styles.securityText}>
            Ödemeniz şifreli olarak iletilir. Ürün elinize ulaşana kadar paranız
            güvende tutulur.
          </Text>
        </View>
      </View>
    </View>
  );
}
