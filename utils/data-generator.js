/**
 * Generates a unique username per test run / worker.
 * Pattern: qa_<purpose>_<epoch>_<workerIndex>
 * see docs/test-data-management.md §2
 */
function generateUsername(tag = 'user', workerIndex = 0) {
  return `qa_${tag}_${Date.now()}_${workerIndex}`;
}

module.exports = { generateUsername };
