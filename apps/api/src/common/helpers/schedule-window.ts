/**
 * Yayın penceresi — TEK kural. Admin'in zamanladığı vitrin içerikleri
 * (reklam, hero slaytı) "şu an pencerenin içinde mi" sorusunu buradan sorar;
 * iki modülde ayrı yazılan sınır kuralı (dahil mi, hariç mi) ayrışırdı.
 *
 * null uç = sınırsız. Sınırlar DAHİL: başlangıç anında ve bitiş anında içerik
 * yayındadır.
 */
export function withinScheduleWindow(
  now: Date,
  start: Date | null,
  end: Date | null,
): boolean {
  if (start && start.getTime() > now.getTime()) return false;
  if (end && end.getTime() < now.getTime()) return false;
  return true;
}

/**
 * Aynı kuralın veritabanı süzmesi (`startDate` / `endDate` kolonlu her model
 * için `AND` listesi). Yalnız daraltma içindir; otorite `withinScheduleWindow`.
 */
export function scheduleWindowWhere(now: Date) {
  return [
    { OR: [{ startDate: null }, { startDate: { lte: now } }] },
    { OR: [{ endDate: null }, { endDate: { gte: now } }] },
  ];
}
