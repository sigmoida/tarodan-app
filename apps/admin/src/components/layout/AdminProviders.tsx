import { QueryProvider } from '@/components/QueryProvider';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import { PromptProvider } from '@/components/PromptProvider';

/** Client-side providers shared across the authenticated app. */
export function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ConfirmProvider>
        <PromptProvider>{children}</PromptProvider>
      </ConfirmProvider>
    </QueryProvider>
  );
}
