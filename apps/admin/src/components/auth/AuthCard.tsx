/** @format */

import { Card, CardContent, CardHeader, CardTitle } from '@tarodan/ui';

interface AuthCardProps {
	title: string;
	children: React.ReactNode;
}

/**
 * Titled card shell for auth forms. Thin wrapper over the design-system Card
 * so login / forgot-password share the same frame without duplicating markup.
 */
export function AuthCard({ title, children }: AuthCardProps) {
	return (
		<Card className='bg-surface-alt'>
			<CardHeader>
				<CardTitle className='text-2xl'>{title}</CardTitle>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}
