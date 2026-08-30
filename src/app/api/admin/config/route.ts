export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cafeId = (session.user as any).cafeId;

    const cafe = await prisma.cafe.findUnique({
      where: { qrCode: cafeId },
      select: { qrCode: true, agentSecretKey: true }
    });

    if (!cafe || !cafe.agentSecretKey) {
      return NextResponse.json({ error: 'Cafe or agent key not found' }, { status: 404 });
    }

    // Build the config object the print agent will use
    const configJson = JSON.stringify({
      API_URL: request.nextUrl.origin,
      CAFE_ID: cafe.qrCode,
      AGENT_SECRET_KEY: cafe.agentSecretKey,
      POLL_INTERVAL_MS: 5000
    }, null, 2);

    // Return as a downloadable file
    return new NextResponse(configJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="config.json"'
      }
    });

  } catch (error) {
    console.error('Config Download Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
