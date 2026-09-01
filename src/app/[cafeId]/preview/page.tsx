'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';

import { Layout } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  usePrintJob,
  CanvasItemState,
} from '@/context/PrintJobContext';

import styles from './page.module.css';

import * as pdfjsLib from 'pdfjs-dist';

import {
  Crop,
  RotateCw,
  FileUp,
  PlusCircle,
  Trash2,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

const A4_RATIO = 297 / 210;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

const PDF_PAGE_GAP = 18;
const PDF_VIEWER_PADDING = 16;

/* -------------------------------------------------------------------------- */
/* PDF WORKER                                                                 */
/* -------------------------------------------------------------------------- */

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type TouchPoint = {
  clientX: number;
  clientY: number;
};

type TouchCollection = {
  length: number;
  [index: number]: TouchPoint;
};

/* -------------------------------------------------------------------------- */
/* PDF PREVIEW                                                                */
/* -------------------------------------------------------------------------- */

function PdfPreview({
  url,
}: {
  url: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  const pdfDocumentRef = useRef<any>(null);

  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);

  const getTouchDistance = (touches: TouchCollection) => {
    if (touches.length < 2) return 0;
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) return 0;

    const dx = first.clientX - second.clientX;
    const dy = first.clientY - second.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const clampZoom = useCallback((value: number) => {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((value) => clampZoom(value + 0.25));
  }, [clampZoom]);

  const zoomOut = useCallback(() => {
    setZoom((value) => clampZoom(value - 0.25));
  }, [clampZoom]);

  const resetZoom = useCallback(() => {
    setZoom(1);
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    });
  }, []);

  const setCanvasRef = useCallback(
    (pageNumber: number, canvas: HTMLCanvasElement | null) => {
      if (canvas) {
        canvasRefs.current.set(pageNumber, canvas);
      } else {
        canvasRefs.current.delete(pageNumber);
      }
    },
    []
  );

  /* ---------------------------------------------------------------------- */
  /* LOAD PDF                                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    const renderTasks = renderTasksRef.current;

    const loadPdf = async () => {
      try {
        setError(null);
        setPageCount(0);

        const loadingTask = pdfjsLib.getDocument({ url });
        const pdf = await loadingTask.promise;

        if (cancelled) return;

        pdfDocumentRef.current = pdf;
        setPageCount(pdf.numPages);
      } catch (err: any) {
        if (!cancelled) {
          console.error('PDF loading failed:', err);
          setError('Unable to load PDF preview.');
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      renderTasks.forEach((task) => {
        try {
          task?.cancel?.();
        } catch {}
      });
      renderTasks.clear();
      pdfDocumentRef.current = null;
    };
  }, [url]);

  /* ---------------------------------------------------------------------- */
  /* CALCULATE FIT SCALE                                                    */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const calculateFitScale = async () => {
      const pdf = pdfDocumentRef.current;
      if (!pdf) return;

      try {
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });

        const containerWidth = Math.max(container.clientWidth - PDF_VIEWER_PADDING * 2, 1);
        const containerHeight = Math.max(container.clientHeight - PDF_VIEWER_PADDING * 2, 1);

        const nextFitScale = Math.min(
          containerWidth / baseViewport.width,
          containerHeight / baseViewport.height
        );

        if (Number.isFinite(nextFitScale) && nextFitScale > 0) {
          setFitScale(nextFitScale);
        }
      } catch (err) {
        console.error('PDF fit scale calculation failed:', err);
      }
    };

    calculateFitScale();

    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        calculateFitScale();
      }, 80);
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [pageCount]);

  /* ---------------------------------------------------------------------- */
  /* RENDER ALL PAGES                                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    const renderTasks = renderTasksRef.current;

    const renderPages = async () => {
      const pdf = pdfDocumentRef.current;

      if (!pdf || pageCount <= 0 || fitScale <= 0) return;

      setIsRendering(true);

      try {
        renderTasks.forEach((task) => {
          try {
            task?.cancel?.();
          } catch {}
        });

        renderTasks.clear();
        const finalScale = fitScale * zoom;

        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
          if (cancelled) return;

          const canvas = canvasRefs.current.get(pageNumber);
          if (!canvas) continue;

          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const viewport = page.getViewport({ scale: finalScale });
          const dpr = Math.min(window.devicePixelRatio || 1, 2);

          canvas.width = Math.ceil(viewport.width * dpr);
          canvas.height = Math.ceil(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;

          const context = canvas.getContext('2d');
          if (!context) continue;

          context.setTransform(dpr, 0, 0, dpr, 0, 0);
          context.clearRect(0, 0, viewport.width, viewport.height);

          const renderTask = page.render({
            canvasContext: context,
            viewport,
            canvas,
          });

          renderTasks.set(pageNumber, renderTask);

          try {
            await renderTask.promise;
          } catch (renderError: any) {
            if (renderError?.name === 'RenderingCancelledException') return;
            throw renderError;
          } finally {
            renderTasks.delete(pageNumber);
          }
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          console.error('PDF pages render failed:', err);
          setError('Unable to render PDF preview.');
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    };

    renderPages();

    return () => {
      cancelled = true;
      renderTasks.forEach((task) => {
        try {
          task?.cancel?.();
        } catch {}
      });
      renderTasks.clear();
    };
  }, [pageCount, fitScale, zoom]);

  /* ---------------------------------------------------------------------- */
  /* TOUCH & WHEEL EVENTS                                                   */
  /* ---------------------------------------------------------------------- */

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.touches.length === 2) {
      const distance = getTouchDistance(event.touches);
      if (distance > 0) {
        pinchStartDistance.current = distance;
        pinchStartZoom.current = zoom;
      }
    }
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.touches.length === 2 && pinchStartDistance.current) {
      event.preventDefault();
      const distance = getTouchDistance(event.touches);
      if (distance > 0) {
        const ratio = distance / pinchStartDistance.current;
        const nextZoom = clampZoom(pinchStartZoom.current * ratio);
        setZoom(nextZoom);
      }
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.touches.length < 2) {
      pinchStartDistance.current = null;
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheelNative = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();

        const direction = event.deltaY > 0 ? -1 : 1;
        setZoom((value) => clampZoom(value + direction * 0.1));
      }
    };

    viewport.addEventListener('wheel', handleWheelNative, { passive: false });

    return () => {
      viewport.removeEventListener('wheel', handleWheelNative);
    };
  }, [clampZoom]);

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    setZoom((value) => (value > 1 ? 1 : 2));
  };

  return (
    <div
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        background: '#f8f9fa',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x pan-y',
        overscrollBehavior: 'contain',
        zIndex: 20,
        isolation: 'isolate',
        scrollbarWidth: 'thin',
      }}
    >
      <div
        ref={pagesContainerRef}
        style={{
          minWidth: '100%',
          minHeight: '100%',
          width: '100%',
          padding: PDF_VIEWER_PADDING,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: zoom <= 1 ? 'center' : 'flex-start',
          gap: PDF_PAGE_GAP,
        }}
      >
        {Array.from({ length: pageCount }, (_, index) => {
          const pageNumber = index + 1;
          return (
            <div
              key={pageNumber}
              style={{
                position: 'relative',
                flex: '0 0 auto',
                background: '#fff',
                boxShadow: '0 1px 5px rgba(0,0,0,0.15)',
                lineHeight: 0,
                maxWidth: 'none',
              }}
            >
              <canvas
                ref={(canvas) => setCanvasRef(pageNumber, canvas)}
                draggable={false}
                style={{
                  display: 'block',
                  width: 'auto',
                  height: 'auto',
                  maxWidth: 'none',
                  background: '#fff',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: 10,
                  lineHeight: 1,
                  pointerEvents: 'none',
                }}
              >
                {pageNumber}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: 'sticky',
          bottom: 12,
          left: 12,
          width: 'fit-content',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 4,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.96)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          zIndex: 100,
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          touchAction: 'manipulation',
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
          style={{ ...zoomButtonStyle, opacity: zoom <= MIN_ZOOM ? 0.45 : 1 }}
        >
          −
        </button>
        <button
          type="button"
          onClick={resetZoom}
          aria-label="Reset zoom"
          style={{ ...zoomButtonStyle, width: 50, fontSize: 12 }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
          style={{ ...zoomButtonStyle, opacity: zoom >= MAX_ZOOM ? 0.45 : 1 }}
        >
          +
        </button>
      </div>

      {isRendering && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '5px 9px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.92)',
            boxShadow: '0 1px 5px rgba(0,0,0,0.12)',
            fontSize: 11,
            zIndex: 200,
            pointerEvents: 'none',
          }}
        >
          Loading…
        </div>
      )}

      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            color: '#b42318',
            fontSize: 13,
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

const zoomButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  border: 'none',
  borderRadius: 7,
  background: '#f1f3f4',
  color: '#222',
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  flexShrink: 0,
};

/* -------------------------------------------------------------------------- */
/* PREVIEW PAGE                                                              */
/* -------------------------------------------------------------------------- */
const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
export default function PreviewPage({
  params,
}: {
  params: Promise<{
    cafeId: string;
  }>;
}) {
  const router = useRouter();
  const {
    file,
    filePreviewUrl,
    items,
    setItems,
    activeItemId,
    setActiveItemId,
    setFile,
    setTotalPages,
  } = usePrintJob();

  const { cafeId } = React.use(params);

  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const a4Ref = useRef<HTMLDivElement>(null);

  const [a4Width, setA4Width] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // ✅ ISKO ADD KAREIN:
const isMounted = useIsMounted();

  const countPdfPages = async (targetFile: File): Promise<number> => {
    if (!targetFile || !(targetFile instanceof Blob)) {
      return 1;
    }
    try {
      const buffer = await targetFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      return pdf.numPages || 1;
    } catch (error) {
      console.error('PDF page count failed:', error);
      return 1;
    }
  };

  useEffect(() => {
    const element = a4Ref.current;
    if (!element) return;

    const measureWidth = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0) {
        setA4Width(rect.width);
      }
    };

    measureWidth();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0) {
        setA4Width(entry.contentRect.width);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const currentCanvasWidth = a4Width > 0 ? a4Width : 360;
  const currentCanvasHeight = currentCanvasWidth * A4_RATIO;

  useEffect(() => {
    if (!file || !filePreviewUrl || items.length !== 0 || currentCanvasWidth <= 0) {
      return;
    }

    const initialId = 'item-1';
    const isPdfFile = file.type === 'application/pdf';

    if (isPdfFile) {
      countPdfPages(file).then((pages) => {
        setTotalPages(pages);
      });
    } else {
      setTotalPages(1);
    }

    const initialItem: CanvasItemState = {
      id: initialId,
      file,
      url: filePreviewUrl,
      isImage: file.type.startsWith('image/'),
      isPdf: isPdfFile,
      pos: { x: isPdfFile ? 0 : 20, y: isPdfFile ? 0 : 20 },
      size: {
        width: isPdfFile ? currentCanvasWidth : 150,
        height: isPdfFile ? currentCanvasHeight : 100,
      },
    };

    setItems([initialItem]);
    setActiveItemId(initialId);
  }, [
    file,
    filePreviewUrl,
    items.length,
    currentCanvasWidth,
    currentCanvasHeight,
    setItems,
    setActiveItemId,
    setTotalPages,
  ]);

  /* ---------------------------------------------------------------------- */
  /* SAFE REDIRECT FIX (PREVENTS WHITE BLANK SCREEN)                       */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    if (isMounted && !file) {
      router.replace(`/${cafeId}`);
    }
  }, [file, isMounted, router, cafeId]);

  const selectedItem =
    items.find((item) => item.id === activeItemId) || items[0];

  const interactionMode = useRef<'drag' | 'resize' | null>(null);
  const activeItemIdRef = useRef<string | null>(null);
  const initialPointer = useRef({ mx: 0, my: 0, px: 0, py: 0, w: 0, h: 0 });

  const handlePointerDown = (id: string, mode: 'drag' | 'resize', event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();

    setActiveItemId(id);
    activeItemIdRef.current = id;
    interactionMode.current = mode;

    const targetItem = items.find((item) => item.id === id);
    if (targetItem) {
      initialPointer.current = {
        mx: event.clientX,
        my: event.clientY,
        px: targetItem.pos.x,
        py: targetItem.pos.y,
        w: targetItem.size.width,
        h: targetItem.size.height,
      };
    }

    try {
      (event.target as Element).setPointerCapture(event.pointerId);
    } catch {}
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!interactionMode.current || !activeItemIdRef.current || !a4Ref.current) return;

    const dx = event.clientX - initialPointer.current.mx;
    const dy = event.clientY - initialPointer.current.my;

    setItems((previous) =>
      previous.map((item) => {
        if (item.id !== activeItemIdRef.current) return item;

        if (interactionMode.current === 'drag') {
          return {
            ...item,
            pos: {
              x: Math.max(0, Math.min(currentCanvasWidth - item.size.width, initialPointer.current.px + dx)),
              y: Math.max(0, Math.min(currentCanvasHeight - item.size.height, initialPointer.current.py + dy)),
            },
          };
        }

        if (interactionMode.current === 'resize') {
          return {
            ...item,
            size: {
              width: Math.max(50, initialPointer.current.w + dx),
              height: Math.max(30, initialPointer.current.h + dy),
            },
          };
        }
        return item;
      })
    );
  };

  const handlePointerUp = () => {
    interactionMode.current = null;
    activeItemIdRef.current = null;
  };

  const handleScanCrop = () => {
    if (selectedItem?.isImage) {
      router.push(`/${cafeId}/crop`);
    }
  };

  const rotateSelectedImage = () => {
    if (!selectedItem || !selectedItem.isImage) return;

    setIsRotating(true);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalHeight;
      canvas.height = image.naturalWidth;
      const context = canvas.getContext('2d');
      if (!context) {
        setIsRotating(false);
        return;
      }

      context.translate(canvas.width, 0);
      context.rotate(Math.PI / 2);
      context.drawImage(image, 0, 0);

      const outputType = selectedItem.file.type === 'image/png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const updatedFile = new File([blob], selectedItem.file.name, { type: outputType });
            const updatedUrl = URL.createObjectURL(blob);

            setItems((previous) =>
              previous.map((item) =>
                item.id === selectedItem.id
                  ? { ...item, file: updatedFile, url: updatedUrl }
                  : item
              )
            );
          }
          setIsRotating(false);
        },
        outputType,
        0.92
      );
    };

    image.onerror = () => setIsRotating(false);
    image.src = selectedItem.url;
  };

  const handleReplaceFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (nextFile && selectedItem) {
      const newUrl = URL.createObjectURL(nextFile);
      const isPdfFile = nextFile.type === 'application/pdf';

      if (isPdfFile) {
        const pages = await countPdfPages(nextFile);
        setTotalPages(pages);
      } else {
        setTotalPages(1);
      }

      setItems((previous) =>
        previous.map((item) =>
          item.id === selectedItem.id
            ? {
                ...item,
                file: nextFile,
                url: newUrl,
                isImage: nextFile.type.startsWith('image/'),
                isPdf: isPdfFile,
                size: {
                  width: isPdfFile ? currentCanvasWidth : 150,
                  height: isPdfFile ? currentCanvasHeight : 100,
                },
                pos: { x: isPdfFile ? 0 : 20, y: isPdfFile ? 0 : 20 },
              }
            : item
        )
      );
    }
    event.target.value = '';
  };

  const handleAddAnotherImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFile = event.target.files?.[0];
    if (newFile) {
      const newUrl = URL.createObjectURL(newFile);
      const newId = `item-${Date.now()}`;
      const offset = items.length * 25;

      const newItem: CanvasItemState = {
        id: newId,
        file: newFile,
        url: newUrl,
        isImage: newFile.type.startsWith('image/'),
        isPdf: newFile.type === 'application/pdf',
        pos: {
          x: Math.min(Math.max(0, currentCanvasWidth - 160), 20 + offset),
          y: Math.min(Math.max(0, currentCanvasHeight - 110), 20 + offset),
        },
        size: { width: 150, height: 100 },
      };

      setItems((previous) => [...previous, newItem]);
      setActiveItemId(newId);
    }
    event.target.value = '';
  };

  const handleDelete = () => {
    if (items.length <= 1) {
      setFile(null);
      router.push(`/${cafeId}`);
      return;
    }

    if (activeItemId) {
      const filtered = items.filter((item) => item.id !== activeItemId);
      setItems(filtered);
      setActiveItemId(filtered[0]?.id || null);
    }
  };

  const handleNextStep = async () => {
    setIsUploading(true);
    try {
      router.push(`/${cafeId}/options`);
    } catch (error: any) {
      console.error('Preview navigation Error:', error);
      alert(error?.message || 'Something went wrong. Please try again.');
      setIsUploading(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* FIX WHITE SCREEN (SHOW SPAWNER/REDIRECTION INSTEAD OF NULL)           */
  /* ---------------------------------------------------------------------- */
  if (!file || !isMounted) {
    return (
      <Layout>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '60vh',
          gap: '12px',
          color: '#666'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid #ccc',
            borderTopColor: '#0070f3',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: '14px' }}>Loading document...</p>
        </div>
      </Layout>
    );
  }

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(2)} MB`;
  };

  return (
    <Layout>
      <div className={styles.header}>
        <h1 className={styles.title}>Preview &amp; Position</h1>
      </div>

      <div className={styles.a4Wrapper}>
        <div
          ref={a4Ref}
          id="a4-sheet"
          className={styles.a4Sheet}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div className={styles.a4Inner}>
            {items.map((item) => {
              const isSelected = item.id === activeItemId;
              return (
                <div
                  key={item.id}
                  className={`${styles.draggable} ${
                    isSelected && !item.isPdf ? styles.selectedDraggable : ''
                  }`}
                  style={{
                    left: `${(item.pos.x / currentCanvasWidth) * 100}%`,
                    top: `${(item.pos.y / currentCanvasHeight) * 100}%`,
                    width: `${(item.size.width / currentCanvasWidth) * 100}%`,
                    height: `${(item.size.height / currentCanvasHeight) * 100}%`,
                    border: item.isPdf ? 'none' : undefined,
                  }}
                  onPointerDown={(event) => handlePointerDown(item.id, 'drag', event)}
                >
                  {item.isImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.url}
                      alt="Preview"
                      className={styles.draggableImage}
                      draggable={false}
                    />
                  )}



                  {item.isPdf && <PdfPreview url={item.url} />}

                  {isSelected && !item.isPdf && (
                    <>
                      <div className={styles.dragHint}>⠿ drag</div>
                      <div
                        className={styles.resizeHandle}
                        onPointerDown={(event) => handlePointerDown(item.id, 'resize', event)}
                      />
                    </>
                  )}
                </div>
              );
            })}

            <span className={`${styles.corner} ${styles.cornerTL}`} />
            <span className={`${styles.corner} ${styles.cornerTR}`} />
            <span className={`${styles.corner} ${styles.cornerBL}`} />
            <span className={`${styles.corner} ${styles.cornerBR}`} />
          </div>
        </div>
      </div>

      {selectedItem && (
        <Card className={styles.fileInfoCard}>
          <div className={styles.fileInfo}>
            <p className={styles.fileName}>{selectedItem.file.name}</p>
            <p className={styles.fileDetails}>
              {formatSize(selectedItem.file.size)} &bull;{' '}
              {selectedItem.isImage ? 'Image' : 'PDF'} ({items.length} item(s) on page)
            </p>
          </div>
        </Card>
      )}

      <div className={styles.actionGrid}>
        {selectedItem?.isImage && (
          <Button
            variant="secondary"
            onClick={handleScanCrop}
            disabled={isUploading}
            style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}
          >
            <Crop size={16} /> Scan &amp; Crop
          </Button>
        )}

        {selectedItem?.isImage && (
          <Button
            variant="secondary"
            onClick={rotateSelectedImage}
            disabled={isRotating || isUploading}
            style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}
          >
            <RotateCw size={16} />
            {isRotating ? 'Rotating…' : 'Rotate'}
          </Button>
        )}

        <Button
          variant="secondary"
          onClick={() => replaceInputRef.current?.click()}
          disabled={isUploading}
          style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}
        >
          <FileUp size={16} /> Replace File
        </Button>

        {!selectedItem?.isPdf && (
          <Button
            variant="secondary"
            onClick={() => addImageInputRef.current?.click()}
            disabled={isUploading}
            style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}
          >
            <PlusCircle size={16} /> Add More
          </Button>
        )}

        <Button
          variant="danger"
          onClick={handleDelete}
          disabled={isUploading}
          style={{
            display: 'flex',
            gap: '6px',
            justifyContent: 'center',
            gridColumn: 'span 2',
          }}
        >
          <Trash2 size={16} /> Delete Item
        </Button>
      </div>

      <input
        ref={replaceInputRef}
        type="file"
        className="visually-hidden"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={handleReplaceFile}
      />

      <input
        ref={addImageInputRef}
        type="file"
        className="visually-hidden"
        accept=".png,.jpg,.jpeg"
        onChange={handleAddAnotherImage}
      />

      <Button
        variant="ghost"
        fullWidth
        onClick={() => router.replace(`/${cafeId}`)}
        className={styles.backButton}
        disabled={isUploading}
        style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}
      >
        <ArrowLeft size={16} /> Back
      </Button>

      <div className={styles.footer}>
        <Button
          variant="primary"
          size="large"
          fullWidth
          onClick={handleNextStep}
          disabled={isUploading}
          style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}
        >
          {isUploading ? (
            'Preparing Assets...'
          ) : (
            <>
              Next Step <ArrowRight size={18} />
            </>
          )}
        </Button>
      </div>
    </Layout>
  );
  // sahil
}