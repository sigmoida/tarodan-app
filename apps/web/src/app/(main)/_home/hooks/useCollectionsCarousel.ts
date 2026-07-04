"use client";

import { useEffect, useState } from "react";

export function useCollectionsCarousel(count: number) {
  const [currentCollectionIndex, setCurrentCollectionIndex] = useState(0);

  useEffect(() => {
    if (count <= 1) return;
    const interval = setInterval(() => {
      setCurrentCollectionIndex((prev) => (prev + 1) % count);
    }, 10000);
    return () => clearInterval(interval);
  }, [count]);

  const next = () => {
    if (count > 0) setCurrentCollectionIndex((prev) => (prev + 1) % count);
  };
  const prev = () => {
    if (count > 0)
      setCurrentCollectionIndex((p) => (p - 1 + count) % count);
  };
  const goTo = (index: number) => setCurrentCollectionIndex(index);

  return { currentCollectionIndex, next, prev, goTo };
}
