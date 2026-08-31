/** @format */

"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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
  ArrowUturnRightIcon,
  Bars3Icon,
  ExclamationTriangleIcon,
  StarIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Button, IconButton } from "@tarodan/ui";
import { imagePlaceholder } from "@tarodan/shared";
import {
  coverIndexOf,
  MIN_RECOMMENDED_DIMENSION,
  type ListingImageItem,
} from "./listing-image-item";
import { canRotateFile } from "./rotate-image";

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
  /**
   * Kalemi 90° çevir. Sunucu EXIF etiketini kendisi uyguluyor; bu, etiketi
   * HİÇ olmayan fotoğraflar (ekran görüntüsü vb.) için kurtarma yoludur.
   */
  onRotate?: (clientId: string) => void;
  /**
   * Izgaranın SONUNA eklenen hücre — tipik olarak "+ Ekle" kutucuğu. Sortable
   * DEĞİLDİR: sıralamaya giren yalnız `items`tir, böylece ızgara ekleme
   * mekanizmasından habersiz kalır.
   */
  trailing?: ReactNode;
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
 * demekti. Kapak karosu 2×2 gösterilir — hangi görselin ilanda görüneceği
 * rozete bakmadan anlaşılsın.
 */
export default function ImagePreviewGrid({
  items,
  onRemove,
  onRetry,
  onMove,
  onMakeCover,
  onRotate,
  trailing,
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

  if (items.length === 0 && !trailing) return null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onMove) return;
    const from = items.findIndex((item) => item.clientId === active.id);
    const to = items.findIndex((item) => item.clientId === over.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  };

  /** Ekran okuyucuya `clientId` değil, kullanıcının gördüğü sıra numarası. */
  const positionOf = (id?: string | number) =>
    items.findIndex((item) => item.clientId === id) + 1;

  const grid =
    `grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-6 ${className}`.trim();

  // Kapak listenin ilk YÜKLENMİŞ kalemidir; hata almış bir görsel kapak
  // etiketi almaz (forma zaten yazılmıyor).
  const coverIndex = coverIndexOf(items);

  const tiles = items.map((item, index) => (
    <SortableTile
      key={item.clientId}
      item={item}
      index={index}
      isCover={index === coverIndex}
      /** Büyük karo yalnız listenin BAŞINDAKİ kapak için — aradaki bir kalem
          büyütülseydi ızgara sırası okunamaz hâle gelirdi. */
      featured={index === coverIndex && index === 0}
      sortable={!!onMove}
      onRemove={onRemove}
      onRetry={onRetry}
      onMakeCover={onMakeCover}
      onRotate={onRotate}
    />
  ));

  if (!onMove) {
    return (
      <div className={grid}>
        {tiles}
        {trailing}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) =>
            t("product.imageUpload.dragStarted", { id: positionOf(active.id) }),
          onDragOver: ({ over }) =>
            over
              ? t("product.imageUpload.dragOver", { id: positionOf(over.id) })
              : "",
          onDragEnd: ({ over }) =>
            over
              ? t("product.imageUpload.dragEnded", { id: positionOf(over.id) })
              : t("product.imageUpload.dragCancelled"),
          onDragCancel: () => t("product.imageUpload.dragCancelled"),
        },
      }}
    >
      <SortableContext
        items={items.map((item) => item.clientId)}
        strategy={rectSortingStrategy}
      >
        <div className={grid}>
          {tiles}
          {trailing}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableTile({
  item,
  index,
  isCover,
  featured,
  sortable,
  onRemove,
  onRetry,
  onMakeCover,
  onRotate,
}: {
  item: ListingImageItem;
  index: number;
  isCover: boolean;
  featured: boolean;
  sortable: boolean;
  onRemove: (clientId: string) => void;
  onRetry?: (clientId: string) => void;
  onMakeCover?: (index: number) => void;
  onRotate?: (clientId: string) => void;
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

  /**
   * Düşük çözünürlük UYARISI — engel değil. Ayrı bir çözüm adımı gerekmez:
   * karodaki `<img>` önizlemeyi zaten yüklüyor, gerçek boyut `onLoad` içinde
   * okunuyor. Yalnız YENİ seçilen dosyalar için: kayıtlı görsellerin önizlemesi
   * sunucunun 500×500 kart türevi, o zaten sınırın üstünde.
   */
  const [lowResolution, setLowResolution] = useState(false);

  const isBusy =
    item.status === "queued" ||
    item.status === "uploading" ||
    item.status === "processing";

  /**
   * Sağ alt şeridin iki düğmesi. Yalnız YÜKLENMİŞ kalemde çıkarlar: yükleme
   * sürerken şeridin yerini ilerleme çubuğu, hatada ise hata katmanı alıyor.
   *
   * Çevirme iki yoldan yapılabilir. YENİ seçilmiş dosyada tarayıcı çevirir —
   * orada GIF elenir, çünkü canvas animasyonu düzleştirir. KAYITLI görselde
   * (düzenleme ekranı) tarayıcıda dosya yoktur; sunucu depodaki türevi çevirir,
   * o yüzden tek şart anahtarın bilinmesidir.
   */
  const canRotate =
    !!onRotate &&
    item.status === "uploaded" &&
    (item.file ? canRotateFile(item.file) : !!item.detailKey);
  const canMakeCover = !!onMakeCover && item.status === "uploaded" && !isCover;

  const label = { index: index + 1 };
  /** Dokunmatikte hover yok: ikonlar mobilde AÇIK, masaüstünde hover ile. */
  const revealOnHover =
    "opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="listing-image-tile"
      data-status={item.status}
      data-cover={isCover || undefined}
      className={`group relative aspect-square overflow-hidden rounded-xl bg-surface ring-1 ${
        featured ? "col-span-2 row-span-2" : ""
      } ${
        item.status === "failed" ? "ring-danger-300" : "ring-border"
      } ${isDragging ? "z-10 opacity-80 ring-2 ring-primary-400" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt={t("product.imageUpload.imageAlt", label)}
        className={`h-full w-full object-cover ${isBusy ? "opacity-60" : ""}`}
        onLoad={(e) => {
          if (!item.file) return;
          const img = e.currentTarget;
          setLowResolution(
            img.naturalWidth > 0 &&
              (img.naturalWidth < MIN_RECOMMENDED_DIMENSION ||
                img.naturalHeight < MIN_RECOMMENDED_DIMENSION),
          );
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).src = FALLBACK;
        }}
      />

      {/* Rozetler görselin üstünde okunabilsin diye üstte ve altta yumuşak
          bir karartma; düz metin açık fotoğrafta kayboluyordu. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-heading/30 to-transparent" />

      {isCover ? (
        <span
          data-testid="listing-image-cover-badge"
          className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-semibold text-inverted shadow-sm"
        >
          <StarSolidIcon className="h-3 w-3" />
          {t("product.imageUpload.cover")}
        </span>
      ) : (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-surface-elevated/90 px-1.5 py-0.5 text-[10px] font-medium text-muted ring-1 ring-border">
          {index + 1}
        </span>
      )}

      {/* Rozet sağ ÜSTTE, kaldır düğmesinin solunda durur: karonun alt şeridi
          tutamak, kapak yap düğmesi ve ilerleme çubuğu tarafından kullanılıyor,
          oraya konan uyarı dokunmatikte kalıcı olarak örtülü kalıyordu. */}
      {lowResolution && !isBusy && item.status !== "failed" && (
        <span
          title={t("product.imageUpload.lowResolutionHint", {
            size: MIN_RECOMMENDED_DIMENSION,
          })}
          className="absolute right-9 top-1.5 inline-flex items-center gap-1 rounded-full bg-warning-100 px-1.5 py-0.5 text-[10px] font-medium text-warning-800 shadow-sm"
        >
          <ExclamationTriangleIcon className="h-3 w-3 flex-none" />
          {/* Dar karoda metin sığmaz; ikon görünür kalır, metni yalnız büyük
              kapak karosu ve ekran okuyucular alır. */}
          <span className={featured ? "" : "sr-only"}>
            {t("product.imageUpload.lowResolution")}
          </span>
        </span>
      )}

      {sortable && (
        <IconButton
          variant="ghost"
          size="xs"
          aria-label={t("product.imageUpload.reorderImage", label)}
          className={`absolute bottom-1.5 left-1.5 cursor-grab touch-none rounded-full bg-surface-elevated/90 text-muted shadow-sm ring-1 ring-border backdrop-blur-sm active:cursor-grabbing ${revealOnHover}`}
          {...attributes}
          {...listeners}
        >
          <Bars3Icon className="h-4 w-4" />
        </IconButton>
      )}

      {/* Karonun sağ ALT şeridi: çevir + kapak yap. Tek tek konumlandırmak
          yerine tek satırda toplanır — biri gizlendiğinde diğerinin yeri
          kaymaz ve konum sınıfı iki kez yazılmaz. */}
      {(canRotate || canMakeCover) && (
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
          {canRotate && (
            <IconButton
              variant="ghost"
              size="xs"
              onClick={() => onRotate?.(item.clientId)}
              aria-label={t("product.imageUpload.rotateImage", label)}
              title={t("product.imageUpload.rotate")}
              className={`rounded-full bg-surface-elevated/90 text-muted shadow-sm ring-1 ring-border backdrop-blur-sm hover:bg-primary-500 hover:text-inverted ${revealOnHover}`}
            >
              <ArrowUturnRightIcon className="h-4 w-4" />
            </IconButton>
          )}

          {canMakeCover && (
            <IconButton
              variant="ghost"
              size="xs"
              onClick={() => onMakeCover?.(index)}
              aria-label={t("product.imageUpload.makeCoverImage", label)}
              className={`rounded-full bg-surface-elevated/90 text-muted shadow-sm ring-1 ring-border backdrop-blur-sm hover:bg-primary-500 hover:text-inverted ${revealOnHover}`}
            >
              <StarIcon className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      )}

      {/* Bayt aktarımı: gerçek yüzde. Aktarım bitip yanıt beklenirken sunucu
          tarafı (moderasyon, dönüştürme, depolama) sürüyor; sahte bir yüzde
          yerine "İşleniyor" yazılır. */}
      {isBusy && (
        <div className="absolute inset-x-0 bottom-0 bg-surface-elevated/90 px-1.5 py-1 backdrop-blur-sm">
          <p className="text-[10px] font-medium text-body">
            {item.status === "processing"
              ? t("product.imageUpload.processing")
              : item.status === "queued"
                ? t("product.imageUpload.queued")
                : t("product.imageUpload.uploadingPercent", {
                    progress: item.progress,
                  })}
          </p>
          <div
            className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-alt"
            role="progressbar"
            aria-valuenow={item.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("product.imageUpload.uploadProgressLabel", label)}
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
            {item.error ?? t("product.imageUpload.failed")}
          </p>
          {onRetry && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRetry(item.clientId)}
              className="px-2 py-0.5 text-[10px]"
            >
              <ArrowPathIcon className="mr-1 h-3 w-3" />
              {t("product.imageUpload.retry")}
            </Button>
          )}
        </div>
      )}

      <IconButton
        variant="ghost"
        size="xs"
        onClick={() => onRemove(item.clientId)}
        aria-label={t("product.imageUpload.removeImage", label)}
        className={`absolute right-1.5 top-1.5 rounded-full bg-surface-elevated/90 text-muted shadow-sm ring-1 ring-border backdrop-blur-sm hover:bg-danger-500 hover:text-inverted ${revealOnHover}`}
      >
        <XMarkIcon className="h-4 w-4" />
      </IconButton>
    </div>
  );
}
