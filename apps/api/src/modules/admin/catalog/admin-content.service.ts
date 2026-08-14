import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "../ops/admin-audit.service";
import {
  extractEmailTemplateContent,
  extractEmailTemplateVariables,
  getEmailTemplateSubject,
  renderEmailTemplate,
  renderStoredEmailTemplate,
  substituteEmailVariables,
} from "../../../common/helpers/email-template-renderer";
import {
  EMAIL_TEMPLATE_DEFINITIONS,
  EMAIL_TEMPLATE_DEFINITION_BY_KEY,
} from "../../../common/email/email-template-registry";
import {
  CreateStaticPageDto,
  UpdateStaticPageDto,
  UpdateEmailTemplateDto,
} from "../dto";
import { EventService } from "../../events/event.service";
import { frontendUrlForEnvironment } from "../../../config/app-urls";
import { i18nMessage } from "../../i18n";

/**
 * İçerik yönetimi admin operasyonları (statik sayfalar + e-posta şablonları) —
 * AdminService'in STATIC PAGES ve EMAIL TEMPLATES bölümlerinden birebir taşındı.
 * AdminService aynı imzalarla buraya delege eder.
 */
@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly eventService: EventService,
    private readonly configService: ConfigService,
  ) {}

  // ==================== STATIC PAGES ====================

  async getPages() {
    const pages = await this.prisma.staticPage.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    return {
      data: pages.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription
          ? p.metaDescription.slice(0, 100)
          : null,
        isPublished: p.isPublished,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    };
  }

  async getPageById(id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page)
      throw new NotFoundException(i18nMessage("server.admin.page.notFound"));
    return page;
  }

  async getPageBySlug(slug: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { slug } });
    if (!page)
      throw new NotFoundException(i18nMessage("server.admin.page.notFound"));
    return page;
  }

  async createPage(adminId: string, dto: CreateStaticPageDto) {
    const existing = await this.prisma.staticPage.findUnique({
      where: { slug: dto.slug },
    });
    if (existing)
      throw new BadRequestException(i18nMessage("server.admin.page.slugInUse"));
    const page = await this.prisma.staticPage.create({
      data: {
        slug: dto.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        title: dto.title,
        content: dto.content,
        metaTitle: dto.metaTitle ?? null,
        metaDescription: dto.metaDescription ?? null,
        metaKeywords: dto.metaKeywords ?? null,
        isPublished: dto.isPublished ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.createAuditLog(
      adminId,
      "static_page_create",
      "StaticPage",
      page.id,
      null,
      page,
    );
    return page;
  }

  async updatePage(adminId: string, id: string, dto: UpdateStaticPageDto) {
    const existing = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.admin.page.notFound"));
    if (dto.slug && dto.slug !== existing.slug) {
      const duplicate = await this.prisma.staticPage.findUnique({
        where: { slug: dto.slug },
      });
      if (duplicate)
        throw new BadRequestException(
          i18nMessage("server.admin.page.slugInUse"),
        );
    }
    const page = await this.prisma.staticPage.update({
      where: { id },
      data: {
        ...(dto.slug != null && {
          slug: dto.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        }),
        ...(dto.title != null && { title: dto.title }),
        ...(dto.content != null && { content: dto.content }),
        ...(dto.metaTitle !== undefined && {
          metaTitle: dto.metaTitle || null,
        }),
        ...(dto.metaDescription !== undefined && {
          metaDescription: dto.metaDescription || null,
        }),
        ...(dto.metaKeywords !== undefined && {
          metaKeywords: dto.metaKeywords || null,
        }),
        ...(dto.isPublished != null && { isPublished: dto.isPublished }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
    await this.audit.createAuditLog(
      adminId,
      "static_page_update",
      "StaticPage",
      id,
      existing,
      page,
    );
    return page;
  }

  async deletePage(adminId: string, id: string) {
    const page = await this.prisma.staticPage.findUnique({ where: { id } });
    if (!page)
      throw new NotFoundException(i18nMessage("server.admin.page.notFound"));
    await this.prisma.staticPage.delete({ where: { id } });
    await this.audit.createAuditLog(
      adminId,
      "static_page_delete",
      "StaticPage",
      id,
      page,
      null,
    );
    return { success: true };
  }

  // ==================== EMAIL TEMPLATES ====================

  private getEmailBrandOptions() {
    const frontendUrl = frontendUrlForEnvironment();
    return {
      frontendUrl,
      logoUrl:
        this.configService.get<string>("EMAIL_LOGO_URL") ||
        `${frontendUrl.replace(/\/+$/, "")}/tarodan-logo.jpg`,
      supportEmail:
        this.configService.get<string>("SUPPORT_EMAIL") ||
        "destek@tarodan.com.tr",
    };
  }

  private getEmailTemplateMeta(key: string) {
    const meta = EMAIL_TEMPLATE_DEFINITION_BY_KEY.get(key);
    if (!meta)
      throw new NotFoundException(
        i18nMessage("server.admin.content.invalidTemplateKey"),
      );
    return meta;
  }

  private validateEmailBodyHtml(bodyHtml: string) {
    const unsafePattern =
      /<(?:script|iframe|object|embed|form|input|button|meta|link)\b|\son\w+\s*=|(?:href|src)\s*=\s*["']?\s*(?:javascript|data:text\/html):/i;
    if (unsafePattern.test(bodyHtml)) {
      throw new BadRequestException(
        i18nMessage("server.admin.content.unsafeTemplateHtml"),
      );
    }
  }

  substituteVariables(text: string, data: Record<string, any>): string {
    return substituteEmailVariables(text, data);
  }

  async getEmailTemplates() {
    const dbTemplates = await this.prisma.emailTemplate.findMany();
    const dbMap = new Map(dbTemplates.map((t) => [t.key, t]));
    const list = EMAIL_TEMPLATE_DEFINITIONS.map(({ key, name, group }) => {
      const db = dbMap.get(key);
      return {
        key,
        name: db?.name ?? name,
        group,
        subject: db?.subject ?? null,
        hasCustomBody: !!db?.bodyHtml,
        variablesJson: db?.variablesJson,
        updatedAt: db?.updatedAt ?? null,
      };
    });
    return { data: list };
  }

  async getEmailTemplate(key: string) {
    const meta = this.getEmailTemplateMeta(key);
    const db = await this.prisma.emailTemplate.findUnique({ where: { key } });
    return {
      key,
      name: db?.name ?? meta.name,
      subject: db?.subject ?? null,
      bodyHtml: db?.bodyHtml ? extractEmailTemplateContent(db.bodyHtml) : null,
      variablesJson: db?.variablesJson ?? null,
      isCustom: Boolean(db?.subject || db?.bodyHtml),
    };
  }

  async updateEmailTemplate(
    adminId: string,
    key: string,
    dto: UpdateEmailTemplateDto,
  ) {
    const meta = this.getEmailTemplateMeta(key);
    const existing = await this.prisma.emailTemplate.findUnique({
      where: { key },
    });
    const subject = dto.subject ?? existing?.subject ?? "";
    const bodyHtml = extractEmailTemplateContent(
      dto.bodyHtml ?? existing?.bodyHtml ?? "",
    );
    this.validateEmailBodyHtml(bodyHtml);
    const variables = Array.from(
      new Set([
        ...extractEmailTemplateVariables(subject),
        ...extractEmailTemplateVariables(bodyHtml),
      ]),
    ).sort();
    const data = {
      name: dto.name ?? meta.name,
      subject,
      bodyHtml,
      variablesJson: JSON.stringify(variables),
    };
    const template = await this.prisma.emailTemplate.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
    await this.audit.createAuditLog(
      adminId,
      "email_template_update",
      "EmailTemplate",
      template.id,
      existing,
      template,
    );
    return template;
  }

  async resetEmailTemplate(adminId: string, key: string) {
    this.getEmailTemplateMeta(key);
    const existing = await this.prisma.emailTemplate.findUnique({
      where: { key },
    });
    if (existing) {
      await this.prisma.emailTemplate.delete({ where: { key } });
      await this.audit.createAuditLog(
        adminId,
        "email_template_reset",
        "EmailTemplate",
        existing.id,
        existing,
        null,
      );
    }
    return { success: true };
  }

  async previewEmailTemplate(
    key: string,
    templateData?: Record<string, any>,
    overrideHtml?: string,
    overrideSubject?: string,
  ) {
    this.getEmailTemplateMeta(key);
    const brand = this.getEmailBrandOptions();
    const sample = templateData || {
      name: "Örnek Kullanıcı",
      buyerName: "Alıcı",
      sellerName: "Satıcı",
      orderNumber: "TRD-12345",
      orderId: "sample-order-id",
      productTitle: "Örnek Ürün",
      totalAmount: 199.99,
      verifyUrl: `${brand.frontendUrl}/verify?token=sample`,
      resetUrl: `${brand.frontendUrl}/reset?token=sample`,
      trackingNumber: "1234567890",
      provider: "Sürat Kargo",
    };

    const db = await this.prisma.emailTemplate.findUnique({ where: { key } });
    const defaultSubject = getEmailTemplateSubject(key, sample);
    const defaultBodyHtml = extractEmailTemplateContent(
      renderEmailTemplate(key, sample, brand),
    );
    const bodyHtml =
      overrideHtml?.trim() ||
      (db?.bodyHtml ? extractEmailTemplateContent(db.bodyHtml) : "") ||
      defaultBodyHtml;
    this.validateEmailBodyHtml(bodyHtml);
    const subject =
      overrideSubject?.trim() || db?.subject?.trim() || defaultSubject;
    const rendered = renderStoredEmailTemplate(
      bodyHtml,
      subject,
      sample,
      brand,
    );

    return {
      ...rendered,
      unresolvedVariables: extractEmailTemplateVariables(
        `${rendered.subject}\n${rendered.html}`,
      ),
    };
  }

  async sendTestEmail(
    key: string,
    dto: {
      to: string;
      templateData?: Record<string, any>;
      overrideHtml?: string;
      overrideSubject?: string;
    },
  ) {
    this.getEmailTemplateMeta(key);
    await this.eventService.queueEmail({
      to: dto.to,
      template: key,
      subject: dto.overrideSubject || "",
      templateData: dto.templateData || {},
      overrideHtml: dto.overrideHtml,
      overrideSubject: dto.overrideSubject,
    });
    return { success: true, message: "Test e-postası kuyruğa eklendi" };
  }
}
