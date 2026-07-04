'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Owns the account dropdown state: open/close, the container ref used for the
 * outside-click close, and the hover-leave grace timer so the panel doesn't
 * snap shut while the pointer travels between trigger and menu.
 */
export function useAccountDropdown() {
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);
  const accountDropdownLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseEnter = () => {
    if (accountDropdownLeaveTimer.current) {
      clearTimeout(accountDropdownLeaveTimer.current);
      accountDropdownLeaveTimer.current = null;
    }
    setShowAccountDropdown(true);
  };

  const handleMouseLeave = () => {
    accountDropdownLeaveTimer.current = setTimeout(() => setShowAccountDropdown(false), 150);
  };

  return {
    accountDropdownRef,
    showAccountDropdown,
    setShowAccountDropdown,
    handleMouseEnter,
    handleMouseLeave,
  };
}
