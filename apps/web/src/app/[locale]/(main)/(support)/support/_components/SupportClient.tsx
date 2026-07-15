"use client";

import { Link } from "@/i18n/navigation";
import {
  QuestionMarkCircleIcon,
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  LifebuoyIcon,
  PlusIcon,
  ClockIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { Form, FormInput, FormTextarea } from "@tarodan/ui/form";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { formatDate } from "@/lib/format";
import { CATEGORIES, STATUS_CONFIG, categoryLabel } from "../_lib/data";
import { useSupport } from "../_hooks/useSupport";

const QUICK_LINKS = [
  {
    href: "/help",
    icon: QuestionMarkCircleIcon,
    color: "text-info-500",
    title: "Yardım Merkezi",
    sub: "Rehberler ve konu başlıkları",
  },
  {
    href: "/faq",
    icon: ChatBubbleLeftRightIcon,
    color: "text-success-500",
    title: "Sıkça Sorulan Sorular",
    sub: "Hızlı yanıtlar",
  },
  {
    href: "/contact",
    icon: EnvelopeIcon,
    color: "text-primary-500",
    title: "İletişim",
    sub: "Bize yazın",
  },
];

export default function SupportClient() {
  const {
    isAuthenticated,
    authLoading,
    tickets,
    ticketsLoading,
    showForm,
    setShowForm,
    form,
    onSubmit,
    isSubmitting,
  } = useSupport();
  const { register, setValue, watch, formState } = form;
  register("category");
  const category = watch("category");

  return (
    <DocPage
      title="Destek Merkezi"
      description="Size yardımcı olmak için buradayız. Sorununuzu bildirin, ekibimiz en kısa sürede sizinle ilgilensin."
    >
      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-3">
        {QUICK_LINKS.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated p-4 transition-shadow hover:shadow-md"
          >
            <q.icon className={`h-8 w-8 flex-shrink-0 ${q.color}`} />
            <div>
              <p className="font-semibold text-heading">{q.title}</p>
              <p className="text-sm text-muted">{q.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {!authLoading && !isAuthenticated && (
        <SectionCard className="text-center">
          <LifebuoyIcon className="mx-auto mb-4 h-12 w-12 text-subtle" />
          <h2 className="mb-2 text-xl font-semibold text-heading">
            Destek talebi oluşturmak için giriş yapın
          </h2>
          <p className="mb-6 text-muted">
            Siparişleriniz, ödemeleriniz veya hesabınızla ilgili talepler için
            giriş yapmanız gerekir. Üye değilseniz iletişim formunu da
            kullanabilirsiniz.
          </p>
          <div className="flex items-center justify-center gap-3">
            <ButtonLink variant="primary" href="/login?redirect=/support">
              Giriş Yap
            </ButtonLink>
            <ButtonLink variant="secondary" href="/contact">
              İletişim Formu
            </ButtonLink>
          </div>
        </SectionCard>
      )}

      {isAuthenticated && (
        <>
          <SectionCard
            title="Destek Talebi Oluştur"
            action={
              !showForm ? (
                <Button
                  onClick={() => setShowForm(true)}
                  leftIcon={<PlusIcon className="h-5 w-5" />}
                >
                  Yeni Talep
                </Button>
              ) : undefined
            }
          >
            <p className="mb-4 text-sm text-muted">
              Sorununuzu kategorisiyle birlikte iletin; ekibimiz genellikle 24
              saat içinde yanıt verir.
            </p>

            {showForm && (
              <Form form={form} onSubmit={onSubmit} className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-heading">
                    Kategori
                  </label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {CATEGORIES.map((cat) => (
                      <Button
                        key={cat.id}
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setValue("category", cat.id, { shouldValidate: true })
                        }
                        className={`h-auto flex-col gap-2 whitespace-normal p-3 text-sm font-normal ${
                          category === cat.id
                            ? "border-primary-500 bg-primary-50 font-medium text-primary-700 hover:bg-primary-50"
                            : "text-body"
                        }`}
                      >
                        <cat.icon className="h-6 w-6" />
                        {cat.label}
                      </Button>
                    ))}
                  </div>
                  {formState.errors.category && (
                    <p className="mt-1 text-xs text-danger-600">
                      {formState.errors.category.message as string}
                    </p>
                  )}
                </div>

                <FormInput
                  name="subject"
                  label="Konu"
                  placeholder="Örn: Siparişim kargoya verilmedi"
                  maxLength={200}
                />
                <FormTextarea
                  name="message"
                  label="Mesajınız"
                  rows={5}
                  placeholder="Sorununuzu mümkün olduğunca ayrıntılı anlatın. Varsa sipariş numaranızı ekleyin."
                  maxLength={2000}
                />

                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    isLoading={isSubmitting}
                    disabled={isSubmitting}
                  >
                    Talebi Gönder
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                  >
                    Vazgeç
                  </Button>
                </div>
              </Form>
            )}
          </SectionCard>

          <SectionCard title="Taleplerim">
            {ticketsLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-lg bg-border-subtle"
                  />
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-8 text-center">
                <ClockIcon className="mx-auto mb-3 h-10 w-10 text-subtle" />
                <p className="text-muted">Henüz bir destek talebiniz yok.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {tickets.map((ticket) => {
                  const status =
                    STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
                  return (
                    <li key={ticket.id}>
                      <Link
                        href={`/support/${ticket.id}`}
                        className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-4 transition-colors hover:bg-surface"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-heading">
                            {ticket.subject}
                          </p>
                          <p className="text-sm text-muted">
                            {categoryLabel(ticket.category)} ·{" "}
                            {formatDate(ticket.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${status.className}`}
                        >
                          {status.label}
                        </span>
                        <ChevronRightIcon className="h-5 w-5 flex-shrink-0 text-subtle" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </>
      )}

      <SectionCard className="text-center">
        <h2 className="mb-2 text-lg font-semibold text-heading">
          Hâlâ yardıma mı ihtiyacınız var?
        </h2>
        <p className="mb-4 text-muted">
          E-posta ile de bize ulaşabilirsiniz; hafta içi 09.00–18.00 arasında
          yanıt veriyoruz.
        </p>
        <a
          href="mailto:destek@tarodan.com"
          className="inline-flex items-center gap-2 font-medium text-primary-600 hover:text-primary-700"
        >
          <EnvelopeIcon className="h-5 w-5" />
          destek@tarodan.com
        </a>
      </SectionCard>
    </DocPage>
  );
}
