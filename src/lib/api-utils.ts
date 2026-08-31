import { NextResponse } from 'next/server';

export interface ApiErrorResponse {
  error: string;
  code?: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  [key: string]: any;
}

/**
 * Centralized error response builder
 */
export function apiError(message: string, status: number = 500, code?: string): NextResponse {
  return NextResponse.json(
    { 
      error: message,
      ...(code && { code })
    },
    { status }
  );
}

/**
 * Centralized success response builder
 */
export function apiSuccess<T extends Record<string, any>>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(
    {
      success: true,
      ...data
    },
    { status }
  );
}

/**
 * Validation error response
 */
export function validationError(fields: Record<string, string>): NextResponse {
  return NextResponse.json(
    {
      error: 'Validation failed',
      fields
    },
    { status: 400 }
  );
}

/**
 * Unauthorized error
 */
export function unauthorized(message: string = 'Unauthorized'): NextResponse {
  return apiError(message, 401, 'UNAUTHORIZED');
}

/**
 * Forbidden error (authorized but doesn't have permission)
 */
export function forbidden(message: string = 'Forbidden'): NextResponse {
  return apiError(message, 403, 'FORBIDDEN');
}

/**
 * Not found error
 */
export function notFound(message: string = 'Not found'): NextResponse {
  return apiError(message, 404, 'NOT_FOUND');
}

/**
 * Internal server error (logs error for debugging)
 */
export function internalError(error: unknown, context: string = 'Internal Server Error'): NextResponse {
  console.error(`[${context}]`, error instanceof Error ? error.message : error);
  return apiError('Internal server error', 500, 'INTERNAL_ERROR');
}

/**
 * Rate limit error
 */
export function rateLimited(message: string = 'Too many requests. Please try again later.'): NextResponse {
  return apiError(message, 429, 'RATE_LIMITED');
}

/**
 * Service unavailable error
 */
export function serviceUnavailable(message: string = 'Service temporarily unavailable'): NextResponse {
  return apiError(message, 503, 'SERVICE_UNAVAILABLE');
}

/**
 * Parse and validate request body
 */
export async function parseAndValidateBody<T>(
  request: Request,
  validator: (data: any) => { valid: boolean; error?: string }
): Promise<{ data: T | null; error?: NextResponse }> {
  try {
    const body = await request.json();
    const validation = validator(body);
    if (!validation.valid) {
      return { data: null, error: apiError(validation.error || 'Validation failed', 400) };
    }
    return { data: body as T };
  } catch (error) {
    return { data: null, error: apiError('Invalid request body', 400) };
  }
}

/**
 * Simple field validator
 */
export function validateFields(data: Record<string, any>, fields: Record<string, (v: any) => boolean>): { valid: boolean; error?: string } {
  for (const [field, validator] of Object.entries(fields)) {
    if (!validator(data[field])) {
      return { valid: false, error: `Invalid ${field}` };
    }
  }
  return { valid: true };
}

/**
 * Required string field validator
 */
export const isRequiredString = (v: any): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Required non-empty array validator
 */
export const isRequiredArray = (v: any): v is any[] => Array.isArray(v) && v.length > 0;

/**
 * Required number validator
 */
export const isRequiredNumber = (v: any): v is number => typeof v === 'number' && !isNaN(v);

/**
 * Number in range validator
 */
export const isNumberInRange = (min: number, max: number) => (v: any): v is number => 
  typeof v === 'number' && v >= min && v <= max;

/**
 * Enum validator
 */
export const isEnum = <T extends string>(allowedValues: readonly T[]) => (v: any): v is T =>
  typeof v === 'string' && allowedValues.includes(v as T);
