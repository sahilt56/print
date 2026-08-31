import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import dbConnect from './dbConnect';
import Cafe from '@/models/Cafe';

type CafeLookupCondition = {
  qrCode?: string;
  loginId?: string;
  _id?: string;
};

type CafeLookupQuery = {
  $or: CafeLookupCondition[];
  isActive?: boolean;
  isAgentActive?: boolean;
};

export function buildCafeLookupQuery(identifier: string): CafeLookupQuery {
  const q: CafeLookupQuery = {
    $or: [
      { qrCode: identifier },
      { loginId: identifier.toLowerCase() },
    ],
  };

  if (mongoose.Types.ObjectId.isValid(identifier)) {
    q.$or.push({ _id: identifier });
  }

  return q;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string, rounds: number = 10): Promise<string> {
  return bcrypt.hash(password, rounds);
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash an agent secret key
 */
export async function hashAgentSecret(secret: string, rounds: number = 10): Promise<string> {
  return bcrypt.hash(secret, rounds);
}

/**
 * Verify an agent secret key against its hash
 */
export async function verifyAgentSecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

/**
 * Generate a secure random agent secret key
 */
export function generateAgentSecret(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Get authenticated cafe ID from session
 */
export async function getAuthenticatedCafeId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const cafeId = (session?.user as { cafeId?: unknown } | undefined)?.cafeId;
  return typeof cafeId === 'string' && cafeId.length > 0 ? cafeId : null;
}

/**
 * Get authenticated user role from session
 */
export async function getAuthenticatedUserRole(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: unknown } | undefined)?.role;
  return typeof role === 'string' && role.length > 0 ? role : null;
}

/**
 * Get current authenticated session
 */
export async function getAuthenticatedSession() {
  return getServerSession(authOptions);
}

/**
 * Verify cafe ownership
 */
export async function verifyCafeOwnership(sessionCafeId: string | null, queryCafeId: string): Promise<boolean> {
  if (!sessionCafeId) return false;
  await dbConnect();
  const cafe = await Cafe.findOne(buildCafeLookupQuery(sessionCafeId));
  if (!cafe) return false;

  return cafe.qrCode === queryCafeId || cafe._id.toString() === queryCafeId || cafe.loginId === queryCafeId.toLowerCase();
}

/**
 * Verify super admin role
 */
export async function verifySuperAdminRole(role: string | null): Promise<boolean> {
  return role === 'super-admin';
}

/**
 * Verify cafe admin role
 */
export async function verifyCafeAdminRole(role: string | null): Promise<boolean> {
  return role === 'cafe';
}

/**
 * Verify agent authentication via bearer token
 */
export async function verifyAgentToken(
  token: string | null,
  cafeId: string
): Promise<{ valid: boolean; cafeDoc?: any }> {
  if (!token) return { valid: false };

  await dbConnect();
  const cafe = await Cafe.findOne({
    ...buildCafeLookupQuery(cafeId),
    isActive: true,
    isAgentActive: true,
  });

  if (!cafe) return { valid: false };

  // Accept both legacy plain-text secrets and newer bcrypt-hashed secrets.
  // This preserves compatibility for existing cafe records while keeping the
  // newer hash verification path working.
  const storedSecret = String(cafe.agentSecretKey || '');

  try {
    const isPlainMatch = timingSafeCompare(token, storedSecret);
    if (isPlainMatch) {
      cafe.lastAgentSeen = new Date();
      await cafe.save();
      return { valid: true, cafeDoc: cafe };
    }

    const isHashMatch = await verifyAgentSecret(token, storedSecret);
    if (isHashMatch) {
      cafe.lastAgentSeen = new Date();
      await cafe.save();
      return { valid: true, cafeDoc: cafe };
    }
  } catch (error) {
    // Invalid secret format or comparison error - token is invalid.
    return { valid: false };
  }

  return { valid: false };
}

/**
 * Check if cafe is locked out due to failed login attempts
 */
export async function isCafeLocked(cafeDoc: any): Promise<boolean> {
  if (!cafeDoc.lockedUntil) return false;
  if (new Date() > cafeDoc.lockedUntil) {
    // Unlock if lockout period has expired
    cafeDoc.lockedUntil = null;
    cafeDoc.failedLoginAttempts = 0;
    await cafeDoc.save();
    return false;
  }
  return true;
}

/**
 * Record failed login attempt
 */
export async function recordFailedLoginAttempt(cafeDoc: any): Promise<void> {
  cafeDoc.failedLoginAttempts = (cafeDoc.failedLoginAttempts || 0) + 1;
  cafeDoc.lastFailedLoginAt = new Date();

  // Lock after 5 failed attempts for 15 minutes
  if (cafeDoc.failedLoginAttempts >= 5) {
    cafeDoc.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
  }

  await cafeDoc.save();
}

/**
 * Clear failed login attempts
 */
export async function clearFailedLoginAttempts(cafeDoc: any): Promise<void> {
  cafeDoc.failedLoginAttempts = 0;
  cafeDoc.lastFailedLoginAt = null;
  cafeDoc.lockedUntil = null;
  await cafeDoc.save();
}

/**
 * Timing-safe comparison for signatures
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  
  if (bufA.length !== bufB.length) {
    return false;
  }
  
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Generate a payment idempotency key
 */
export function generateIdempotencyKey(jobId: string, paymentId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${jobId}:${paymentId}`)
    .digest('hex');
}
