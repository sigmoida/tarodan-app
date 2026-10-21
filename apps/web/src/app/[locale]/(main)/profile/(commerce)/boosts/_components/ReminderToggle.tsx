/** @format */

"use client";

import { useTranslations } from "next-intl";
import { Toggle } from "@tarodan/ui";
import { Link } from "@/i18n/navigation";
import { useAuthStore } from "@/stores/authStore";
import { hasPaidMembership } from "@/lib/membership";
import { MEMBERSHIP_PATH } from "@/lib/paymentKind";
import { useBoostReminder } from "../_hooks/useMyBoosts";

/**
 * The listing's ending-soon reminder (a reminder only, no automatic charge).
 * Turning it on is premium only: other members see it disabled, with the way
 * to upgrade, unless it is already on (then they can still turn it off).
 */
export default function ReminderToggle({
  productId,
  checked,
}: {
  productId: string;
  checked: boolean;
}) {
  const t = useTranslations();
  const premium = useAuthStore((s) =>
    hasPaidMembership(s.user?.membershipTier),
  );
  const reminder = useBoostReminder();

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Toggle
          size="sm"
          checked={checked}
          // Turning it on needs premium; turning it off never does (a
          // lapsed member must still be able to stop the reminder).
          disabled={(!premium && !checked) || reminder.isPending}
          label={t("profile.boosts.reminder.label")}
          onChange={(enabled) => reminder.mutate({ productId, enabled })}
        />
        <span className="text-sm text-body">
          {t("profile.boosts.reminder.label")}
        </span>
      </div>
      {premium ? (
        <p className="text-xs text-subtle">
          {t("profile.boosts.reminder.hint")}
        </p>
      ) : (
        <p className="text-xs text-subtle">
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
  );
}
