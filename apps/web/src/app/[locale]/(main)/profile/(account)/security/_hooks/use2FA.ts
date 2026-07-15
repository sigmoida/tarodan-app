/** @format */

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { TwoFactorStatus, SetupResponse } from "../_lib/types";

const STATUS_KEY = ["2fa-status"];

/**
 * Two-factor (TOTP) status query + the enable / verify / disable / regenerate
 * mutations. Each mutation clears the shared error banner on start, writes the
 * exact Turkish fallback on failure, and invalidates the status query so the
 * enabled/disabled state refreshes. Setup + backup-code UI flow state lives here
 * too, keeping the page and sections thin.
 */
export function use2FA() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  const statusQuery = useQuery({
    queryKey: STATUS_KEY,
    queryFn: async (): Promise<TwoFactorStatus> =>
      (await api.get("/security/2fa/status")).data,
  });

  const invalidateStatus = () =>
    queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  const enable = useMutation({
    mutationFn: async (): Promise<SetupResponse> =>
      (await api.post("/security/2fa/enable")).data,
    onMutate: () => setError(""),
    onSuccess: (data) => setSetupData(data),
    onError: (e: any) =>
      setError(e?.response?.data?.message || "2FA kurulumu başlatılamadı"),
  });

  const verify = useMutation({
    mutationFn: async (code: string) =>
      (await api.post("/security/2fa/verify", { code })).data,
    onMutate: () => setError(""),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes || setupData?.backupCodes || []);
      setShowBackupCodes(true);
      setSetupData(null);
      invalidateStatus();
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || "Doğrulama başarısız"),
  });

  const disable = useMutation({
    mutationFn: async (code: string) =>
      (await api.post("/security/2fa/disable", { code })).data,
    onMutate: () => setError(""),
    onSuccess: () => invalidateStatus(),
    onError: (e: any) =>
      setError(e?.response?.data?.message || "2FA devre dışı bırakılamadı"),
  });

  const regenerateBackupCodes = useMutation({
    mutationFn: async (code: string) =>
      (await api.post("/security/2fa/backup-codes", { code })).data,
    onMutate: () => setError(""),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setShowBackupCodes(true);
      invalidateStatus();
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || "Yedek kodlar oluşturulamadı"),
  });

  const cancelSetup = () => setSetupData(null);
  const closeBackupCodes = () => {
    setShowBackupCodes(false);
    setBackupCodes([]);
  };

  return {
    status: statusQuery.data ?? { isEnabled: false },
    isLoading: statusQuery.isLoading,
    error,
    setError,
    setupData,
    cancelSetup,
    backupCodes,
    showBackupCodes,
    closeBackupCodes,
    enable,
    verify,
    disable,
    regenerateBackupCodes,
  };
}
