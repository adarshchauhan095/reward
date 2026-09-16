/**
 * The Bunny Loyalty Club - Staff Portal Logic
 * Implements strict transaction checks, role authorization, and real-time queues.
 */

import {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  formatErrorMessage,
  isOnline
} from './firebase.js';

// DOM Elements
const offlineBanner = document.getElementById('offline-banner');
const navUserPanel = document.getElementById('nav-user-panel');
const staffNameDisplay = document.getElementById('staff-name-display');
const staffRoleBadge = document.getElementById('staff-role-badge');
const adminLinkBtn = document.getElementById('admin-link-btn');
const signoutBtn = document.getElementById('signout-btn');

const loginView = document.getElementById('login-view');
const loginForm = document.getElementById('login-form');
const staffEmailInput = document.getElementById('staff-email-input');
const staffPasswordInput = document.getElementById('staff-password-input');
const loginSubmitBtn = document.getElementById('login-submit-btn');

const unauthorizedView = document.getElementById('unauthorized-view');
const unauthorizedSignoutBtn = document.getElementById('unauthorized-signout-btn');
const staffMainView = document.getElementById('staff-main-view');

// Metrics
const metricPendingCount = document.getElementById('metric-pending-count');
const metricApprovedCount = document.getElementById('metric-approved-count');
const metricRewardsAvailable = document.getElementById('metric-rewards-available');
const metricRewardsRedeemed = document.getElementById('metric-rewards-redeemed');

// Queues & Tables
const pendingQueue = document.getElementById('pending-queue');
const rewardsQueue = document.getElementById('rewards-queue');
const approvedVisitsTableBody = document.getElementById('approved-visits-table-body');
const toastContainer = document.getElementById('toast-container');

// State
let currentStaff = null;
let pendingUnsubscribe = null;
let rewardsUnsubscribe = null;
let approvedUnsubscribe = null;
let processingAction = false;

// ----------------------------------------------------
// UI Notification Helpers
// ----------------------------------------------------
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function updateOfflineStatus() {
  if (!isOnline()) {
    offlineBanner.classList.remove('hidden');
  } else {
    offlineBanner.classList.add('hidden');
  }
}

window.addEventListener('online', () => {
  updateOfflineStatus();
  showToast('Back online', 'success');
});

window.addEventListener('offline', () => {
  updateOfflineStatus();
  showToast("You're offline. Action disabled.", 'error');
});

// ----------------------------------------------------
// Auth & Role Verification
// ----------------------------------------------------
async function handleLogin(e) {
  e.preventDefault();
  if (processingAction) return;

  const email = staffEmailInput.value.trim();
  const password = staffPasswordInput.value;

  if (!email || !password) {
    showToast('Please enter both email and password.', 'error');
    return;
  }

  processingAction = true;
  loginSubmitBtn.disabled = true;
  const originalText = loginSubmitBtn.querySelector('span').textContent;
  loginSubmitBtn.querySelector('span').textContent = 'Signing in...';

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast('Signed in successfully', 'success');
  } catch (err) {
    console.error('Staff login error:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    processingAction = false;
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.querySelector('span').textContent = originalText;
  }
}

async function handleSignOut() {
  try {
    if (pendingUnsubscribe) pendingUnsubscribe();
    if (rewardsUnsubscribe) rewardsUnsubscribe();
    if (approvedUnsubscribe) approvedUnsubscribe();
    await signOut(auth);
    showToast('Signed out', 'info');
  } catch (err) {
    console.error('Sign out error:', err);
  }
}

// ----------------------------------------------------
// Transaction: Approve Customer Visit
// ----------------------------------------------------
async function approveVisit(visitId, customerId, buttonElement) {
  if (processingAction) return;
  if (!isOnline()) {
    showToast("You're offline. Cannot verify visit.", 'error');
    return;
  }

  // Double-click protection
  processingAction = true;
  buttonElement.disabled = true;
  const originalHtml = buttonElement.innerHTML;
  buttonElement.innerHTML = '<span class="spinner"></span>';

  try {
    await runTransaction(db, async (transaction) => {
      const visitRef = doc(db, 'visits', visitId);
      const visitSnap = await transaction.get(visitRef);

      if (!visitSnap.exists()) {
        throw new Error('Visit record not found.');
      }

      const visitData = visitSnap.data();
      if (visitData.status !== 'pending') {
        throw new Error(`Visit is already ${visitData.status}.`);
      }

      const customerRef = doc(db, 'customers', customerId);
      const customerSnap = await transaction.get(customerRef);

      if (!customerSnap.exists()) {
        throw new Error('Customer record not found.');
      }

      const customerData = customerSnap.data();
      const currentStamp = Number(customerData.stampCount || 0);

      if (currentStamp >= 10) {
        throw new Error('Customer has reached 10 stamps. Please redeem the ₹3,000 reward before awarding new stamps.');
      }

      const nextStamp = currentStamp + 1;
      const currentCycle = Number(customerData.cycleNumber || 1);

      // 1. Update Visit Document
      transaction.update(visitRef, {
        status: 'approved',
        stampNumber: nextStamp,
        cycleNumber: currentCycle,
        approvedAt: serverTimestamp(),
        approvedBy: auth.currentUser.uid
      });

      // 2. If 10th stamp reached -> Create Reward Document & Update Customer
      if (nextStamp === 10) {
        const rewardRef = doc(collection(db, 'rewards'));
        transaction.set(rewardRef, {
          customerId: customerId,
          cycleNumber: currentCycle,
          type: 'complimentary_service',
          value: 3000,
          status: 'available',
          createdAt: serverTimestamp(),
          redeemedAt: null,
          redeemedBy: null
        });

        transaction.update(customerRef, {
          stampCount: 10,
          rewardAvailable: true,
          totalVisits: (customerData.totalVisits || 0) + 1,
          lastVisitAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        // Standard stamp increment
        transaction.update(customerRef, {
          stampCount: nextStamp,
          totalVisits: (customerData.totalVisits || 0) + 1,
          lastVisitAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    });

    showToast('✨ Visit approved & stamp awarded!', 'success');
  } catch (err) {
    console.error('Approval transaction failed:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    processingAction = false;
    buttonElement.innerHTML = originalHtml;
    buttonElement.disabled = false;
  }
}

// ----------------------------------------------------
// Reject Customer Visit
// ----------------------------------------------------
async function rejectVisit(visitId, customerId, buttonElement) {
  if (processingAction) return;
  if (!isOnline()) {
    showToast("You're offline. Cannot modify visit.", 'error');
    return;
  }

  if (!confirm('Are you sure you want to decline this visit request?')) {
    return;
  }

  processingAction = true;
  buttonElement.disabled = true;
  const originalHtml = buttonElement.innerHTML;
  buttonElement.innerHTML = '<span class="spinner"></span>';

  try {
    await runTransaction(db, async (transaction) => {
      const visitRef = doc(db, 'visits', visitId);
      const visitSnap = await transaction.get(visitRef);

      if (!visitSnap.exists() || visitSnap.data().status !== 'pending') {
        throw new Error('Visit record is no longer pending.');
      }

      transaction.update(visitRef, {
        status: 'rejected',
        stampNumber: 0,
        approvedAt: serverTimestamp(),
        approvedBy: auth.currentUser.uid
      });
    });

    showToast('Visit request declined.', 'info');
  } catch (err) {
    console.error('Reject visit failed:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    processingAction = false;
    buttonElement.innerHTML = originalHtml;
    buttonElement.disabled = false;
  }
}

// ----------------------------------------------------
// Transaction: Redeem ₹3,000 Reward Voucher
// ----------------------------------------------------
async function redeemReward(rewardId, customerId, buttonElement) {
  if (processingAction) return;
  if (!isOnline()) {
    showToast("You're offline. Cannot redeem reward.", 'error');
    return;
  }

  if (!confirm('Confirm redemption of ₹3,000 complimentary beauty service? This will complete the current cycle and start a fresh cycle.')) {
    return;
  }

  processingAction = true;
  buttonElement.disabled = true;
  const originalHtml = buttonElement.innerHTML;
  buttonElement.innerHTML = '<span class="spinner"></span>';

  try {
    await runTransaction(db, async (transaction) => {
      const rewardRef = doc(db, 'rewards', rewardId);
      const rewardSnap = await transaction.get(rewardRef);

      if (!rewardSnap.exists()) {
        throw new Error('Reward record not found.');
      }

      const rewardData = rewardSnap.data();
      if (rewardData.status !== 'available') {
        throw new Error('This reward has already been redeemed.');
      }

      const customerRef = doc(db, 'customers', customerId);
      const customerSnap = await transaction.get(customerRef);

      if (!customerSnap.exists()) {
        throw new Error('Customer record not found.');
      }

      const customerData = customerSnap.data();

      // 1. Mark reward as redeemed
      transaction.update(rewardRef, {
        status: 'redeemed',
        redeemedAt: serverTimestamp(),
        redeemedBy: auth.currentUser.uid
      });

      // 2. Reset customer loyalty stamps, increment cycle number, preserve total metrics
      transaction.update(customerRef, {
        stampCount: 0,
        cycleNumber: (customerData.cycleNumber || 1) + 1,
        rewardAvailable: false,
        totalRewards: (customerData.totalRewards || 0) + 1,
        updatedAt: serverTimestamp()
      });
    });

    showToast('🎉 Reward successfully redeemed! New cycle started.', 'success');
  } catch (err) {
    console.error('Redeem transaction failed:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    processingAction = false;
    buttonElement.innerHTML = originalHtml;
    buttonElement.disabled = false;
  }
}

// ----------------------------------------------------
// Realtime Pending Queue Listener
// ----------------------------------------------------
function initPendingQueue() {
  const visitsRef = collection(db, 'visits');
  const q = query(
    visitsRef,
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );

  pendingUnsubscribe = onSnapshot(q, async (snapshot) => {
    metricPendingCount.textContent = snapshot.size;

    if (snapshot.empty) {
      pendingQueue.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">☕</div>
          <p>No customers currently waiting for verification.</p>
        </div>
      `;
      return;
    }

    pendingQueue.innerHTML = '';

    for (const docSnap of snapshot.docs) {
      const visit = { id: docSnap.id, ...docSnap.data() };
      
      // Fetch customer doc for details
      let customerName = 'Guest';
      let customerPhone = 'N/A';
      let currentStamps = 0;

      try {
        const cSnap = await getDoc(doc(db, 'customers', visit.customerId));
        if (cSnap.exists()) {
          const cData = cSnap.data();
          customerName = cData.name || 'Guest';
          customerPhone = cData.phone || 'N/A';
          currentStamps = Number(cData.stampCount || 0);
        }
      } catch (err) {
        console.warn('Customer fetch warning:', err);
      }

      const card = document.createElement('div');
      card.className = 'queue-card';

      const infoDiv = document.createElement('div');
      
      const nameH = document.createElement('div');
      nameH.className = 'queue-customer-name';
      nameH.textContent = customerName; // Safe textContent (XSS Protection)

      const metaDiv = document.createElement('div');
      metaDiv.className = 'queue-customer-meta';
      const timeStr = visit.createdAt?.toDate ? visit.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';
      metaDiv.textContent = `📱 ${customerPhone} • Requested: ${timeStr} • Current: ${currentStamps}/10 (Will award #${currentStamps + 1})`;

      infoDiv.appendChild(nameH);
      infoDiv.appendChild(metaDiv);

      // Actions
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'queue-actions';

      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn btn-success';
      approveBtn.innerHTML = '✓ Approve';
      approveBtn.addEventListener('click', () => approveVisit(visit.id, visit.customerId, approveBtn));

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn btn-danger';
      rejectBtn.innerHTML = '✕ Decline';
      rejectBtn.addEventListener('click', () => rejectVisit(visit.id, visit.customerId, rejectBtn));

      actionsDiv.appendChild(approveBtn);
      actionsDiv.appendChild(rejectBtn);

      card.appendChild(infoDiv);
      card.appendChild(actionsDiv);

      pendingQueue.appendChild(card);
    }
  }, (err) => {
    console.error('Pending visits listener error:', err);
  });
}

// ----------------------------------------------------
// Realtime Rewards Queue Listener
// ----------------------------------------------------
function initRewardsQueue() {
  const rewardsRef = collection(db, 'rewards');
  const q = query(
    rewardsRef,
    where('status', '==', 'available'),
    orderBy('createdAt', 'desc')
  );

  rewardsUnsubscribe = onSnapshot(q, async (snapshot) => {
    metricRewardsAvailable.textContent = snapshot.size;

    if (snapshot.empty) {
      rewardsQueue.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎁</div>
          <p>No customers currently waiting to redeem rewards.</p>
        </div>
      `;
      return;
    }

    rewardsQueue.innerHTML = '';

    for (const docSnap of snapshot.docs) {
      const reward = { id: docSnap.id, ...docSnap.data() };
      
      let customerName = 'Guest';
      let customerPhone = 'N/A';

      try {
        const cSnap = await getDoc(doc(db, 'customers', reward.customerId));
        if (cSnap.exists()) {
          const cData = cSnap.data();
          customerName = cData.name || 'Guest';
          customerPhone = cData.phone || 'N/A';
        }
      } catch (err) {
        console.warn('Customer fetch warning:', err);
      }

      const card = document.createElement('div');
      card.className = 'queue-card';
      card.style.borderColor = 'var(--gold-primary)';

      const infoDiv = document.createElement('div');
      
      const nameH = document.createElement('div');
      nameH.className = 'queue-customer-name';
      nameH.textContent = `👑 ${customerName}`; // Safe textContent

      const metaDiv = document.createElement('div');
      metaDiv.className = 'queue-customer-meta';
      metaDiv.textContent = `📱 ${customerPhone} • Cycle #${reward.cycleNumber || 1} • Reward Value: ₹${reward.value || 3000}`;

      infoDiv.appendChild(nameH);
      infoDiv.appendChild(metaDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'queue-actions';

      const redeemBtn = document.createElement('button');
      redeemBtn.className = 'btn btn-primary';
      redeemBtn.textContent = 'Redeem ₹3,000 Reward';
      redeemBtn.addEventListener('click', () => redeemReward(reward.id, reward.customerId, redeemBtn));

      actionsDiv.appendChild(redeemBtn);
      card.appendChild(infoDiv);
      card.appendChild(actionsDiv);

      rewardsQueue.appendChild(card);
    }
  }, (err) => {
    console.error('Rewards listener error:', err);
  });
}

// ----------------------------------------------------
// Realtime Approved Visits Log & Redeemed Rewards Log
// ----------------------------------------------------
function initApprovedVisitsLog() {
  const visitsRef = collection(db, 'visits');
  const q = query(
    visitsRef,
    where('status', '==', 'approved'),
    orderBy('approvedAt', 'desc'),
    limit(25)
  );

  approvedUnsubscribe = onSnapshot(q, async (snapshot) => {
    metricApprovedCount.textContent = snapshot.size;

    if (snapshot.empty) {
      approvedVisitsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
            No visits approved today yet.
          </td>
        </tr>
      `;
      return;
    }

    approvedVisitsTableBody.innerHTML = '';

    for (const docSnap of snapshot.docs) {
      const visit = docSnap.data();

      let customerName = 'Guest';
      let customerPhone = 'N/A';

      try {
        const cSnap = await getDoc(doc(db, 'customers', visit.customerId));
        if (cSnap.exists()) {
          const cData = cSnap.data();
          customerName = cData.name || 'Guest';
          customerPhone = cData.phone || 'N/A';
        }
      } catch (err) {
        console.warn('Customer lookup error:', err);
      }

      const tr = document.createElement('tr');

      const timeTd = document.createElement('td');
      timeTd.textContent = visit.approvedAt?.toDate ? visit.approvedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';

      const nameTd = document.createElement('td');
      nameTd.textContent = customerName; // Safe textContent
      nameTd.style.fontWeight = '600';
      nameTd.style.color = '#fff';

      const phoneTd = document.createElement('td');
      phoneTd.textContent = customerPhone;

      const stampTd = document.createElement('td');
      stampTd.textContent = `Stamp #${visit.stampNumber || 1} (Cycle ${visit.cycleNumber || 1})`;
      stampTd.style.color = 'var(--gold-light)';

      const statusTd = document.createElement('td');
      statusTd.innerHTML = '<span style="color: var(--emerald); font-weight: 600;">✓ Approved</span>';

      tr.appendChild(timeTd);
      tr.appendChild(nameTd);
      tr.appendChild(phoneTd);
      tr.appendChild(stampTd);
      tr.appendChild(statusTd);

      approvedVisitsTableBody.appendChild(tr);
    }
  }, (err) => {
    console.error('Approved visits listener error:', err);
  });

  // Query redeemed rewards count
  const rewardsRef = collection(db, 'rewards');
  const rQ = query(rewardsRef, where('status', '==', 'redeemed'));
  onSnapshot(rQ, (snap) => {
    metricRewardsRedeemed.textContent = snap.size;
  });
}

// ----------------------------------------------------
// Main Initialization & Auth State
// ----------------------------------------------------
function initStaffApp() {
  updateOfflineStatus();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // Show login form
      currentStaff = null;
      navUserPanel.classList.add('hidden');
      loginView.classList.remove('hidden');
      unauthorizedView.classList.add('hidden');
      staffMainView.classList.add('hidden');
      return;
    }

    // Verify staff role in Firestore
    try {
      const staffDoc = await getDoc(doc(db, 'staff', user.uid));
      if (!staffDoc.exists() || staffDoc.data().active !== true) {
        // User authenticated but not authorized active staff
        navUserPanel.classList.add('hidden');
        loginView.classList.add('hidden');
        unauthorizedView.classList.remove('hidden');
        staffMainView.classList.add('hidden');
        return;
      }

      currentStaff = staffDoc.data();
      staffNameDisplay.textContent = currentStaff.name || user.email;
      staffRoleBadge.textContent = currentStaff.role === 'admin' ? 'Admin' : 'Staff';
      
      if (currentStaff.role === 'admin') {
        adminLinkBtn.classList.remove('hidden');
      } else {
        adminLinkBtn.classList.add('hidden');
      }

      navUserPanel.classList.remove('hidden');
      loginView.classList.add('hidden');
      unauthorizedView.classList.add('hidden');
      staffMainView.classList.remove('hidden');

      // Initialize real-time streams
      initPendingQueue();
      initRewardsQueue();
      initApprovedVisitsLog();
    } catch (err) {
      console.error('Staff verification failed:', err);
      showToast('Error validating staff credentials: ' + formatErrorMessage(err), 'error');
    }
  });
}

// Event Listeners
loginForm.addEventListener('submit', handleLogin);
signoutBtn.addEventListener('click', handleSignOut);
unauthorizedSignoutBtn.addEventListener('click', handleSignOut);

initStaffApp();
