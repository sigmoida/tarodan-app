import { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  Button,
  HStack,
  IconButton,
  Input,
  Screen,
  Text,
  VStack,
  theme,
} from "@tarodan/ui-native";
import { authApi } from "@/lib/api";
import { useTranslation } from "react-i18next";

const { colors, radius, spacing } = theme;

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const validatePassword = () => {
    if (password.length < 8) return "Şifre en az 8 karakter olmalıdır";
    if (!/[A-Z]/.test(password))
      return "Şifre en az bir büyük harf içermelidir";
    if (!/[a-z]/.test(password))
      return "Şifre en az bir küçük harf içermelidir";
    if (!/[0-9]/.test(password)) return "Şifre en az bir rakam içermelidir";
    return null;
  };

  const handleResetPassword = async () => {
    setError("");
    if (!token) {
      setError(
        "Geçersiz veya eksik token. Lütfen şifre sıfırlama bağlantısını tekrar kullanın.",
      );
      return;
    }
    const passwordError = validatePassword();
    if (passwordError) return setError(passwordError);
    if (password !== confirmPassword) return setError("Şifreler eşleşmiyor");

    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setSuccess(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || "Şifre sıfırlama başarısız oldu");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Screen center>
        <VStack gap={4} align="center">
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: radius.full,
              backgroundColor: colors.success[50]!,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="checkmark-circle"
              size={64}
              color={colors.success[600]!}
            />
          </View>
          <Text variant="h1" align="center">
            Şifre Başarıyla Değiştirildi!
          </Text>
          <Text variant="body" tone="muted" align="center">
            Yeni şifreniz ile giriş yapabilirsiniz.
          </Text>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            title="Giriş Yap"
            onPress={() => router.replace("/(auth)/login")}
          />
        </VStack>
      </Screen>
    );
  }

  const passwordRequirements = [
    { ok: password.length >= 8, label: "En az 8 karakter" },
    { ok: /[A-Z]/.test(password), label: "En az bir büyük harf" },
    { ok: /[a-z]/.test(password), label: "En az bir küçük harf" },
    { ok: /[0-9]/.test(password), label: "En az bir rakam" },
  ];

  return (
    <Screen>
      <HStack justify="flex-start" style={{ marginBottom: spacing[2] }}>
        <IconButton
          icon="arrow-back"
          variant="plain"
          accessibilityLabel="Geri"
          onPress={() => router.back()}
        />
      </HStack>

      <VStack gap={4}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: radius.full,
            backgroundColor: colors.primary[50]!,
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "center",
          }}
        >
          <Ionicons
            name="lock-closed-outline"
            size={48}
            color={colors.primary[600]!}
          />
        </View>

        <Text variant="h1" align="center">
          Yeni Şifre Belirle
        </Text>
        <Text variant="body" tone="muted" align="center">
          Hesabınız için güçlü bir şifre oluşturun.
        </Text>

        <Input
          label={t("mobile.newPassword")}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          togglePasswordVisibility
          autoCapitalize="none"
        />

        <View
          style={{
            backgroundColor: colors.surface.alt,
            padding: spacing[4],
            borderRadius: radius.xl,
          }}
        >
          <Text
            variant="label"
            tone="muted"
            style={{ marginBottom: spacing[3] }}
          >
            Şifre gereksinimleri:
          </Text>
          {passwordRequirements.map((r) => (
            <HStack
              key={r.label}
              gap={2}
              align="center"
              style={{ marginBottom: spacing[2] }}
            >
              <Ionicons
                name={r.ok ? "checkmark-circle" : "ellipse-outline"}
                size={16}
                color={r.ok ? colors.success[600]! : colors.text.subtle}
              />
              <Text variant="bodySm" tone={r.ok ? "success" : "subtle"}>
                {r.label}
              </Text>
            </HStack>
          ))}
        </View>

        <Input
          label={t("mobile.newPasswordRepeat")}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          togglePasswordVisibility
          autoCapitalize="none"
        />

        {confirmPassword ? (
          <HStack gap={2} align="center">
            <Ionicons
              name={
                password === confirmPassword
                  ? "checkmark-circle"
                  : "close-circle"
              }
              size={16}
              color={
                password === confirmPassword
                  ? colors.success[600]!
                  : colors.danger[600]!
              }
            />
            <Text
              variant="bodySm"
              tone={password === confirmPassword ? "success" : "danger"}
            >
              {password === confirmPassword
                ? t("common.success")
                : t("mobile.passwordsDontMatch")}
            </Text>
          </HStack>
        ) : null}

        {error ? (
          <Text variant="bodySm" tone="danger">
            {error}
          </Text>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          title={t("mobile.resetPasswordButton")}
          onPress={handleResetPassword}
          isLoading={loading}
          disabled={loading || !password || !confirmPassword}
        />

        <HStack
          gap={2}
          justify="center"
          align="center"
          style={{ marginTop: spacing[3] }}
        >
          <Ionicons name="arrow-back" size={16} color={colors.primary[600]!} />
          <Text
            variant="bodySm"
            tone="primary"
            weight="medium"
            onPress={() => router.replace("/(auth)/login")}
          >
            {t("common.login")}
          </Text>
        </HStack>
      </VStack>
    </Screen>
  );
}
