import React, { Component, ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@tarodan/ui-native";
import { logger } from "../services/logger";

const { colors } = theme;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Uygulama içinde herhangi bir render-time crash'i yakalar:
 *   - React tree'sini beyaz ekrana bırakmaz, friendly bir "tekrar dene"
 *     ekranı gösterir (i18n ile çevrilir).
 *   - Hatayı Sentry'ye gönderir (paketleme sonrası gerçekten gönderir;
 *     dev'de ve Expo Go'da no-op).
 *
 * Class component → hook kullanılamaz; fallback UI ayrı bir functional
 * component (FallbackScreen) ve useTranslation orada çağrılır.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    logger.captureException(error, {
      level: "error",
      tags: { boundary: "app-root" },
      componentStack: errorInfo.componentStack ?? "n/a",
    });
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return <FallbackScreen error={this.state.error} onRetry={this.reset} />;
  }
}

function FallbackScreen({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}) {
  return (
    <View style={styles.container}>
      <Ionicons
        name="warning-outline"
        size={64}
        color={theme.colors.danger[500]}
      />
      <Text style={styles.title}>Bir şeyler ters gitti</Text>
      <Text style={styles.subtitle}>
        Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.
      </Text>
      {__DEV__ && error && (
        <ScrollView style={styles.errorBox}>
          <Text style={styles.errorText}>
            {error.message}
            {"\n\n"}
            {error.stack ?? ""}
          </Text>
        </ScrollView>
      )}
      <TouchableOpacity style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>Tekrar Dene</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.gray[900],
    marginTop: theme.spacing[4],
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.gray[600],
    textAlign: "center",
    marginTop: theme.spacing[2],
    lineHeight: 20,
  },
  errorBox: {
    maxHeight: 200,
    marginTop: theme.spacing[4],
    padding: theme.spacing[3],
    backgroundColor: colors.danger[50],
    borderRadius: theme.radius.xl,
    width: "100%",
  },
  errorText: {
    fontFamily: "Courier",
    fontSize: 11,
    color: colors.danger[800],
  },
  button: {
    marginTop: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[8],
    backgroundColor: theme.colors.primary[500],
    borderRadius: theme.radius.xl,
  },
  buttonText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 16,
  },
});
