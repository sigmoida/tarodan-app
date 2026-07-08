'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useZodForm } from '@tarodan/ui/form';
import { useAuthStore } from '@/stores/authStore';
import { supportApi } from '@/lib/api';
import { ticketSchema, type TicketValues } from '../_lib/schema';
import type { Ticket } from '../_lib/data';

/**
 * Support center — my-tickets query + create-ticket RHF/zod form & mutation.
 * A `?orderId` in the URL (order → "report issue") prefills and opens the form.
 */
export function useSupport() {
	const { isAuthenticated, isLoading: authLoading } = useAuthStore();
	const queryClient = useQueryClient();
	const [showForm, setShowForm] = useState(false);
	const [orderId, setOrderId] = useState<string | undefined>();

	const form = useZodForm(ticketSchema, {
		defaultValues: { category: '', subject: '', message: '' },
	});

	useEffect(() => {
		const oid =
			new URLSearchParams(window.location.search).get('orderId') || undefined;
		if (!oid) return;
		setOrderId(oid);
		setShowForm(true);
		form.reset({
			category: 'shipping',
			subject: `Sipariş sorunu (#${oid.slice(0, 8)})`,
			message: '',
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const ticketsQuery = useQuery({
		queryKey: ['support-tickets'],
		queryFn: async (): Promise<Ticket[]> => {
			const res = await supportApi.getMyTickets({ page: 1, pageSize: 10 });
			const data: any = res.data;
			return (
				data?.tickets || data?.data || (Array.isArray(data) ? data : [])
			);
		},
		enabled: !authLoading && isAuthenticated,
		meta: { page: 'support-tickets' },
	});

	const create = useMutation({
		mutationFn: (values: TicketValues) =>
			supportApi.createTicket({
				subject: values.subject.trim(),
				category: values.category,
				message: values.message.trim(),
				...(orderId ? { orderId } : {}),
			}),
		onSuccess: () => {
			toast.success(
				'Destek talebiniz oluşturuldu. En kısa sürede dönüş yapacağız.',
			);
			form.reset({ category: '', subject: '', message: '' });
			setOrderId(undefined);
			setShowForm(false);
			queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
		},
		onError: (error: any) =>
			toast.error(
				error?.response?.data?.message ||
					'Talep oluşturulamadı. Lütfen tekrar deneyin.',
			),
	});

	return {
		isAuthenticated,
		authLoading,
		tickets: ticketsQuery.data ?? [],
		ticketsLoading: ticketsQuery.isLoading,
		showForm,
		setShowForm,
		form,
		onSubmit: (values: TicketValues) => create.mutate(values),
		isSubmitting: create.isPending,
	};
}
