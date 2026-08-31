'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { usePrintJob } from '@/context/PrintJobContext';
import styles from './page.module.css';
import { X, Check, ScanLine } from 'lucide-react';

type Point = { x: number; y: number };

const DEFAULT_CORNERS: Point[] = [
  { x: 6, y: 6 }, { x: 94, y: 6 }, { x: 94, y: 94 }, { x: 6, y: 94 },
];
const clamp = (value: number) => Math.min(98, Math.max(2, value));

function dimensions(points: Point[], image: HTMLImageElement, maxSide: number) {
  const source = points.map((point) => ({ x: point.x * image.naturalWidth / 100, y: point.y * image.naturalHeight / 100 }));
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const width = (distance(source[0], source[1]) + distance(source[3], source[2])) / 2;
  const height = (distance(source[0], source[3]) + distance(source[1], source[2])) / 2;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { source, width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function solveLinearSystem(matrix: number[][]) {
  const size = matrix.length;
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const pivotValue = matrix[column][column];
    if (Math.abs(pivotValue) < 1e-8) return null;
    for (let index = column; index <= size; index += 1) matrix[column][index] /= pivotValue;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let index = column; index <= size; index += 1) matrix[row][index] -= factor * matrix[column][index];
    }
  }
  return matrix.map((row) => row[size]);
}

function projectiveTransform(source: Point[]) {
  const rectangle = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const equations: number[][] = [];
  rectangle.forEach(([u, v], index) => {
    const { x, y } = source[index];
    equations.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    equations.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  });
  return solveLinearSystem(equations);
}

function createPerspectiveCanvas(image: HTMLImageElement, points: Point[], maxSide: number) {
  const { source, width, height } = dimensions(points, image, maxSide);
  const input = document.createElement('canvas');
  input.width = image.naturalWidth;
  input.height = image.naturalHeight;
  const inputContext = input.getContext('2d', { willReadFrequently: true });
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputContext = output.getContext('2d');
  if (!inputContext || !outputContext) return null;
  inputContext.drawImage(image, 0, 0);
  const inputPixels = inputContext.getImageData(0, 0, input.width, input.height);
  const result = outputContext.createImageData(width, height);
  const transform = projectiveTransform(source);
  if (!transform) return null;
  const [a, b, c, d, e, f, g, h] = transform;

  for (let y = 0; y < height; y += 1) {
    const v = height === 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = width === 1 ? 0 : x / (width - 1);
      const divisor = g * u + h * v + 1;
      const sourceX = (a * u + b * v + c) / divisor;
      const sourceY = (d * u + e * v + f) / divisor;
      const pixelX = Math.min(input.width - 1, Math.max(0, Math.round(sourceX)));
      const pixelY = Math.min(input.height - 1, Math.max(0, Math.round(sourceY)));
      const sourceIndex = (pixelY * input.width + pixelX) * 4;
      const outputIndex = (y * width + x) * 4;
      result.data.set(inputPixels.data.subarray(sourceIndex, sourceIndex + 4), outputIndex);
    }
  }
  outputContext.putImageData(result, 0, 0);
  return output;
}

export default function CropPage({ params }: { params: Promise<{ cafeId: string }> }) {
  const router = useRouter();
  const { items, activeItemId, updateActiveItemFile, file } = usePrintJob();
  const { cafeId } = React.use(params);

  const selectedItem = items.find((item) => item.id === activeItemId) || items[0];
  const targetFile = selectedItem?.file || file;
  const targetPreviewUrl = selectedItem?.url;

  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [corners, setCorners] = useState<Point[]>(DEFAULT_CORNERS);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (!targetFile || !targetFile.type.startsWith('image/')) router.replace(`/${cafeId}`);
  }, [targetFile, router, cafeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canvas = imageRef.current && createPerspectiveCanvas(imageRef.current, corners, 620);
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const nextUrl = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
      }, 'image/jpeg', 0.88);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [corners]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (activeCorner === null || !stageRef.current) return;
      const bounds = stageRef.current.getBoundingClientRect();
      const point = { x: clamp((event.clientX - bounds.left) / bounds.width * 100), y: clamp((event.clientY - bounds.top) / bounds.height * 100) };
      setCorners((current) => current.map((corner, index) => index === activeCorner ? point : corner));
    };
    const stop = () => setActiveCorner(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  }, [activeCorner]);

  if (!targetFile || !targetPreviewUrl) return null;

  const applyPerspective = () => {
    if (!imageRef.current) return;
    setIsApplying(true);
    window.setTimeout(() => {
      const canvas = imageRef.current && createPerspectiveCanvas(imageRef.current, corners, 2400);
      if (!canvas) return setIsApplying(false);
      const outputType = targetFile.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob((blob) => {
        if (!blob) return setIsApplying(false);
        const name = outputType === 'image/png' ? targetFile.name.replace(/\.[^.]+$/, '.png') : targetFile.name.replace(/\.[^.]+$/, '.jpg');
        updateActiveItemFile(new File([blob], name, { type: outputType }));
        router.push(`/${cafeId}/preview`);
      }, outputType, 0.92);
    }, 0);
  };

  return (
    <Layout>
      <div className={styles.header}>
        <h1 className={styles.title}>Scan &amp; Straighten</h1>
        <p>Document ke 4 corners ko drag karke lines ke saath set karo.</p>
      </div>

      <div ref={stageRef} className={styles.editor}>
        <img
          ref={imageRef}
          src={targetPreviewUrl}
          alt="Document to straighten"
          className={styles.imageToCrop}
          onLoad={() => setCorners(DEFAULT_CORNERS)}
        />
        <svg className={styles.overlay} viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon
            points={corners.map((point) => `${point.x},${point.y}`).join(' ')}
            className={styles.documentArea}
          />
          {corners.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="3.2"
              className={styles.handle}
              onPointerDown={(event) => {
                event.preventDefault();
                setActiveCorner(index);
              }}
            />
          ))}
        </svg>
      </div>

      <section className={styles.previewSection}>
        <div>
          <h2>Corrected Preview</h2>
          <p>Yahi image print ke liye save hogi.</p>
        </div>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Perspective-corrected document preview"
            className={styles.correctedPreview}
          />
        ) : (
          <div className={styles.previewPlaceholder}>
            <ScanLine size={24} className="animate-pulse" style={{ marginBottom: '6px' }} />
            Preview ban raha hai…
          </div>
        )}
      </section>

      <div className={styles.actionGrid}>
        <Button variant="secondary" onClick={() => router.push(`/${cafeId}/preview`)} style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          <X size={16} /> Cancel
        </Button>
        <Button variant="primary" onClick={applyPerspective} disabled={isApplying} style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          <Check size={16} /> {isApplying ? 'Saving…' : 'Use This Scan'}
        </Button>
      </div>
    </Layout>
  );
}