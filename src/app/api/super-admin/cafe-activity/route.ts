import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'super-admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();

    const cafes = await Cafe.find({}).sort({ createdAt: -1 }).lean();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Pichle 7 din

    const cafesWithStatus = await Promise.all(
      cafes.map(async (cafe: any) => {
        // Is cafe ka sabse aakhri print job pata karein
        const lastJob = await PrintJob.findOne({ cafeId: cafe._id })
          .sort({ createdAt: -1 })
          .select('createdAt printStatus')
          .lean();

        const totalJobs = await PrintJob.countDocuments({ cafeId: cafe._id });

        // Activity Check Logic
        let status = 'Inactive';
        let lastActiveDate = null;

        if (lastJob) {
          lastActiveDate = (lastJob as any).createdAt;
          // Agar aakhri print pichle 7 dino ke andar hua hai toh 'Active' maanege
          if (new Date(lastActiveDate) >= sevenDaysAgo) {
            status = 'Active';
          } else {
            status = 'Sleeping / Unused';
          }
        } else {
          status = 'Never Used (0 Prints)';
        }

        return {
          id: cafe._id.toString(),
          name: cafe.name || 'Unnamed Cafe',
          loginId: cafe.loginId,
          qrCode: cafe.qrCode,
          totalJobs,
          lastActiveDate,
          status, // Active, Sleeping / Unused, Never Used
          createdAt: cafe.createdAt,
        };
      })
    );

    // Summary Counts
    const totalCafes = cafesWithStatus.length;
    const activeCount = cafesWithStatus.filter(c => c.status === 'Active').length;
    const inactiveCount = totalCafes - activeCount;

    return NextResponse.json({
      success: true,
      summary: { totalCafes, activeCount, inactiveCount },
      cafes: cafesWithStatus,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}