'use client';

import { useState } from 'react';

/** Mobile sidebar open/close state (drawer is always visible on lg+). */
export function useSidebar() {
  const [open, setOpen] = useState(false);
  return {
    open,
    openSidebar: () => setOpen(true),
    closeSidebar: () => setOpen(false),
  };
}
