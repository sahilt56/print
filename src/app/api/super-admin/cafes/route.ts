import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';

async function isSuperAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === 'super-admin';
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
      loginId: cleanLoginId, // Only saving clean loginId
      password: hashedPassword,
      qrCode,
      agentSecretKey,
      pricingConfig: JSON.stringify({ bw: 2, color: 10 }),
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