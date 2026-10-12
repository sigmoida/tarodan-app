/** Bağlantı: mutlak `http(s)://…` ya da site-içi `/yol` (`//` ve `/\` hariç). Boş geçerli. */
export const isValidLink = (v?: string | null): boolean => {
  const s = (v ?? "").trim();
  if (!s) return true;
  return /^https?:\/\/\S+$/i.test(s) || /^\/(?![/\\])\S*$/.test(s);
};
