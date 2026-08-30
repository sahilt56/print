import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { SuperAdminDashboard } from './super-admin-dashboard';
import { prisma } from '@/lib/prisma';

export default async function SuperAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if (session.user.role !== 'super-admin') redirect('/admin');

  const cafes = await prisma.cafe.findMany({
    select: { id: true, name: true, loginId: true, qrCode: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return <SuperAdminDashboard initialCafes={cafes.map((cafe) => ({ ...cafe, createdAt: cafe.createdAt.toISOString() }))} />;
}
