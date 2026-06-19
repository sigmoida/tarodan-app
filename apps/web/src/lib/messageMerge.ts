export interface HasIdAndTime {
  id: string;
  createdAt: string | Date;
}

const time = (v: string | Date): number => new Date(v).getTime();

export function mergeMessages<T extends HasIdAndTime>(existing: T[], incoming: T): T[] {
  if (existing.some((m) => m.id === incoming.id)) return existing;
  const next = [...existing, incoming];
  next.sort((a, b) => time(a.createdAt) - time(b.createdAt));
  return next;
}
