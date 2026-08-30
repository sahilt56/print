'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePrintJob, CanvasItemState } from '@/context/PrintJobContext';
import styles from './page.module.css';

const A4_RATIO = 297 / 210; // 1.4142

export default function PreviewPage({ params }: { params: Promise<{ cafeId: string }> }) {
  const router = useRouter();
  const {
    file,
    filePreviewUrl,
    items,
    setItems,
    activeItemId,
    setActiveItemId,
    setFile,
  } = usePrintJob();
  const { cafeId } = React.use(params);

  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const a4Ref = useRef<HTMLDivElement>(null);

  const [a4Width, setA4Width] = useState<number>(0);
  const [isRotating, setIsRotating] = useState(false);

  // Measure A4 width dynamically
  useEffect(() => {
    if (!a4Ref.current) return;

    const measureWidth = () => {
      if (a4Ref.current) {
        const rect = a4Ref.current.getBoundingClientRect();
        if (rect.width > 0) {
          setA4Width(rect.width);
        }
      }
    };

    measureWidth();

    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        setA4Width(entry.contentRect.width);
      }
    });

    observer.observe(a4Ref.current);
    return () => observer.disconnect();
  }, []);

  const currentCanvasWidth = a4Width > 0 ? a4Width : 380;
  const currentCanvasHeight = currentCanvasWidth * A4_RATIO;

  // Initialize initial file into items list with proportional size
  useEffect(() => {
    if (file && filePreviewUrl && items.length === 0) {
      const initialId = 'item-1';
      const initialItem: CanvasItemState = {
        id: initialId,
        file,
        url: filePreviewUrl,
        isImage: file.type.startsWith('image/'),
        isPdf: file.type === 'application/pdf',
        // Centered position
        pos: { x: currentCanvasWidth / 2, y: currentCanvasHeight / 3 },
        // Proportional initial card/document dimensions
        size: { width: 220, height: 145 },
      };
      setItems([initialItem]);
      setActiveItemId(initialId);
    }
  }, [file, filePreviewUrl, items.length, currentCanvasWidth, currentCanvasHeight, setItems, setActiveItemId]);

  useEffect(() => {
    if (!file) router.replace(`/${cafeId}`);
  }, [file, router, cafeId]);

  const selectedItem = items.find((it) => it.id === activeItemId) || items[0];

  // ── Drag & Resize Logic ──────────────────────────────────────────────────
  const interactionMode = useRef<'drag' | 'resize' | null>(null);
  const activeItemIdRef = useRef<string | null>(null);
  const initialPointer = useRef<{ mx: number; my: number; px: number; py: number; w: number; h: number }>({
    mx: 0, my: 0, px: 0, py: 0, w: 0, h: 0
  });

  const handlePointerDown = (id: string, mode: 'drag' | 'resize', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveItemId(id);
    activeItemIdRef.current = id;
    interactionMode.current = mode;

    const targetItem = items.find((item) => item.id === id);
    if (targetItem) {
      initialPointer.current = {
        mx: e.clientX,
        my: e.clientY,
        px: targetItem.pos.x,
        py: targetItem.pos.y,
        w: targetItem.size.width,
        h: targetItem.size.height,
      };
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!interactionMode.current || !activeItemIdRef.current || !a4Ref.current) return;
    const dx = e.clientX - initialPointer.current.mx;
    const dy = e.clientY - initialPointer.current.my;
    const { width, height } = a4Ref.current.getBoundingClientRect();

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== activeItemIdRef.current) return item;

        if (interactionMode.current === 'drag') {
          return {
            ...item,
            pos: {
              x: Math.max(0, Math.min(width, initialPointer.current.px + dx)),
              y: Math.max(0, Math.min(height, initialPointer.current.py + dy)),
            },
          };
        } else if (interactionMode.current === 'resize') {
          const newW = Math.max(60, initialPointer.current.w + dx);
          const newH = Math.max(40, initialPointer.current.h + dy);
          return {
            ...item,
            size: { width: newW, height: newH },
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

  // ── Button Actions ───────────────────────────────────────────────────────

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
      if (!context) return setIsRotating(false);

      context.translate(canvas.width, 0);
      context.rotate(Math.PI / 2);
      context.drawImage(image, 0, 0);

      const outputType = selectedItem.file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob((blob) => {
        if (blob) {
          const updatedFile = new File([blob], selectedItem.file.name, { type: outputType });
          const updatedUrl = URL.createObjectURL(blob);

          setItems((prev) =>
            prev.map((it) =>
              it.id === selectedItem.id
                ? { ...it, file: updatedFile, url: updatedUrl }
                : it
            )
          );
        }
        setIsRotating(false);
      }, outputType, 0.92);
    };
    image.onerror = () => setIsRotating(false);
    image.src = selectedItem.url;
  };

  const handleReplaceFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (nextFile && selectedItem) {
      const newUrl = URL.createObjectURL(nextFile);
      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedItem.id
            ? {
                ...it,
                file: nextFile,
                url: newUrl,
                isImage: nextFile.type.startsWith('image/'),
                isPdf: nextFile.type === 'application/pdf',
              }
            : it
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
      const newItem: CanvasItemState = {
        id: newId,
        file: newFile,
        url: newUrl,
        isImage: newFile.type.startsWith('image/'),
        isPdf: newFile.type === 'application/pdf',
        pos: { x: currentCanvasWidth / 2, y: Math.min(currentCanvasHeight - 60, currentCanvasHeight / 2 + items.length * 30) },
        size: { width: 220, height: 145 },
      };
      setItems((prev) => [...prev, newItem]);
      setActiveItemId(newId);
    }
    event.target.value = '';
  };

  const handleDelete = () => {
    if (items.length <= 1) {
      setFile(null);
      router.push(`/${cafeId}`);
    } else if (activeItemId) {
      const filtered = items.filter((it) => it.id !== activeItemId);
      setItems(filtered);
      setActiveItemId(filtered[0]?.id || null);
    }
  };

  const handleNextStep = () => {
    const layoutPayload = items.map((item) => ({
      id: item.id,
      fileName: item.file.name,
      xPercent: (item.pos.x / currentCanvasWidth) * 100,
      yPercent: (item.pos.y / currentCanvasHeight) * 100,
      widthPercent: (item.size.width / currentCanvasWidth) * 100,
      heightPercent: (item.size.height / currentCanvasHeight) * 100,
    }));

    console.log('Final Admin Job Layout Payload:', layoutPayload);
    router.push(`/${cafeId}/options`);
  };

  if (!file) return null;

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(2)} MB`;
  };

  return (
    <Layout>
      <div className={styles.header}>
        <h1 className={styles.title}>Preview &amp; Position</h1>
      </div>

      {/* Interactive A4 Sheet Canvas */}
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
                    isSelected ? styles.selectedDraggable : ''
                  }`}
                  style={{
                    left: item.pos.x,
                    top: item.pos.y,
                    width: item.size.width,
                    height: item.size.height,
                  }}
                  onPointerDown={(e) => handlePointerDown(item.id, 'drag', e)}
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

                  {item.isPdf && (
                    <div className={styles.pdfPlaceholder}>
                      <span role="img" aria-label="PDF" className={styles.pdfIcon}>
                        📄
                      </span>
                      <p>PDF Document</p>
                    </div>
                  )}

                  {/* Drag & Resize Handle */}
                  {isSelected && (
                    <>
                      <div className={styles.dragHint}>⠿ drag</div>
                      <div
                        className={styles.resizeHandle}
                        onPointerDown={(e) => handlePointerDown(item.id, 'resize', e)}
                      />
                    </>
                  )}
                </div>
              );
            })}

            {/* Corner Crop Marks */}
            <span className={`${styles.corner} ${styles.cornerTL}`} />
            <span className={`${styles.corner} ${styles.cornerTR}`} />
            <span className={`${styles.corner} ${styles.cornerBL}`} />
            <span className={`${styles.corner} ${styles.cornerBR}`} />
          </div>
        </div>
      </div>

      {/* Info Card */}
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

      {/* Action Controls */}
      <div className={styles.actionGrid}>
        {selectedItem?.isImage && (
          <Button variant="secondary" onClick={handleScanCrop}>
            ✂️ Scan &amp; Crop
          </Button>
        )}

        {selectedItem?.isImage && (
          <Button variant="secondary" onClick={rotateSelectedImage} disabled={isRotating}>
            🔄 {isRotating ? 'Rotating…' : 'Rotate'}
          </Button>
        )}

        <Button variant="secondary" onClick={() => replaceInputRef.current?.click()}>
          🖼️ Use Another Image
        </Button>

        <Button variant="secondary" onClick={() => addImageInputRef.current?.click()}>
          ➕ Add Another Image
        </Button>

        <Button variant="danger" onClick={handleDelete}>
          🗑️ Delete
        </Button>
      </div>

      {/* Hidden Inputs */}
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
        onClick={() => router.push(`/${cafeId}`)}
        className={styles.backButton}
      >
        ← Back
      </Button>

      <div className={styles.footer}>
        <Button variant="primary" size="large" fullWidth onClick={handleNextStep}>
          Next Step &rarr;
        </Button>
      </div>
    </Layout>
  );
}