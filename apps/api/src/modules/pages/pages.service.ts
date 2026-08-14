import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public list of published pages (slug + updatedAt) for sitemap etc. */
  async findAllPublished() {
    const pages = await this.prisma.staticPage.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: { sortOrder: "asc" },
    });
    return pages;
  }

  async findBySlug(slug: string) {
    const page = await this.prisma.staticPage.findFirst({
      where: { slug, isPublished: true },
    });
    if (!page)
      throw new NotFoundException(i18nMessage("server.admin.page.notFound"));
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      content: page.content,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      metaKeywords: page.metaKeywords,
      updatedAt: page.updatedAt,
    };
  }
}
