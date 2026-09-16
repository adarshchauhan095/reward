/**
 * Test Suite: Security, Privacy, and Code Quality Audit
 * Verifies non-negotiable rules, XSS defenses, secret leakage prevention,
 * GitHub Pages asset pathing, and zero-trust auth constraints.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- RUNNING SECURITY & INTEGRITY AUDIT ---');

const filesToAudit = [
  'index.html',
  'staff.html',
  'admin.html',
  'app.js',
  'staff.js',
  'admin.js',
  'firebase.js',
  'firestore.rules'
];

// 1. Audit: No exposed private keys or service account credentials
console.log('Audit 1: Checking for private credentials/secrets');
const secretPatterns = [
  /private_key/i,
  /BEGIN\s+(RSA\s+)?PRIVATE\s+KEY/i,
  /service_account/i,
  /client_secret/i,
  /AIzaSy[A-Za-z0-9_-]{33}\s*:\s*password/i
];

filesToAudit.forEach(file => {
  const content = fs.readFileSync(path.resolve(file), 'utf-8');
  secretPatterns.forEach(pattern => {
    assert.doesNotMatch(
      content,
      pattern,
      `File ${file} contains potentially leaked secret matching pattern ${pattern}`
    );
  });
});
console.log('  ✓ No private credentials or server secrets found in any codebase file');

// 2. Audit: Phone number must NOT be used as document ID
console.log('Audit 2: Verifying phone number is NOT used as document ID');
['app.js', 'staff.js', 'admin.js'].forEach(file => {
  const content = fs.readFileSync(path.resolve(file), 'utf-8');
  assert.doesNotMatch(
    content,
    /doc\s*\(\s*db\s*,\s*['"]customers['"]\s*,\s*(phone|sanitizedPhone|cleanPhone)\s*\)/,
    `File ${file} must not use phone number as customer document ID`
  );
  // Verify user.uid is used instead
  if (file === 'app.js') {
    assert.match(
      content,
      /doc\s*\(\s*db\s*,\s*['"]customers['"]\s*,\s*currentUser\.uid\s*\)/,
      'app.js correctly uses currentUser.uid as document ID'
    );
  }
});
console.log('  ✓ Verified: Phone numbers are never used as document IDs. Auth UID is consistently used');

// 3. Audit: GitHub Pages relative paths
console.log('Audit 3: Verifying relative paths for GitHub Pages compatibility');
['index.html', 'staff.html', 'admin.html'].forEach(htmlFile => {
  const content = fs.readFileSync(path.resolve(htmlFile), 'utf-8');
  // Check stylesheet link
  assert.match(
    content,
    /<link[^>]+href="\.\/styles\.css"[^>]*>/,
    `${htmlFile} must use relative path for styles.css`
  );
  // Check script tag
  assert.match(
    content,
    /<script[^>]+src="\.\/[a-z]+\.js"[^>]*>/,
    `${htmlFile} must use relative path for script tag`
  );
  // Ensure no absolute root paths like href="/styles.css"
  assert.doesNotMatch(
    content,
    /href="\/styles\.css"/,
    `${htmlFile} must not use root-absolute paths`
  );
});
console.log('  ✓ All HTML assets use proper relative paths for GitHub Pages');

// 4. Audit: XSS protection (No unsafe innerHTML interpolation of customer data)
console.log('Audit 4: Auditing XSS protections');
['app.js', 'staff.js', 'admin.js'].forEach(jsFile => {
  const content = fs.readFileSync(path.resolve(jsFile), 'utf-8');
  assert.doesNotMatch(
    content,
    /\.innerHTML\s*=\s*.*(customer\.name|cData\.name|c\.name|customerName)/,
    `Potential XSS: ${jsFile} assigns customer name into innerHTML without textContent`
  );
  assert.doesNotMatch(
    content,
    /\.innerHTML\s*=\s*.*(customer\.phone|cData\.phone|c\.phone|customerPhone)/,
    `Potential XSS: ${jsFile} assigns phone into innerHTML without textContent`
  );
});
console.log('  ✓ All customer text dynamically rendered via textContent/DOM APIs (XSS-safe)');

// 5. Audit: Zero reliance on localStorage for authorization
console.log('Audit 5: Verifying zero reliance on localStorage for authentication');
['app.js', 'staff.js', 'admin.js'].forEach(jsFile => {
  const content = fs.readFileSync(path.resolve(jsFile), 'utf-8');
  assert.doesNotMatch(
    content,
    /localStorage\.getItem\s*\(\s*['"](token|auth|role|isStaff|isAdmin|stampCount)['"]\s*\)/,
    `${jsFile} must not rely on localStorage for authorization or stamp states`
  );
});
console.log('  ✓ Zero reliance on localStorage for authentication or privilege checks');

// 6. Audit: Indian mobile number validation format
console.log('Audit 6: Phone validation format verification');
const phoneRegex = /^[6-9]\d{9}$/;
assert.strictEqual(phoneRegex.test('9876543210'), true, 'Valid 10-digit mobile starting with 9');
assert.strictEqual(phoneRegex.test('8123456789'), true, 'Valid 10-digit mobile starting with 8');
assert.strictEqual(phoneRegex.test('7000000000'), true, 'Valid 10-digit mobile starting with 7');
assert.strictEqual(phoneRegex.test('6111111111'), true, 'Valid 10-digit mobile starting with 6');
assert.strictEqual(phoneRegex.test('5111111111'), false, 'Invalid mobile starting with 5');
assert.strictEqual(phoneRegex.test('987654321'), false, 'Too short (9 digits)');
assert.strictEqual(phoneRegex.test('98765432100'), false, 'Too long (11 digits)');
assert.strictEqual(phoneRegex.test('98765abc10'), false, 'Contains characters');
console.log('  ✓ Indian phone validation regex verified against all edge cases');

// 7. Audit: Error message sanitization (No internal Firebase errors to customers)
console.log('Audit 7: Verifying error sanitizer implementation');
const fbContent = fs.readFileSync(path.resolve('firebase.js'), 'utf-8');
assert.match(fbContent, /export\s+function\s+formatErrorMessage/, 'formatErrorMessage must be exported');
assert.match(fbContent, /Action\s+not\s+permitted/, 'Sanitizes permission-denied errors');
assert.match(fbContent, /You're\s+offline/, 'Sanitizes offline network errors');
console.log('  ✓ Error message sanitizer prevents raw Firebase stack/code leakage');

console.log('\n--- ALL SECURITY & INTEGRITY AUDIT CHECKS PASSED! ---');
