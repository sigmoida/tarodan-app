"use client";

import { Link } from "@/i18n/navigation";
import {
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
import {
  CATEGORIES,
  STATUS_CONFIG,
  HELP_TOPICS,
  POPULAR_TOPICS,
  categoryLabel,
} from "../_lib/data";
import { useSupport } from "../_hooks/useSupport";

/**
 * Yardım & Destek — tek sayfa. Önce kendine yardım (konu listeleri, popüler
 * sorular), sonra çözülemeyen durum için talep açma ve talep geçmişi. Ayrı bir
 * /help sayfası yok; ikisi aynı kullanıcı yolculuğunun iki adımıydı.
 */
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
  const { setValue, watch, formState, register } = form;
  register("category");
  const category = watch("category");

  return (
    <DocPage
      title="Yardım & Destek"
      description="Önce hazır yanıtlara göz atın; çözemezseniz destek talebi oluşturun."
      actions={
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="secondary" size="sm" href="/faq">
            Sıkça Sorulan Sorular
          </ButtonLink>
          <ButtonLink variant="secondary" size="sm" href="/guides">
            Kullanım Kılavuzları
          </ButtonLink>
          <ButtonLink variant="secondary" size="sm" href="/contact">
            İletişim
          </ButtonLink>
        </div>
      }
    >
      {/* Self-serve: topics + popular questions in one card, no colour blocks */}
      <SectionCard title="Yardım Konuları">
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_TOPICS.map((topic) => (
            <div key={topic.title}>
              <div className="mb-2 flex items-center gap-2">
                <topic.icon className="h-5 w-5 text-muted" />
                <h3 className="font-medium text-heading">{topic.title}</h3>
              </div>
              <ul className="space-y-1.5">
                {topic.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted transition-colors hover:text-primary-600"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Popüler Sorular">
        <ul className="divide-y divide-border-subtle">
          {POPULAR_TOPICS.map((item) => (
            <li key={item.q}>
              <Link
                href={item.href}
                className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface"
              >
                <span className="text-sm text-body">{item.q}</span>
                <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* Ticketing */}
      {!authLoading && !isAuthenticated && (
        <SectionCard className="text-center">
          <LifebuoyIcon className="mx-auto mb-3 h-10 w-10 text-subtle" />
          <h2 className="mb-2 text-lg font-semibold text-heading">
            Destek talebi oluşturmak için giriş yapın
          </h2>
          <p className="mb-5 text-sm text-muted">
            Siparişleriniz, ödemeleriniz veya hesabınızla ilgili talepler için
            giriş yapmanız gerekir. Üye değilseniz iletişim formunu da
            kullanabilirsiniz.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/login?redirect=/support">Giriş Yap</ButtonLink>
            <ButtonLink variant="secondary" href="/contact">
              İletişim Formu
            </ButtonLink>
          </div>
        </SectionCard>
      )}

      {isAuthenticated && (
        <>
          <SectionCard
            title="Destek Talebi"
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
            {showForm ? (
              <Form form={form} onSubmit={onSubmit} className="space-y-5">
                <div>
                  <p className="mb-2 text-sm font-medium text-heading">
                    Kategori
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                        <cat.icon className="h-5 w-5" />
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
            ) : (
              <p className="text-sm text-muted">
                Sorununuzu kategorisiyle birlikte iletin; ekibimiz genellikle 24
                saat içinde yanıt verir.
              </p>
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
        <p className="mb-3 text-sm text-muted">
          Hafta içi 09.00–18.00 arasında e-posta ile de ulaşabilirsiniz.
        </p>
        <a
          href="mailto:destek@tarodan.com.tr"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <EnvelopeIcon className="h-5 w-5" />
          destek@tarodan.com.tr
        </a>
      </SectionCard>
    </DocPage>
  );
}
