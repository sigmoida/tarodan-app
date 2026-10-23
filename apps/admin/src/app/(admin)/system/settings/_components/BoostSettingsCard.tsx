"use client";

import { useTranslations } from "next-intl";
import { z } from "zod";
import {
  BOOST_ENABLED_SETTING,
  BOOST_OFFER_SINCE_SETTING,
} from "@tarodan/types";
import { Button } from "@tarodan/ui";
import { Form, FormDatePicker, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { SectionCard } from "@/components/detail/SectionCard";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { istanbulDateOf, startOfIstanbulDayIso } from "@/lib/istanbul-dates";
import { readBoostEnabled, readBoostOfferSince } from "@/lib/settings";
import { SettingToggle } from "./SettingToggle";

const offerSinceSchema = z.object({
  /** An Istanbul calendar day (`YYYY-MM-DD`), or empty for "offers off". */
  offerSince: z.string(),
});
type OfferSinceValues = z.infer<typeof offerSinceSchema>;

/** The stored offer start as the form's Istanbul day ("" when off). */
function selectOfferSinceDay(raw: unknown): string {
  const since = readBoostOfferSince(raw);
  return since ? istanbulDateOf(since.toISOString()) : "";
}

/** The form's day as the setting value: that day's Istanbul midnight, or "". */
function offerSinceSettingValue(day: string): string {
  return day ? startOfIstanbulDayIso(day) : "";
}

/**
 * Boost sales on/off (`boost_enabled`: missing is on, so it reads through
 * `isBoostEnabled`, never the standard on/off rule) and the day from which
 * new listings get the one-time boost offer (`boost_offer_since`; empty turns
 * the offer off). Both apply without a deploy.
 */
export function BoostSettingsCard() {
  const t = useTranslations();
  const { data: offerSince } = usePlatformSettings(selectOfferSinceDay);
  const form = useZodForm(offerSinceSchema, {
    values: offerSince === undefined ? undefined : { offerSince },
    resetOptions: { keepDirtyValues: true },
  });

  const save = useAdminMutation(
    (v: OfferSinceValues) =>
      adminApi.updateSetting(
        BOOST_OFFER_SINCE_SETTING,
        offerSinceSettingValue(v.offerSince),
      ),
    {
      invalidates: ["platform-settings"],
      successMessage: t("admin.settings.saved"),
    },
  );

  return (
    <SectionCard title={t("admin.settings.boost.title")}>
      <div className="space-y-6">
        <SettingToggle
          settingKey={BOOST_ENABLED_SETTING}
          read={readBoostEnabled}
          label={t("admin.settings.boost.enabled")}
          helper={t("admin.settings.boost.enabledHint")}
        />
        <Form
          form={form}
          onSubmit={(v) => save.mutate(v)}
          className="space-y-3"
        >
          <FormDatePicker
            name="offerSince"
            label={t("admin.settings.boost.offerSince")}
            helperText={t("admin.settings.boost.offerSinceHint")}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              isLoading={save.isPending}
              disabled={offerSince === undefined}
            >
              {t("admin.settings.saveButton")}
            </Button>
          </div>
        </Form>
      </div>
    </SectionCard>
  );
}
