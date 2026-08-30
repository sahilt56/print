import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import crypto from 'crypto';

const ALLOWED_FILES = new Map([
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
]);

function hasAllowedSignature(buffer: Buffer, extension: string) {
  if (extension === '.pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  if (extension === '.png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Validate size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds 10MB' }, { status: 400 });
    }

    const extension = extname(file.name).toLowerCase();
    const expectedMimeType = ALLOWED_FILES.get(extension);
    if (!expectedMimeType || file.type !== expectedMimeType) {
      return NextResponse.json({ error: 'Only PDF, JPG, JPEG, and PNG files are allowed' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasAllowedSignature(buffer, extension)) {
      return NextResponse.json({ error: 'The uploaded file content does not match its type' }, { status: 400 });
    }

    const hash = crypto.randomBytes(16).toString('hex');
    const safeFileName = `${hash}${extension}`;
    
    // Save inside public/uploads so Next.js static server can serve the file
    const uploadDir = join(process.cwd(), 'public', 'uploads');
    const filePath = join(uploadDir, safeFileName);
    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, buffer);

    return NextResponse.json({ 
      fileUrl: `/uploads/${safeFileName}`,
      fileName: file.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 150)
    });

  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}