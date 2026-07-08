/** @format */

'use client';

import { Select } from '@tarodan/ui';
import { type LogTab } from '../_lib/types';

const OPTIONS = {
	errorSeverity: [
		{ value: 'all', label: 'Tüm Seviyeler' },
		{ value: 'critical', label: 'Kritik' },
		{ value: 'error', label: 'Hata' },
		{ value: 'warning', label: 'Uyarı' },
		{ value: 'low', label: 'Düşük' },
	],
	securitySeverity: [
		{ value: 'all', label: 'Tüm Seviyeler' },
		{ value: 'critical', label: 'Kritik' },
		{ value: 'high', label: 'Yüksek' },
		{ value: 'medium', label: 'Orta' },
		{ value: 'low', label: 'Düşük' },
	],
	resolved: [
		{ value: 'all', label: 'Tüm Durumlar' },
		{ value: 'false', label: 'Bekleyenler' },
		{ value: 'true', label: 'Çözülenler' },
	],
	emailStatus: [
		{ value: 'all', label: 'Tüm Durumlar' },
		{ value: 'sent', label: 'Gönderildi' },
		{ value: 'delivered', label: 'Teslim Edildi' },
		{ value: 'queued', label: 'Kuyrukta' },
		{ value: 'bounced', label: 'Geri Döndü' },
		{ value: 'failed', label: 'Başarısız' },
	],
	emailTemplate: [
		{ value: 'all', label: 'Tüm Şablonlar' },
		{ value: 'welcome', label: 'Hoş Geldiniz' },
		{ value: 'password_reset', label: 'Şifre Sıfırlama' },
		{ value: 'order_confirmation', label: 'Sipariş Onayı' },
		{ value: 'shipping_update', label: 'Kargo Güncelleme' },
	],
	auditAction: [
		{ value: '', label: 'Tüm İşlemler' },
		{ value: 'user_ban', label: 'Kullanıcı Banlandı' },
		{ value: 'user_unban', label: 'Ban Kaldırıldı' },
		{ value: 'product_approve', label: 'Ürün Onaylandı' },
		{ value: 'product_reject', label: 'Ürün Reddedildi' },
		{ value: 'product_delete', label: 'Ürün Silindi' },
		{ value: 'order_update', label: 'Sipariş Güncellendi' },
		{ value: 'payment_refund', label: 'Ödeme İadesi' },
	],
	auditEntity: [
		{ value: '', label: 'Tüm Kayıt Tipleri' },
		{ value: 'User', label: 'Kullanıcı' },
		{ value: 'Product', label: 'Ürün' },
		{ value: 'Order', label: 'Sipariş' },
		{ value: 'Payment', label: 'Ödeme' },
	],
};

export function LogsFilters({
	tab,
	filters,
	setFilter,
}: {
	tab: LogTab;
	filters: Record<string, string>;
	setFilter: (name: string, value: string) => void;
}) {
	const sel = (
		name: string,
		options: { value: string; label: string }[],
		fallback: string,
		className: string,
	) => (
		<Select
			value={filters[name] ?? fallback}
			onChange={(e) => setFilter(name, e.target.value)}
			options={options}
			className={className}
		/>
	);

	if (tab === 'errors')
		return sel('severity', OPTIONS.errorSeverity, 'all', 'sm:w-48');
	if (tab === 'security')
		return (
			<>
				{sel('severity', OPTIONS.securitySeverity, 'all', 'sm:w-48')}
				{sel('resolved', OPTIONS.resolved, 'all', 'sm:w-44')}
			</>
		);
	if (tab === 'emails')
		return (
			<>
				{sel('status', OPTIONS.emailStatus, 'all', 'sm:w-48')}
				{sel('template', OPTIONS.emailTemplate, 'all', 'sm:w-48')}
			</>
		);
	return (
		<>
			{sel('action', OPTIONS.auditAction, '', 'sm:w-52')}
			{sel('entityType', OPTIONS.auditEntity, '', 'sm:w-44')}
		</>
	);
}
