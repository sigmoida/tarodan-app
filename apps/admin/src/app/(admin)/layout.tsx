import AdminLayout from '@/components/AdminLayout';
import { ConfirmProvider } from '@/components/ConfirmProvider';

export default function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfirmProvider>
      <AdminLayout>{children}</AdminLayout>
    </ConfirmProvider>
  );
}
