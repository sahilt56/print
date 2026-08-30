import { readFile } from 'fs/promises';
import { basename, join } from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedCafeId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const MIME_TYPES: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const job = await prisma.printJob.findUnique({
      where: { id: jobId },
      include: { cafe: { select: { qrCode: true, agentSecretKey: true } } },
    });

    if (!job) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const cafeId = await getAuthenticatedCafeId();
    const isAgent = Boolean(token && job.cafe.agentSecretKey && token === job.cafe.agentSecretKey);
    const isOwner = cafeId === job.cafe.qrCode;
    if (!isAgent && !isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const storedName = basename(job.fileUrl);
    if (!/^[a-f0-9]{32}\.(pdf|jpe?g|png)$/.test(storedName)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const file = await readFile(join(process.cwd(), 'uploads', storedName));
    const safeName = basename(job.fileName).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    return new NextResponse(file, {
      headers: {
        'Content-Type': MIME_TYPES[job.fileType] ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${safeName || 'document'}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('File download error:', error);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
