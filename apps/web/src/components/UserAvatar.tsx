'use client';

import { useState } from 'react';

function getInitials(displayName: string | null | undefined, companyName?: string | null): string {
  if (companyName?.trim()) {
    const parts = companyName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return companyName.trim().slice(0, 2).toUpperCase();
  }
  if (!displayName?.trim()) return '?';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return displayName.trim().slice(0, 2).toUpperCase();
}

function isValidUrl(src: unknown): boolean {
  if (!src || typeof src !== 'string') return false;
  return src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/') || src.startsWith('blob:');
}

export interface UserAvatarProps {
  displayName?: string | null;
  companyName?: string | null;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-10 h-10 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-24 h-24 md:w-28 md:h-28 text-4xl',
};

export default function UserAvatar({
  displayName,
  companyName,
  avatarUrl,
  size = 'md',
  className = '',
  ring = false,
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(displayName, companyName);
  const isCompany = Boolean(companyName?.trim());
  const base =
    'rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden';
  const bg = isCompany
    ? 'bg-orange-500/20 text-orange-600'
    : 'bg-primary-500 text-white';
  const ringClass = ring ? 'ring-4 ring-white/30' : '';
  const showImage = isValidUrl(avatarUrl) && !imgError;

  return (
    <div
      className={`${sizeClasses[size]} ${base} ${showImage ? '' : bg} ${ringClass} ${className}`}
      title={displayName || companyName || undefined}
    >
      {showImage ? (
        <img
          src={avatarUrl!}
          alt={displayName || companyName || 'Avatar'}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        isCompany && !displayName ? '🏢' : initials
      )}
    </div>
  );
}
