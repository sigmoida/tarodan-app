'use client';

import { useState, useEffect } from 'react';
import {
  Squares2X2Icon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import {
  Squares2X2Icon as GridIconSolid,
  Bars3Icon as ListIconSolid,
} from '@heroicons/react/24/solid';

export type ProductLayout = 'grid-3' | 'grid-4' | 'list';

interface ProductLayoutSelectorProps {
  layout: ProductLayout;
  onLayoutChange: (layout: ProductLayout) => void;
  storageKey?: string; // Optional storage key for persistence
}

export default function ProductLayoutSelector({
  layout,
  onLayoutChange,
  storageKey,
}: ProductLayoutSelectorProps) {
  // Load from localStorage on mount if storageKey is provided
  useEffect(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey) as ProductLayout | null;
      if (saved && ['grid-3', 'grid-4', 'list'].includes(saved)) {
        onLayoutChange(saved);
      }
    }
  }, [storageKey, onLayoutChange]);

  // Save to localStorage when layout changes
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, layout);
    }
  }, [layout, storageKey]);

  const layouts: Array<{ value: ProductLayout; icon: React.ReactNode; label: string }> = [
    {
      value: 'grid-3',
      icon: layout === 'grid-3' ? (
        <GridIconSolid className="w-5 h-5" />
      ) : (
        <Squares2X2Icon className="w-5 h-5" />
      ),
      label: '3\'lü',
    },
    {
      value: 'grid-4',
      icon: layout === 'grid-4' ? (
        <GridIconSolid className="w-5 h-5" />
      ) : (
        <Squares2X2Icon className="w-5 h-5" />
      ),
      label: '4\'lü',
    },
    {
      value: 'list',
      icon: layout === 'list' ? (
        <ListIconSolid className="w-5 h-5" />
      ) : (
        <Bars3Icon className="w-5 h-5" />
      ),
      label: 'Liste',
    },
  ];

  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
      {layouts.map((item) => (
        <button
          key={item.value}
          onClick={() => onLayoutChange(item.value)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-md transition-all ${
            layout === item.value
              ? 'bg-white text-orange-500 shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
          title={item.label}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
