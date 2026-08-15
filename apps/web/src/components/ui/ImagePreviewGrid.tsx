/** @format */

"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowPathIcon,
  Bars3Icon,
  StarIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Button, IconButton } from "@tarodan/ui";
import {
  coverIndexOf,
  type ListingImageItem,
} from "@/components/listings/form/listing-image-item";
import { imagePlaceholder } from "@/lib/placeholder";

export interface ImagePreviewGridProps {
  /** Görseller — EKRANDAKİ sırayla. İlk kalem kapak görselidir. */
  items: ListingImageItem[];
  /** Kalemi kimliğinden kaldır (indeksten DEĞİL). */
  onRemove: (clientId: string) => void;
  /** Hata alan kalemi yeniden dene. */
  onRetry?: (clientId: string) => void;
  /** Sıralama — verilmezse ızgara salt-okunur olur. */
  onMove?: (from: number, to: number) => void;
  /** Kalemi kapak yap (listenin başına al). */
  onMakeCover?: (index: number) => void;
  className?: string;
}

const FALLBACK = imagePlaceholder("200x200");

/**
 * Yüklenen görsellerin ızgarası: her kalem KENDİ durumunu gösterir, sıra
 * sürükleyerek ya da KLAVYEYLE değiştirilebilir.
 *
 * React anahtarı `clientId`dir: indeks anahtarı, aradan bir görsel silindiğinde
 * ya da sıra değiştiğinde React'in yanlış düğümü yeniden kullanmasına ve
 * önizlemenin başka bir görseli göstermesine yol açıyordu.
 *
 * Kapak görseli için ayrı bir alan YOKTUR: listenin ilk kalemi kapaktır ve sıra
 * zaten `sortOrder` ile saklanır. İkinci bir kaynak tutmak, ikisinin ayrışması
 * demekti.
 */
export default function ImagePreviewGrid({
  items,
  onRemove,
  onRetry,
  onMove,
  onMakeCover,
  className = "",
}: ImagePreviewGridProps) {
  const t = useTranslations();

  // Pointer sensörü fare ve DOKUNMAYI birlikte karşılar; klavye sensörü ok
  // tuşlarıyla taşımayı sağlar (native HTML5 drag ikisini de vermiyordu).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (items.length === 0) return null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onMove) return;
    const from = items.findIndex((item) => item.clientId === active.id);
    const to = items.findIndex((item) => item.clientId === over.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  };

  const grid =
    `grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 ${className}`.trim();

  // Kapak listenin ilk YÜKLENMİŞ kalemidir; hata almış bir görsel kapak
  // etiketi almaz (forma zaten yazılmıyor).
  const coverIndex = coverIndexOf(items);

  const tiles = items.map((item, index) => (
    <SortableTile
      key={item.clientId}
      item={item}
      index={index}
      isCover={index === coverIndex}
      sortable={!!onMove}
      onRemove={onRemove}
      onRetry={onRetry}
      onMakeCover={onMakeCover}
    />
  ));

  if (!onMove) return <div className={grid}>{tiles}</div>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) =>
            t("product.imageGrid.dragStart", { name: String(active.id) }),
          onDragOver: ({ over }) =>
            over
              ? t("product.imageGrid.dragOver", { name: String(over.id) })
              : "",
          onDragEnd: ({ over }) =>
            over
              ? t("product.imageGrid.dragEnd", { name: String(over.id) })
              : t("product.imageGrid.dragCancel"),
          onDragCancel: () => t("product.imageGrid.dragCancel"),
        },
      }}
    >
      <SortableContext
        items={items.map((item) => item.clientId)}
        strategy={rectSortingStrategy}
      >
        <div className={grid}>{tiles}</div>
      </SortableContext>
    </DndContext>
  );
}

function SortableTile({
  item,
  index,
  isCover,
  sortable,
  onRemove,
  onRetry,
  onMakeCover,
}: {
  item: ListingImageItem;
  index: number;
  isCover: boolean;
  sortable: boolean;
  onRemove: (clientId: string) => void;
  onRetry?: (clientId: string) => void;
  onMakeCover?: (index: number) => void;
}) {
  const t = useTranslations();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.clientId, disabled: !sortable });

  const isBusy =
    item.status === "queued" ||
    item.status === "uploading" ||
    item.status === "processing";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="listing-image-tile"
      data-status={item.status}
      data-cover={isCover || undefined}
      className={`group relative aspect-square overflow-hidden rounded-lg border bg-surface ${
        item.status === "failed" ? "border-danger-300" : "border-border"
      } ${isDragging ? "z-10 opacity-80 ring-2 ring-primary-400" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt={t("product.imageGrid.alt", { index: index + 1 })}
        className={`h-full w-full object-cover ${isBusy ? "opacity-60" : ""}`}
        onError={(e) => {
          (e.target as HTMLImageElement).src = FALLBACK;
        }}
      />

      {isCover ? (
        <span
          data-testid="listing-image-cover-badge"
          className="absolute left-1.5 top-1.5 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-medium text-inverted shadow-sm"
        >
          {t("product.imageGrid.cover")}
        </span>
      ) : (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-surface-elevated/90 px-1.5 py-0.5 text-[10px] font-medium text-muted ring-1 ring-border">
          {index + 1}
        </span>
      )}

      {sortable && (
        <IconButton
          variant="ghost"
          size="xs"
          aria-label={t("product.imageGrid.reorder", { index: index + 1 })}
          className="absolute bottom-1.5 left-1.5 cursor-grab touch-none rounded-full bg-surface-elevated/90 text-muted shadow-sm ring-1 ring-border backdrop-blur-sm active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <Bars3Icon className="h-4 w-4" />
        </IconButton>
      )}

      {!isCover && onMakeCover && item.status === "uploaded" && (
        <IconButton
          variant="ghost"
          size="xs"
          onClick={() => onMakeCover(index)}
          aria-label={t("product.imageGrid.makeCover", { index: index + 1 })}
          className="absolute bottom-1.5 right-1.5 rounded-full bg-surface-elevated/90 text-muted shadow-sm ring-1 ring-border backdrop-blur-sm hover:bg-primary-500 hover:text-inverted opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        >
          <StarIcon className="h-4 w-4" />
        </IconButton>
      )}

      {/* Bayt aktarımı: gerçek yüzde. Aktarım bitip yanıt beklenirken sunucu
          tarafı (moderasyon, dönüştürme, depolama) sürüyor; sahte bir yüzde
          yerine "İşleniyor" yazılır. */}
      {isBusy && (
        <div className="absolute inset-x-0 bottom-0 bg-surface-elevated/90 px-1.5 py-1 backdrop-blur-sm">
          <p className="text-[10px] font-medium text-body">
            {item.status === "processing"
              ? t("product.imageGrid.processing")
              : item.status === "queued"
                ? t("product.imageGrid.queued")
                : t("product.imageGrid.uploadingPercent", {
                    percent: item.progress,
                  })}
          </p>
          <div
            className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-alt"
            role="progressbar"
            aria-valuenow={item.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("product.imageGrid.uploadingAria", {
              index: index + 1,
            })}
          >
            <div
              className={`h-full bg-primary-500 transition-[width] ${
                item.status === "processing" ? "animate-pulse" : ""
              }`}
              style={{ width: `${item.progress}%` }}
            />
          </div>
        </div>
      )}

      {item.status === "failed" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-danger-50/90 p-1 text-center">
          <p className="text-[10px] leading-tight text-danger-700">
            {item.error ?? t("product.imageGrid.failed")}
          </p>
          {onRetry && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRetry(item.clientId)}
              className="px-2 py-0.5 text-[10px]"
            >
              <ArrowPathIcon className="mr-1 h-3 w-3" />
              {t("common.tryAgain")}
            </Button>
          )}
        </div>
      )}

      <IconButton
        variant="ghost"
        size="xs"
        onClick={() => onRemove(item.clientId)}
        aria-label={t("product.imageGrid.remove", { index: index + 1 })}
        className="absolute right-1.5 top-1.5 rounded-full bg-surface-elevated/90 text-muted shadow-sm ring-1 ring-border backdrop-blur-sm hover:bg-danger-500 hover:text-inverted opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        <XMarkIcon className="h-4 w-4" />
      </IconButton>
    </div>
  );
}
