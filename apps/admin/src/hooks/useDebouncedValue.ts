"use client";

import { useEffect, useState } from "react";

/**
 * Değeri `delayMs` sustuktan sonra yansıtır — async arama girdileri için
 * (`useAdminResource`'un liste-içi debounce'unun bağımsız karşılığı).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
