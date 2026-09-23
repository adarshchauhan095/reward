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
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
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

// Universal SaaS Settings Elements
const programSettingsForm = document.getElementById('program-settings-form');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const cfgBusinessName = document.getElementById('cfg-business-name');
const cfgBusinessCategory = document.getElementById('cfg-business-category');
const cfgBusinessTagline = document.getElementById('cfg-business-tagline');
const cfgBrandIcon = document.getElementById('cfg-brand-icon');
const cfgCurrencySymbol = document.getElementById('cfg-currency-symbol');
const cfgTargetStamps = document.getElementById('cfg-target-stamps');
const cfgMinSpend = document.getElementById('cfg-min-spend');
const cfgStampIcon = document.getElementById('cfg-stamp-icon');
const cfgVipIcon = document.getElementById('cfg-vip-icon');
const cfgRewardTitle = document.getElementById('cfg-reward-title');
const cfgRewardValue = document.getElementById('cfg-reward-value');
const cfgRewardExpiry = document.getElementById('cfg-reward-expiry');
const cfgReferralMessage = document.getElementById('cfg-referral-message');
const cfgStreakDays = document.getElementById('cfg-streak-days');

// Danger Zone Elements
const resetTargetCustomer = document.getElementById('reset-target-customer');
const resetNewStamps = document.getElementById('reset-new-stamps');
const executeCustomerResetBtn = document.getElementById('execute-customer-reset-btn');
const purgeHistoryBtn = document.getElementById('purge-history-btn');
const factoryResetConfirmInput = document.getElementById('factory-reset-confirm-input');
const factoryResetBtn = document.getElementById('factory-reset-btn');

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
let programConfig = {
  businessName: 'The Bunny',
  businessCategory: 'Hair & Beauty Salon',
  businessTagline: 'Luxury Hair & Beauty Studio',
  brandIcon: '🐰',
  currencySymbol: '₹',
  targetStamps: 10,
  minSpend: 600,
  stampIcon: '★',
  vipIcon: '👑',
  rewardTitle: 'Complimentary Hair & Beauty Service',
  rewardValue: 3000,
  rewardExpiryDays: 60,
  referralMessage: 'Hey! Join the exclusive VIP Club at The Bunny with me and earn luxury rewards on every visit! Check your loyalty card here: ',
  streakBonusDays: 14
};

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
    const target = Number(programConfig.targetStamps || 10);
    stampsTd.textContent = `${sc} / ${target}`;
    stampsTd.style.color = sc >= target ? 'var(--emerald)' : 'var(--gold-light)';
    stampsTd.style.fontWeight = '700';

    const cycleTd = document.createElement('td');
    cycleTd.textContent = `Cycle ${c.cycleNumber || 1}`;

    const visitsTd = document.createElement('td');
    visitsTd.textContent = String(c.totalVisits || 0);

    const rewardsTd = document.createElement('td');
    rewardsTd.textContent = String(c.totalRewards || 0);

    const dateTd = document.createElement('td');
    dateTd.textContent = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString('en-IN') : 'N/A';

    const actionTd = document.createElement('td');
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-danger';
    resetBtn.style.padding = '4px 8px';
    resetBtn.style.fontSize = '11px';
    resetBtn.textContent = 'Manage / Reset';
    resetBtn.addEventListener('click', () => {
      // Switch to Danger Zone tab and preselect this customer
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(cnt => cnt.classList.add('hidden'));

      const dangerTabBtn = document.querySelector('[data-tab="danger-tab"]');
      const dangerTab = document.getElementById('danger-tab');
      if (dangerTabBtn) dangerTabBtn.classList.add('active');
      if (dangerTab) dangerTab.classList.remove('hidden');

      if (resetTargetCustomer) {
        resetTargetCustomer.value = c.id;
        resetTargetCustomer.focus();
      }
    });
    actionTd.appendChild(resetBtn);

    tr.appendChild(nameTd);
    tr.appendChild(phoneTd);
    tr.appendChild(stampsTd);
    tr.appendChild(cycleTd);
    tr.appendChild(visitsTd);
    tr.appendChild(rewardsTd);
    tr.appendChild(dateTd);
    tr.appendChild(actionTd);

    customersTableBody.appendChild(tr);
  });

  // Populate Danger Zone customer select
  if (resetTargetCustomer) {
    const currentVal = resetTargetCustomer.value;
    resetTargetCustomer.innerHTML = '<option value="">-- Select Customer --</option>';
    customers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      const cName = c.name || 'Valued Guest';
      const cPhone = c.phone || 'N/A';
      opt.textContent = `${cName} (${cPhone}) - ${c.stampCount || 0} stamps`;
      resetTargetCustomer.appendChild(opt);
    });
    if (currentVal) resetTargetCustomer.value = currentVal;
  }
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
// Universal SaaS Program Settings Management
// ----------------------------------------------------
function populateSettingsForm(cfg) {
  if (!cfg) return;
  if (cfgBusinessName) cfgBusinessName.value = cfg.businessName || '';
  if (cfgBusinessCategory) cfgBusinessCategory.value = cfg.businessCategory || '';
  if (cfgBusinessTagline) cfgBusinessTagline.value = cfg.businessTagline || '';
  if (cfgBrandIcon) cfgBrandIcon.value = cfg.brandIcon || '🐰';
  if (cfgCurrencySymbol) cfgCurrencySymbol.value = cfg.currencySymbol || '₹';
  if (cfgTargetStamps) cfgTargetStamps.value = cfg.targetStamps || 10;
  if (cfgMinSpend) cfgMinSpend.value = cfg.minSpend || 600;
  if (cfgStampIcon) cfgStampIcon.value = cfg.stampIcon || '★';
  if (cfgVipIcon) cfgVipIcon.value = cfg.vipIcon || '👑';
  if (cfgRewardTitle) cfgRewardTitle.value = cfg.rewardTitle || '';
  if (cfgRewardValue) cfgRewardValue.value = cfg.rewardValue || 3000;
  if (cfgRewardExpiry) cfgRewardExpiry.value = cfg.rewardExpiryDays || 60;
  if (cfgReferralMessage) cfgReferralMessage.value = cfg.referralMessage || '';
  if (cfgStreakDays) cfgStreakDays.value = cfg.streakBonusDays || 14;
}

async function handleSaveSettings(e) {
  e.preventDefault();
  if (!isOnline()) {
    showToast("You're offline. Cannot save settings.", 'error');
    return;
  }

  const targetStamps = parseInt(cfgTargetStamps.value, 10);
  if (isNaN(targetStamps) || targetStamps < 3 || targetStamps > 20) {
    showToast('Target stamps must be between 3 and 20.', 'error');
    return;
  }

  const rewardValue = parseInt(cfgRewardValue.value, 10);
  if (isNaN(rewardValue) || rewardValue <= 0) {
    showToast('Reward value must be a positive number.', 'error');
    return;
  }

  const updatedConfig = {
    businessName: cfgBusinessName.value.trim() || 'Loyalty Club',
    businessCategory: cfgBusinessCategory.value.trim() || 'Business',
    businessTagline: cfgBusinessTagline.value.trim() || '',
    brandIcon: cfgBrandIcon.value.trim() || '🐰',
    currencySymbol: cfgCurrencySymbol.value.trim() || '₹',
    targetStamps: targetStamps,
    minSpend: parseInt(cfgMinSpend.value, 10) || 0,
    stampIcon: cfgStampIcon.value.trim() || '★',
    vipIcon: cfgVipIcon.value.trim() || '👑',
    rewardTitle: cfgRewardTitle.value.trim() || 'Complimentary Reward',
    rewardValue: rewardValue,
    rewardExpiryDays: parseInt(cfgRewardExpiry.value, 10) || 60,
    referralMessage: cfgReferralMessage.value.trim(),
    streakBonusDays: parseInt(cfgStreakDays.value, 10) || 14,
    updatedAt: serverTimestamp()
  };

  saveSettingsBtn.disabled = true;
  const originalText = saveSettingsBtn.textContent;
  saveSettingsBtn.textContent = 'Saving...';

  try {
    await setDoc(doc(db, 'settings', 'program_config'), updatedConfig, { merge: true });
    programConfig = { ...programConfig, ...updatedConfig };
    showToast('Program configuration saved successfully!', 'success');
    renderCustomersTable(customersCache);
  } catch (err) {
    console.error('Error saving program settings:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = originalText;
  }
}

function initSettingsStream() {
  const settingsRef = doc(db, 'settings', 'program_config');
  onSnapshot(settingsRef, (snap) => {
    if (snap.exists()) {
      programConfig = { ...programConfig, ...snap.data() };
      populateSettingsForm(programConfig);
      renderCustomersTable(customersCache);
    }
  }, (err) => {
    console.error('Error reading program settings:', err);
  });
}

// ----------------------------------------------------
// Super-Admin Danger Zone Handlers
// ----------------------------------------------------
async function handleCustomerStampReset() {
  if (!isOnline()) {
    showToast("You're offline. Cannot reset stamps.", 'error');
    return;
  }

  const customerId = resetTargetCustomer.value;
  if (!customerId) {
    showToast('Please select a customer to reset.', 'error');
    return;
  }

  const newStamps = parseInt(resetNewStamps.value, 10);
  if (isNaN(newStamps) || newStamps < 0 || newStamps > 20) {
    showToast('Please enter a valid stamp count between 0 and 20.', 'error');
    return;
  }

  const customer = customersCache.find(c => c.id === customerId);
  const cName = customer?.name || 'Customer';

  if (!confirm(`Are you sure you want to set ${cName}'s stamps to ${newStamps}?`)) {
    return;
  }

  executeCustomerResetBtn.disabled = true;
  try {
    const target = Number(programConfig.targetStamps || 10);
    await updateDoc(doc(db, 'customers', customerId), {
      stampCount: newStamps,
      rewardAvailable: newStamps >= target,
      updatedAt: serverTimestamp()
    });

    showToast(`Stamps updated to ${newStamps} for ${cName}.`, 'success');
  } catch (err) {
    console.error('Error resetting customer stamps:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    executeCustomerResetBtn.disabled = false;
  }
}

async function handlePurgeHistory() {
  if (!isOnline()) {
    showToast("You're offline. Cannot purge history.", 'error');
    return;
  }

  if (!confirm('Are you sure you want to permanently delete all completed/rejected visits and redeemed rewards? This cannot be undone.')) {
    return;
  }

  purgeHistoryBtn.disabled = true;
  const originalText = purgeHistoryBtn.textContent;
  purgeHistoryBtn.textContent = 'Purging completed history...';

  try {
    // 1. Fetch completed/rejected visits
    const visitsSnap = await getDocs(collection(db, 'visits'));
    const completedVisits = visitsSnap.docs.filter(d => {
      const status = d.data().status;
      return status === 'approved' || status === 'rejected';
    });

    // 2. Fetch redeemed rewards
    const rewardsSnap = await getDocs(collection(db, 'rewards'));
    const redeemedRewards = rewardsSnap.docs.filter(d => d.data().status === 'redeemed');

    // 3. Batch delete in chunks of 400
    const allToDelete = [
      ...completedVisits.map(d => doc(db, 'visits', d.id)),
      ...redeemedRewards.map(d => doc(db, 'rewards', d.id))
    ];

    if (allToDelete.length === 0) {
      showToast('No completed history found to purge.', 'info');
      return;
    }

    const chunkSize = 400;
    for (let i = 0; i < allToDelete.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = allToDelete.slice(i, i + chunkSize);
      chunk.forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    showToast(`Successfully purged ${allToDelete.length} historical records!`, 'success');
  } catch (err) {
    console.error('Error purging history:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    purgeHistoryBtn.disabled = false;
    purgeHistoryBtn.textContent = originalText;
  }
}

async function handleFactoryReset() {
  if (!isOnline()) {
    showToast("You're offline. Cannot execute factory reset.", 'error');
    return;
  }

  const confirmText = factoryResetConfirmInput.value.trim();
  if (confirmText !== 'RESET') {
    showToast('Please type RESET in uppercase to confirm.', 'error');
    return;
  }

  if (!confirm('DANGER: Master Factory Reset will reset ALL customer stamp cards to 0, cycle to 1, and wipe all visits, rewards, and phone mappings. Proceed?')) {
    return;
  }

  factoryResetBtn.disabled = true;
  const originalText = factoryResetBtn.textContent;
  factoryResetBtn.textContent = 'Executing Factory Reset...';

  try {
    // 1. Reset all customers to initial state
    const custSnap = await getDocs(collection(db, 'customers'));
    const custChunks = [];
    let currentBatch = writeBatch(db);
    let count = 0;

    for (const cDoc of custSnap.docs) {
      currentBatch.update(doc(db, 'customers', cDoc.id), {
        stampCount: 0,
        cycleNumber: 1,
        totalVisits: 0,
        totalRewards: 0,
        rewardAvailable: false,
        lastVisitAt: null,
        updatedAt: serverTimestamp()
      });
      count++;
      if (count === 400) {
        custChunks.push(currentBatch.commit());
        currentBatch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) custChunks.push(currentBatch.commit());
    await Promise.all(custChunks);

    // 2. Delete all visits
    const visitsSnap = await getDocs(collection(db, 'visits'));
    for (let i = 0; i < visitsSnap.docs.length; i += 400) {
      const b = writeBatch(db);
      visitsSnap.docs.slice(i, i + 400).forEach(d => b.delete(doc(db, 'visits', d.id)));
      await b.commit();
    }

    // 3. Delete all rewards
    const rewardsSnap = await getDocs(collection(db, 'rewards'));
    for (let i = 0; i < rewardsSnap.docs.length; i += 400) {
      const b = writeBatch(db);
      rewardsSnap.docs.slice(i, i + 400).forEach(d => b.delete(doc(db, 'rewards', d.id)));
      await b.commit();
    }

    // 4. Delete phone_index
    const phoneSnap = await getDocs(collection(db, 'phone_index'));
    for (let i = 0; i < phoneSnap.docs.length; i += 400) {
      const b = writeBatch(db);
      phoneSnap.docs.slice(i, i + 400).forEach(d => b.delete(doc(db, 'phone_index', d.id)));
      await b.commit();
    }

    factoryResetConfirmInput.value = '';
    factoryResetBtn.disabled = true;
    factoryResetBtn.style.opacity = '0.5';

    showToast('Master Factory Reset completed! Loyalty state is pristine.', 'success');
  } catch (err) {
    console.error('Error during factory reset:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    factoryResetBtn.textContent = originalText;
  }
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

      initSettingsStream();
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

if (programSettingsForm) {
  programSettingsForm.addEventListener('submit', handleSaveSettings);
}

if (executeCustomerResetBtn) {
  executeCustomerResetBtn.addEventListener('click', handleCustomerStampReset);
}

if (purgeHistoryBtn) {
  purgeHistoryBtn.addEventListener('click', handlePurgeHistory);
}

if (factoryResetConfirmInput && factoryResetBtn) {
  factoryResetConfirmInput.addEventListener('input', () => {
    const isReset = factoryResetConfirmInput.value.trim() === 'RESET';
    factoryResetBtn.disabled = !isReset;
    factoryResetBtn.style.opacity = isReset ? '1' : '0.5';
  });
  factoryResetBtn.addEventListener('click', handleFactoryReset);
}

initAdminApp();

