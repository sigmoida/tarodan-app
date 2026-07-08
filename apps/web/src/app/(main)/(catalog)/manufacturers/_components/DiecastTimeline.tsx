/** @format */

import { Badge } from '@tarodan/ui';
import SectionCard from '@/components/ui/SectionCard';
import { DIECAST_TIMELINE } from '../_lib/brands-data';

export default function DiecastTimeline() {
	return (
		<SectionCard title='Diecast Tarihi' headerClassName='mb-1'>
			<p className='text-sm text-muted mb-8'>
				Model araba dünyasını şekillendiren kilometre taşları
			</p>

			<div className='relative'>
				<div className='absolute left-[18px] top-0 bottom-0 w-px bg-border-subtle' />
				<div className='space-y-6'>
					{DIECAST_TIMELINE.map((item) => (
						<div
							key={item.year}
							className='flex gap-4 pl-0'>
							<div className='relative flex-shrink-0'>
								<div className='w-[37px] h-[37px] bg-surface-elevated border-2 border-border flex items-center justify-center z-10 relative rounded'>
									<div className='w-2.5 h-2.5 bg-primary-500 rounded-sm' />
								</div>
							</div>
							<div className='pb-1 pt-1'>
								<div className='flex items-center gap-2 mb-1'>
									<Badge variant='primary' size='sm'>
										{item.year}
									</Badge>
									<span className='text-sm font-bold text-heading'>
										{item.event}
									</span>
								</div>
								<p className='text-sm text-muted leading-relaxed'>
									{item.detail}
								</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</SectionCard>
	);
}
