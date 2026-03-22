/**
 * Human-readable message from NestJS / axios error bodies (validation arrays, etc.).
 */
export function formatApiErrorMessage(err: unknown, fallback = 'Bir hata oluştu.'): string {
  const ax = err as {
    response?: { data?: { message?: unknown; error?: unknown; statusCode?: number } };
    message?: string;
  };
  const data = ax?.response?.data;
  if (!data) {
    if (typeof ax?.message === 'string' && ax.message) return ax.message;
    return fallback;
  }

  const { message, error } = data;

  if (typeof message === 'string' && message.trim()) return message.trim();

  if (Array.isArray(message)) {
    const parts = message.map((m: unknown) => {
      if (typeof m === 'string') return m;
      if (m && typeof m === 'object' && 'constraints' in m) {
        const c = (m as { constraints?: Record<string, string> }).constraints;
        if (c && typeof c === 'object') return Object.values(c).join(', ');
      }
      if (m && typeof m === 'object' && 'message' in m && typeof (m as { message: string }).message === 'string') {
        return (m as { message: string }).message;
      }
      return '';
    });
    const joined = parts.filter(Boolean).join(' ').trim();
    if (joined) return joined;
  }

  if (error != null && String(error).trim()) return String(error).trim();

  if (typeof data.statusCode === 'number') {
    return `${fallback} (${data.statusCode})`;
  }

  return fallback;
}
