import { useState } from 'react';
import { Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { elogoInvoicesApi, sellerInvoiceApi } from '@/lib/api';
import { qk } from '@/lib/query';

type Notify = (message: string, variant: 'success' | 'danger' | 'default') => void;

/** eLogo e-Arşiv + kurumsal satıcı faturası query'leri + görüntüleme handler'ları. */
export function useOrderInvoices(id: string, orderStatus: string | undefined, notify: Notify) {
  const invoiceEnabled =
    !!id &&
    !!orderStatus &&
    orderStatus !== 'pending' &&
    orderStatus !== 'cancelled' &&
    orderStatus !== 'refunded';

  const { data: elogoInvoice } = useQuery({
    queryKey: qk.orders.elogoInvoice(id),
    enabled: invoiceEnabled,
    queryFn: async () => {
      try {
        const res = await elogoInvoicesApi.byOrder(id);
        return res.data ?? null;
      } catch {
        return null;
      }
    },
  });

  const { data: sellerInvoice } = useQuery({
    queryKey: qk.orders.sellerInvoice(id),
    enabled: invoiceEnabled,
    queryFn: async () => {
      try {
        const res = await sellerInvoiceApi.status(id);
        return res.data ?? null;
      } catch {
        return null;
      }
    },
  });

  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const viewInvoice = async () => {
    if (!elogoInvoice?.id) return;
    setDownloadingInvoice(true);
    try {
      const res = await elogoInvoicesApi.pdf(elogoInvoice.id);
      const url = res.data?.url;
      if (url) await Linking.openURL(url);
      else notify('Fatura henüz hazır değil', 'danger');
    } catch {
      notify('Fatura açılamadı', 'danger');
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const [downloadingSellerInvoice, setDownloadingSellerInvoice] = useState(false);
  const viewSellerInvoice = async () => {
    setDownloadingSellerInvoice(true);
    try {
      const res = await sellerInvoiceApi.download(id);
      const url = res.data?.url;
      if (url) await Linking.openURL(url);
      else notify('Fatura bulunamadı', 'danger');
    } catch {
      notify('Fatura açılamadı', 'danger');
    } finally {
      setDownloadingSellerInvoice(false);
    }
  };

  return {
    elogoInvoice,
    sellerInvoice,
    viewInvoice,
    downloadingInvoice,
    viewSellerInvoice,
    downloadingSellerInvoice,
  };
}
