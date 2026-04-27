import { getPrisma } from '../test-utils/db';

export async function createAddress(opts: {
  userId: string;
  isDefault?: boolean;
  fullName?: string;
  phone?: string;
  city?: string;
  district?: string;
  address?: string;
  zipCode?: string;
}): Promise<{ id: string }> {
  const prisma = getPrisma();
  const address = await prisma.address.create({
    data: {
      userId: opts.userId,
      fullName: opts.fullName ?? 'Test User',
      phone: opts.phone ?? '+905551234567',
      city: opts.city ?? 'İstanbul',
      district: opts.district ?? 'Kadıköy',
      address: opts.address ?? 'Atatürk Cad. No:1',
      zipCode: opts.zipCode ?? '34000',
      isDefault: opts.isDefault ?? true,
    },
  });
  return { id: address.id };
}
