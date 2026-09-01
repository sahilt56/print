// Dedicated Web Worker for Off-Main-Thread Processing

self.onmessage = async (e: MessageEvent<{ file: File; maxDim: number; quality: number }>) => {
  const { file, maxDim, quality } = e.data;

  try {
    // Hardware level decoding inside background worker
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    // Offscreen Canvas (Zero UI Memory Consumption)
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d', { alpha: false });

    if (!ctx) {
      bitmap.close();
      self.postMessage({ success: false, file });
      return;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close(); // Immediate memory cleanup

    const blob = await offscreen.convertToBlob({
      type: 'image/jpeg',
      quality: quality,
    });

    const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    self.postMessage({ success: true, file: compressedFile });
  } catch (err) {
    console.warn('Worker processing failed, fallback to original:', err);
    self.postMessage({ success: false, file });
  }
};