import { JsonBlock } from "./JsonBlock";
import {
  type ErrorLog,
  type AuditLog,
  actionLabels,
  entityLabels,
} from "../_lib/types";
import { useTranslations } from "next-intl";

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <span className="font-medium text-heading">{label}</span>
      <span className={mono ? "font-mono" : undefined}>{value}</span>
    </>
  );
}

export function ErrorDetail({ log }: { log: ErrorLog }) {
  const t = useTranslations();
  const m = log.metadata;
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-alt p-4 text-sm">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted">
        {log.endpoint && <Field label="Endpoint" value={log.endpoint} mono />}
        {m?.status && (
          <Field
            label={t("admin.system.logs.details.httpStatus")}
            value={m.status}
            mono
          />
        )}
        {m?.name && (
          <Field
            label={t("admin.system.logs.details.errorType")}
            value={m.name}
            mono
          />
        )}
        {log.userId && (
          <Field
            label={t("admin.system.logs.details.userId")}
            value={log.userId}
            mono
          />
        )}
        {/* Korelasyon kimliği: aynı isteğin konsol satırları bu kodla grep'lenir
            ve kullanıcı 500 ekranında aynı kodu görür. */}
        {log.requestId && (
          <Field
            label={t("admin.system.logs.details.requestId")}
            value={log.requestId}
            mono
          />
        )}
        {m?.ip && (
          <Field
            label={t("admin.system.logs.details.ipAddress")}
            value={m.ip}
            mono
          />
        )}
        {m?.userAgent && (
          <>
            <span className="font-medium text-heading">User-Agent</span>
            <span className="break-all font-mono">{m.userAgent}</span>
          </>
        )}
      </div>

      {m?.causes && m.causes.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-heading">
            {t("admin.system.logs.details.errorChain")}
          </p>
          <ol className="list-inside list-decimal space-y-0.5 font-mono text-xs text-danger-600">
            {m.causes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </div>
      )}

      {m?.response && (
        <div>
          <p className="mb-1 font-medium text-heading">
            {t("admin.system.logs.details.response")}
          </p>
          <JsonBlock value={m.response} />
        </div>
      )}

      {m?.body && (
        <div>
          <p className="mb-1 font-medium text-heading">
            {t("admin.system.logs.details.requestBody")}{" "}
            <span className="text-xs font-normal text-muted">
              {t("admin.system.logs.details.sensitiveHidden")}
            </span>
          </p>
          <JsonBlock value={m.body} />
        </div>
      )}

      {log.stackTrace && (
        <div>
          <p className="mb-1 font-medium text-heading">Stack Trace</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface p-2 text-xs text-muted">
            {log.stackTrace}
          </pre>
        </div>
      )}
    </div>
  );
}

export function AuditDetail({ log }: { log: AuditLog }) {
  const t = useTranslations();
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-alt p-4 text-sm">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted">
        <Field label="Admin" value={log.admin?.email ?? log.adminUserId} />
        <Field
          label={t("admin.system.logs.action")}
          value={actionLabels(t)[log.action] ?? log.action}
        />
        <Field
          label={t("admin.system.logs.entityType")}
          value={entityLabels(t)[log.entityType] ?? log.entityType}
        />
        <Field
          label={t("admin.system.logs.details.entityId")}
          value={log.entityId}
          mono
        />
        {/* IP adresi satırı KALDIRILDI: createAuditLog istek bağlamına
            erişemediği için (6 pozisyonel parametre, ~20 servisten çağrılıyor,
            uygulamada CLS yok) bu kolon hiç yazılmıyor ve satır hiç dolmuyordu.
            IP'yi gerçekten kaydetmek ayrı bir iş. */}
      </div>

      {log.oldValue && (
        <div>
          <p className="mb-1 font-medium text-heading">
            {t("admin.system.logs.details.oldValues")}{" "}
            <span className="text-xs font-normal text-muted">
              {t("admin.system.logs.details.sensitiveHidden")}
            </span>
          </p>
          <JsonBlock value={log.oldValue} />
        </div>
      )}

      {log.newValue && (
        <div>
          <p className="mb-1 font-medium text-heading">
            {t("admin.system.logs.details.newValues")}{" "}
            <span className="text-xs font-normal text-muted">
              {t("admin.system.logs.details.sensitiveHidden")}
            </span>
          </p>
          <JsonBlock value={log.newValue} />
        </div>
      )}
    </div>
  );
}
