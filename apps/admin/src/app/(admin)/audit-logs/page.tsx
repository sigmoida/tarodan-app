import { redirect } from 'next/navigation';

export default function AuditLogsRedirect() {
    redirect('/system/logs');
}
