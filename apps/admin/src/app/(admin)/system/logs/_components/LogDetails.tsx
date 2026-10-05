import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { JsonBlock } from "./JsonBlock";
import {
  type ErrorLog,
  type AuditLog,
  actionLabels,
  entityLabels,
} from "../_lib/types";
import { useTranslations } from "next-intl";

export function ErrorDetail({ log }: { log: ErrorLog }) {
  const t = useTranslations();
  const m = log.metadata;
  return (
    <Panel tone="muted" className="space-y-3 text-sm">
      <DataList className="gap-y-1">
        {log.endpoint && (
          <Field label="Endpoint" mono>
            {log.endpoint}
          </Field>
        )}
        {m?.status && (
          <Field label={t("admin.system.logs.details.httpStatus")} mono>
            {m.status}
          </Field>
        )}
        {m?.name && (
          <Field label={t("admin.system.logs.details.errorType")} mono>
            {m.name}
          </Field>
        )}
        {log.userId && (
          <Field label={t("admin.system.logs.details.userId")} mono>
            {log.userId}
          </Field>
        )}
        {/* Korelasyon kimliği: aynı isteğin konsol satırları bu kodla grep'lenir
            ve kullanıcı 500 ekranında aynı kodu görür. */}
        {log.requestId && (
          <Field label={t("admin.system.logs.details.requestId")} mono>
            {log.requestId}
          </Field>
        )}
        {m?.ip && (
          <Field label={t("admin.system.logs.details.ipAddress")} mono>
            {m.ip}
          </Field>
        )}
        {m?.userAgent && (
          <Field label="User-Agent" mono>
            <span className="break-all">{m.userAgent}</span>
          </Field>
        )}
      </DataList>

      {m?.causes && m.causes.length > 0 && (
        <div>
          <SectionTitle as="h4" size="sm" className="mb-1">
            {t("admin.system.logs.details.errorChain")}
          </SectionTitle>
          <ol className="list-inside list-decimal space-y-0.5 font-mono text-xs text-danger-600">
            {m.causes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </div>
      )}

      {m?.response && (
        <div>
          <SectionTitle as="h4" size="sm" className="mb-1">
            {t("admin.system.logs.details.response")}
          </SectionTitle>
          <JsonBlock value={m.response} />
        </div>
      )}

      {m?.body && (
        <div>
          <SectionTitle as="h4" size="sm" className="mb-1">
            {t("admin.system.logs.details.requestBody")}{" "}
            <span className="text-xs font-normal text-muted">
              {t("admin.system.logs.details.sensitiveHidden")}
            </span>
          </SectionTitle>
          <JsonBlock value={m.body} />
        </div>
      )}

      {log.stackTrace && (
        <div>
          <SectionTitle as="h4" size="sm" className="mb-1">
            Stack Trace
          </SectionTitle>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface p-2 text-xs text-muted">
            {log.stackTrace}
          </pre>
        </div>
      )}
    </Panel>
  );
}

export function AuditDetail({ log }: { log: AuditLog }) {
  const t = useTranslations();
  return (
    <Panel tone="muted" className="space-y-3 text-sm">
      <DataList className="gap-y-1">
        <Field label="Admin">{log.admin?.email ?? log.adminUserId}</Field>
        <Field label={t("admin.system.logs.action")}>
          {actionLabels(t)[log.action] ?? log.action}
        </Field>
        <Field label={t("admin.system.logs.entityType")}>
          {entityLabels(t)[log.entityType] ?? log.entityType}
        </Field>
        <Field label={t("admin.system.logs.details.entityId")} mono>
          {log.entityId}
        </Field>
        {/* IP adresi satırı KALDIRILDI: createAuditLog istek bağlamına
            erişemediği için (6 pozisyonel parametre, ~20 servisten çağrılıyor,
            uygulamada CLS yok) bu kolon hiç yazılmıyor ve satır hiç dolmuyordu.
            IP'yi gerçekten kaydetmek ayrı bir iş. */}
      </DataList>

      {log.oldValue && (
        <div>
          <SectionTitle as="h4" size="sm" className="mb-1">
            {t("admin.system.logs.details.oldValues")}{" "}
            <span className="text-xs font-normal text-muted">
              {t("admin.system.logs.details.sensitiveHidden")}
            </span>
          </SectionTitle>
          <JsonBlock value={log.oldValue} />
        </div>
      )}

      {log.newValue && (
        <div>
          <SectionTitle as="h4" size="sm" className="mb-1">
            {t("admin.system.logs.details.newValues")}{" "}
            <span className="text-xs font-normal text-muted">
              {t("admin.system.logs.details.sensitiveHidden")}
            </span>
          </SectionTitle>
          <JsonBlock value={log.newValue} />
        </div>
      )}
    </Panel>
  );
}
