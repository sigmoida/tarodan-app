import type { Message } from '@/stores/messagesStore';

export const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Bugün';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Dün';
  } else {
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  }
};

export const getMessageStatus = (status: Message['status']) => {
  switch (status) {
    case 'sent': return '✓';
    case 'delivered': return '✓✓';
    case 'read': return '✓✓';
    case 'pending_approval': return '⏳';
    case 'rejected': return '❌';
    default: return '';
  }
};

// Mesajları güne göre gruplar (tarih ayracı için).
export function groupMessagesByDate(messages: Message[]): { date: string; messages: Message[] }[] {
  const grouped: { date: string; messages: Message[] }[] = [];
  let currentDate = '';
  messages.forEach((message) => {
    const messageDate = formatDate(message.createdAt);
    if (messageDate !== currentDate) {
      currentDate = messageDate;
      grouped.push({ date: messageDate, messages: [message] });
    } else {
      grouped[grouped.length - 1].messages.push(message);
    }
  });
  return grouped;
}
