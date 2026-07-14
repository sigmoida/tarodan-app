"use client";

import { Button, Slider } from "@tarodan/ui";
import { Form, useZodForm } from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { SectionCard } from "@/components/detail/SectionCard";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { aiThresholdsSchema, type AiThresholdsValues } from "../_lib/schema";
import { type AiModerationConfig } from "../_lib/types";

/** Relevance auto-accept + NSFW block thresholds (stored 0..1, edited as %). */
export function AiThresholdsCard({ config }: { config?: AiModerationConfig }) {
  // `values` reseeds the sliders from the server config (and after each save's
  // refetch) — no useEffect mirror. Sliders are controlled, so the values are
  // driven via watch/setValue rather than register.
  const form = useZodForm(aiThresholdsSchema, {
    defaultValues: { rel: 20, nsfw: 70 },
    values: config
      ? {
          rel: Math.round(config.relevanceThreshold * 100),
          nsfw: Math.round(config.nsfwThreshold * 100),
        }
      : undefined,
  });
  const { rel, nsfw } = form.watch();

  const save = useAdminMutation(
    (v: AiThresholdsValues) =>
      adminApi.post("/admin/moderation/ai-config", {
        relevanceThreshold: v.rel / 100,
        nsfwThreshold: v.nsfw / 100,
      }),
    {
      invalidates: ["ai-moderation-config"],
      successMessage: "Eşikler kaydedildi",
    },
  );

  const disabled = config?.enabled === false;

  return (
    <SectionCard title="AI Eşikleri" bodyClassName="space-y-4">
      <Form form={form} onSubmit={(v) => save.mutate(v)} className="space-y-4">
        <Slider
          min={0}
          max={100}
          value={rel}
          onChange={(e) => form.setValue("rel", Number(e.target.value))}
          label="Kabul eşiği (ilgililik %)"
          valueLabel={`%${rel}`}
          helperText="Ürün görseli bu yüzdenin üstünde ilgililik alırsa otomatik kabul edilir; altındakiler admin onayına düşer."
        />
        <Slider
          min={0}
          max={100}
          value={nsfw}
          onChange={(e) => form.setValue("nsfw", Number(e.target.value))}
          label="Uygunsuzluk eşiği (NSFW %)"
          valueLabel={`%${nsfw}`}
          helperText="Bir görselin uygunsuzluk skoru bu yüzdeyi aşarsa engellenir (avatar, koleksiyon, ürün ve diğer tüm görsel yüklemeleri kapsar)."
        />
        <div className="flex justify-end">
          <Button type="submit" isLoading={save.isPending} disabled={disabled}>
            Eşikleri Kaydet
          </Button>
        </div>
      </Form>
    </SectionCard>
  );
}
