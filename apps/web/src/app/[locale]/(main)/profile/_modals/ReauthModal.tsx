"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { XCircleIcon } from "@heroicons/react/24/outline";
import {
  SIGN_IN_METHODS_ERROR_CODES,
  SIGN_IN_PROVIDER_NAMES,
  type ReauthRequest,
  type ReauthResponse,
  type SignInMethods,
  type SignInProvider,
} from "@tarodan/types";
import { Alert, Button, Modal, Spinner } from "@tarodan/ui";
import { Form, FormInput, useZodForm } from "@tarodan/ui/form";
import { authApi, signInMethodsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import {
  apiErrorCode,
  apiErrorMessage,
  useWebMutation,
} from "@/hooks/useWebMutation";
import { SIGN_IN_PROVIDER_ICONS } from "@/components/auth/providerIcons";
import {
  providerCredentialErrorKey,
  useProviderCredential,
} from "@/components/auth/useProviderCredential";
import {
  reauthPasswordSchema,
  type ReauthPasswordValues,
} from "../_lib/schemas";
import {
  useRefreshSignInMethods,
  useSignInMethods,
} from "../_hooks/useSecurity";
import LoadErrorAlert from "../_components/LoadErrorAlert";

interface ReauthModalProps {
  open: boolean;
  onConfirmed: (response: ReauthResponse) => void;
  onCancel: () => void;
}

/**
 * "Confirm it's you": the one step-up dialog of the account area. An account
 * with a password confirms with it (the only proof the API accepts then);
 * one without confirms with a fresh sign-in of a provider linked to it.
 * Errors stay in the dialog: `403 REAUTH_FAILED`, `429 REAUTH_LOCKED` and
 * `503 REAUTH_UNAVAILABLE` never end the session. It cannot be closed while
 * a provider popup is open or the proof is being checked.
 */
export default function ReauthModal({
  open,
  onConfirmed,
  onCancel,
}: ReauthModalProps) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const [opening, setOpening] = useState(false);
  return (
    <Modal
      isOpen={open}
      onClose={onCancel}
      title={t("auth.reauth.title")}
      size="sm"
      closeLabel={t("common.close")}
      dismissDisabled={pending || opening}
    >
      {/* Mounted only while open, so every opening starts clean. */}
      {open && (
        <ReauthBody
          onConfirmed={onConfirmed}
          onCancel={onCancel}
          onPendingChange={setPending}
          onOpeningChange={setOpening}
        />
      )}
    </Modal>
  );
}

function ReauthBody({
  onConfirmed,
  onCancel,
  onPendingChange,
  onOpeningChange,
}: Omit<ReauthModalProps, "open"> & {
  onPendingChange: (pending: boolean) => void;
  onOpeningChange: (opening: boolean) => void;
}) {
  const t = useTranslations();
  const { methods, isLoading, isError, refetch } = useSignInMethods();
  const refreshMethods = useRefreshSignInMethods();
  const [error, setError] = useState<string | null>(null);

  const reauth = useMutation({
    mutationFn: async (body: ReauthRequest) =>
      (await signInMethodsApi.reauth(body)).data,
    // The answer carries the token: keep it out of the mutation cache.
    gcTime: 0,
    onMutate: () => {
      setError(null);
      onPendingChange(true);
    },
    onSettled: () => onPendingChange(false),
    onSuccess: (response) => onConfirmed(response),
    onError: (e) => {
      // The account gained a password elsewhere: show the password variant.
      if (
        apiErrorCode(e) === SIGN_IN_METHODS_ERROR_CODES.reauthMethodNotAllowed
      ) {
        void refreshMethods();
      }
      setError(apiErrorMessage(e) ?? t("server.auth.reauthFailed"));
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("auth.reauth.body")}</p>
      {error && (
        <Alert
          variant="danger"
          icon={<XCircleIcon className="h-5 w-5 text-danger-600" />}
          role="alert"
        >
          {error}
        </Alert>
      )}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="md" />
        </div>
      ) : !methods ? (
        // A failed background refetch keeps the cached methods: only a
        // first load that failed shows the error.
        isError && <LoadErrorAlert onRetry={() => void refetch()} />
      ) : methods.hasPassword ? (
        <PasswordProof
          isPending={reauth.isPending}
          onSubmit={(password) => reauth.mutate({ password })}
          onCancel={onCancel}
        />
      ) : (
        <ProviderProof
          methods={methods}
          isPending={reauth.isPending}
          onCredential={(credential) => reauth.mutate(credential)}
          onError={setError}
          onOpeningChange={onOpeningChange}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

function PasswordProof({
  isPending,
  onSubmit,
  onCancel,
}: {
  isPending: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const form = useZodForm(reauthPasswordSchema(t), {
    defaultValues: { password: "" },
  });
  return (
    <Form
      form={form}
      onSubmit={(values: ReauthPasswordValues) => onSubmit(values.password)}
      className="space-y-4"
    >
      <FormInput
        name="password"
        type="password"
        label={t("auth.reauth.withPassword")}
        placeholder="••••••••"
        autoComplete="current-password"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          {t("common.cancel")}
        </Button>
        <Button type="submit" isLoading={isPending}>
          {t("common.confirm")}
        </Button>
      </div>
    </Form>
  );
}

function ProviderProof({
  methods,
  isPending,
  onCredential,
  onError,
  onOpeningChange,
  onCancel,
}: {
  methods: SignInMethods;
  isPending: boolean;
  onCredential: (credential: ReauthRequest) => void;
  onError: (message: string | null) => void;
  onOpeningChange: (opening: boolean) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const credentials = useProviderCredential();
  const [opening, setOpening] = useState<SignInProvider | null>(null);
  const providers = methods.providers
    .map((linked) => linked.provider)
    .filter((provider) => credentials.isAvailable(provider));

  // Called straight from the click: the popup must open in the handler.
  const confirmWith = async (provider: SignInProvider) => {
    onError(null);
    setOpening(provider);
    onOpeningChange(true);
    try {
      const credential = await credentials.request(provider);
      if (credential) onCredential(credential);
    } catch (e) {
      onError(t(providerCredentialErrorKey(e) ?? "server.auth.reauthFailed"));
    } finally {
      setOpening(null);
      onOpeningChange(false);
    }
  };

  return (
    <div className="space-y-3">
      {providers.length > 0 ? (
        providers.map((provider) => {
          const Icon = SIGN_IN_PROVIDER_ICONS[provider];
          return (
            <Button
              key={provider}
              type="button"
              variant="outline"
              className="w-full"
              leftIcon={<Icon className="h-4 w-4" />}
              isLoading={opening === provider || (isPending && !opening)}
              disabled={isPending || opening !== null}
              onClick={() => void confirmWith(provider)}
            >
              {t("auth.reauth.withProvider", {
                provider: SIGN_IN_PROVIDER_NAMES[provider],
              })}
            </Button>
          );
        })
      ) : (
        <SetPasswordMailFallback />
      )}
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={onCancel}
        disabled={isPending || opening !== null}
      >
        {t("common.cancel")}
      </Button>
    </div>
  );
}

/**
 * No linked provider can be shown here (not configured on this site): the
 * set-password mail is the way in, as on the login screen.
 */
function SetPasswordMailFallback() {
  const t = useTranslations();
  const email = useAuthStore((s) => s.user?.email);
  const sendMail = useWebMutation((to: string) => authApi.forgotPassword(to), {
    successMessage: t("auth.setPasswordEmailSent"),
    errorMessage: t("auth.couldNotSendEmail"),
  });
  if (!email) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      isLoading={sendMail.isPending}
      onClick={() => sendMail.mutate(email)}
    >
      {t("auth.setPassword")}
    </Button>
  );
}
