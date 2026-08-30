import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest, { params }: { params: Promise<{ cafeId: string }> }) {
  try {
    const { cafeId } = await params;
    
    const cafe = await prisma.cafe.findUnique({
      where: { qrCode: cafeId },
      select: {
        name: true,
        logoUrl: true, // <-- Add this field
        pricingConfig: true
      }
    });

    if (!cafe) {
      return NextResponse.json({ error: 'Cafe not found' }, { status: 404 });
    }

    return NextResponse.json({
      name: cafe.name,
      logoUrl: cafe.logoUrl || null, // <-- Return logoUrl to frontend
      pricing: JSON.parse(cafe.pricingConfig || '{"bw":2,"color":10}')
    });

  } catch (error) {
    console.error('Fetch Cafe Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}