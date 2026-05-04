'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguage, Locale, localeNames, localeFlags } from '@/i18n/LanguageContext';
import { GlobeAltIcon, ChevronDownIcon } from '@heroicons/react/24/outline';import { Button } from '@tarodan/ui';


interface LanguageSwitcherProps {
  variant?: 'dropdown' | 'buttons' | 'minimal';
  className?: string;
}

export default function LanguageSwitcher({ variant = 'dropdown', className = '' }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const locales: Locale[] = ['tr', 'en'];

  if (variant === 'buttons') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {locales.map((l) => (
          <Button variant="secondary" key={l}
            onClick={() => setLocale(l)}
            className={`px-2 py-1 text-sm rounded transition-colors ${
              locale === l
                ? 'bg-primary-500 text-inverted'
                : 'text-muted hover:bg-surface-alt'
            }`}>
            {localeFlags[l]} {l.toUpperCase()}
          </Button>
        ))}
      </div>
    );
  }

  if (variant === 'minimal') {
    return (
      <Button variant="secondary" onClick={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
        className={`flex items-center gap-1 text-sm text-muted hover:text-primary-500 transition-colors ${className}`}
        title={t('language.selectLanguage')}>
        <GlobeAltIcon className="w-5 h-5" />
        <span>{locale.toUpperCase()}</span>
      </Button>
    );
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <Button variant="secondary" onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-body hover:bg-surface-alt rounded-lg transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="listbox">
        <GlobeAltIcon className="w-5 h-5" />
        <span className="hidden sm:inline">{localeFlags[locale]} {localeNames[locale]}</span>
        <span className="sm:hidden">{localeFlags[locale]}</span>
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-surface-elevated rounded-lg shadow-lg border border-border py-1 z-50">
          <div className="px-3 py-2 text-xs text-muted border-b">
            {t('language.selectLanguage')}
          </div>
          {locales.map((l) => (
            <Button variant="secondary" key={l}
              onClick={() => {
                setLocale(l);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                locale === l
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-body hover:bg-surface'
              }`}
              role="option"
              aria-selected={locale === l}>
              <span className="text-lg">{localeFlags[l]}</span>
              <span>{localeNames[l]}</span>
              {locale === l && (
                <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
