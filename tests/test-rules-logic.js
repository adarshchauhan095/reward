/**
 * Test Suite: Firestore Security Rules Logic & Invariants
 * Validates authorization boundaries, field constraints, role enforcement, and access restrictions.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- RUNNING SECURITY RULES AUDIT & VALIDATION ---');

const rulesContent = fs.readFileSync(path.resolve('./firestore.rules'), 'utf-8');

// 1. Verify Rules Version and Service
assert.match(rulesContent, /rules_version\s*=\s*'2';/, 'Must use rules_version 2');
assert.match(rulesContent, /service cloud\.firestore/, 'Must target Cloud Firestore service');

// 2. Invariant: Default deny for all unmatched collections
assert.match(
  rulesContent,
  /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/,
  'CRITICAL: Must enforce default deny (allow read, write: if false) on all unmatched documents'
);

// 3. Invariant: No public access permitted
assert.doesNotMatch(
  rulesContent,
  /allow\s+read:\s*if\s+true;/,
  'CRITICAL: No public read access allowed'
);
assert.doesNotMatch(
  rulesContent,
  /allow\s+write:\s*if\s+true;/,
  'CRITICAL: No public write access allowed'
);

// 4. Invariant: Customer profile authorization
assert.match(
  rulesContent,
  /match\s+\/customers\/\{uid\}/,
  'Must have match block for customers collection'
);
assert.match(
  rulesContent,
  /allow\s+read:\s*if\s+isCustomer\(uid\)\s*\|\|\s*isActiveStaff\(\);/,
  'Customer read allowed only for owner customer or active staff'
);

// 5. Invariant: Customer creation validation
assert.match(rulesContent, /request\.resource\.data\.stampCount\s*==\s*0/, 'Initial customer stampCount must be 0');
assert.match(rulesContent, /request\.resource\.data\.cycleNumber\s*==\s*1/, 'Initial customer cycleNumber must be 1');
assert.match(rulesContent, /request\.resource\.data\.totalVisits\s*==\s*0/, 'Initial customer totalVisits must be 0');
assert.match(rulesContent, /request\.resource\.data\.totalRewards\s*==\s*0/, 'Initial customer totalRewards must be 0');
assert.match(rulesContent, /request\.resource\.data\.rewardAvailable\s*==\s*false/, 'Initial customer rewardAvailable must be false');
assert.match(rulesContent, /request\.resource\.data\.phone\.matches\('\^\[6-9\]\[0-9\]\{9\}\$'\)/, 'Phone must match 10-digit Indian pattern');

// 6. Invariant: Customer update cannot forge stamps or rewards
assert.match(
  rulesContent,
  /request\.resource\.data\.stampCount\s*==\s*resource\.data\.stampCount/,
  'Customer self-update cannot alter stampCount'
);
assert.match(
  rulesContent,
  /request\.resource\.data\.cycleNumber\s*==\s*resource\.data\.cycleNumber/,
  'Customer self-update cannot alter cycleNumber'
);
assert.match(
  rulesContent,
  /request\.resource\.data\.rewardAvailable\s*==\s*resource\.data\.rewardAvailable/,
  'Customer self-update cannot alter rewardAvailable'
);

// 7. Invariant: Visits collection authorization
assert.match(
  rulesContent,
  /match\s+\/visits\/\{visitId\}/,
  'Must have match block for visits collection'
);
assert.match(
  rulesContent,
  /request\.resource\.data\.status\s*==\s*'pending'/,
  'Customers can only create pending visits'
);
assert.match(
  rulesContent,
  /request\.resource\.data\.stampNumber\s*==\s*0/,
  'Customer created pending visit must have stampNumber 0'
);
assert.match(
  rulesContent,
  /allow\s+update:\s*if\s+\(isActiveStaff\(\)/,
  'Only active staff (or admin) can approve/reject visits'
);

// 8. Invariant: Rewards collection authorization
assert.match(
  rulesContent,
  /match\s+\/rewards\/\{rewardId\}/,
  'Must have match block for rewards collection'
);
assert.match(
  rulesContent,
  /allow\s+create:\s*if\s+isActiveStaff\(\)/,
  'Only active staff can create rewards (during visit approval transaction)'
);
assert.match(
  rulesContent,
  /request\.resource\.data\.value\s+is\s+int\s*&&\s*request\.resource\.data\.value\s*>\s*0/,
  'Reward value must be a positive integer'
);
assert.match(
  rulesContent,
  /request\.resource\.data\.type\s+is\s+string/,
  'Reward type must be a string'
);
assert.match(
  rulesContent,
  /allow\s+update:\s*if\s+\(isActiveStaff\(\)/,
  'Only active staff (or admin) can redeem/manage rewards'
);

// 9. Invariant: Staff management authorization
assert.match(
  rulesContent,
  /match\s+\/staff\/\{uid\}/,
  'Must have match block for staff collection'
);
assert.match(
  rulesContent,
  /allow\s+write:\s*if\s+isAdmin\(\);/,
  'Only admin can create, update, or delete staff records'
);

// 10. Invariant: Phone Index collection authorization (Multi-device customer continuity)
assert.match(
  rulesContent,
  /match\s+\/phone_index\/\{phone\}/,
  'Must have match block for phone_index collection'
);
assert.match(
  rulesContent,
  /allow\s+get:\s*if\s+isAuthenticated\(\)/,
  'Authenticated users can retrieve customerId by phone'
);

// 11. Invariant: Settings collection authorization (Universal Multi-Business SaaS Configuration)
assert.match(
  rulesContent,
  /match\s+\/settings\/\{docId\}/,
  'Must have match block for settings collection'
);
assert.match(
  rulesContent,
  /allow\s+read:\s*if\s+isAuthenticated\(\);/,
  'Authenticated users can read program settings'
);
assert.match(
  rulesContent,
  /allow\s+write:\s*if\s+isAdmin\(\);/,
  'Only super-admin can write program settings'
);

console.log('✓ All 11 Security Rules assertions passed successfully!');
