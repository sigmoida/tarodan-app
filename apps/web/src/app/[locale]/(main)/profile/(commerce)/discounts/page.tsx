"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  PlusIcon,
  TagIcon,
  ReceiptPercentIcon,
  CheckCircleIcon,
  ClockIcon,
  FireIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Spinner, Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAuthStore } from "@/stores/authStore";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import {
  useDiscounts,
  useSellerProducts,
  useDeleteDiscount,
  useToggleDiscount,
} from "./_hooks/useDiscounts";
import {
  FILTER_TABS,
  matchesFilter,
  type Discount,
  type DiscountFilter,
} from "./_lib/types";
import DiscountCard from "./_components/DiscountCard";
import DiscountFormModal from "./_modals/DiscountFormModal";
import { MetricCard } from "@/components/ui";

export default function ProfileDiscountsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { ready } = useRequireAuth();
  const user = useAuthStore((s) => s.user);

  const [filter, setFilter] = useState<DiscountFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);

  const canAccess = ready && !!user?.isSeller;

  // Auth is gated on the server; only the seller-role check redirects here.
  useEffect(() => {
    if (!ready) return;
    if (!user?.isSeller) {
      toast.error("Bu sayfaya erişim için satıcı olmanız gerekiyor");
      router.push("/profile");
    }
  }, [ready, user?.isSeller, router]);

  const { discounts, isLoading } = useDiscounts(canAccess);
  const products = useSellerProducts(canAccess);
  const deleteDiscount = useDeleteDiscount();
  const toggleDiscount = useToggleDiscount();

  // Metrics derive from the FULL dataset → unaffected by the active tab.
  const metrics = useMemo(
    () => ({
      total: discounts.length,
      active: discounts.filter((d) => d.isActive && d.isCurrentlyValid).length,
      expired: discounts.filter((d) => new Date(d.endDate) < new Date()).length,
      usage: discounts.reduce((sum, d) => sum + d.usedCount, 0),
    }),
    [discounts],
  );

  const visible = useMemo(
    () => discounts.filter((d) => matchesFilter(d, filter)),
    [discounts, filter],
  );

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (discount: Discount) => {
    setEditing(discount);
    setModalOpen(true);
  };

  const onDelete = async (discount: Discount) => {
    const ok = await confirm({
      title: "İndirimi sil",
      description:
        "Bu indirimi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      destructive: true,
    });
    if (ok) deleteDiscount.mutate(discount.id);
  };

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="xl" color="border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <PageShell className="pb-16">
      <PageHeader
        title="İndirimlerim"
        description="Ürünleriniz için indirim ve kampanya oluşturun"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <PlusIcon className="h-5 w-5" />
            Yeni İndirim
          </Button>
        }
      />

      {/* Metrics — tab-independent */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          icon={ReceiptPercentIcon}
          label="Toplam İndirim"
          value={metrics.total}
          accent="text-heading"
        />
        <MetricCard
          icon={CheckCircleIcon}
          label="Aktif"
          value={metrics.active}
          accent="text-success-600"
        />
        <MetricCard
          icon={ClockIcon}
          label="Süresi Dolmuş"
          value={metrics.expired}
          accent="text-danger-600"
        />
        <MetricCard
          icon={FireIcon}
          label="Toplam Kullanım"
          value={metrics.usage}
          accent="text-primary-600"
        />
      </div>

      <Tabs
        value={filter}
        onValueChange={(v) => setFilter(v as DiscountFilter)}
      >
        <TabsList className="flex flex-wrap">
          {FILTER_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="xl" color="border-primary-500 border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-elevated p-12 text-center">
          <TagIcon className="mx-auto mb-4 h-16 w-16 text-border-strong" />
          <h3 className="mb-2 text-xl font-semibold text-heading">
            {filter !== "all"
              ? "Bu filtreye uygun indirim yok"
              : "Henüz indirim oluşturmadınız"}
          </h3>
          <p className="mb-6 text-muted">
            Müşterilerinize özel indirimler ve kampanyalar oluşturun
          </p>
          <Button onClick={openCreate}>İlk İndirimi Oluştur</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((discount) => (
            <DiscountCard
              key={discount.id}
              discount={discount}
              onEdit={openEdit}
              onToggle={(d) => toggleDiscount.mutate(d)}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      <DiscountFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        products={products}
      />
    </PageShell>
  );
}
