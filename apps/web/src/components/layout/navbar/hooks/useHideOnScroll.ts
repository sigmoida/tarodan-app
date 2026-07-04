'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Hide-on-scroll behavior for the sticky navbar: hides the bar when scrolling
 * down past 80px and reveals it when scrolling up.
 */
export function useHideOnScroll() {
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setNavHidden(y > lastScrollY.current && y > 80);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return navHidden;
}
