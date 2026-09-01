'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePrintJob, CanvasItemState } from '@/context/PrintJobContext';
import styles from './page.module.css';
import * as pdfjsLib from 'pdfjs-dist';
import QuickPinchZoom from 'react-quick-pinch-zoom';

import { useCallback } from 'react'; // 👈 Fix 1: useCallback import
import { 
  Crop, 
  RotateCw, 
  FileUp, 
  PlusCircle, 
  Trash2, 
  ArrowLeft, 
  ArrowRight 
} from 'lucide-react';

const A4_RATIO = 297 / 210; // 1.4142

// ye naya add kiye haiii
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
function PdfPreviewCanvas({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  // Pinch Zoom & 2D Dragging Matrix
  const onUpdate = useCallback(({ x, y, scale }: { x: number; y: number; scale: number }) => {
    if (targetRef.current) {
      targetRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      targetRef.current.style.transformOrigin = '0 0';
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const renderAllPages = async () => {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        const loadingTask = pdfjsLib.getDocument({ url });
        const pdf = await loadingTask.promise;

        if (!containerRef.current || !isMounted) return;
        containerRef.current.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.2 });

          const canvas = document.createElement('canvas');
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.marginBottom = '12px';
          canvas.style.display = 'block';
          canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';

          const context = canvas.getContext('2d');
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
              canvasContext: context,
              viewport: viewport,
              canvas: canvas,
            }).promise;
          }

          if (isMounted && containerRef.current) {
            containerRef.current.appendChild(canvas);
          }
        }
      } catch (err) {
        console.error('PDF multi-page render error:', err);
      }
    };

    renderAllPages();
    return () => {
      isMounted = false;
    };
  }, [url]);

  return (
    <QuickPinchZoom 
      onUpdate={onUpdate} 
      draggableUnZoomed={true} // 👈 Isse normal state me bhi drag allow rahega
      inertia={true}
    >
      <div ref={targetRef} style={{ width: '100%' }}>
        <div ref={containerRef} style={{ width: '100%' }} />
      </div>
    </QuickPinchZoom>
  );
}
// function PdfPreviewCanvas({ url }: { url: string }) {
//   const containerRef = useRef<HTMLDivElement>(null);

//   useEffect(() => {
//     let isMounted = true;

//     const renderAllPages = async () => {
//       try {
//         pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
//           'pdfjs-dist/build/pdf.worker.min.mjs',
//           import.meta.url
//         ).toString();

//         const loadingTask = pdfjsLib.getDocument({ url });
//         const pdf = await loadingTask.promise;

//         if (!containerRef.current || !isMounted) return;
//         containerRef.current.innerHTML = ''; // Purana canvas clear karein

//         for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
//           const page = await pdf.getPage(pageNum);
//           const viewport = page.getViewport({ scale: 1.2 });

//           const canvas = document.createElement('canvas');
//           canvas.style.width = '100%';
//           canvas.style.height = 'auto';
//           canvas.style.marginBottom = '12px';
//           canvas.style.display = 'block';
//           canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';

//           const context = canvas.getContext('2d');
//           if (context) {
//             canvas.height = viewport.height;
//             canvas.width = viewport.width;

//             await page.render({
//               canvasContext: context,
//               viewport: viewport,
//               canvas: canvas,
//             }).promise;
//           }

//           if (isMounted && containerRef.current) {
//             containerRef.current.appendChild(canvas);
//           }
//         }
//       } catch (err) {
//         console.error('PDF multi-page render error:', err);
//       }
//     };

//     renderAllPages();
//     return () => {
//       isMounted = false;
//     };
//   }, [url]);

//   return (
//   <div ref={containerRef} style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }} />
// );
// }

// ye purana hai
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
    setTotalPages,
  } = usePrintJob();
  const { cafeId } = React.use(params);

  const replaceInputRef = useRef<HTMLInputElement>(null);
  const addImageInputRef = useRef<HTMLInputElement>(null);
  const a4Ref = useRef<HTMLDivElement>(null);

  const [a4Width, setA4Width] = useState<number>(0);
  const [isRotating, setIsRotating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Safe & fast PDF page counter without external library worker clashes
 // Accurate PDF Page Counter using /Type /Pages /Count
  const countPdfPages = async (targetFile: File): Promise<number> => {
    if (!targetFile || !(targetFile instanceof Blob)) return 1;
    try {
      const buffer = await targetFile.arrayBuffer();
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(buffer);
      
      // PDF ke root /Pages object ke andar jo /Count hota hai, wahi asli total pages hote hain
      const pageCountMatch = text.match(/\/Type\s*\/Pages\b[\s\S]*?\/Count\s+(\d+)/);
      if (pageCountMatch && pageCountMatch[1]) {
        const pages = parseInt(pageCountMatch[1], 10);
        if (!isNaN(pages) && pages > 0) return pages;
      }

      // Fallback agar root pages na mile toh general /Count dhoondo lekinpehla ya sabse chhota/sahi match lo
      const matches = text.match(/\/Count\s+(\d+)/g);
      if (matches && matches.length > 0) {
        const counts = matches.map(m => {
          const num = m.match(/\d+/);
          return num ? parseInt(num[0], 10) : 0;
        }).filter(n => n > 0 && n < 1000); // 1000 se kam wale normal pages hote hain
        
        if (counts.length > 0) {
          return Math.min(...counts); // Sabse chhota wala usually total page count hota hai
        }
      }
    } catch (e) {
      console.error("Accurate page count failed, fallback to 1", e);
    }
    return 1;
  };

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

  const currentCanvasWidth = a4Width > 0 ? a4Width : 360;
  const currentCanvasHeight = currentCanvasWidth * A4_RATIO;

  // Initialize initial file into items list with proportional size
  useEffect(() => {
    if (file && filePreviewUrl && items.length === 0 && currentCanvasWidth > 0) {
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
          height: isPdfFile ? currentCanvasHeight : 100 
        },
      };
      setItems([initialItem]);
      setActiveItemId(initialId);
    }
  }, [file, filePreviewUrl, items.length, currentCanvasWidth, currentCanvasHeight, setItems, setActiveItemId, setTotalPages]);

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

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== activeItemIdRef.current) return item;

        if (interactionMode.current === 'drag') {
          return {
            ...item,
            pos: {
              x: Math.max(0, Math.min(currentCanvasWidth - item.size.width, initialPointer.current.px + dx)),
              y: Math.max(0, Math.min(currentCanvasHeight - item.size.height, initialPointer.current.py + dy)),
            },
          };
        } else if (interactionMode.current === 'resize') {
          const newW = Math.max(50, initialPointer.current.w + dx);
          const newH = Math.max(30, initialPointer.current.h + dy);
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

  const handleReplaceFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (nextFile && selectedItem) {
      const newUrl = URL.createObjectURL(nextFile);
      const isPdfFile = nextFile.type === 'application/pdf';

      // 👈 Nayi file replace hote hi uska exact page count turant calculate karein
      if (isPdfFile) {
        const pages = await countPdfPages(nextFile);
        setTotalPages(pages);
      } else {
        setTotalPages(1);
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedItem.id
            ? {
                ...it,
                file: nextFile,
                url: newUrl,
                isImage: nextFile.type.startsWith('image/'),
                isPdf: isPdfFile,
                // Size ko bhi naye file ke hisaab se reset kar dein
                size: { 
                  width: isPdfFile ? currentCanvasWidth : 150, 
                  height: isPdfFile ? currentCanvasHeight : 100 
                },
                pos: { x: isPdfFile ? 0 : 20, y: isPdfFile ? 0 : 20 }
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
      
      const offset = items.length * 25;
      const newItem: CanvasItemState = {
        id: newId,
        file: newFile,
        url: newUrl,
        isImage: newFile.type.startsWith('image/'),
        isPdf: newFile.type === 'application/pdf',
        pos: { 
          x: Math.min(currentCanvasWidth - 160, 20 + offset), 
          y: Math.min(currentCanvasHeight - 110, 20 + offset) 
        },
        size: { width: 150, height: 100 },
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

  const handleNextStep = async () => {
    setIsUploading(true);
    try {
      router.push(`/${cafeId}/options`);
    } catch (err: any) {
      console.error('Preview navigation Error:', err);
      alert(err.message || 'Something went wrong. Please try again.');
      setIsUploading(false);
    }
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
                    isSelected && !item.isPdf ? styles.selectedDraggable : ''
                  }`}
                  style={{
                    left: `${(item.pos.x / currentCanvasWidth) * 100}%`,
                    top: `${(item.pos.y / currentCanvasHeight) * 100}%`,
                    width: `${(item.size.width / currentCanvasWidth) * 100}%`,
                    height: `${(item.size.height / currentCanvasHeight) * 100}%`,
                    border: item.isPdf ? 'none' : undefined,
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
  <div 
    className={styles.pdfScrollContainer}
    onPointerDown={(e) => e.stopPropagation()}
  >
    <PdfPreviewCanvas url={item.url} />
  </div>
)}
                    {/* {item.isPdf && (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <PdfPreviewCanvas url={item.url} />
  </div>
)} */}
                  {/* {item.isPdf && (
                    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#ffffff' }}>
                      <div style={{ 
                        position: 'absolute', 
                        top: '-5px',    
                        left: '-5px',   
                        bottom: '-5px', 
                        right: '-25px'  
                      }}>
                        <object
                          data={`${item.url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                          type="application/pdf"
                          style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            pointerEvents: 'auto',
                          }}
                        />
                      </div>
                    </div>
                  )} */}

                  {isSelected && !item.isPdf && (
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
          <Button variant="secondary" onClick={handleScanCrop} disabled={isUploading} style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
            <Crop size={16} /> Scan &amp; Crop
          </Button>
        )}

        {selectedItem?.isImage && (
          <Button variant="secondary" onClick={rotateSelectedImage} disabled={isRotating || isUploading} style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
            <RotateCw size={16} /> {isRotating ? 'Rotating…' : 'Rotate'}
          </Button>
        )}

        <Button variant="secondary" onClick={() => replaceInputRef.current?.click()} disabled={isUploading} style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          <FileUp size={16} /> Replace File
        </Button>

        {/* 👈 Sirf tabhi dikhega jab item PDF nahi hoga (yani Image hogi) */}
        {!selectedItem?.isPdf && (
          <Button variant="secondary" onClick={() => addImageInputRef.current?.click()} disabled={isUploading} style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
            <PlusCircle size={16} /> Add More
          </Button>
        )}

        <Button variant="danger" onClick={handleDelete} disabled={isUploading} style={{ display: 'flex', gap: '6px', justifyContent: 'center', gridColumn: 'span 2' }}>
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
        <Button variant="primary" size="large" fullWidth onClick={handleNextStep} disabled={isUploading} style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          {isUploading ? 'Preparing Assets...' : <>Next Step <ArrowRight size={18} /></>}
        </Button>
      </div>
    </Layout>
  );
}