import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Self-signup is disabled. Contact the service provider for credentials.' }, { status: 403 });
}
