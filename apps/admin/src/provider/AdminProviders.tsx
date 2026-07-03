import { QueryProvider } from '@/provider/QueryProvider';
import { ConfirmProvider } from '@/provider/ConfirmProvider';
import { PromptProvider } from '@/provider/PromptProvider';

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
