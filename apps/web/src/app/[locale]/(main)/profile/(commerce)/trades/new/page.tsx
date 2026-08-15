"use client";

import { useState, useEffect, Suspense } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Input, Radio, Spinner, Textarea } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import TradeAddressPicker from "../_components/TradeAddressPicker";
import SectionCard from "@/components/ui/SectionCard";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyStateCard } from "@/components/ui";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";
import { getProductEffectivePrice } from "@/lib/productPrice";
import { formatTL } from "@/lib/format";
import {
  useTradeTarget,
  useTradeableProducts,
  useCreateTrade,
} from "./_hooks/useNewTrade";
import { getSellerId, getTradeProductImage } from "./_lib/types";
import TradeProductPicker from "./_components/TradeProductPicker";
import TradeSummary from "./_components/TradeSummary";
import TradeCostPreview from "@/components/trade/TradeCostPreview";
import { useTradeCostPreview } from "@/hooks/useTradeCostPreview";

function NewTradeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingId = searchParams.get("listing");
  const t = useTranslations();
  const {
    user,
    isAuthenticated,
    isLoading: authLoading,
    limits,
  } = useAuthStore();

  const canTrade = Boolean(limits?.canTrade);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [cashAmount, setCashAmount] = useState("");
  const [cashPayer, setCashPayer] = useState<"me" | "them">("me");
  const [message, setMessage] = useState("");
  const [addressId, setAddressId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push(`/login?redirect=/profile/trades/new?listing=${listingId}`);
    } else if (!canTrade) {
      toast.error(t("trade.requiresPremium"));
      router.push("/membership");
    }
  }, [authLoading, isAuthenticated, limits, canTrade, listingId, router, t]);

  const enabled = isAuthenticated && canTrade;
  const { target, isLoading: targetLoading } = useTradeTarget(
    listingId,
    enabled,
  );
  const { products } = useTradeableProducts(listingId, enabled);
  const createTrade = useCreateTrade();

  const selectedProducts = products.filter((p) => selectedIds.includes(p.id));
  const cash = parseFloat(cashAmount) || 0;

  const {
    preview: costPreview,
    previewLoading: costPreviewLoading,
    previewFailed: costPreviewFailed,
  } = useTradeCostPreview({
    myProductIds: selectedIds,
    theirProductIds: target ? [target.id] : [],
    cashAmount,
    cashPayer,
    enabled,
  });

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const submit = () => {
    if (selectedIds.length === 0 && !cash)
      return toast.error(t("trade.selectAtLeastOne"));
    if (!target) return toast.error(t("trade.targetNotFound"));
    if (!addressId)
      return toast.error(t("page.new.page.lutfenBirTeslimatAdresiSecinVeya"));
    const sellerId = getSellerId(target);
    if (!sellerId) return toast.error(t("trade.sellerNotFound"));

    createTrade.mutate({
      receiverId: sellerId,
      initiatorItems: selectedIds.map((id) => ({ productId: id, quantity: 1 })),
      receiverItems: [{ productId: target.id, quantity: 1 }],
      cashAmount: cash > 0 ? (cashPayer === "me" ? cash : -cash) : undefined,
      message: message || undefined,
      shippingAddressId: addressId || undefined,
    });
  };

  if (targetLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="xl" color="border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!target) {
    return (
      <PageShell className="pb-16">
        <div className="mx-auto w-full max-w-2xl px-4 pt-4">
          <EmptyStateCard
            title={t("trade.targetNotFound")}
            description={t("trade.targetNotFoundDesc")}
            action={
              <Button asChild>
                <Link href="/listings">{t("seller.backToListings")}</Link>
              </Button>
            }
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="pb-16">
      <PageHeader
        backHref={`/listings/${listingId}`}
        backLabel={t("common.back")}
        title={t("trade.createTrade")}
        description={t("page.new.page.takasEtmekIstediginizUrunleriSecin")}
      />

      <div className="flex flex-col items-stretch gap-6 lg:flex-row">
        <SectionCard
          title={t("page.new.page.istediginizUrun")}
          className="flex-1"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="relative aspect-square w-full max-w-[200px] overflow-hidden rounded-lg bg-surface-alt">
              <OptimizedImage
                src={getTradeProductImage(target)}
                alt={target.title}
                fill
                sizes="200px"
                className="object-cover"
                logContext={{ productId: target.id, page: "trades-new-target" }}
              />
            </div>
            <div className="w-full text-center">
              <h3 className="mb-2 line-clamp-2 font-medium text-heading">
                {target.title}
              </h3>
              <p className="text-xl font-bold text-primary-500">
                {formatTL(getProductEffectivePrice(target))}
              </p>
            </div>
          </div>
        </SectionCard>

        <div className="flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
            <ArrowsRightLeftIcon className="h-8 w-8 text-primary-600" />
          </div>
        </div>

        <SectionCard
          title={t("page.new.page.teklifEdeceginizUrunler")}
          className="flex-1"
        >
          <TradeProductPicker
            products={products}
            selectedIds={selectedIds}
            onToggle={toggle}
          />
        </SectionCard>
      </div>

      <SectionCard
        title={`${t("trade.cashDifference")} (${t("common.optional")})`}
      >
        <p className="mb-4 text-sm text-muted">
          {t("page.new.page.takasDegeriniDengelemekIcinNakitFark")}
        </p>
        <div className="space-y-4">
          <div className="relative max-w-xs">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
              ₺
            </span>
            <Input
              type="number"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="pl-10"
            />
          </div>
          {cash > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-body">
                {t("page.new.page.nakitFarkiKimOdeyecek")}
              </p>
              <div className="flex gap-4">
                <Radio
                  name="cashPayer"
                  value="me"
                  checked={cashPayer === "me"}
                  onChange={(e) =>
                    setCashPayer(e.target.value as "me" | "them")
                  }
                  label={t("page.new.page.benOdeyecegim")}
                />
                <Radio
                  name="cashPayer"
                  value="them"
                  checked={cashPayer === "them"}
                  onChange={(e) =>
                    setCashPayer(e.target.value as "me" | "them")
                  }
                  label={t("page.new.page.karsiTarafOdeyecek")}
                />
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title={`${t("trade.message")} (${t("common.optional")})`}>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("trade.messagePlaceholder")}
          rows={4}
          maxLength={500}
        />
        <p className="mt-2 text-right text-sm text-muted">
          {message.length}/500
        </p>
      </SectionCard>

      <TradeSummary
        target={target}
        selectedProducts={selectedProducts}
        cashAmount={cash}
        cashPayer={cashPayer}
      />

      {/* Takasın bedeli seçilen ürünlere bağlıdır (ürün başına hizmet bedeli +
          desiye göre kargo) — kullanıcı teklifi göndermeden önce görmeli. */}
      <div className="mt-6">
        <TradeCostPreview
          preview={costPreview}
          loading={costPreviewLoading}
          failed={costPreviewFailed}
        />
      </div>

      <SectionCard title={t("page.new.page.teslimatAdresiniz")}>
        <TradeAddressPicker onChange={setAddressId} />
      </SectionCard>

      <div className="flex gap-4">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => router.back()}
        >
          {t("common.cancel")}
        </Button>
        <Button
          className="flex-1 gap-2"
          onClick={submit}
          disabled={selectedIds.length === 0 && !cash}
          isLoading={createTrade.isPending}
        >
          <ArrowsRightLeftIcon className="h-5 w-5" />
          {t("trade.sendTrade")}
        </Button>
      </div>
    </PageShell>
  );
}

export default function NewTradePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" color="border-primary-500 border-t-transparent" />
        </div>
      }
    >
      <NewTradeContent />
    </Suspense>
  );
}
