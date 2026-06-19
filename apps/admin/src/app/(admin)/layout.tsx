import AdminLayout from '@/components/AdminLayout';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import { QueryProvider } from '@/components/QueryProvider';

export default function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <ConfirmProvider>
        <AdminLayout>{children}</AdminLayout>
      </ConfirmProvider>
    </QueryProvider>
  );
}
