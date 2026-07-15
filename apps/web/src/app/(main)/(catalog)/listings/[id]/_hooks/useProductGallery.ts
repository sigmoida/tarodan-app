/** @format */

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import toast from "react-hot-toast";
import { createTranslator } from "next-intl";
import { getMessages, resolveLocale } from "@tarodan/i18n";

/**
 * All gallery UI state + handlers for the listing detail: the active image, the
 * zoomable/pannable lightbox, the hover magnifier, and the 360° auto-rotate
 * viewer. Kept out of the context file since it's self-contained and heavy.
 */
export function useProductGallery(images: string[], locale: string) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Lightbox
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Magnifier
  const [magnifierPosition, setMagnifierPosition] = useState({ x: 0, y: 0 });
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [imageContainerRef, setImageContainerRef] =
    useState<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const zoomPreviewRef = useRef<HTMLDivElement | null>(null);

  // 360° View
  const [show360Modal, setShow360Modal] = useState(false);
  const [is360Playing, setIs360Playing] = useState(false);
  const [view360Index, setView360Index] = useState(0);
  const rotation360IntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle ESC + arrow keys while the lightbox is open
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isLightboxOpen) {
        setIsLightboxOpen(false);
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLightboxOpen) return;
      if (e.key === "ArrowLeft") {
        setLightboxImageIndex((i) => (i > 0 ? i - 1 : images.length - 1));
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
      } else if (e.key === "ArrowRight") {
        setLightboxImageIndex((i) => (i < images.length - 1 ? i + 1 : 0));
        setZoomLevel(1);
        setPanPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener("keydown", handleEsc);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLightboxOpen, images.length]);

  // Keep the lightbox in sync with the active thumbnail
  useEffect(() => {
    if (isLightboxOpen) setLightboxImageIndex(activeImageIndex);
  }, [isLightboxOpen, activeImageIndex]);

  const openLightbox = (index: number) => {
    setLightboxImageIndex(index);
    setIsLightboxOpen(true);
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const closeLightbox = () => {
    setIsLightboxOpen(false);
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.5, 3));

  const handleZoomOut = () =>
    setZoomLevel((prev) => {
      const newZoom = Math.max(prev - 0.5, 1);
      if (newZoom === 1) setPanPosition({ x: 0, y: 0 });
      return newZoom;
    });

  const handleWheel = (e: ReactWheelEvent) => {
    if (!isLightboxOpen) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoomLevel((prev) => {
      const newZoom = Math.max(1, Math.min(3, prev + delta));
      if (newZoom === 1) setPanPosition({ x: 0, y: 0 });
      return newZoom;
    });
  };

  const handleMouseDown = (e: ReactMouseEvent) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - panPosition.x,
      y: e.clientY - panPosition.y,
    });
  };

  const handleMouseMove = (e: ReactMouseEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    setPanPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Magnifier — throttled with requestAnimationFrame
  const handleMagnifierMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!imageContainerRef) return;
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);

      animationFrameRef.current = requestAnimationFrame(() => {
        if (!imageContainerRef) return;
        const rect = imageContainerRef.getBoundingClientRect();
        const magnifierSize = 150;
        const halfSize = magnifierSize / 2;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Suppress the magnifier over the nav arrow buttons
        const buttonSize = 40; // w-10 h-10
        const buttonOffset = 16; // left-4 / right-4
        const centerY = rect.height / 2;
        const isOverLeftButton =
          mouseX >= buttonOffset &&
          mouseX <= buttonOffset + buttonSize &&
          mouseY >= centerY - buttonSize / 2 &&
          mouseY <= centerY + buttonSize / 2;
        const isOverRightButton =
          mouseX >= rect.width - buttonOffset - buttonSize &&
          mouseX <= rect.width - buttonOffset &&
          mouseY >= centerY - buttonSize / 2 &&
          mouseY <= centerY + buttonSize / 2;
        if (isOverLeftButton || isOverRightButton) {
          setShowMagnifier(false);
          return;
        }

        let x = mouseX;
        let y = mouseY;
        x = Math.max(halfSize, Math.min(rect.width - halfSize, x));
        y = Math.max(halfSize, Math.min(rect.height - halfSize, y));

        if (
          mouseX >= 0 &&
          mouseX <= rect.width &&
          mouseY >= 0 &&
          mouseY <= rect.height
        ) {
          setMagnifierPosition({ x, y });
          setShowMagnifier(true);
          if (zoomPreviewRef.current) {
            const zoom = 3;
            const bgX = -x * zoom + rect.width / 2;
            const bgY = -y * zoom + rect.height / 2;
            zoomPreviewRef.current.style.backgroundPosition = `${bgX}px ${bgY}px`;
          }
        } else {
          setShowMagnifier(false);
        }
      });
    },
    [imageContainerRef],
  );

  const handleMagnifierMouseLeave = () => setShowMagnifier(false);

  // 360° View
  const open360View = () => {
    if (images.length < 2) {
      const t = createTranslator({
        locale,
        messages: getMessages(resolveLocale(locale)),
      });
      toast.error(t("product.multipleImagesRequired360"));
      return;
    }
    setView360Index(0);
    setShow360Modal(true);
    setIs360Playing(true);
  };

  const close360View = () => {
    setShow360Modal(false);
    setIs360Playing(false);
    if (rotation360IntervalRef.current) {
      clearInterval(rotation360IntervalRef.current);
      rotation360IntervalRef.current = null;
    }
  };

  const toggle360Play = () => setIs360Playing((p) => !p);

  // 360° auto-rotation
  useEffect(() => {
    if (show360Modal && is360Playing && images.length > 1) {
      rotation360IntervalRef.current = setInterval(() => {
        setView360Index((prev) => (prev + 1) % images.length);
      }, 800);
    } else if (rotation360IntervalRef.current) {
      clearInterval(rotation360IntervalRef.current);
      rotation360IntervalRef.current = null;
    }
    return () => {
      if (rotation360IntervalRef.current) {
        clearInterval(rotation360IntervalRef.current);
        rotation360IntervalRef.current = null;
      }
    };
  }, [show360Modal, is360Playing, images.length]);

  return {
    activeImageIndex,
    setActiveImageIndex,
    // lightbox
    isLightboxOpen,
    lightboxImageIndex,
    setLightboxImageIndex,
    zoomLevel,
    setZoomLevel,
    panPosition,
    setPanPosition,
    isDragging,
    openLightbox,
    closeLightbox,
    handleZoomIn,
    handleZoomOut,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    // magnifier
    magnifierPosition,
    showMagnifier,
    setShowMagnifier,
    imageContainerRef,
    setImageContainerRef,
    zoomPreviewRef,
    handleMagnifierMouseMove,
    handleMagnifierMouseLeave,
    // 360
    show360Modal,
    is360Playing,
    view360Index,
    setView360Index,
    open360View,
    close360View,
    toggle360Play,
  };
}
