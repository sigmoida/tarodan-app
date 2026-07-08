/** @format */

const SOCIAL = [
	{ name: 'Twitter', href: '#', icon: 'X' },
	{ name: 'Instagram', href: '#', icon: 'IG' },
	{ name: 'Facebook', href: '#', icon: 'f' },
];

export default function SocialLinks({ title }: { title?: string }) {
	return (
		<div>
			{title && <p className='mb-2 text-sm font-medium text-body'>{title}</p>}
			<div className='flex justify-center gap-3'>
				{SOCIAL.map((s) => (
					<a
						key={s.name}
						href={s.href}
						aria-label={s.name}
						className='flex h-10 w-10 items-center justify-center rounded-full bg-surface-alt text-sm font-medium text-body transition-colors hover:bg-primary-500 hover:text-inverted'>
						{s.icon}
					</a>
				))}
			</div>
		</div>
	);
}
