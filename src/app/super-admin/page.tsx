import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { SuperAdminDashboard } from './super-admin-dashboard';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';

export default async function SuperAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if ((session.user as any)?.role !== 'super-admin') redirect('/admin');

  await dbConnect();

  // 1. Saare cafes fetch karein
  const rawCafes = await Cafe.find({}).sort({ createdAt: -1 }).lean();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Pichle 7 din

  // 2. Har cafe ke stats (Prints & Activity) calculate karein
  const cafes = await Promise.all(
    rawCafes.map(async (cafe: any) => {
      const extractedUserId = cafe.loginId || cafe.email || cafe.username || cafe.user_id || '';
      
      // Total prints handled by this cafe
      const totalJobs = await PrintJob.countDocuments({ cafeId: cafe._id });

      // Last print job find karein status check ke liye
      const lastJob = await PrintJob.findOne({ cafeId: cafe._id })
        .sort({ createdAt: -1 })
        .select('createdAt')
        .lean();

      let status = 'Inactive';
      if (lastJob) {
        const lastActiveDate = new Date((lastJob as any).createdAt);
        if (lastActiveDate >= sevenDaysAgo) {
          status = 'Active';
        } else {
          status = 'Sleeping';
        }
      } else {
        status = 'Never Used';
      }

      return {
        id: cafe._id.toString(), // 👈 Math.random() hata kar clean string conversion kar diya
        name: cafe.name || 'Unnamed Cafe',
        loginId: extractedUserId !== '' ? extractedUserId : cafe.qrCode,
        qrCode: cafe.qrCode || '',
        totalJobs: totalJobs,
        status: status,
        createdAt: cafe.createdAt ? new Date(cafe.createdAt).toISOString() : new Date().toISOString(),
      };
    })
  );

  return <SuperAdminDashboard initialCafes={cafes} />;
}