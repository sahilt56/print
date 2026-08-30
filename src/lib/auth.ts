import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function getAuthenticatedCafeId() {
  const session = await getServerSession(authOptions);
  const cafeId = (session?.user as { cafeId?: unknown } | undefined)?.cafeId;

  return typeof cafeId === 'string' && cafeId.length > 0 ? cafeId : null;
}
