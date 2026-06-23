import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MediaAccessService } from './media-access.service';
import { PrismaService } from '../../prisma';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

describe('MediaAccessService', () => {
  let service: MediaAccessService;
  let findUnique: jest.Mock;

  const owner: RequestUser = { id: 'user-1', email: 'a@b.c', isSeller: false };
  const other: RequestUser = { id: 'user-2', email: 'x@y.z', isSeller: false };
  const admin: RequestUser = { id: 'admin-1', email: 'admin@b.c', isSeller: false, isAdmin: true };

  beforeEach(async () => {
    findUnique = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaAccessService,
        { provide: PrismaService, useValue: { mediaFile: { findUnique } } },
      ],
    }).compile();

    service = module.get(MediaAccessService);
  });

  it('uploader dosyasını değiştirebilir ve bucket/key döner', async () => {
    findUnique.mockResolvedValue({ bucket: 'avatars', key: 'dev/avatars/user-1/a.jpg', uploaderId: 'user-1' });
    await expect(service.assertCanModify('dev/avatars/user-1/a.jpg', owner)).resolves.toEqual({
      bucket: 'avatars',
      key: 'dev/avatars/user-1/a.jpg',
    });
  });

  it('admin başkasının dosyasını değiştirebilir', async () => {
    findUnique.mockResolvedValue({ bucket: 'documents', key: 'dev/documents/invoices/x.pdf', uploaderId: 'user-1' });
    await expect(service.assertCanModify('dev/documents/invoices/x.pdf', admin)).resolves.toMatchObject({
      bucket: 'documents',
    });
  });

  it('başka kullanıcı (sahip değil) → Forbidden', async () => {
    findUnique.mockResolvedValue({ bucket: 'avatars', key: 'dev/avatars/user-1/a.jpg', uploaderId: 'user-1' });
    await expect(service.assertCanModify('dev/avatars/user-1/a.jpg', other)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('uploaderId boş olan (sahipsiz) dosya → admin değilse Forbidden', async () => {
    findUnique.mockResolvedValue({ bucket: 'products', key: 'dev/products/x.jpg', uploaderId: null });
    await expect(service.assertCanModify('dev/products/x.jpg', other)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('olmayan key → NotFound', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.assertCanModify('dev/products/missing.jpg', owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('kimlik yoksa → Forbidden (DB sorgusu yapılmaz)', async () => {
    await expect(service.assertCanModify('dev/products/x.jpg', undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
