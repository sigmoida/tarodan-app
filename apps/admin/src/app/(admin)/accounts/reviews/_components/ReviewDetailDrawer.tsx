"use client";

import { useTranslations } from "next-intl";
import type { ReviewModerationStatus } from "@tarodan/types";
import { Badge, Button, Drawer } from "@tarodan/ui";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { Eyebrow } from "@/components/detail/SectionTitle";
import { TextLink } from "@/components/TextLink";
import { useResourceList } from "@/components/list";
import { fmtDateTime } from "@/lib/format";
import type { ReviewDetail } from "../_lib/detail";
import {
  REVIEW_TRANSITION_LABEL_KEY,
  reviewTransitions,
} from "@/components/reviews/transitions";
import { reviewStatusConfig } from "@/components/reviews/reviewStatus";
import { Stars } from "./Stars";

const DETAIL_BUTTON_VARIANT = {
  approved: "primary",
  hidden: "danger",
} as const satisfies Record<ReviewModerationStatus, string>;

/**
 * Review detail drawer: product and seller reviews draw the SAME view
 * (`ReviewDetail`). It lives inside the list context: the selected row is read
 * from `rows` on every render, so after a moderation the refreshed list also
 * updates the drawer (it closes if the row drops out of the filter).
 */
export function ReviewDetailDrawer<Row extends { id: string }>({
  selectedId,
  toDetail,
  onAct,
  busyId,
  onClose,
}: {
  selectedId: string | null;
  toDetail: (row: Row) => ReviewDetail;
  /** The SAME action as the row menu (opens the reason modal); not duplicated. */
  onAct: (id: string, status: ReviewModerationStatus) => void;
  busyId?: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { rows, filters, setFilter } = useResourceList<Row>();
  const row = selectedId ? rows.find((r) => r.id === selectedId) : undefined;
  const detail = row ? toDetail(row) : null;

  return (
    <Drawer
      isOpen={!!detail}
      onClose={() => {
        onClose();
        // A report deep link narrows the list to one review (`?id=`); closing
        // the drawer returns to the full list.
        if (filters.id) setFilter("id", "");
      }}
      side="right"
      title={t("admin.accounts.reviews.detail.title")}
      closeLabel={t("common.close")}
      widthClassName="w-[min(32rem,calc(100%-3rem))]"
      bodyClassName="space-y-5 p-4"
      footer={
        detail && (
          <div className="flex flex-wrap justify-end gap-2 p-4">
            {reviewTransitions(detail.status).map((target) => (
              <Button
                key={target}
                size="sm"
                variant={DETAIL_BUTTON_VARIANT[target]}
                isLoading={busyId === detail.id}
                onClick={() => onAct(detail.id, target)}
              >
                {t(REVIEW_TRANSITION_LABEL_KEY[target])}
              </Button>
            ))}
          </div>
        )
      }
    >
      {detail && <ReviewDetailBody detail={detail} />}
    </Drawer>
  );
}

function ReviewDetailBody({ detail }: { detail: ReviewDetail }) {
  const t = useTranslations();
  const statusConfig = reviewStatusConfig(t);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Stars score={detail.score} />
        <Badge status={detail.status} config={statusConfig} />
      </div>

      <div className="space-y-2">
        {detail.title && (
          <p className="text-base font-semibold text-heading">{detail.title}</p>
        )}
        {detail.text ? (
          <p className="whitespace-pre-wrap break-words text-sm text-body">
            {detail.text}
          </p>
        ) : (
          <p className="text-sm text-muted">
            {t("admin.accounts.reviews.detail.noText")}
          </p>
        )}
      </div>

      {detail.images.length > 0 && (
        <div>
          <Eyebrow className="mb-2">
            {t("admin.accounts.reviews.detail.images")}
          </Eyebrow>
          <div className="grid grid-cols-3 gap-2">
            {detail.images.map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={t("admin.accounts.reviews.detail.imageAlt", {
                    index: index + 1,
                  })}
                  className="h-24 w-full rounded border border-border object-cover transition-opacity hover:opacity-90"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {detail.adminReply && (
        <Panel tone="muted" padding="sm">
          <Eyebrow className="mb-1">
            {t("admin.accounts.reviews.detail.adminReply")}
          </Eyebrow>
          <p className="whitespace-pre-wrap break-words text-sm text-body">
            {detail.adminReply}
          </p>
          {detail.adminReplyAt && (
            <p className="mt-1 text-xs text-muted">
              {fmtDateTime(detail.adminReplyAt)}
            </p>
          )}
        </Panel>
      )}

      {detail.moderation && (
        <Panel tone="muted" padding="sm">
          <Eyebrow className="mb-1">
            {t("admin.accounts.reviews.detail.moderation")}
          </Eyebrow>
          {detail.moderation.reason && (
            <p className="whitespace-pre-wrap break-words text-sm text-body">
              {detail.moderation.reason}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            {detail.moderation.by
              ? t("admin.accounts.reviews.moderatedBy", {
                  name: detail.moderation.by,
                  date: fmtDateTime(detail.moderation.at),
                })
              : fmtDateTime(detail.moderation.at)}
          </p>
        </Panel>
      )}

      <DataList columns={1}>
        <Field label={t("admin.accounts.reviews.detail.author")}>
          {detail.author.href ? (
            <TextLink href={detail.author.href}>{detail.author.name}</TextLink>
          ) : (
            detail.author.name
          )}
        </Field>
        {detail.links.map((link) => (
          <Field
            key={link.kind}
            label={t(`admin.accounts.reviews.detail.links.${link.kind}`)}
          >
            <TextLink href={link.href}>{link.label}</TextLink>
          </Field>
        ))}
        <Field label={t("common.date")}>{fmtDateTime(detail.createdAt)}</Field>
        {detail.isVerifiedPurchase && (
          <Field label={t("admin.accounts.reviews.verifiedBuyer")}>
            {t("common.yes")}
          </Field>
        )}
      </DataList>
    </>
  );
}
