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
/* CONSTANTS & WORKER                                                         */
/* -------------------------------------------------------------------------- */
const A4_RATIO = 297 / 210;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const PDF_VIEWER_PADDING = 16;

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cloudflare.com{pdfjsLib.version}/pdf.worker.min.mjs`;
}

type TouchPoint = { clientX: number; clientY: number; };
type TouchCollection = { length: number; [index: number]: TouchPoint; };

/* -------------------------------------------------------------------------- */
/* 🛡️ RAM SAFE PDF PREVIEW COMPONENT                                          */
/* -------------------------------------------------------------------------- */
function PdfPreview({ url }: { url: string }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfDocumentRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const loadPdf = async () => {
      try {
        setError(null);
        // 🛡️ Direct Blob URL loading prevents arrayBuffer memory spikes
        const loadingTask = pdfjsLib.getDocument({ url });
        const pdf = await loadingTask.promise;

        if (cancelled) {
          pdf.cleanup();
          return;
        }

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
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
      if (pdfDocumentRef.current) {
        try { pdfDocumentRef.current.destroy(); } catch {}
      }
      pdfDocumentRef.current = null;
    };
  }, [url]);

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
      resizeTimer = setTimeout(() => { calculateFitScale(); }, 80);
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [pageCount]);

  useEffect(() => {
    let cancelled = false;
    const renderSinglePage = async () => {
      const pdf = pdfDocumentRef.current;
      const canvas = canvasRef.current;

      if (!pdf || !canvas || pageCount <= 0 || fitScale <= 0) return;
      setIsRendering(true);

      try {
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch {}
        }

        const page = await pdf.getPage(currentPage);
        if (cancelled) return;

        const finalScale = fitScale * zoom;
        const viewport = page.getViewport({ scale: finalScale });

        const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
        const dpr = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);

        canvas.width = Math.ceil(viewport.width * dpr);
        canvas.height = Math.ceil(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, viewport.width, viewport.height);

        const renderTask = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err) {
        console.warn('Render status update:', err);
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    renderSinglePage();
    return () => { cancelled = true; };
  }, [currentPage, fitScale, zoom, pageCount]);

  return (
    <div className={styles.pdfViewerContainer} ref={viewportRef}>
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <>
          <div className={styles.canvasWrapper}>
            <canvas ref={canvasRef} />
          </div>
          {pageCount > 1 && (
            <div className={styles.paginationControls}>
              <Button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ArrowLeft size={16} /> Prev
              </Button>
              <span className={styles.pageIndicator}>
                Page {currentPage} of {pageCount}
              </span>
              <Button
                disabled={currentPage >= pageCount}
                onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
              >
                Next <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* MAIN PREVIEW PAGE                                                          */
/* -------------------------------------------------------------------------- */
const emptySubscribe = () => () => {};
function useIsMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export default function PreviewPage({ params }: { params: Promise<{ cafeId: string; }> }) {
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
    clearAllMemory // 🛡️ Hook cleanup attached
  } = usePrintJob();

  const { cafeId } = React.use(params);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const a4Ref = useRef<HTMLDivElement>(null);

  const [a4Width, setA4Width] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const isMounted = useIsMounted();

  // 🛡️ RAM Safe: Count pages directly using the existing Blob URL instead of ArrayBuffer
  useEffect(() => {
    if (!filePreviewUrl || !file) return;

    let cancelled = false;
    let loadingTask: any = null;

    const fetchPagesCount = async () => {
      if (file.type !== 'application/pdf') {
        setTotalPages(1);
        return;
      }
      try {
        loadingTask = pdfjsLib.getDocument({ url: filePreviewUrl });
        const pdf = await loadingTask.promise;
        if (!cancelled) {
          setTotalPages(pdf.numPages || 1);
        }
        pdf.destroy();
      } catch (err) {
        console.error('Failed to parse pages safely:', err);
        setTotalPages(1);
      }
    };

    fetchPagesCount();
    return () => {
      cancelled = true;
      if (loadingTask) {
        try { loadingTask.destroy(); } catch {}
      }
    };
  }, [filePreviewUrl, file, setTotalPages]);

  useEffect(() => {
    const element = a4Ref.current;
    if (!element) return;

    const measureWidth = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0) setA4Width(rect.width);
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
    if (!file || !filePreviewUrl || items.length !== 0 || currentCanvasWidth <= 0) return;

    const initialId = 'item-1';
    const isPdfFile = file.type === 'application/pdf';

    const initialItem: CanvasItemState = {
      id: initialId,
      file,
      url: filePreviewUrl,
      isImage: file.type.startsWith('image/'),
      isPdf: isPdfFile,

      pos: {
        x: isPdfFile ? 0 : 20,
        y: isPdfFile ? 0 : 20,
      },
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
  ]);

  /* ---------------------------------------------------------------------- */
  /* HARD CLEANUP                                                            */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    return () => {
      if (clearAllMemory) clearAllMemory();
    };
  }, [clearAllMemory]);

  /* ---------------------------------------------------------------------- */
  /* REDIRECT IF FILE MISSING                                               */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (isMounted && !file) {
      router.replace(`/${cafeId}`);
    }
  }, [file, isMounted, router, cafeId]);

  const selectedItem =
    items.find((item) => item.id === activeItemId) || items[0];

  /* ---------------------------------------------------------------------- */
  /* DRAG & RESIZE INTERACTION HANDLERS                                      */
  /* ---------------------------------------------------------------------- */

  const interactionMode = useRef<'drag' | 'resize' | null>(null);
  const activeItemIdRef = useRef<string | null>(null);
  const initialPointer = useRef({ mx: 0, my: 0, px: 0, py: 0, w: 0, h: 0 });

  const handlePointerDown = (
    id: string,
    mode: 'drag' | 'resize',
    event: React.PointerEvent
  ) => {
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
    if (!interactionMode.current || !activeItemIdRef.current || !a4Ref.current)
      return;

    const dx = event.clientX - initialPointer.current.mx;
    const dy = event.clientY - initialPointer.current.my;

    setItems((previous) =>
      previous.map((item) => {
        if (item.id !== activeItemIdRef.current) return item;

        if (interactionMode.current === 'drag') {
          return {
            ...item,
            pos: {
              x: Math.max(
                0,
                Math.min(
                  currentCanvasWidth - item.size.width,
                  initialPointer.current.px + dx
                )
              ),
              y: Math.max(
                0,
                Math.min(
                  currentCanvasHeight - item.size.height,
                  initialPointer.current.py + dy
                )
              ),
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

  /* ---------------------------------------------------------------------- */
  /* ACTION HANDLERS                                                        */
  /* ---------------------------------------------------------------------- */

  const handleScanCrop = () => {
    if (selectedItem?.isImage) router.push(`/${cafeId}/crop`);
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

      const outputType =
        selectedItem.file.type === 'image/png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0; // Clear canvas buffer instantly

          if (blob) {
            if (selectedItem.url.startsWith('blob:')) {
              URL.revokeObjectURL(selectedItem.url);
            }

            const updatedFile = new File([blob], selectedItem.file.name, {
              type: outputType,
            });
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
        0.85
      );
    };

    image.onerror = () => setIsRotating(false);
    image.src = selectedItem.url;
  };

  const handleReplaceFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const nextFile = event.target.files?.[0];
    if (nextFile && selectedItem) {
      if (selectedItem.url.startsWith('blob:')) {
        URL.revokeObjectURL(selectedItem.url);
      }

      const newUrl = URL.createObjectURL(nextFile);
      const isPdfFile = nextFile.type === 'application/pdf';

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

  const handleAddAnotherImage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
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
      const targetItem = items.find((i) => i.id === activeItemId);
      if (targetItem?.url.startsWith('blob:')) {
        URL.revokeObjectURL(targetItem.url);
      }

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
      setIsUploading(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* LOADING / FALLBACK SCREEN                                              */
  /* ---------------------------------------------------------------------- */

  if (!file || !isMounted) {
    return (
      <Layout>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '60vh',
            gap: '12px',
            color: '#666',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid #ccc',
              borderTopColor: '#0070f3',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
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

  /* ---------------------------------------------------------------------- */
  /* JSX UI RENDER                                                          */
  /* ---------------------------------------------------------------------- */

  return (
    <Layout>
      {/* HEADER */}
      <div className={styles.header}>
        <h1 className={styles.title}>Preview &amp; Position</h1>
      </div>

      {/* A4 CANVAS CONTAINER */}
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
                  onPointerDown={(event) =>
                    handlePointerDown(item.id, 'drag', event)
                  }
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

                  {isSelected && !item.isPdf && (
                    <>
                      <div className={styles.dragHint}>⠿ drag</div>
                      <div
                        className={styles.resizeHandle}
                        onPointerDown={(event) =>
                          handlePointerDown(item.id, 'resize', event)
                        }
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

      {/* FILE INFO CARD */}
      {selectedItem && (
        <Card className={styles.fileInfoCard}>
          <div className={styles.fileInfo}>
            <p className={styles.fileName}>{selectedItem.file.name}</p>
            <p className={styles.fileDetails}>
              {formatSize(selectedItem.file.size)} &bull;{' '}
              {selectedItem.isImage ? 'Image' : 'PDF'} ({items.length} item(s)
              on page)
            </p>
          </div>
        </Card>
      )}

      {/* ACTION BUTTONS */}
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

      {/* HIDDEN FILE INPUTS */}
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

      {/* BACK BUTTON */}
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

      {/* NEXT STEP FOOTER */}
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
}