import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';

async function isSuperAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === 'super-admin';
}
export async function DELETE(request: NextRequest) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const cafeId = searchParams.get('id');

    if (!cafeId) {
      return NextResponse.json({ error: 'Cafe ID is required.' }, { status: 400 });
    }

    // 1. Cafe ko database se delete karein
    const deletedCafe = await Cafe.findByIdAndDelete(cafeId);
    if (!deletedCafe) {
      return NextResponse.json({ error: 'Cafe not found.' }, { status: 404 });
    }

    // 2. Optional: Us cafe ke saare print jobs bhi database se saaf kar dein
    await PrintJob.deleteMany({ cafeId: cafeId });

    return NextResponse.json({ success: true, message: 'Cafe deleted successfully.' });
  } catch (error: any) {
    console.error('Delete Cafe Error:', error);
    return NextResponse.json({ error: error.message || 'Error deleting cafe' }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await dbConnect();

    const { cafeName, loginId: loginIdInput, password } = await request.json();
    const cleanLoginId = typeof loginIdInput === 'string' ? loginIdInput.trim().toLowerCase() : '';

    if (!cafeName || !cleanLoginId || !password) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }

    const existing = await Cafe.findOne({ loginId: cleanLoginId });
    if (existing) {
      return NextResponse.json({ error: 'This User ID is already in use.' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const qrCode = `cafe_${crypto.randomBytes(5).toString('hex')}`;
    const agentSecretKey = `sk_agent_${crypto.randomBytes(16).toString('hex')}`;

    const newCafe = await Cafe.create({
      name: cafeName.trim(),
      ownerName: cafeName.trim(),
      loginId: cleanLoginId,
      password: hashedPassword,
      qrCode,
      agentSecretKey,
      pricingConfig: { bw: 2, color: 10 },
    });

    return NextResponse.json({
      cafe: {
        id: newCafe._id.toString(),
        name: newCafe.name,
        loginId: newCafe.loginId,
        qrCode: newCafe.qrCode,
        createdAt: newCafe.createdAt.toISOString(),
      },
      initialPassword: password,
    });
  } catch (error: any) {
    console.error('Create Cafe Error:', error);
    return NextResponse.json({ error: error.message || 'Error creating account' }, { status: 500 });
  }
}