import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';

@Injectable()
export class ManufacturerService {
  private readonly logger = new Logger(ManufacturerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.manufacturer.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        country: true,
        _count: { select: { products: { where: { status: 'active' } } } },
      },
    });
  }

  async findBySlug(slug: string) {
    const manufacturer = await this.prisma.manufacturer.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        description: true,
        website: true,
        country: true,
        _count: { select: { products: { where: { status: 'active' } } } },
      },
    });
    if (!manufacturer) {
      throw new NotFoundException(`Üretici bulunamadı: ${slug}`);
    }
    return {
      ...manufacturer,
      productCount: manufacturer._count.products,
    };
  }

  async findOne(id: string) {
    const manufacturer = await this.prisma.manufacturer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        description: true,
        website: true,
        country: true,
        _count: { select: { products: { where: { status: 'active' } } } },
      },
    });
    if (!manufacturer) {
      throw new NotFoundException(`Üretici bulunamadı`);
    }
    return {
      ...manufacturer,
      productCount: manufacturer._count.products,
    };
  }
}
