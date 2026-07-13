/** Sohbet zaman damgası — bugün saat, dün "Dün", <7g gün adı, aksi tarih. */
export const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Dün';
  } else if (days < 7) {
    return date.toLocaleDateString('tr-TR', { weekday: 'short' });
  }
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};
