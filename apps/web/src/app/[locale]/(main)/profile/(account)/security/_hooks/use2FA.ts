/** @format */

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useRefreshSignInMethods } from "../../../_hooks/useSecurity";
import { queryKeys } from "@/lib/query/keys";
import type { TwoFactorStatus, SetupResponse } from "../_lib/types";

/** The API refuses 2FA for an account without a password (this catalog key). */
const PASSWORD_REQUIRED_KEY = "server.security.passwordRequiredFor2fa";

/** The API error body (`message`, `i18nKey`) of a failed request, if any. */
const errorBody = (e: unknown) =>
  (e as { response?: { data?: { message?: string; i18nKey?: string } } })
    ?.response?.data;

/**
 * Two-factor (TOTP) status query + the enable / verify / disable / regenerate
 * mutations. Each mutation clears the shared error banner on start, falls back
 * to the catalog message on failure, and invalidates the status query so the
 * enabled/disabled state refreshes. Setup + backup-code UI flow state lives here
 * too, keeping the page and sections thin.
 */
export function use2FA() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const refreshSignInMethods = useRefreshSignInMethods();
  const [error, setError] = useState("");
  /** The API refused setup because the account has no password. */
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  const statusQuery = useQuery({
    queryKey: queryKeys.twoFactor.status(),
    queryFn: async (): Promise<TwoFactorStatus> =>
      (await api.get("/security/2fa/status")).data,
  });

  const invalidateStatus = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.twoFactor.status() });

  const enable = useMutation({
    mutationFn: async (): Promise<SetupResponse> =>
      (await api.post("/security/2fa/enable")).data,
    onMutate: () => setError(""),
    onSuccess: (data) => setSetupData(data),
    onError: (e: unknown) => {
      // No password (a stale page): the page shows the "set a password
      // first" hint instead of the raw error, and the methods refresh.
      if (errorBody(e)?.i18nKey === PASSWORD_REQUIRED_KEY) {
        setPasswordRequired(true);
        void refreshSignInMethods();
        return;
      }
      setError(errorBody(e)?.message || t("profile.twoFactor.setupFailed"));
    },
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
    onError: (e: unknown) =>
      setError(errorBody(e)?.message || t("profile.twoFactor.verifyFailed")),
  });

  const disable = useMutation({
    mutationFn: async (code: string) =>
      (await api.post("/security/2fa/disable", { code })).data,
    onMutate: () => setError(""),
    onSuccess: () => invalidateStatus(),
    onError: (e: unknown) =>
      setError(errorBody(e)?.message || t("profile.twoFactor.disableFailed")),
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
    onError: (e: unknown) =>
      setError(
        errorBody(e)?.message || t("profile.twoFactor.regenerateFailed"),
      ),
  });

  const cancelSetup = () => setSetupData(null);
  const closeBackupCodes = () => {
    setShowBackupCodes(false);
    setBackupCodes([]);
  };

  return {
    passwordRequired,
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
