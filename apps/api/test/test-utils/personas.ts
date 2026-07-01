/**
 * Persona seed — Test Konsolu senaryolarındaki demo kullanıcılarının factory eşdeğerleri.
 *
 * Senaryolar deniz@demo.com / ahmet@demo.com / mehmet@demo.com / admin@tarodan.com gibi
 * sabit persona'lara atıfta bulunur. API E2E harness'i her testte truncate ettiği için
 * bu cast'i `beforeEach` içinde `seedBaseline()` SONRASI çağırın; her persona token'ıyla
 * birlikte döner. Davranış demo seed ile aynıdır; sadece kayıtlar test-içi üretilir.
 *
 *   beforeEach(async () => {
 *     await truncateAll();
 *     baseline = await seedBaseline();
 *     cast = await seedPersonas(ctx);
 *   });
 */
import { TestingModule } from '@nestjs/testing';
import {
  createUser,
  createAdminUser,
  CreatedTestUser,
  CreatedTestAdmin,
} from '../factories/user.factory';
import { createAddress } from '../factories/address.factory';

export type PersonaUser = CreatedTestUser & { addressId: string };
export type PersonaAdmin = CreatedTestAdmin & { addressId: string };

export interface PersonaCast {
  /** Alıcı (temiz; satıcı değil). */
  deniz: PersonaUser;
  /** Premium satıcı (takas/koleksiyon yetkili). */
  ahmet: PersonaUser;
  /** Standart satıcı. */
  mehmet: PersonaUser;
  /** Premium satıcı/alıcı. */
  ayse: PersonaUser;
  /** İkinci alıcı (eşzamanlılık senaryoları). */
  kaan: PersonaUser;
  /** Super admin (admin@tarodan.com). */
  admin: PersonaAdmin;
  /** Moderatör (moderator@tarodan.com). */
  moderator: PersonaAdmin;
}

interface SeedPersonasOpts {
  /** Her persona için varsayılan adres oluştur (sipariş/kargo akışları için). Varsayılan: true. */
  withAddresses?: boolean;
}

async function withAddress<T extends CreatedTestUser>(
  user: T,
  enabled: boolean,
): Promise<T & { addressId: string }> {
  if (!enabled) return { ...user, addressId: '' };
  const addr = await createAddress({ userId: user.id, isDefault: true });
  return { ...user, addressId: addr.id };
}

export async function seedPersonas(
  ctx: { module: TestingModule },
  opts: SeedPersonasOpts = {},
): Promise<PersonaCast> {
  const m = ctx.module;
  const withAddr = opts.withAddresses ?? true;

  const [deniz, ahmet, mehmet, ayse, kaan, admin, moderator] = await Promise.all([
    createUser(m, { email: 'deniz@demo.com', displayName: 'Deniz Alıcı' }),
    createUser(m, {
      email: 'ahmet@demo.com',
      displayName: 'Ahmet Satıcı',
      isSeller: true,
      premium: true,
    }),
    createUser(m, { email: 'mehmet@demo.com', displayName: 'Mehmet Satıcı', isSeller: true }),
    createUser(m, {
      email: 'ayse@demo.com',
      displayName: 'Ayşe Satıcı',
      isSeller: true,
      premium: true,
    }),
    createUser(m, { email: 'kaan@demo.com', displayName: 'Kaan Alıcı' }),
    createAdminUser(m, { email: 'admin@tarodan.com', role: 'super_admin' as any }),
    createAdminUser(m, { email: 'moderator@tarodan.com', role: 'moderator' as any }),
  ]);

  const [denizA, ahmetA, mehmetA, ayseA, kaanA, adminA, modA] = await Promise.all([
    withAddress(deniz, withAddr),
    withAddress(ahmet, withAddr),
    withAddress(mehmet, withAddr),
    withAddress(ayse, withAddr),
    withAddress(kaan, withAddr),
    withAddress(admin, withAddr),
    withAddress(moderator, withAddr),
  ]);

  return {
    deniz: denizA,
    ahmet: ahmetA,
    mehmet: mehmetA,
    ayse: ayseA,
    kaan: kaanA,
    admin: adminA as PersonaAdmin,
    moderator: modA as PersonaAdmin,
  };
}
