import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { SuperAdminDashboard } from './super-admin-dashboard';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';

export default async function SuperAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if (session.user.role !== 'super-admin') redirect('/admin');

  await dbConnect();

  // Lean query with no key exclusion
  const rawCafes = await Cafe.find({}).sort({ createdAt: -1 }).lean();

  const cafes = rawCafes.map((cafe: any) => {
    // MongoDB _id fallback & User ID extraction fallback
    const extractedUserId = cafe.loginId || cafe.email || cafe.username || cafe.user_id || '';
    
    return {
      id: cafe._id ? cafe._id.toString() : String(Math.random()),
      name: cafe.name || 'Unnamed Cafe',
      loginId: extractedUserId !== '' ? extractedUserId : cafe.qrCode, // Agar loginId na mile toh Cafe ID (qrCode) dikhayega
      qrCode: cafe.qrCode || '',
      createdAt: cafe.createdAt ? new Date(cafe.createdAt).toISOString() : new Date().toISOString(),
    };
  });

  return <SuperAdminDashboard initialCafes={cafes} />;
}