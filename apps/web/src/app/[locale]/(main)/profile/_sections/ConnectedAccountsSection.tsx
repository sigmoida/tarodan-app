"use client";

import { useTranslations } from "next-intl";
import {
  SIGN_IN_PROVIDERS,
  SIGN_IN_PROVIDER_NAMES,
  canUnlinkProvider,
  type LinkedSignInProvider,
  type SignInMethods,
  type SignInProvider,
} from "@tarodan/types";
import { Badge, Button, Skeleton } from "@tarodan/ui";
import SectionCard from "@/components/ui/SectionCard";
import { useConfirm } from "@/components/ConfirmProvider";
import { SIGN_IN_PROVIDER_ICONS } from "@/components/auth/providerIcons";
import { useAuthStore } from "@/stores/authStore";
import { useSignInMethods } from "../_hooks/useSecurity";
import { useConnectedAccounts } from "../_hooks/useConnectedAccounts";
import LoadErrorAlert from "../_components/LoadErrorAlert";

/**
 * Connected accounts: Google and Apple, each connected or not, with Connect or
 * Disconnect. Disconnect is disabled with the D1 hint when the account would
 * keep neither a password nor a Google link (`canUnlinkProvider`, the one
 * rule shared with the API).
 */
export default function ConnectedAccountsSection() {
  const t = useTranslations();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { methods, isLoading, isError, refetch } =
    useSignInMethods(isAuthenticated);

  return (
    <SectionCard title={t("profile.connectedAccounts.title")}>
      <p className="mb-4 text-sm text-muted">
        {t("profile.connectedAccounts.description")}
      </p>
      {methods ? (
        // Cached methods stay on screen when a background refetch fails.
        <ProviderRows methods={methods} />
      ) : isError && !isLoading ? (
        <LoadErrorAlert onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-3">
          {SIGN_IN_PROVIDERS.map((provider) => (
            <Skeleton key={provider} className="h-14 w-full" />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ProviderRows({ methods }: { methods: SignInMethods }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const { canConnect, connect, disconnect, busyProvider } =
    useConnectedAccounts();

  const askDisconnect = async (provider: SignInProvider) => {
    const name = SIGN_IN_PROVIDER_NAMES[provider];
    const ok = await confirm({
      title: t("profile.connectedAccounts.disconnectTitle", { provider: name }),
      description: (
        <div className="space-y-2">
          <p>
            {t("profile.connectedAccounts.disconnectConfirm", {
              provider: name,
            })}
          </p>
          <p>{t("profile.connectedAccounts.relinkNote", { provider: name })}</p>
        </div>
      ),
      confirmLabel: t("profile.connectedAccounts.disconnect"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (ok) disconnect(provider);
  };

  return (
    <ul className="divide-y divide-border-subtle">
      {SIGN_IN_PROVIDERS.map((provider) => {
        const linked = methods.providers.find((p) => p.provider === provider);
        // Without a client config the provider cannot be connected here.
        if (!linked && !canConnect(provider)) return null;
        return (
          <ProviderRow
            key={provider}
            provider={provider}
            linked={linked}
            canUnlink={canUnlinkProvider(methods, provider)}
            isBusy={busyProvider === provider}
            isLocked={busyProvider !== null}
            onConnect={() => void connect(provider)}
            onDisconnect={() => void askDisconnect(provider)}
          />
        );
      })}
    </ul>
  );
}

function ProviderRow({
  provider,
  linked,
  canUnlink,
  isBusy,
  isLocked,
  onConnect,
  onDisconnect,
}: {
  provider: SignInProvider;
  linked: LinkedSignInProvider | undefined;
  canUnlink: boolean;
  isBusy: boolean;
  isLocked: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const t = useTranslations();
  const Icon = SIGN_IN_PROVIDER_ICONS[provider];
  const name = SIGN_IN_PROVIDER_NAMES[provider];
  const hintId = `connected-${provider}-hint`;

  return (
    <li className="py-3 first:pt-0 last:pb-0" data-provider={provider}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-heading">{name}</p>
              <Badge variant={linked ? "success" : "outline"} size="sm">
                {linked
                  ? t("profile.connectedAccounts.connected")
                  : t("profile.connectedAccounts.notConnected")}
              </Badge>
            </div>
            {linked?.email && (
              <p className="truncate text-xs text-muted">
                {t("profile.connectedAccounts.connectedAs", {
                  email: linked.email,
                })}
              </p>
            )}
          </div>
        </div>
        {linked ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={isBusy}
            disabled={!canUnlink || isLocked}
            aria-describedby={canUnlink ? undefined : hintId}
            onClick={onDisconnect}
          >
            {t("profile.connectedAccounts.disconnect")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={isBusy}
            disabled={isLocked}
            onClick={onConnect}
          >
            {t("profile.connectedAccounts.connect")}
          </Button>
        )}
      </div>
      {linked && !canUnlink && (
        <p id={hintId} className="mt-2 text-xs text-muted">
          {t("profile.connectedAccounts.lastMethodHint")}
        </p>
      )}
    </li>
  );
}
