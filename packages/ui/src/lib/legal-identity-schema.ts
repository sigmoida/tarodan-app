/**
 * Zod building blocks for legal-identity fields (legal first/last name and
 * Turkish national ID) — one rule shared by web (registration, identity gate)
 * and admin (correction modal). The rule itself lives in `@tarodan/types`
 * (`isValidTckn`, `isValidLegalName`), which the API validators call too, so
 * client and server cannot disagree.
 *
 * Messages are parameters for the same reason as `phone-schema.ts`: some
 * schemas are locale-aware factories and others take `t` from a component.
 */
import { z } from "zod";
import { isValidLegalName, isValidTckn } from "@tarodan/types";

/** Required legal first or last name (letters incl. Turkish, 2–50 chars). */
export const legalName = (message: string) =>
  z.string().refine((v) => isValidLegalName(v), message);

/** Required TCKN; formatting (spaces, dashes) is tolerated, checksum is not. */
export const tckn = (message: string) =>
  z.string().refine((v) => isValidTckn(v), message);

/** Optional legal name — empty passes ("leave unchanged"), anything else must be valid. */
export const legalNameOptional = (message: string) =>
  z.string().refine((v) => !v.trim() || isValidLegalName(v), message);

/** Optional TCKN — empty passes ("leave unchanged"), anything else must be valid. */
export const tcknOptional = (message: string) =>
  z.string().refine((v) => !v.trim() || isValidTckn(v), message);
