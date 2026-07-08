'use client';

import { useCallback, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/stores/authStore';
import { withChunkErrorLogging } from '@/lib/withChunkErrorLogging';

const AuthRequiredModal = dynamic(
	withChunkErrorLogging(
		() => import('@/components/AuthRequiredModal'),
		'AuthRequiredModal',
	),
	{ ssr: false },
);

export interface AuthGateConfig {
	/** Modal heading. Falls back to the generic "auth required" title. */
	title?: string;
	message: string;
	icon?: ReactNode;
	/** Where to send the user after login/register. Defaults to the current URL. */
	redirectPath?: string;
}

/**
 * The single mechanism for gating an ACTION behind login on a PUBLIC page —
 * favorite / offer / message / follow / like. Owns the shared `AuthRequiredModal`
 * state, trigger and render, replacing the per-surface `useState` +
 * `setShowAuthModal` + local `AuthModalConfig` copies (listings, collections,
 * seller) that had each re-rolled the same wiring with drifting behaviour.
 *
 * This is a UI/render concern, not a security boundary: it reads the client
 * `isAuthenticated` cache only to decide which affordance to show. The real gate
 * is the API, which rejects the mutation when the request carries no session
 * cookie. Server-enforced routes use middleware / `getSession()` instead.
 */
export function useAuthGate() {
	const { isAuthenticated } = useAuthStore();
	const [config, setConfig] = useState<AuthGateConfig | null>(null);

	const close = useCallback(() => setConfig(null), []);

	/**
	 * Run `action` when authed; otherwise open the auth modal with `config`.
	 * Returns `true` when the action ran. Call with just a config to gate an early
	 * return: `if (!requireAuth(cfg)) return;`.
	 */
	const requireAuth = useCallback(
		(cfg: AuthGateConfig, action?: () => void): boolean => {
			if (!isAuthenticated) {
				setConfig(cfg);
				return false;
			}
			action?.();
			return true;
		},
		[isAuthenticated],
	);

	const authModal = config ? (
		<AuthRequiredModal
			isOpen
			onClose={close}
			title={config.title}
			message={config.message}
			icon={config.icon}
			redirectPath={config.redirectPath}
		/>
	) : null;

	return { isAuthenticated, requireAuth, authModal, close };
}
