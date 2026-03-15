'use client';

import { useRef, useEffect, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/solid';

export interface SimpleDropdownOption {
  value: string;
  label: string;
}

interface SimpleDropdownProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SimpleDropdownOption[];
  placeholder: string;
  disabled?: boolean;
  /** Optional class for the trigger (e.g. edit page uses py-3 rounded-xl) */
  triggerClassName?: string;
}

/**
 * Custom dropdown with div + list (no native select). Ensures options are always
 * visible with white background and dark text on all systems/themes.
 */
export function SimpleDropdown({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  triggerClassName,
}: SimpleDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayLabel = value ? options.find((o) => o.value === value)?.label : null;
  const baseTriggerClass =
    'w-full px-4 py-2.5 border border-gray-200 rounded text-left flex items-center justify-between gap-2 text-gray-900 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed';

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={triggerClassName ? `${baseTriggerClass} ${triggerClassName}` : baseTriggerClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className={displayLabel ? 'text-gray-900' : 'text-gray-500'}>
          {displayLabel || placeholder}
        </span>
        <ChevronDownIcon className={`h-4 w-4 text-gray-500 shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute z-[100] mt-1 w-full max-h-[280px] overflow-auto rounded border border-gray-200 bg-white shadow-lg py-1"
          role="listbox"
        >
          {options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">{placeholder}</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={value === opt.value}
                onClick={() => {
                  onValueChange(opt.value);
                  setOpen(false);
                }}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 bg-white hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
