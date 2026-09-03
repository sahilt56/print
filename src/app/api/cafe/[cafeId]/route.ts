import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import mongoose from 'mongoose';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cafeId: string }> }
) {
  try {
    await dbConnect();
    const resolvedParams = await params;
    const cafeId = resolvedParams?.cafeId ? String(resolvedParams.cafeId).trim() : '';

    if (!cafeId) {
      return NextResponse.json({ error: 'Invalid Cafe Identifier' }, { status: 400 });
    }

    const isObjectId = mongoose.Types.ObjectId.isValid(cafeId);

    // .lean() added to guarantee plain JSON output including logoUrl
    const cafe = await Cafe.findOne({
      $or: [
        { qrCode: cafeId },
        { loginId: cafeId.toLowerCase() },
        ...(isObjectId ? [{ _id: cafeId }] : []),
      ],
    }).lean();

    if (!cafe) {
      return NextResponse.json({ error: 'Cafe not found' }, { status: 404 });
    }

    // Safe Pricing Config Parsing
    let pricing = { bw: 2, color: 10 };
    if (cafe.pricingConfig) {
      try {
        pricing = typeof cafe.pricingConfig === 'string'
          ? JSON.parse(cafe.pricingConfig)
          : cafe.pricingConfig;
      } catch (e) {
        /* fallback pricing */
      }
    }

    return NextResponse.json({
      name: cafe.name,
      qrCode: cafe.qrCode,
      loginId: cafe.loginId,
      logoUrl: (cafe as any).logoUrl || null, // Guaranteed Base64/URL payload
      backgroundImageUrl: (cafe as any).backgroundImageUrl || null,
      pricing,
    });
  } catch (error: any) {
    console.error('Fetch Cafe Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}