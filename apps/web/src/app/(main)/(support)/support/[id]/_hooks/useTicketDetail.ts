'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useZodForm } from '@tarodan/ui/form';
import { useAuthStore } from '@/stores/authStore';
import { supportApi } from '@/lib/api';
import { replySchema, type ReplyValues } from '../../_lib/schema';
import type { TicketDetail } from '../../_lib/data';

/** Support ticket detail — the ticket query + the reply RHF/zod form & mutation. */
export function useTicketDetail() {
	const params = useParams();
	const router = useRouter();
	const ticketId = params.id as string;
	const { isAuthenticated, isLoading: authLoading } = useAuthStore();
	const queryClient = useQueryClient();

	useEffect(() => {
		if (authLoading) return;
		if (!isAuthenticated) router.push(`/login?redirect=/support/${ticketId}`);
	}, [authLoading, isAuthenticated, ticketId, router]);

	const ticketQuery = useQuery({
		queryKey: ['support-ticket', ticketId],
		queryFn: async (): Promise<TicketDetail> =>
			(await supportApi.getTicket(ticketId)).data,
		enabled: !authLoading && isAuthenticated && !!ticketId,
		meta: { page: 'support-ticket' },
	});

	useEffect(() => {
		if (ticketQuery.isError) {
			toast.error(
				(ticketQuery.error as any)?.response?.data?.message ||
					'Destek talebi yüklenemedi',
			);
			router.push('/support');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketQuery.isError]);

	const form = useZodForm(replySchema, { defaultValues: { reply: '' } });

	const reply = useMutation({
		mutationFn: (values: ReplyValues) =>
			supportApi.addMessage(ticketId, { content: values.reply.trim() }),
		onSuccess: () => {
			form.reset({ reply: '' });
			queryClient.invalidateQueries({ queryKey: ['support-ticket', ticketId] });
		},
		onError: (error: any) =>
			toast.error(
				error?.response?.data?.message ||
					'Mesaj gönderilemedi. Lütfen tekrar deneyin.',
			),
	});

	return {
		ticket: ticketQuery.data ?? null,
		loading: ticketQuery.isLoading || authLoading,
		form,
		onSubmit: (values: ReplyValues) => reply.mutate(values),
		isSending: reply.isPending,
	};
}
