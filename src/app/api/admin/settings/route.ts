import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import mongoose from 'mongoose';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const userObj = session.user as any;
    const cafeId = userObj?.cafeId || userObj?.qrCode;
    const userId = userObj?.id;
    const loginId = userObj?.loginId || userObj?.email;

    const body = await request.json();
    const { bw, color, logoUrl } = body;

    const isObjectId = mongoose.Types.ObjectId.isValid(userId);

    // Dynamic search: Match cafe by qrCode, _id, or loginId
    const cafe = await Cafe.findOne({
      $or: [
        ...(cafeId ? [{ qrCode: cafeId }] : []),
        ...(isObjectId ? [{ _id: userId }] : []),
        ...(loginId ? [{ loginId: loginId }] : []),
      ],
    });

    if (!cafe) {
      return NextResponse.json({ error: 'Cafe not found in database' }, { status: 404 });
    }

    // Save pricing and logo
    cafe.pricingConfig = JSON.stringify({
      bw: Number(bw) || 2,
      color: Number(color) || 10,
    });

    if (logoUrl !== undefined) {
      cafe.logoUrl = logoUrl;
    }

    await cafe.save();

    return NextResponse.json({ success: true, message: 'Settings updated successfully' });
  } catch (error: any) {
    console.error('Settings Update Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}