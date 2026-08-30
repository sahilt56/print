import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const DEFAULT_PRICES = {
  bw: 2,
  color: 10,
};

const UPLOAD_URL = /^\/uploads\/[a-f0-9]{32}\.(pdf|jpe?g|png)$/;
const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      cafeId, fileUrl, fileName, fileType, 
      pageCount, selectedPages, colorMode, 
      paperSize, copies, paymentMethod,
      layout 
    } = body;

    if (typeof cafeId !== 'string' || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Extract primary fileUrl if fileUrl is empty but layout array is present
    const primaryFileUrl = fileUrl || (Array.isArray(layout) && layout.length > 0 ? layout[0].fileUrl : '');

    if (!primaryFileUrl || !UPLOAD_URL.test(primaryFileUrl) || !ALLOWED_FILE_TYPES.has(fileType)) {
      return NextResponse.json({ error: 'Invalid uploaded file' }, { status: 400 });
    }

    if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 500 || !Number.isInteger(copies) || copies < 1 || copies > 100) {
      return NextResponse.json({ error: 'Invalid page count or copy count' }, { status: 400 });
    }

    if (!['bw', 'color'].includes(colorMode) || paperSize !== 'A4' || paymentMethod !== 'cash') {
      return NextResponse.json({ error: 'Invalid print options' }, { status: 400 });
    }

    if (typeof selectedPages !== 'string' || !/^(all|[\d,\-\s]+)$/.test(selectedPages) || fileName.length > 150) {
      return NextResponse.json({ error: 'Invalid print job details' }, { status: 400 });
    }

    const cafe = await prisma.cafe.findUnique({ where: { qrCode: cafeId } });
    if (!cafe) {
      return NextResponse.json({ error: 'Cafe not found' }, { status: 404 });
    }

    let prices = DEFAULT_PRICES;
    try {
      const configured = JSON.parse(cafe.pricingConfig);
      if (Number.isFinite(configured.bw) && configured.bw > 0 && Number.isFinite(configured.color) && configured.color > 0) {
        prices = { bw: configured.bw, color: configured.color };
      }
    } catch {
      return NextResponse.json({ error: 'Cafe pricing is invalid' }, { status: 500 });
    }

    const pricePerPage = colorMode === 'color' ? prices.color : prices.bw;
    const totalAmount = pageCount * copies * pricePerPage;
    const jobNumber = `PRINT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const job = await prisma.printJob.create({
      data: {
        jobNumber,
        cafeId: cafe.id,
        fileUrl: primaryFileUrl,
        fileName,
        fileType,
        layout: layout ? JSON.stringify(layout) : null, // Direct Json object/array save for multi-image
        pageCount,
        selectedPages,
        colorMode,
        paperSize,
        copies,
        pricePerPage,
        totalAmount,
        paymentMethod,
        paymentStatus: 'pending',
        printStatus: 'pending'
      }
    });

    return NextResponse.json({ jobId: job.id, jobNumber: job.jobNumber });

  } catch (error) {
    console.error('Job Creation Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}