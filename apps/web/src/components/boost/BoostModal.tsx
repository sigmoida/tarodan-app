/** @format */

"use client";

import { useId, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { ClockIcon } from "@heroicons/react/24/outline";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Modal,
  ModalFooter,
  Radio,
  Skeleton,
  Toggle,
} from "@tarodan/ui";
import { cn } from "@tarodan/ui/utils";
import {
  CONSENT_DOCUMENTS,
  type BoostDurationOption,
  type BoostPackage,
  type InitiateBoostRequest,
  type InitiateBoostResponse,
} from "@tarodan/types";
import { Link, useRouter } from "@/i18n/navigation";
import { boostApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { formatTL } from "@/lib/format";
import { MEMBERSHIP_PATH, paymentPagePath } from "@/lib/paymentKind";
import { apiErrorI18nKey, useWebMutation } from "@/hooks/useWebMutation";
import BoostPreInformation from "./BoostPreInformation";

/** The listing the dialog boosts, as every entry point knows it. */
export interface BoostListing {
  id: string;
  title: string;
  /** The listing's current boost end, if one is running (extend summary). */
  boostedUntil?: string | null;
}

interface BoostModalProps {
  listing: BoostListing;
  /**
   * Whether the seller may ask for the ending-soon reminder (a paid
   * membership; the API checks it again and drops it otherwise).
   */
  canRemind: boolean;
  onClose: () => void;
}

interface Selection {
  packageId: string;
  durationDays: number;
}

/** The pre-selected duration when the first package offers it. */
const DEFAULT_DURATION_DAYS = 7;
/** The API's rejection when a consent is missing. */
const CONSENT_REQUIRED_KEY = "server.product.boostConsentRequired";
/**
 * The API's 409 when `expectedPrice` is no longer the price it charges (the
 * comparison rule is the API's `boostPriceMatches`); nothing was written.
 */
const PRICE_CHANGED_KEY = "server.product.boostPriceChanged";
const DAY_MS = 86_400_000;

function defaultSelection(packages: BoostPackage[]): Selection | null {
  const pkg = packages[0];
  const option =
    pkg?.options.find((o) => o.durationDays === DEFAULT_DURATION_DAYS) ??
    pkg?.options[0];
  return pkg && option
    ? { packageId: pkg.id, durationDays: option.durationDays }
    : null;
}

/**
 * The package and duration behind a selection in the CURRENT options, so the
 * price shown, consented to and sent always comes from the latest response.
 * A choice the latest response no longer offers resolves to nothing (the
 * caller then falls back to the default selection).
 */
function resolveSelection(
  packages: BoostPackage[],
  selection: Selection | null,
): { pkg: BoostPackage; option: BoostDurationOption } | null {
  if (!selection) return null;
  const pkg = packages.find((p) => p.id === selection.packageId);
  const option = pkg?.options.find(
    (o) => o.durationDays === selection.durationDays,
  );
  return pkg && option ? { pkg, option } : null;
}

/**
 * What the pre-information shows for a choice (`BoostPreInformation`'s
 * props), and so what the seller consents to.
 */
interface ConsentedTerms {
  listingTitle: string;
  packageId: string;
  packageName: string;
  durationDays: number;
  price: number;
}

function termsOf(
  listingTitle: string,
  choice: { pkg: BoostPackage; option: BoostDurationOption } | null,
): ConsentedTerms | null {
  return choice
    ? {
        listingTitle,
        packageId: choice.pkg.id,
        packageName: choice.pkg.name,
        durationDays: choice.option.durationDays,
        price: choice.option.price,
      }
    : null;
}

/** Any change, however small (also to the price), is a different offer. */
function sameTerms(a: ConsentedTerms | null, b: ConsentedTerms | null) {
  if (!a || !b) return a === b;
  return (
    a.listingTitle === b.listingTitle &&
    a.packageId === b.packageId &&
    a.packageName === b.packageName &&
    a.durationDays === b.durationDays &&
    a.price === b.price
  );
}

function OptionsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1].map((block) => (
        <div
          key={block}
          className="overflow-hidden rounded-lg border border-border"
        >
          <Skeleton className="h-10 rounded-none" />
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-12" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The boost purchase dialog ("İlanı öne çıkar"): the listing's packages and
 * durations priced for its price, the optional ending-soon reminder, the
 * pre-contract information and the two purchase consents (plan section 3.6:
 * `platform_service_sales`, `withdrawal_waiver`). Pay stays disabled until a
 * duration is chosen and BOTH consents are ticked; the API refuses the order
 * without them. A change to the pre-information (listing, package, duration,
 * price) unticks both. The request carries the price shown; when the API
 * answers that it changed (409), the prices are fetched again and both
 * consents are asked again on them. On success it hands over to the pay page
 * (`/payment/<id>?type=boost`).
 *
 * Mount it per opening (`useBoostLauncher` does): the consents start unticked
 * every time and are never remembered.
 */
export default function BoostModal({
  listing,
  canRemind,
  onClose,
}: BoostModalProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const consentId = useId();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [reminder, setReminder] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const resetConsents = () => {
    setContractAccepted(false);
    setWaiverAccepted(false);
  };

  // Fresh on every opening (staleTime 0) and payable only once that fetch
  // succeeded: the price is the one the seller consents to, so a cached
  // matrix (or one whose refetch failed) is never paid on.
  const optionsQuery = useQuery({
    queryKey: queryKeys.boost.options(listing.id),
    queryFn: async () => (await boostApi.options(listing.id)).data,
    staleTime: 0,
    meta: { page: "boost-options" },
  });
  const options = optionsQuery.data;
  const packages = options?.packages ?? [];
  const choice =
    resolveSelection(packages, selected) ??
    resolveSelection(packages, defaultSelection(packages));
  const terms = termsOf(listing.title, choice);
  // The consents belong to the pre-information they were given on. When it
  // changes (another package or duration, or a refetch that reprices or
  // renames the choice), both are asked again, in the same render, so pay is
  // never enabled on terms the seller has not seen. A refetch with the same
  // terms keeps them.
  const [termsShown, setTermsShown] = useState(terms);
  if (!sameTerms(termsShown, terms)) {
    setTermsShown(terms);
    resetConsents();
  }
  const canBuy = !!options?.enabled && packages.length > 0;
  const optionsFresh = optionsQuery.isSuccess && !optionsQuery.isFetching;

  // The server decides the price: it refuses an `expectedPrice` that is not
  // what it charges (409, nothing written), so a success is always at the
  // price the seller consented to.
  const initiate = useWebMutation(
    async (body: InitiateBoostRequest): Promise<InitiateBoostResponse> =>
      (await boostApi.initiate(listing.id, body)).data,
    {
      errorMessage: t("profile.boost.initiateFailed"),
      onSuccess: (data) => {
        if (!data?.paymentId) {
          toast.error(t("profile.boost.paymentStartFailed"));
          return;
        }
        onClose();
        router.push(paymentPagePath(data.paymentId, "boost"));
      },
    },
  );
  const consentRejected =
    apiErrorI18nKey(initiate.error) === CONSENT_REQUIRED_KEY;

  const consentsAccepted = contractAccepted && waiverAccepted;
  const canPay = optionsFresh && canBuy && !!choice && consentsAccepted;

  const remainingDays = listing.boostedUntil
    ? Math.max(
        0,
        Math.ceil(
          (new Date(listing.boostedUntil).getTime() - Date.now()) / DAY_MS,
        ),
      )
    : 0;
  const hasActiveBoost = remainingDays > 0;

  const handleConfirm = () => {
    if (!canPay || !choice) return;
    initiate.mutate(
      {
        packageId: choice.pkg.id,
        durationDays: choice.option.durationDays,
        // The price the pre-information shows: the API refuses any other.
        expectedPrice: choice.option.price,
        preInformationAccepted: true,
        withdrawalWaiverAccepted: true,
        // The reminder is a premium feature: other sellers never send it.
        ...(canRemind ? { autoRenew: reminder } : {}),
      },
      {
        // The hook toasts the server's message. A changed price also
        // reloads the prices and asks for both consents again on them; pay
        // stays disabled until that fetch has succeeded (`optionsFresh`).
        onError: (error) => {
          if (apiErrorI18nKey(error) !== PRICE_CHANGED_KEY) return;
          resetConsents();
          queryClient.invalidateQueries({
            queryKey: queryKeys.boost.options(listing.id),
          });
        },
      },
    );
  };

  const termsPath = CONSENT_DOCUMENTS.platform_service_sales.path;
  // Both links open the legal page in a new tab, so the dialog keeps its state.
  const termsLink = (chunks: ReactNode) =>
    termsPath ? (
      <Link
        href={termsPath}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary-600 underline"
      >
        {chunks}
      </Link>
    ) : (
      chunks
    );

  let body: ReactNode;
  if (optionsQuery.isPending) {
    body = <OptionsSkeleton />;
  } else if (optionsQuery.isError) {
    body = (
      <Alert
        variant="danger"
        title={t("profile.boost.pricingLoadError")}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => optionsQuery.refetch()}
          >
            {t("common.tryAgain")}
          </Button>
        }
      />
    );
  } else if (!options?.enabled) {
    body = (
      <EmptyState
        size="compact"
        icon={false}
        title={t("profile.boost.unavailable")}
      />
    );
  } else if (packages.length === 0) {
    body = (
      <EmptyState
        size="compact"
        icon={false}
        title={t("profile.boost.noPackages")}
      />
    );
  } else {
    body = (
      <div className="space-y-4">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className="overflow-hidden rounded-lg border border-border"
          >
            {/* Name and hint stacked: side by side the hint squeezed the
                name onto two lines. */}
            <div className="bg-surface-alt/60 px-3 py-2">
              <p className="font-semibold text-heading">{pkg.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {pkg.showcaseOnHome
                  ? t("profile.boost.showcaseHint")
                  : t("profile.boost.searchHint")}
              </p>
            </div>
            <div className="divide-y divide-border">
              {pkg.options.map((opt) => {
                const active =
                  choice?.pkg.id === pkg.id &&
                  choice.option.durationDays === opt.durationDays;
                return (
                  <label
                    key={opt.durationDays}
                    className={cn(
                      "flex cursor-pointer items-center justify-between px-3 py-3 transition-colors",
                      active ? "bg-warning-50" : "hover:bg-surface-alt/40",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Radio
                        name={`boost-${pkg.id}`}
                        checked={active}
                        onChange={() =>
                          setSelected({
                            packageId: pkg.id,
                            durationDays: opt.durationDays,
                          })
                        }
                      />
                      <span className="font-medium text-heading">
                        {t("profile.boost.daysValue", {
                          days: opt.durationDays,
                        })}
                      </span>
                      {opt.campaign && (
                        <Badge variant="danger" size="sm">
                          {t("profile.boost.campaign")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2">
                      {opt.campaign && (
                        <span className="text-xs text-subtle line-through">
                          {formatTL(opt.listPrice)}
                        </span>
                      )}
                      <span className="font-bold text-primary-600">
                        {formatTL(opt.price)}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

        {/* The reminder is optional, so it is a switch, unlike the two
            mandatory consents below. Other sellers see it off and disabled,
            with the premium hint and the way to upgrade. */}
        <div className="space-y-1">
          <label
            className={cn(
              "flex items-start gap-2 text-sm",
              canRemind ? "cursor-pointer text-body" : "text-muted",
            )}
          >
            <span className="flex h-5 shrink-0 items-center">
              <Toggle
                size="sm"
                checked={canRemind && reminder}
                onChange={setReminder}
                disabled={!canRemind}
                label={t("profile.boost.autoRenewLabel")}
              />
            </span>
            <span>{t("profile.boost.autoRenewLabel")}</span>
          </label>
          {!canRemind && (
            <p className="pl-10 text-xs text-muted">
              {t("profile.boosts.reminder.premiumOnly")}{" "}
              <Link
                href={MEMBERSHIP_PATH}
                className="font-medium text-primary-600 underline"
              >
                {t("profile.boost.reminderUpgrade")}
              </Link>
            </p>
          )}
        </div>

        {choice && (
          <BoostPreInformation
            listingTitle={listing.title}
            packageName={choice.pkg.name}
            durationDays={choice.option.durationDays}
            price={choice.option.price}
          />
        )}

        <div className="space-y-3">
          <Checkbox
            id={`${consentId}-contract`}
            align="start"
            checked={contractAccepted}
            onChange={(e) => setContractAccepted(e.target.checked)}
            label={t.rich("profile.boost.consent.contract", {
              preInfo: termsLink,
              contract: termsLink,
            })}
          />
          <Checkbox
            id={`${consentId}-waiver`}
            align="start"
            checked={waiverAccepted}
            onChange={(e) => setWaiverAccepted(e.target.checked)}
            label={t("profile.boost.consent.waiver")}
          />
          {(!consentsAccepted || consentRejected) && (
            <p
              className={cn(
                "text-xs",
                consentRejected ? "text-danger-600" : "text-muted",
              )}
            >
              {t("profile.boost.consent.required")}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("profile.boost.title")}
      size="2xl"
      closeLabel={t("common.close")}
      dismissDisabled={initiate.isPending}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleConfirm}
          cancelLabel={t("common.cancel")}
          confirmLabel={
            hasActiveBoost
              ? t("profile.boost.extendAndPay")
              : t("profile.boost.featureAndPay")
          }
          isLoading={initiate.isPending}
          disabled={!canPay}
        />
      }
    >
      <p className="mb-1 line-clamp-2 text-sm font-medium text-heading">
        {listing.title}
      </p>
      <p className="mb-4 text-sm text-muted">{t("profile.boost.intro")}</p>

      {hasActiveBoost && (
        <Alert
          variant="warning"
          icon={<ClockIcon className="h-5 w-5 text-warning-600" />}
          title={t("page.listings.boostmodal.aktifOneCikarma")}
          className="mb-4"
        >
          {t("profile.boost.activeBoostInfo", { days: remainingDays })}
          {choice && (
            <div className="mt-1 font-semibold">
              {t("profile.boost.extendSummary", {
                remaining: remainingDays,
                selected: choice.option.durationDays,
                total: remainingDays + choice.option.durationDays,
              })}
            </div>
          )}
        </Alert>
      )}

      {body}
    </Modal>
  );
}
