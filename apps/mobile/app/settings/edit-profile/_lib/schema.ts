import { z } from 'zod';

export const MAX_BIO_LENGTH = 500; // Backend DTO (UpdateProfileDto) bio'yu 500 ile sınırlar — web ile aynı.

// 18+ kontrolü (web ile parite): doğum tarihi en geç bugünden 18 yıl önce olmalı.
export const minBirthDate = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
};

export const createProfileSchema = (isBusinessTier: boolean) =>
  z.object({
    displayName: z.string().min(2, 'İsim en az 2 karakter olmalı').max(50),
    bio: z
      .string()
      .max(MAX_BIO_LENGTH, `Biyografi en fazla ${MAX_BIO_LENGTH} karakter olabilir`)
      .optional()
      .or(z.literal('')),
    phone: z.string().max(20).optional().or(z.literal('')),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Lütfen geçerli bir doğum tarihi seçin')
      .refine((val) => new Date(val) <= minBirthDate(), '18 yaşından büyük olmalısınız')
      .optional()
      .or(z.literal('')),
    // Kurumsal (business tier) — web ile parite. Business ise firma adı zorunlu.
    companyName: isBusinessTier
      ? z.string().min(2, 'Şirket adı zorunludur').max(120)
      : z.string().max(120).optional().or(z.literal('')),
    taxId: z.string().max(20).optional().or(z.literal('')),
    taxOffice: z.string().max(120).optional().or(z.literal('')),
  });

export type ProfileForm = {
  displayName: string;
  bio?: string;
  phone?: string;
  birthDate?: string;
  companyName?: string;
  taxId?: string;
  taxOffice?: string;
};
