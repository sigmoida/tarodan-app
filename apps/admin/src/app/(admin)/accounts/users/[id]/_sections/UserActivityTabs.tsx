/** @format */

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CubeIcon, NoSymbolIcon, StarIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { AdminTabs } from "@/components/AdminTabs";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { getProductEffectivePrice } from "@/lib/product-price";
import { fmtDate, fmtTry } from "@/lib/format";
import {
  type UserBlockItem,
  type UserDetail,
  type UserRatingItem,
  getUserStatusConfig,
} from "../types";

/** Engelleme satırı: karşı taraf + tarih + (varsa) gerekçe. */
function BlockRow({
  item,
  other,
  reasonLabel,
}: {
  item: UserBlockItem;
  other?: { id: string; displayName: string };
  reasonLabel: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-alt p-4">
      <div className="min-w-0">
        {other ? (
          <Link
            href={`/accounts/users/${other.id}`}
            className="font-medium text-heading hover:underline"
          >
            {other.displayName}
          </Link>
        ) : (
          <span className="font-medium text-heading">—</span>
        )}
        {item.reason && (
          <p className="mt-1 truncate text-sm text-muted">
            {reasonLabel}: {item.reason}
          </p>
        )}
      </div>
      <span className="ml-4 shrink-0 text-sm text-subtle">
        {fmtDate(item.createdAt)}
      </span>
    </div>
  );
}

function Stars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4, 5].map((s) => (
        <StarIcon
          key={s}
          className={`h-4 w-4 ${s <= score ? "fill-warning-500 text-warning-500" : "text-muted"}`}
        />
      ))}
      <span className="ml-2 font-medium text-heading">{score}/5</span>
    </div>
  );
}

function RatingCard({
  rating,
  partyLabel,
  party,
}: {
  rating: UserRatingItem;
  partyLabel: string;
  party?: string;
}) {
  const t = useTranslations();
  return (
    <div className="rounded-lg bg-surface-alt p-4">
      <div className="mb-2 flex items-center justify-between">
        <Stars score={rating.score} />
        <span className="text-sm text-muted">{fmtDate(rating.createdAt)}</span>
      </div>
      {rating.comment && <p className="text-muted">{rating.comment}</p>}
      <p className="mt-2 text-sm text-muted">
        {partyLabel}: {party || t("common.unknown")}
      </p>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-muted">{children}</p>;
}

export function UserActivityTabs({
  userId,
  user,
}: {
  userId: string;
  user: UserDetail;
}) {
  const t = useTranslations();
  const userStatusConfig = getUserStatusConfig(t);
  const [tab, setTab] = useState<
    "orders" | "products" | "trades" | "ratings" | "blocks" | "ai"
  >("orders");
  const blocksCount =
    (user.stats?.blocksGivenCount ?? user.blocksGiven?.length ?? 0) +
    (user.stats?.blocksReceivedCount ?? user.blocksReceived?.length ?? 0);

  const tabs = [
    {
      key: "orders",
      label: t("admin.operations.orders.title"),
      badge: user.recentOrders?.length || 0,
    },
    {
      key: "products",
      label: t("admin.catalog.products.title"),
      badge: user.products?.length || 0,
    },
    {
      key: "trades",
      label: t("admin.operations.trades.title"),
      badge: user.recentTrades?.length || 0,
    },
    {
      key: "ratings",
      label: t("admin.users.detail.ratingsTab"),
      badge: user.receivedRatings?.length || 0,
    },
    {
      key: "blocks",
      label: t("admin.users.detail.blocksTab"),
      icon: NoSymbolIcon,
      badge: blocksCount,
    },
    { key: "ai", label: t("admin.catalog.common.aiModeration") },
  ];

  return (
    <SectionCard bodyClassName="space-y-4">
      <AdminTabs
        tabs={tabs}
        value={tab}
        onChange={(k) => setTab(k as typeof tab)}
      />

      {tab === "orders" &&
        (user.recentOrders && user.recentOrders.length > 0 ? (
          <div className="space-y-3">
            {user.recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-lg bg-surface-alt p-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        order.role === "buyer"
                          ? "bg-info-500/20 text-info-700"
                          : "bg-success-500/20 text-success-700"
                      }`}
                    >
                      {order.role === "buyer"
                        ? t("admin.operations.common.buyer")
                        : t("admin.operations.common.seller")}
                    </span>
                    <Link
                      href={`/operations/orders/${order.id}`}
                      className="font-medium text-heading hover:text-primary-600"
                    >
                      {order.orderNumber || `#${order.id.slice(0, 8)}`}
                    </Link>
                    <StatusBadge
                      status={order.status}
                      config={userStatusConfig}
                    />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {order.role === "buyer"
                      ? t("admin.operations.common.seller")
                      : t("admin.operations.common.buyer")}
                    : {order.otherParty?.displayName || t("common.unknown")}
                    {order.product && ` • ${order.product.title}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-heading">
                    {fmtTry(order.totalAmount)}
                  </p>
                  <p className="text-xs text-muted">
                    {fmtDate(order.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            <Link
              href={`/operations/orders?userId=${user.id}`}
              className="block py-2 text-center text-primary-600 hover:underline"
            >
              {t("admin.users.detail.viewAllOrders")}
            </Link>
          </div>
        ) : (
          <EmptyLine>{t("admin.users.detail.noOrders")}</EmptyLine>
        ))}

      {tab === "products" &&
        (user.products && user.products.length > 0 ? (
          <div className="space-y-3">
            {user.products.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-4 rounded-lg bg-surface-alt p-4"
              >
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.title}
                    width={60}
                    height={60}
                    className="rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-[60px] w-[60px] items-center justify-center rounded-lg bg-surface">
                    <CubeIcon className="h-6 w-6 text-muted" />
                  </div>
                )}
                <div className="flex-1">
                  <Link
                    href={`/catalog/products/${product.id}`}
                    className="font-medium text-heading hover:text-primary-600"
                  >
                    {product.title}
                  </Link>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge
                      status={product.status}
                      config={userStatusConfig}
                    />
                    <span className="text-sm text-muted">
                      {fmtDate(product.createdAt)}
                    </span>
                  </div>
                </div>
                <p className="font-medium text-heading">
                  {fmtTry(getProductEffectivePrice(product))}
                </p>
              </div>
            ))}
            <Link
              href={`/catalog/products?sellerId=${user.id}`}
              className="block py-2 text-center text-primary-600 hover:underline"
            >
              {t("admin.users.detail.viewAllProducts")}
            </Link>
          </div>
        ) : (
          <EmptyLine>{t("admin.users.detail.noProducts")}</EmptyLine>
        ))}

      {tab === "trades" &&
        (user.recentTrades && user.recentTrades.length > 0 ? (
          <div className="space-y-3">
            {user.recentTrades.map((trade) => (
              <div key={trade.id} className="rounded-lg bg-surface-alt p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        trade.role === "initiator"
                          ? "bg-primary-500/20 text-primary-700"
                          : "bg-info-500/20 text-info-400"
                      }`}
                    >
                      {trade.role === "initiator"
                        ? t("admin.users.detail.initiator")
                        : t("admin.operations.common.buyer")}
                    </span>
                    <Link
                      href={`/operations/trades/${trade.id}`}
                      className="font-medium text-heading hover:text-primary-600"
                    >
                      {trade.tradeNumber || `#${trade.id.slice(0, 8)}`}
                    </Link>
                    <StatusBadge
                      status={trade.status}
                      config={userStatusConfig}
                    />
                  </div>
                  <span className="text-sm text-muted">
                    {fmtDate(trade.createdAt)}
                  </span>
                </div>
                <div className="text-sm text-muted">
                  <p>
                    {t("admin.users.detail.counterpartyLabel")}{" "}
                    {trade.role === "initiator"
                      ? trade.receiver?.displayName
                      : trade.initiator?.displayName}
                  </p>
                  <p className="mt-1">
                    {t("admin.users.detail.tradeOfferSummary", {
                      a: trade.initiatorItems.length,
                      b: trade.receiverItems.length,
                    })}
                    {trade.cashAmount != null &&
                      trade.cashAmount > 0 &&
                      ` + ${fmtTry(trade.cashAmount)}`}
                  </p>
                </div>
              </div>
            ))}
            <Link
              href={`/operations/trades?userId=${user.id}`}
              className="block py-2 text-center text-primary-600 hover:underline"
            >
              {t("admin.users.detail.viewAllTrades")}
            </Link>
          </div>
        ) : (
          <EmptyLine>{t("admin.users.detail.noTrades")}</EmptyLine>
        ))}

      {tab === "ratings" && (
        <div className="space-y-4">
          <h3 className="font-medium text-heading">
            {t("admin.users.detail.receivedRatingsTitle")}
          </h3>
          {user.receivedRatings && user.receivedRatings.length > 0 ? (
            <div className="space-y-3">
              {user.receivedRatings.map((rating) => (
                <RatingCard
                  key={rating.id}
                  rating={rating}
                  partyLabel={t("admin.users.detail.raterLabel")}
                  party={
                    rating.giver?.displayName ||
                    t("admin.users.detail.anonymous")
                  }
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-muted">
              {t("admin.users.detail.noReceivedRatings")}
            </p>
          )}

          <h3 className="mt-6 font-medium text-heading">
            {t("admin.users.detail.givenRatingsTitle")}
          </h3>
          {user.givenRatings && user.givenRatings.length > 0 ? (
            <div className="space-y-3">
              {user.givenRatings.map((rating) => (
                <RatingCard
                  key={rating.id}
                  rating={rating}
                  partyLabel={t("admin.users.detail.rateeLabel")}
                  party={rating.receiver?.displayName || t("common.unknown")}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-muted">
              {t("admin.users.detail.noGivenRatings")}
            </p>
          )}
        </div>
      )}

      {tab === "blocks" &&
        (blocksCount > 0 ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-heading">
                {t("admin.users.detail.blocksGivenTitle")} (
                {user.stats?.blocksGivenCount ?? user.blocksGiven?.length ?? 0})
              </h4>
              {(user.blocksGiven ?? []).map((b) => (
                <BlockRow
                  key={b.id}
                  item={b}
                  other={b.blocked}
                  reasonLabel={t("common.reason")}
                />
              ))}
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-heading">
                {t("admin.users.detail.blocksReceivedTitle")} (
                {user.stats?.blocksReceivedCount ??
                  user.blocksReceived?.length ??
                  0}
                )
              </h4>
              {(user.blocksReceived ?? []).map((b) => (
                <BlockRow
                  key={b.id}
                  item={b}
                  other={b.blocker}
                  reasonLabel={t("common.reason")}
                />
              ))}
            </div>
          </div>
        ) : (
          <EmptyLine>{t("admin.users.detail.blocksEmpty")}</EmptyLine>
        ))}

      {tab === "ai" && (
        <ModerationEventsPanel
          entityType="user"
          entityId={userId}
          chrome={false}
        />
      )}
    </SectionCard>
  );
}
