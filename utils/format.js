// @ts-check
/**
 * Formats a number the way BookCart renders prices (Angular `currency:"INR"`
 * with the app's default en-US locale): 1500 -> "₹1,500.00".
 * @param {number} value
 * @returns {string}
 */
function formatInr(value) {
  return `₹${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

module.exports = { formatInr };
