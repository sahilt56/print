export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const userObj = session.user as any;
    const userId = userObj.id;
    const cafeId = userObj.cafeId || userObj.qrCode;
    const loginId = userObj.loginId || userObj.email;
    const isObjectId = mongoose.Types.ObjectId.isValid(userId);

    // Flexible search in MongoDB matching qrCode, _id, or loginId
    const cafe = await Cafe.findOne({
      $or: [
        ...(cafeId ? [{ qrCode: cafeId }] : []),
        ...(isObjectId ? [{ _id: userId }] : []),
        ...(loginId ? [{ loginId: loginId }] : []),
      ],
    }).lean();

    if (!cafe || !(cafe as any).agentSecretKey) {
      return NextResponse.json({ error: 'Cafe or agent key not found' }, { status: 404 });
    }

    // Build the config object the print agent will use
    const configJson = JSON.stringify({
      API_URL: request.nextUrl.origin,
      CAFE_ID: (cafe as any).qrCode,
      AGENT_SECRET_KEY: (cafe as any).agentSecretKey,
      POLL_INTERVAL_MS: 5000,
    }, null, 2);

    // Return as a downloadable file attachment
    return new NextResponse(configJson, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="config.json"',
      },
    });

  } catch (error) {
    console.error('Config Download Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}