export function compressImageWithWorker(file: File, maxDim = 1000, quality = 0.65): Promise<File> {
  return new Promise((resolve) => {
    // Safari / Older browser fallback
    if (typeof window === 'undefined' || !('Worker' in window) || !('OffscreenCanvas' in window)) {
      resolve(file);
      return;
    }

    try {
      const worker = new Worker(
        new URL('../workers/imageCompressor.worker.ts', import.meta.url)
      );

      worker.onmessage = (e: MessageEvent<{ success: boolean; file: File }>) => {
        resolve(e.data.file);
        worker.terminate(); // Kill worker to immediately release RAM
      };

      worker.onerror = (err) => {
        console.warn('Worker Error:', err);
        resolve(file);
        worker.terminate();
      };

      worker.postMessage({ file, maxDim, quality });
    } catch {
      resolve(file); // Fallback on failure
    }
  });
}