import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
// Absolute path path alias (@/) or correct relative path:
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cafeId = (session.user as any)?.cafeId;
    const body = await request.json();
    
    const { bw, color, logoUrl } = body;

    const pricingConfig = JSON.stringify({ bw, color });

    await prisma.cafe.update({
      where: { qrCode: cafeId },
      data: {
        pricingConfig,
        logoUrl: logoUrl || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Settings Update Error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}