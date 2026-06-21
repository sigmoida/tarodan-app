import AdminLayout from '@/components/AdminLayout';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import { PromptProvider } from '@/components/PromptProvider';
import { QueryProvider } from '@/components/QueryProvider';

export default function AdminRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <ConfirmProvider>
        <PromptProvider>
          <AdminLayout>{children}</AdminLayout>
        </PromptProvider>
      </ConfirmProvider>
    </QueryProvider>
  );
}
