/** @format */

import { PageShell } from '@/components/layout/PageShell';
import { Container } from '@/components/layout/Container';
import { SectionCard } from '@/components/ui';

export default function CartSkeleton() {
	return (
		<PageShell>
			<Container className='px-4 py-5'>
				<div className='animate-pulse space-y-4'>
					{[...Array(3)].map((_, i) => (
						<SectionCard key={i} className='p-4 flex gap-4'>
							<div className='w-24 h-24 bg-border-subtle rounded-lg' />
							<div className='flex-1 space-y-2'>
								<div className='h-5 bg-border-subtle rounded w-3/4' />
								<div className='h-4 bg-border-subtle rounded w-1/2' />
								<div className='h-6 bg-border-subtle rounded w-1/4' />
							</div>
						</SectionCard>
					))}
				</div>
			</Container>
		</PageShell>
	);
}
