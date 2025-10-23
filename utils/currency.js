// Simple currency formatter used across the app.
// Returns a string with two decimals and a dot as decimal separator (no thousands separator).
export function formatAmount(value, options = {}) {
  const { symbol = '' } = options;
  if (value === null || value === undefined) return '';
  const num = Number(value);
  if (Number.isNaN(num)) return '';
  // Ensure two decimals and dot separator
  const formatted = num.toFixed(2);
  return symbol ? `${symbol}${formatted}` : `${formatted}`;
}

export default { formatAmount };
