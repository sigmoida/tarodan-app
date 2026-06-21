export default function Loading() {
  return (
    <div className="flex flex-1 min-h-[60vh] items-center justify-center">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"
        role="status"
        aria-label="Yükleniyor"
      />
    </div>
  );
}
