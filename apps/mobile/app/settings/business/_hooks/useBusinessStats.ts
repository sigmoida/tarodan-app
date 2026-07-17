import { useState, useEffect } from "react";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useTranslation } from "react-i18next";
import type { BusinessStats, TabType } from "../_lib/types";

/**
 * Business dashboard controller — owns the business-stats fetch (verbatim
 * useState/useEffect flow, RQ migration deferred), auth redirect, tab state,
 * and error handling. Lifted verbatim from the monolithic screen.
 */
export function useBusinessStats() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/(auth)/login");
      return;
    }
    loadBusinessStats();
  }, [isAuthenticated]);

  const loadBusinessStats = async () => {
    try {
      const response = await api.get("/users/me/business-stats");
      setStats(response.data);
    } catch (err: any) {
      if (err.response?.status === 400) {
        const errorMessage =
          err.response?.data?.message ||
          err.response?.data?.error ||
          "Bu özellik sadece İşletme hesapları için geçerlidir.";
        setError(errorMessage);
      } else {
        setError("İstatistikler yüklenirken bir hata oluştu");
      }
    } finally {
      setLoading(false);
    }
  };

  return { t, stats, loading, error, activeTab, setActiveTab };
}

export type BusinessController = ReturnType<typeof useBusinessStats>;
