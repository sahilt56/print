import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

async function isSuperAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === 'super-admin';
}

export async function GET() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const cafes = await prisma.cafe.findMany({
    select: { id: true, name: true, loginId: true, qrCode: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ cafes });
}

export async function POST(request: NextRequest) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { cafeName, loginId: loginIdInput, password } = await request.json();
    const loginId = typeof loginIdInput === 'string' ? loginIdInput.trim().toLowerCase() : '';

    if (typeof cafeName !== 'string' || cafeName.trim().length < 2 || cafeName.trim().length > 100 || !/^[a-z0-9_-]{3,40}$/.test(loginId) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: 'Enter a cafe name, a valid User ID, and a password of at least 8 characters.' }, { status: 400 });
    }

    const existing = await prisma.cafe.findUnique({ where: { loginId } });
    if (existing) return NextResponse.json({ error: 'This User ID is already in use.' }, { status: 409 });

    const cafe = await prisma.cafe.create({
      data: {
        name: cafeName.trim(),
        ownerName: cafeName.trim(),
        loginId,
        password: await bcrypt.hash(password, 12),
        qrCode: `cafe_${crypto.randomBytes(5).toString('hex')}`,
        agentSecretKey: `sk_agent_${crypto.randomBytes(16).toString('hex')}`,
        pricingConfig: JSON.stringify({ bw: 2, color: 10 }),
        printerConfig: '{}',
      },
      select: { id: true, name: true, loginId: true, qrCode: true, createdAt: true },
    });

    return NextResponse.json({ cafe, initialPassword: password }, { status: 201 });
  } catch (error) {
    console.error('Super admin cafe creation error:', error);
    return NextResponse.json({ error: 'Could not create the cafe account.' }, { status: 500 });
  }
}
