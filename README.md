# The Bunny Loyalty Club

**The Bunny Luxury Hair & Beauty Studio**  
*Exclusive 10-Stamp Client Loyalty Program*

---

## 🌟 Overview

**The Bunny Loyalty Club** is a serverless, mobile-first web application designed for seamless customer check-ins and verified loyalty reward redemptions.

### Core Value Proposition
- **Client Experience:** Scan salon QR → First visit registers with Name & Phone → Returning visits recognized instantly with zero repetitive forms → Real-time stamp updates.
- **Reward Offer:** Collect 10 stamps to unlock a **₹3,000 Complimentary Hair & Beauty Service**.
- **Security Guarantee:** Customers cannot forge stamps, approve visits, or redeem rewards. Every state transition is guarded by **Firestore Security Rules** and atomic **Firestore Transactions**.

---

## 🏗️ Architecture & Stack

- **Hosting:** GitHub Pages (Static hosting with HTTPS).
- **Frontend:** Vanilla HTML5 / CSS3 (Luxury Obsidian & Champagne Gold design system) / Modern JavaScript ES Modules.
- **Authentication:** Firebase Auth
  - **Customers:** Anonymous Authentication (seamless device-bound session).
  - **Staff & Admins:** Email / Password Authentication.
- **Database:** Google Cloud Firestore (Strictly secured collections).
- **Backend:** None required (100% serverless, zero paid server costs, Firebase Free Spark tier compatible).

---

## 🔐 Database Schema

### 1. `customers/{uid}`
```typescript
{
  name: string;             // Client full name (2-60 chars)
  phone: string;            // 10-digit Indian mobile number
  stampCount: number;       // Current cycle stamp count (0-10)
  cycleNumber: number;      // Current loyalty cycle (starts at 1)
  totalVisits: number;      // Lifetime visit count
  totalRewards: number;     // Lifetime rewards redeemed
  rewardAvailable: boolean; // True when 10th stamp is awarded
  createdAt: Timestamp;     // Server timestamp
  updatedAt: Timestamp;     // Server timestamp
  lastVisitAt: Timestamp;   // Timestamp of latest approved visit
}
```

### 2. `visits/{visitId}`
```typescript
{
  customerId: string;       // Customer's Firebase Auth UID
  cycleNumber: number;      // Cycle number when visit took place
  stampNumber: number;      // 0 for pending; 1-10 when approved
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;     // When customer scanned/checked-in
  approvedAt: Timestamp;    // When staff approved/rejected
  approvedBy: string;       // Staff UID who approved/rejected
}
```

### 3. `rewards/{rewardId}`
```typescript
{
  customerId: string;       // Customer UID
  cycleNumber: number;      // Cycle number when reward was earned
  type: "complimentary_service";
  value: 3000;              // ₹3,000 INR
  status: "available" | "redeemed";
  createdAt: Timestamp;     // When 10th stamp was awarded
  redeemedAt: Timestamp;    // When staff redeemed in salon
  redeemedBy: string;       // Staff UID who redeemed
}
```

### 4. `staff/{uid}`
```typescript
{
  name: string;             // Staff specialist name
  role: "staff" | "admin";  // Access role
  active: boolean;          // Active status flag
}
```

---

## 🛡️ Security & Integrity Guarantees

1. **Zero Client Trust:**
   - Client applications never write stamps or rewards directly.
   - All stamp increments and reward unlocks are executed inside Firestore atomic transactions run by active staff accounts.
2. **Immutable Audit Trail:**
   - Previous visits and redeemed rewards are **never deleted** when a loyalty cycle resets.
   - Total historical statistics (`totalVisits`, `totalRewards`, `cycleNumber`) persist indefinitely.
3. **No Static QR Vulnerability:**
   - Physical presence is validated by salon staff approval, not merely by possessing the QR URL.
4. **Duplicate Protection:**
   - Real-time queries check for active pending visits before creating new ones.
   - Double-click protection and transaction checks prevent race conditions or simultaneous approvals.
5. **No Public Firestore Reads:**
   - Every collection is closed by default. Customers can read only their own records; only authenticated active staff can view the verification queue.
6. **XSS Protection:**
   - All customer-supplied data is rendered using `textContent` and DOM APIs. No raw `innerHTML` interpolation of user input.

---

## 🚀 Deployment Instructions (GitHub Pages)

1. **Initialize Git & Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "feat: Production-ready The Bunny Loyalty Club"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. **Enable GitHub Pages:**
   - Open your repository on GitHub → **Settings** → **Pages**.
   - Under **Build and deployment** → **Source**, select `Deploy from a branch`.
   - Select Branch: `main`, Folder: `/ (root)`. Click **Save**.
3. **Configure Authorized Domains in Firebase:**
   - Go to [Firebase Console](https://console.firebase.google.com/) → Select `the-bunny-salon`.
   - Go to **Authentication** → **Settings** → **Authorized domains**.
   - Add `<your-username>.github.io`.

---

## 👥 Staff & Admin Onboarding

1. Create a Firebase Authentication user in Firebase Console (**Authentication** → **Users** → **Add user**).
2. Copy the generated User UID.
3. Add a document in Firestore under `staff/{uid}`:
   ```json
   {
     "name": "Manager Name",
     "role": "admin",
     "active": true
   }
   ```
4. Staff can now log in at `staff.html` or `admin.html`.

---

## 🧪 Testing

Automated test suites verify:
- Security rules enforcement (unauthorized write denial, field validations, role boundaries).
- Flow transactions (stamp increments, 10th stamp reward creation, redemption cycle reset).
- Offline handling and input sanitization.

To run tests locally:
```bash
node tests/test-rules.js
node tests/test-flows.js
```
