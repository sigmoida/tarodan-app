import { JsonBlock } from './JsonBlock';
import { type ErrorLog, type AuditLog, ACTION_LABELS, ENTITY_LABELS } from '../_lib/types';

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <span className="font-medium text-heading">{label}</span>
      <span className={mono ? 'font-mono' : undefined}>{value}</span>
    </>
  );
}

export function ErrorDetail({ log }: { log: ErrorLog }) {
  const m = log.metadata;
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-alt p-4 text-sm">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted">
        {log.endpoint && <Field label="Endpoint" value={log.endpoint} mono />}
        {m?.status && <Field label="HTTP Status" value={m.status} mono />}
        {m?.name && <Field label="Hata Tipi" value={m.name} mono />}
        {log.userId && <Field label="Kullanıcı ID" value={log.userId} mono />}
        {m?.ip && <Field label="IP Adresi" value={m.ip} mono />}
        {m?.userAgent && (
          <>
            <span className="font-medium text-heading">User-Agent</span>
            <span className="break-all font-mono">{m.userAgent}</span>
          </>
        )}
      </div>

      {m?.causes && m.causes.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-heading">Hata Zinciri</p>
          <ol className="list-inside list-decimal space-y-0.5 font-mono text-xs text-danger-600">
            {m.causes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </div>
      )}

      {m?.response && (
        <div>
          <p className="mb-1 font-medium text-heading">Yanıt Detayı</p>
          <JsonBlock value={m.response} />
        </div>
      )}

      {m?.body && (
        <div>
          <p className="mb-1 font-medium text-heading">
            Request Body <span className="text-xs font-normal text-muted">(hassas alanlar gizlenmiştir)</span>
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
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-alt p-4 text-sm">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted">
        <Field label="Admin" value={log.admin?.email ?? log.adminUserId} />
        <Field label="İşlem" value={ACTION_LABELS[log.action] ?? log.action} />
        <Field label="Kayıt Tipi" value={ENTITY_LABELS[log.entityType] ?? log.entityType} />
        <Field label="Kayıt ID" value={log.entityId} mono />
        {log.ipAddress && <Field label="IP Adresi" value={log.ipAddress} mono />}
      </div>

      {log.oldValue && (
        <div>
          <p className="mb-1 font-medium text-heading">
            Eski Değerler <span className="text-xs font-normal text-muted">(hassas alanlar gizlenmiştir)</span>
          </p>
          <JsonBlock value={log.oldValue} />
        </div>
      )}

      {log.newValue && (
        <div>
          <p className="mb-1 font-medium text-heading">
            Yeni Değerler <span className="text-xs font-normal text-muted">(hassas alanlar gizlenmiştir)</span>
          </p>
          <JsonBlock value={log.newValue} />
        </div>
      )}
    </div>
  );
}
