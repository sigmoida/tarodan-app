"use client";

import { useState, useEffect } from "react";
import { Logo } from "@tarodan/ui/logo";
import { useTranslations } from "next-intl";
import StatusScreen from "../_components/StatusScreen";
import SocialLinks from "../_components/SocialLinks";
import PinForm from "./_components/PinForm";

/**
 * Fixed launch target: 2026-08-03 00:00 Europe/Istanbul (UTC+03, no DST since
 * 2016). Kept as a compile-time constant so both server render and client tick
 * agree without any Date parsing quirks.
 */
const LAUNCH_TARGET_MS = new Date("2026-08-03T00:00:00+03:00").getTime();

function Countdown() {
  const [diff, setDiff] = useState(() =>
    Math.max(0, LAUNCH_TARGET_MS - Date.now()),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setDiff(Math.max(0, LAUNCH_TARGET_MS - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const t = useTranslations();
  if (diff <= 0) {
    return (
      <p className="text-lg font-semibold text-primary-600">
        {t("utility.comingSoon.launching")}
      </p>
    );
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {[
        { value: days, label: "Gün" },
        { value: hours, label: "Saat" },
        { value: mins, label: "Dk" },
        { value: secs, label: "Sn" },
      ].map(({ value, label }) => (
        <div
          key={label}
          className="min-w-[3.5rem] rounded-xl border border-border bg-surface px-3 py-3 text-center"
        >
          <span className="text-2xl font-mono tabular-nums text-heading">
            {String(value).padStart(2, "0")}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function ComingSoonPage() {
  const t = useTranslations();

  return (
    <StatusScreen
      logo={<Logo className="mx-auto h-16 w-auto" />}
      title={t("utility.comingSoon.title")}
      description={t("utility.comingSoon.subtitle")}
    >
      <p className="mb-3 text-sm text-muted">
        {t("utility.comingSoon.countdownLabel")}
      </p>
      <div className="mb-8">
        <Countdown />
      </div>

      <PinForm />

      <SocialLinks title={t("utility.comingSoon.socialTitle")} />
    </StatusScreen>
  );
}
