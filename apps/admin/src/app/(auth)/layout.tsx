/** @format */

import Image from 'next/image';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';

/**
 * Layout for unauthenticated pages (login, forgot-password). Server Component:
 * if a valid session already exists, bounce to the app before rendering.
 * A primary header with the brand on the left + a centered card frame below.
 */
export default async function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	if (session) redirect('/dashboard');

	return (
		<div className='flex min-h-screen flex-col'>
			<header className='flex h-16 items-center bg-primary-500 px-6 shadow-sm'>
				<Image
					src='/tarodan-logo.jpg'
					alt='Tarodan'
					width={120}
					height={40}
					priority
					className='object-contain'
					style={{ width: 'auto', height: 'auto', maxHeight: '40px' }}
				/>
			</header>

			<main className='flex flex-1 items-center justify-center bg-gradient-to-br from-surface via-surface-elevated to-surface-alt px-4 py-10'>
				<div className='w-full max-w-md'>
					{children}

					<p className='mt-6 text-center text-sm text-muted'>
						© 2026 Tarodan Marketplace. Tüm hakları saklıdır.
					</p>
				</div>
			</main>
		</div>
	);
}
