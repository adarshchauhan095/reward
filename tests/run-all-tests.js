/**
 * Master Test Runner for The Bunny Loyalty Club
 * Runs all rules logic, flow transactions, and security audits.
 */

console.log('================================================================');
console.log('   THE BUNNY LOYALTY CLUB - COMPREHENSIVE TEST SUITE EXECUTION   ');
console.log('================================================================\n');

try {
  await import('./test-rules-logic.js');
  console.log('\n----------------------------------------------------------------\n');
  await import('./test-transactions-and-flows.js');
  console.log('\n----------------------------------------------------------------\n');
  await import('./test-security-audit.js');

  console.log('\n================================================================');
  console.log('   🎉 100% OF TESTS AND AUDITS PASSED WITH ZERO FAILURES!        ');
  console.log('================================================================');
} catch (err) {
  console.error('\n❌ TEST FAILURE DETECTED:');
  console.error(err);
  process.exit(1);
}
