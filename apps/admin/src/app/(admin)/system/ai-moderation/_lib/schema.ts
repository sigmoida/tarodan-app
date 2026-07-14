import { z } from "zod";

/**
 * AI moderation thresholds, edited as percentages (0..100) via sliders. Stored
 * server-side as 0..1 fractions — the /100 shaping stays in the mutationFn.
 */
export const aiThresholdsSchema = z.object({
  rel: z.number().min(0).max(100),
  nsfw: z.number().min(0).max(100),
});

export type AiThresholdsValues = z.infer<typeof aiThresholdsSchema>;
