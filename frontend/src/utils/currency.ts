/**
 * Format a number as Nigerian Naira currency with thousand separators
 * and 2 decimal places.
 *
 * Usage:  formatCurrency(1234567.89)  →  "₦1,234,567.89"
 *         formatCurrency(5000)        →  "₦5,000.00"
 *         formatCurrency(0)            →  "₦0.00"
 *         formatCurrency(null/undef)   →  "₦0.00"
 */
export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return '₦0.00';
  return '₦' + num.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a number with thousand separators and 2 decimal places
 * (without the ₦ symbol). Useful for inline amounts.
 *
 * Usage:  formatNumber(1234567.89)  →  "1,234,567.89"
 *         formatNumber(5000)        →  "5,000.00"
 */
export function formatNumber(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}