/**
 * Validation utilities
 * Note: Using inline validation in routes to avoid extra dependencies.
 * If validation complexity grows, consider adding a schema validation library.
 */

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: Record<string, string>;
}

/**
 * Validate job creation input
 */
export function validateJobInput(data: any): ValidationResult<any> {
  const errors: Record<string, string> = {};

  if (typeof data.cafeId !== 'string' || !data.cafeId.trim()) {
    errors.cafeId = 'Cafe ID is required';
  }

  if (typeof data.pageCount !== 'number' || data.pageCount < 1 || data.pageCount > 1000) {
    errors.pageCount = 'pageCount must be between 1 and 1000';
  }

  if (typeof data.copies !== 'number' || data.copies < 1 || data.copies > 100) {
    errors.copies = 'copies must be between 1 and 100';
  }

  if (!['bw', 'color'].includes(data.colorMode)) {
    errors.colorMode = 'colorMode must be "bw" or "color"';
  }

  if (!['A4', 'A3', 'Letter'].includes(data.paperSize)) {
    errors.paperSize = 'paperSize must be A4, A3, or Letter';
  }

  if (!['cash', 'online'].includes(data.paymentMethod)) {
    errors.paymentMethod = 'paymentMethod must be "cash" or "online"';
  }

  return {
    valid: Object.keys(errors).length === 0,
    data,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
}
