import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    const { searchParams } = new URL(request.url);
    const cafeId = searchParams.get('cafeId');

    if (!cafeId) {
      return NextResponse.json({ error: 'Missing cafeId parameter' }, { status: 400 });
    }

    // Authenticate the specific Cafe's Agent Key
    const cafe = await prisma.cafe.findUnique({
      where: { qrCode: cafeId },
      select: { agentSecretKey: true }
    });

    if (!cafe || cafe.agentSecretKey !== token) {
      return NextResponse.json({ error: 'Unauthorized Agent Key' }, { status: 401 });
    }

    // 2. Fetch the oldest pending/paid job for this cafe
    
    const job = await prisma.printJob.findFirst({
      where: {
        cafe: {
          qrCode: cafeId
        },
        paymentStatus: 'paid',
        printStatus: 'pending' // Only jobs not yet picked up by the printer
      },
      orderBy: {
        createdAt: 'asc' // FIFO
      }
    });

    if (!job) {
      return NextResponse.json({ job: null });
    }

    // 3. Mark it as 'printing' so another polling request doesn't grab it
    const claimedJob = await prisma.printJob.updateMany({
      where: { id: job.id, paymentStatus: 'paid', printStatus: 'pending' },
      data: { printStatus: 'printing' },
    });

    if (claimedJob.count !== 1) {
      return NextResponse.json({ job: null });
    }

    const updatedJob = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });

    // 4. Return the job details including the file URL for the agent to download
    // Ensure fileUrl is an absolute URL if the agent is remote. 
    // Since this is MVP running on localhost, we can construct the full URL.
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    
    return NextResponse.json({ 
      job: {
        ...updatedJob,
        downloadUrl: `${baseUrl}/api/files/${updatedJob.id}`
      }
    });

  } catch (error) {
    console.error('Agent GET Jobs Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
