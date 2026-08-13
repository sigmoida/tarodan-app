/**
 * Zod building blocks for phone fields — one rule shared by web and admin.
 *
 * `combinePhone` is the arbiter: it returns "" for anything that is not a
 * Turkish mobile, and accepts both the national part a `PhoneInput` edits and an
 * already-stored "+90…" value, so the same refine works whichever shape a given
 * form keeps in state. The message is a parameter because some schemas are
 * locale-aware factories and others are plain objects.
 *
 * Lives under the `@tarodan/ui/form` subpath so screens that don't build forms
 * keep zod out of their bundle.
 */
import { z } from "zod";
import { combinePhone } from "./phone";

/** Required Turkish mobile number. */
export const trPhone = (message: string) =>
  z.string().refine((v) => combinePhone(v) !== "", message);

/** Optional Turkish mobile number — empty passes, anything present must be valid. */
export const trPhoneOptional = (message: string) =>
  z
    .string()
    .refine((v) => !v.trim() || combinePhone(v) !== "", message)
    .optional()
    .or(z.literal(""));
