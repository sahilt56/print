import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';
import mongoose from 'mongoose';

const DEFAULT_PRICES = { bw: 2, color: 10 };

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const {
      cafeId, fileUrl, fileName, fileType,
      pageCount, selectedPages, colorMode,
      paperSize, copies, paymentMethod, layout
    } = body;

    if (!cafeId) {
      return NextResponse.json({ error: 'Cafe ID is required' }, { status: 400 });
    }

    const cleanCafeId = String(cafeId).trim();
    const isObjectId = mongoose.Types.ObjectId.isValid(cleanCafeId);

    // Case-insensitive regex match for qrCode & loginId
    const cafe = await Cafe.findOne({
      $or: [
        { qrCode: { $regex: new RegExp(`^${cleanCafeId}$`, 'i') } },
        { loginId: { $regex: new RegExp(`^${cleanCafeId}$`, 'i') } },
        ...(isObjectId ? [{ _id: cleanCafeId }] : []),
      ],
    });

    if (!cafe) {
      console.error(`[Job POST Fail] Cafe not found for: "${cleanCafeId}"`);
      return NextResponse.json({ error: `Cafe not found for ID: ${cleanCafeId}` }, { status: 404 });
    }

    // Pricing Calculation
    let prices = DEFAULT_PRICES;
    try {
      if (cafe.pricingConfig) {
        const configured = typeof cafe.pricingConfig === 'string' 
          ? JSON.parse(cafe.pricingConfig) 
          : cafe.pricingConfig;
        if (Number.isFinite(configured.bw) && Number.isFinite(configured.color)) {
          prices = { bw: configured.bw, color: configured.color };
        }
      }
    } catch {
      /* fallback */
    }

    const pricePerPage = colorMode === 'color' ? prices.color : prices.bw;
    const finalPageCount = Number(pageCount) || 1;
    const finalCopies = Number(copies) || 1;
    const totalAmount = finalPageCount * finalCopies * pricePerPage;
    const jobNumber = `PRINT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const hasLayout = Array.isArray(layout) && layout.length > 0;
    const primaryFileUrl = fileUrl || (hasLayout ? layout[0].fileUrl : null);

    // Save Job to MongoDB
    const newJob = await PrintJob.create({
      jobNumber,
      cafeId: cafe._id.toString(),
      fileUrl: primaryFileUrl,
      fileName: fileName || 'Print Document',
      fileType: fileType || 'image/png',
      layout: hasLayout ? layout : [],
      pageCount: finalPageCount,
      selectedPages: selectedPages || 'all',
      colorMode: colorMode === 'color' ? 'color' : 'bw',
      paperSize: paperSize || 'A4',
      copies: finalCopies,
      pricePerPage,
      totalAmount,
      paymentMethod: paymentMethod || 'cash',
      paymentStatus: 'pending',
      printStatus: 'pending',
    });

    return NextResponse.json({
      success: true,
      jobId: newJob._id.toString(),
      jobNumber: newJob.jobNumber,
    });

  } catch (error: any) {
    console.error('Job Creation Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}