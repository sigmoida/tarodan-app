/** @format */

import {
	ArrowTrendingUpIcon,
	ShoppingCartIcon,
	CheckBadgeIcon,
} from '@heroicons/react/24/outline';
import { formatTL } from '@/lib/format';
import type { UserStats } from '../_lib/types';

/** The two headline money cards: total earned (sales) + total spent (purchases). */
export default function FinancialCards({ stats }: { stats: UserStats }) {
	return (
		<div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
			<div className='rounded-lg bg-gradient-to-br from-success-500 to-success-600 p-6 text-inverted shadow-lg'>
				<div className='mb-4 flex items-center gap-4'>
					<div className='rounded-xl bg-surface-elevated/20 p-3'>
						<ArrowTrendingUpIcon className='h-8 w-8' />
					</div>
					<div>
						<p className='text-success-100'>Toplam Kazanç</p>
						<p className='text-4xl font-bold'>{formatTL(stats.totalRevenue)}</p>
					</div>
				</div>
				<div className='flex items-center gap-2 text-sm text-success-100'>
					<CheckBadgeIcon className='h-5 w-5' />
					<span>{stats.salesCount} satıştan</span>
				</div>
			</div>

			<div className='rounded-lg bg-gradient-to-br from-primary-500 to-warning-500 p-6 text-inverted shadow-lg'>
				<div className='mb-4 flex items-center gap-4'>
					<div className='rounded-xl bg-surface-elevated/20 p-3'>
						<ShoppingCartIcon className='h-8 w-8' />
					</div>
					<div>
						<p className='text-primary-100'>Toplam Harcama</p>
						<p className='text-4xl font-bold'>{formatTL(stats.totalSpent)}</p>
					</div>
				</div>
				<div className='flex items-center gap-2 text-sm text-primary-100'>
					<CheckBadgeIcon className='h-5 w-5' />
					<span>{stats.purchasesCount} siparişten</span>
				</div>
			</div>
		</div>
	);
}
