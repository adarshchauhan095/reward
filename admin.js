/**
 * The Bunny Loyalty Club - Admin Console Logic
 * Super-admin privilege management, customer analytics, and staff provisioning.
 */

import {
  auth,
  db,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  formatErrorMessage,
  isOnline
} from './firebase.js';

// DOM Elements
const offlineBanner = document.getElementById('offline-banner');
const navUserPanel = document.getElementById('nav-user-panel');
const adminNameDisplay = document.getElementById('admin-name-display');
const signoutBtn = document.getElementById('signout-btn');

const adminLoadingView = document.getElementById('admin-loading-view');
const loginView = document.getElementById('login-view');
const loginForm = document.getElementById('login-form');
const adminEmailInput = document.getElementById('admin-email-input');
const adminPasswordInput = document.getElementById('admin-password-input');
const loginSubmitBtn = document.getElementById('login-submit-btn');

const unauthorizedView = document.getElementById('unauthorized-view');
const adminMainView = document.getElementById('admin-main-view');

// Metrics
const metricTotalCustomers = document.getElementById('metric-total-customers');
const metricTotalVisits = document.getElementById('metric-total-visits');
const metricRewardsIssued = document.getElementById('metric-rewards-issued');
const metricRewardsRedeemedVal = document.getElementById('metric-rewards-redeemed-val');

// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Customers Tab
const customerSearchInput = document.getElementById('customer-search-input');
const customersTableBody = document.getElementById('customers-table-body');

// Staff Tab
const addStaffToggleBtn = document.getElementById('add-staff-toggle-btn');
const addStaffPanel = document.getElementById('add-staff-panel');
const addStaffForm = document.getElementById('add-staff-form');
const newStaffUid = document.getElementById('new-staff-uid');
const newStaffName = document.getElementById('new-staff-name');
const newStaffRole = document.getElementById('new-staff-role');
const saveStaffBtn = document.getElementById('save-staff-btn');
const staffTableBody = document.getElementById('staff-table-body');

// History Tab
const auditTableBody = document.getElementById('audit-table-body');
const toastContainer = document.getElementById('toast-container');

// State
let currentAdmin = null;
let customersCache = [];
let staffCache = [];
let isProcessing = false;

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
  showToast("You're offline. Modifications disabled.", 'error');
});

// ----------------------------------------------------
// Authentication Flow
// ----------------------------------------------------
async function handleLogin(e) {
  e.preventDefault();
  if (isProcessing) return;

  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value;

  if (!email || !password) {
    showToast('Please enter both admin email and password.', 'error');
    return;
  }

  isProcessing = true;
  loginSubmitBtn.disabled = true;
  const origText = loginSubmitBtn.querySelector('span').textContent;
  loginSubmitBtn.querySelector('span').textContent = 'Validating credentials...';

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error('Admin login error:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    isProcessing = false;
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.querySelector('span').textContent = origText;
  }
}

async function handleSignOut() {
  try {
    await signOut(auth);
    showToast('Signed out', 'info');
  } catch (err) {
    console.error('Sign out error:', err);
  }
}

// ----------------------------------------------------
// Tabs Navigation
// ----------------------------------------------------
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.add('hidden'));

    btn.classList.add('active');
    const target = document.getElementById(btn.getAttribute('data-tab'));
    if (target) target.classList.remove('hidden');
  });
});

// ----------------------------------------------------
// Customer Management & Roster
// ----------------------------------------------------
function renderCustomersTable(customers) {
  if (!customers || customers.length === 0) {
    customersTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">
          No matching loyalty customers found.
        </td>
      </tr>
    `;
    return;
  }

  customersTableBody.innerHTML = '';

  customers.forEach(c => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = c.name || 'Valued Guest'; // Safe textContent (XSS Protection)
    nameTd.style.fontWeight = '600';
    nameTd.style.color = '#fff';

    const phoneTd = document.createElement('td');
    phoneTd.textContent = c.phone || 'N/A';

    const stampsTd = document.createElement('td');
    const sc = Number(c.stampCount || 0);
    stampsTd.textContent = `${sc} / 10`;
    stampsTd.style.color = sc >= 10 ? 'var(--emerald)' : 'var(--gold-light)';
    stampsTd.style.fontWeight = '700';

    const cycleTd = document.createElement('td');
    cycleTd.textContent = `Cycle ${c.cycleNumber || 1}`;

    const visitsTd = document.createElement('td');
    visitsTd.textContent = String(c.totalVisits || 0);

    const rewardsTd = document.createElement('td');
    rewardsTd.textContent = String(c.totalRewards || 0);

    const dateTd = document.createElement('td');
    dateTd.textContent = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString('en-IN') : 'N/A';

    tr.appendChild(nameTd);
    tr.appendChild(phoneTd);
    tr.appendChild(stampsTd);
    tr.appendChild(cycleTd);
    tr.appendChild(visitsTd);
    tr.appendChild(rewardsTd);
    tr.appendChild(dateTd);

    customersTableBody.appendChild(tr);
  });
}

function filterCustomers() {
  const q = customerSearchInput.value.trim().toLowerCase();
  if (!q) {
    renderCustomersTable(customersCache);
    return;
  }

  const filtered = customersCache.filter(c => {
    const nameMatch = (c.name || '').toLowerCase().includes(q);
    const phoneMatch = (c.phone || '').includes(q);
    return nameMatch || phoneMatch;
  });

  renderCustomersTable(filtered);
}

customerSearchInput.addEventListener('input', filterCustomers);

function initCustomersStream() {
  const q = query(collection(db, 'customers'), limit(200));
  onSnapshot(q, (snapshot) => {
    customersCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    metricTotalCustomers.textContent = customersCache.length;
    filterCustomers();
  }, (err) => {
    console.error('Customers stream error:', err);
  });
}

// ----------------------------------------------------
// Staff Provisioning & Access Control
// ----------------------------------------------------
function renderStaffTable(staffList) {
  if (!staffList || staffList.length === 0) {
    staffTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
          No staff records configured yet.
        </td>
      </tr>
    `;
    return;
  }

  staffTableBody.innerHTML = '';

  staffList.forEach(member => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = member.name || 'Staff Member';
    nameTd.style.fontWeight = '600';
    nameTd.style.color = '#fff';

    const uidTd = document.createElement('td');
    uidTd.style.fontFamily = 'monospace';
    uidTd.style.fontSize = '11px';
    uidTd.textContent = member.id;

    const roleTd = document.createElement('td');
    roleTd.textContent = member.role === 'admin' ? '👑 Admin' : 'Specialist';
    roleTd.style.color = member.role === 'admin' ? 'var(--rose-gold)' : 'var(--text-sub)';

    const statusTd = document.createElement('td');
    const isActive = member.active === true;
    statusTd.innerHTML = isActive 
      ? '<span style="color: var(--emerald); font-weight: 600;">Active</span>' 
      : '<span style="color: var(--crimson); font-weight: 600;">Disabled</span>';

    const actionTd = document.createElement('td');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = isActive ? 'btn btn-danger' : 'btn btn-success';
    toggleBtn.style.padding = '4px 10px';
    toggleBtn.style.fontSize = '11px';
    toggleBtn.textContent = isActive ? 'Revoke Access' : 'Activate Access';
    toggleBtn.addEventListener('click', () => toggleStaffActive(member.id, isActive, toggleBtn));

    actionTd.appendChild(toggleBtn);

    tr.appendChild(nameTd);
    tr.appendChild(uidTd);
    tr.appendChild(roleTd);
    tr.appendChild(statusTd);
    tr.appendChild(actionTd);

    staffTableBody.appendChild(tr);
  });
}

async function toggleStaffActive(uid, currentActive, btnElement) {
  if (!isOnline()) {
    showToast("You're offline. Cannot update permissions.", 'error');
    return;
  }

  btnElement.disabled = true;
  try {
    await updateDoc(doc(db, 'staff', uid), {
      active: !currentActive
    });
    showToast(`Staff access ${!currentActive ? 'granted' : 'revoked'}.`, 'success');
  } catch (err) {
    console.error('Toggle staff error:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    btnElement.disabled = false;
  }
}

async function handleAddStaff(e) {
  e.preventDefault();
  if (!isOnline()) {
    showToast("You're offline. Cannot register staff.", 'error');
    return;
  }

  const uid = newStaffUid.value.trim();
  const name = newStaffName.value.trim();
  const role = newStaffRole.value;

  if (!uid || !name) {
    showToast('Please provide both the Auth UID and Staff Name.', 'error');
    return;
  }

  saveStaffBtn.disabled = true;
  try {
    await setDoc(doc(db, 'staff', uid), {
      name: name,
      role: role,
      active: true
    });

    showToast('Staff registered successfully!', 'success');
    addStaffForm.reset();
    addStaffPanel.classList.add('hidden');
  } catch (err) {
    console.error('Add staff error:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    saveStaffBtn.disabled = false;
  }
}

addStaffToggleBtn.addEventListener('click', () => {
  addStaffPanel.classList.toggle('hidden');
});

addStaffForm.addEventListener('submit', handleAddStaff);

function initStaffStream() {
  const q = collection(db, 'staff');
  onSnapshot(q, (snapshot) => {
    staffCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStaffTable(staffCache);
  }, (err) => {
    console.error('Staff stream error:', err);
  });
}

// ----------------------------------------------------
// History & Audit Logs Stream
// ----------------------------------------------------
function initAuditLogs() {
  const visitsRef = collection(db, 'visits');
  const q = query(visitsRef, orderBy('createdAt', 'desc'), limit(50));

  onSnapshot(q, (snapshot) => {
    metricTotalVisits.textContent = snapshot.size;

    if (snapshot.empty) {
      auditTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">
            No historical logs available yet.
          </td>
        </tr>
      `;
      return;
    }

    auditTableBody.innerHTML = '';

    snapshot.docs.forEach(d => {
      const visit = d.data();
      const tr = document.createElement('tr');

      const timeTd = document.createElement('td');
      timeTd.textContent = visit.createdAt?.toDate ? visit.createdAt.toDate().toLocaleString('en-IN') : 'N/A';

      const custTd = document.createElement('td');
      custTd.style.fontFamily = 'monospace';
      custTd.style.fontSize = '11px';
      custTd.textContent = (visit.customerId || '').substring(0, 10) + '...';

      const cycleTd = document.createElement('td');
      cycleTd.textContent = String(visit.cycleNumber || 1);

      const stampTd = document.createElement('td');
      stampTd.textContent = String(visit.stampNumber || 0);

      const statusTd = document.createElement('td');
      let statusColor = 'var(--amber)';
      if (visit.status === 'approved') statusColor = 'var(--emerald)';
      if (visit.status === 'rejected') statusColor = 'var(--crimson)';
      statusTd.innerHTML = `<span style="color: ${statusColor}; font-weight: 600;">${visit.status || 'pending'}</span>`;

      const staffTd = document.createElement('td');
      staffTd.style.fontFamily = 'monospace';
      staffTd.style.fontSize = '11px';
      staffTd.textContent = visit.approvedBy ? visit.approvedBy.substring(0, 10) + '...' : '-';

      tr.appendChild(timeTd);
      tr.appendChild(custTd);
      tr.appendChild(cycleTd);
      tr.appendChild(stampTd);
      tr.appendChild(statusTd);
      tr.appendChild(staffTd);

      auditTableBody.appendChild(tr);
    });
  }, (err) => {
    console.error('Audit stream error:', err);
  });

  // Rewards Metrics Stream
  const rewardsRef = collection(db, 'rewards');
  onSnapshot(rewardsRef, (snapshot) => {
    metricRewardsIssued.textContent = snapshot.size;
    let totalRedeemedVal = 0;
    snapshot.docs.forEach(d => {
      const r = d.data();
      if (r.status === 'redeemed') {
        totalRedeemedVal += Number(r.value || 3000);
      }
    });
    metricRewardsRedeemedVal.textContent = `₹${totalRedeemedVal.toLocaleString('en-IN')}`;
  });
}

// ----------------------------------------------------
// Main Initialization Flow
// ----------------------------------------------------
function initAdminApp() {
  updateOfflineStatus();

  onAuthStateChanged(auth, async (user) => {
    // Hide initial loader once auth state resolves
    if (adminLoadingView) adminLoadingView.classList.add('hidden');

    // Treat unauthenticated visitors or anonymous customer sessions as needing admin sign in
    if (!user || user.isAnonymous) {
      currentAdmin = null;
      navUserPanel.classList.add('hidden');
      loginView.classList.remove('hidden');
      unauthorizedView.classList.add('hidden');
      adminMainView.classList.add('hidden');

      // Silently clear anonymous customer session
      if (user && user.isAnonymous) {
        try {
          await signOut(auth);
        } catch (e) {
          // ignore silent signout error
        }
      }
      return;
    }

    try {
      const staffDoc = await getDoc(doc(db, 'staff', user.uid));
      if (!staffDoc.exists() || staffDoc.data().active !== true || staffDoc.data().role !== 'admin') {
        navUserPanel.classList.add('hidden');
        loginView.classList.add('hidden');
        unauthorizedView.classList.remove('hidden');
        adminMainView.classList.add('hidden');
        return;
      }

      currentAdmin = staffDoc.data();
      adminNameDisplay.textContent = currentAdmin.name || user.email;

      navUserPanel.classList.remove('hidden');
      loginView.classList.add('hidden');
      unauthorizedView.classList.add('hidden');
      adminMainView.classList.remove('hidden');

      initCustomersStream();
      initStaffStream();
      initAuditLogs();
    } catch (err) {
      console.error('Admin verification error:', err);
      showToast('Error verifying administrative role: ' + formatErrorMessage(err), 'error');
    }
  });
}

loginForm.addEventListener('submit', handleLogin);
signoutBtn.addEventListener('click', handleSignOut);

initAdminApp();
