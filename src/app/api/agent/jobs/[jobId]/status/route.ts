import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    const resolvedParams = await params;
    const { jobId } = resolvedParams;

    // Fetch the job to get the cafeId
    const job = await prisma.printJob.findUnique({
      where: { id: jobId },
      include: { cafe: true }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.cafe.agentSecretKey !== token) {
      return NextResponse.json({ error: 'Unauthorized Agent Key' }, { status: 401 });
    }

    const body = await request.json();
    const { status, error } = body;

    if (!['completed', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updatedJob = await prisma.printJob.updateMany({
      where: { id: jobId, printStatus: 'printing' },
      data: { printStatus: status }
    });

    if (updatedJob.count !== 1) {
      return NextResponse.json({ error: 'Job is not currently being printed' }, { status: 409 });
    }

    if (error) {
      console.error(`Job ${jobId} failed to print on agent:`, error);
      // We could store the error message in the DB if we add an error field later
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Agent Status Update Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
