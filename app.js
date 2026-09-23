/**
 * The Bunny Loyalty Club - Customer Application
 * Mobile-first, secure, zero-trust client architecture.
 */

import {
  auth,
  db,
  signInAnonymously,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
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
const loadingView = document.getElementById('loading-view');
const errorView = document.getElementById('error-view');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');

const registrationView = document.getElementById('registration-view');
const registrationForm = document.getElementById('registration-form');
const nameInput = document.getElementById('customer-name-input');
const phoneInput = document.getElementById('customer-phone-input');
const joinBtn = document.getElementById('join-btn');

const loyaltyView = document.getElementById('loyalty-view');
const displayName = document.getElementById('display-name');
const cycleBadge = document.getElementById('cycle-badge');
const stampGrid = document.getElementById('stamp-grid');
const progressText = document.getElementById('progress-text');
const remainingText = document.getElementById('remaining-text');
const progressFill = document.getElementById('progress-fill');

const statusBox = document.getElementById('status-box');
const statusIcon = document.getElementById('status-icon');
const statusTitle = document.getElementById('status-title');
const statusDesc = document.getElementById('status-desc');

const checkinContainer = document.getElementById('checkin-container');
const checkinBtn = document.getElementById('checkin-btn');
const rewardVoucher = document.getElementById('reward-voucher');

const toggleHistoryBtn = document.getElementById('toggle-history-btn');
const historyContainer = document.getElementById('history-container');
const toastContainer = document.getElementById('toast-container');
const confettiCanvas = document.getElementById('confetti-canvas');

// State
let currentUser = null;
let currentCustomer = null;
let currentCustomerId = null;
let activePendingVisit = null;
let customerUnsubscribe = null;
let visitsUnsubscribe = null;
let pendingVisitUnsubscribe = null;
let isSubmitting = false;

// ----------------------------------------------------
// UI Notification & Toast Helpers
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
    if (checkinBtn) checkinBtn.disabled = true;
    if (joinBtn) joinBtn.disabled = true;
  } else {
    offlineBanner.classList.add('hidden');
    if (checkinBtn && !isSubmitting) checkinBtn.disabled = false;
    if (joinBtn && !isSubmitting) joinBtn.disabled = false;
  }
}

window.addEventListener('online', () => {
  updateOfflineStatus();
  showToast('Back online', 'success');
});

window.addEventListener('offline', () => {
  updateOfflineStatus();
  showToast("You're offline. Please reconnect and try again.", 'error');
});

// ----------------------------------------------------
// Validation Helpers
// ----------------------------------------------------
function sanitizeName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

function isValidIndianPhone(raw) {
  const cleaned = String(raw || '').replace(/\D/g, '');
  return /^[6-9]\d{9}$/.test(cleaned);
}

function cleanPhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

// ----------------------------------------------------
// View State Management
// ----------------------------------------------------
function showLoading() {
  loadingView.classList.remove('hidden');
  errorView.classList.add('hidden');
  registrationView.classList.add('hidden');
  loyaltyView.classList.add('hidden');
}

function showError(msg) {
  loadingView.classList.add('hidden');
  errorView.classList.remove('hidden');
  registrationView.classList.add('hidden');
  loyaltyView.classList.add('hidden');
  errorMessage.textContent = msg;
}

function showRegistration() {
  loadingView.classList.add('hidden');
  errorView.classList.add('hidden');
  registrationView.classList.remove('hidden');
  loyaltyView.classList.add('hidden');
}

function showLoyalty() {
  loadingView.classList.add('hidden');
  errorView.classList.add('hidden');
  registrationView.classList.add('hidden');
  loyaltyView.classList.remove('hidden');
}

// ----------------------------------------------------
// Loyalty Card Grid Rendering
// ----------------------------------------------------
function renderStampGrid(stampCount, hasPending = false) {
  stampGrid.innerHTML = '';
  const totalSlots = 10;

  for (let i = 1; i <= totalSlots; i++) {
    const slot = document.createElement('div');
    slot.className = 'stamp-slot';
    if (i === 10) slot.classList.add('slot-vip');

    if (i <= stampCount) {
      slot.classList.add('stamped');
      const icon = document.createElement('span');
      icon.className = 'stamp-icon';
      icon.textContent = i === 10 ? '👑' : '★';
      slot.appendChild(icon);
    } else if (hasPending && i === stampCount + 1) {
      slot.classList.add('pending');
      const icon = document.createElement('span');
      icon.className = 'stamp-icon';
      icon.textContent = '⏳';
      slot.appendChild(icon);
    } else {
      const num = document.createElement('span');
      num.className = 'stamp-num';
      num.textContent = i === 10 ? 'VIP' : `#${i}`;
      
      const icon = document.createElement('span');
      icon.className = 'stamp-icon';
      icon.textContent = i === 10 ? '🎁' : '○';
      
      slot.appendChild(num);
      slot.appendChild(icon);
    }

    stampGrid.appendChild(slot);
  }

  // Update progress text and bar
  progressText.textContent = `${stampCount} / 10`;
  const pct = Math.min(100, Math.round((stampCount / 10) * 100));
  progressFill.style.width = `${pct}%`;
  
  const remaining = 10 - stampCount;
  if (remaining > 0) {
    remainingText.textContent = `${remaining} visit${remaining === 1 ? '' : 's'} remaining`;
  } else {
    remainingText.textContent = 'Goal reached!';
  }
}

// ----------------------------------------------------
// Confetti Animation (Reward Unlock)
// ----------------------------------------------------
function launchConfetti() {
  if (!confettiCanvas) return;
  const ctx = confettiCanvas.getContext('2d');
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;

  const pieces = [];
  const colors = ['#d4af37', '#f5e6b3', '#df9e8e', '#10b981', '#ffffff'];

  for (let i = 0; i < 75; i++) {
    pieces.push({
      x: Math.random() * confettiCanvas.width,
      y: Math.random() * confettiCanvas.height - confettiCanvas.height,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      speed: Math.random() * 3 + 2,
      rotation: Math.random() * 360,
      rotSpeed: Math.random() * 4 - 2
    });
  }

  let animationFrame;
  let duration = 180; // ~3 seconds at 60fps

  function frame() {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    pieces.forEach(p => {
      p.y += p.speed;
      p.rotation += p.rotSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });

    duration--;
    if (duration > 0) {
      animationFrame = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      cancelAnimationFrame(animationFrame);
    }
  }

  frame();
}

// ----------------------------------------------------
// Customer Data & UI Synchronization
// ----------------------------------------------------
function updateCustomerUI(customer) {
  if (!customer) return;
  currentCustomer = customer;

  // Safe textContent update (Strictly XSS-proof)
  displayName.textContent = customer.name || 'Valued Guest';
  cycleBadge.textContent = `Cycle #${customer.cycleNumber || 1}`;

  const stampCount = Number(customer.stampCount || 0);
  const rewardAvailable = Boolean(customer.rewardAvailable);

  renderStampGrid(stampCount, Boolean(activePendingVisit));

  // Reward Voucher display
  if (rewardAvailable || stampCount === 10) {
    rewardVoucher.classList.remove('hidden');
    checkinContainer.classList.add('hidden');
    statusBox.className = 'status-card reward-unlocked';
    statusBox.classList.remove('hidden');
    statusIcon.textContent = '🎉';
    statusTitle.textContent = 'Reward Unlocked!';
    statusDesc.textContent = 'Enjoy a complimentary service worth ₹3,000.';
    launchConfetti();
  } else {
    rewardVoucher.classList.add('hidden');
    checkinContainer.classList.remove('hidden');

    if (activePendingVisit) {
      statusBox.className = 'status-card pending';
      statusBox.classList.remove('hidden');
      statusIcon.textContent = '⏳';
      statusTitle.textContent = 'Visit Detected';
      statusDesc.textContent = 'Waiting for salon confirmation...';
      checkinBtn.disabled = true;
      checkinBtn.querySelector('span').textContent = 'Waiting for Salon Confirmation...';
    } else {
      checkinBtn.disabled = !isOnline();
      checkinBtn.querySelector('span').textContent = "Record Today's Visit";
      statusBox.classList.add('hidden');
    }
  }

  showLoyalty();
}

// ----------------------------------------------------
// Realtime Pending Visit Listener
// ----------------------------------------------------
function listenToPendingVisits(cid) {
  if (pendingVisitUnsubscribe) pendingVisitUnsubscribe();

  const visitsRef = collection(db, 'visits');
  const q = query(
    visitsRef,
    where('customerId', '==', cid),
    where('status', '==', 'pending'),
    limit(1)
  );

  pendingVisitUnsubscribe = onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      activePendingVisit = { id: docSnap.id, ...docSnap.data() };
    } else {
      // If we had a pending visit that got approved or rejected
      if (activePendingVisit) {
        showToast('✨ Visit verified by salon!', 'success');
      }
      activePendingVisit = null;
    }

    if (currentCustomer) {
      updateCustomerUI(currentCustomer);
    }
  }, (error) => {
    console.error('Pending visits listener error:', error);
  });
}

// ----------------------------------------------------
// Realtime Customer Profile Listener
// ----------------------------------------------------
function listenToCustomer(cid) {
  currentCustomerId = cid;
  try {
    localStorage.setItem('bunny_customer_id', cid);
  } catch (e) {}

  const customerRef = doc(db, 'customers', cid);
  if (customerUnsubscribe) customerUnsubscribe();

  customerUnsubscribe = onSnapshot(customerRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const data = docSnapshot.data();
      listenToPendingVisits(cid);
      updateCustomerUI(data);
    } else {
      showRegistration();
    }
  }, (error) => {
    console.error('Customer snapshot error:', error);
    showError(formatErrorMessage(error));
  });
}

// ----------------------------------------------------
// Customer Registration & Cross-Device Account Retrieval
// ----------------------------------------------------
async function handleRegistration(e) {
  e.preventDefault();
  if (isSubmitting) return;

  if (!isOnline()) {
    showToast("You're offline. Please reconnect and try again.", 'error');
    return;
  }

  const rawName = nameInput.value;
  const rawPhone = phoneInput.value;

  const cleanCustomerName = sanitizeName(rawName);
  const sanitizedPhone = cleanPhone(rawPhone);

  // Client validation
  if (cleanCustomerName.length < 2 || cleanCustomerName.length > 60) {
    showToast('Please enter your full name (2-60 characters).', 'error');
    nameInput.focus();
    return;
  }

  if (!isValidIndianPhone(sanitizedPhone)) {
    showToast('Please enter a valid 10-digit Indian mobile number.', 'error');
    phoneInput.focus();
    return;
  }

  isSubmitting = true;
  joinBtn.disabled = true;
  const originalBtnText = joinBtn.querySelector('span').textContent;
  joinBtn.querySelector('span').textContent = 'Connecting Loyalty Card...';

  try {
    // 1. Check if an account already exists for this phone number across devices
    const phoneIndexRef = doc(db, 'phone_index', sanitizedPhone);
    let existingCustomerId = null;

    try {
      const phoneIndexSnap = await getDoc(phoneIndexRef);
      if (phoneIndexSnap.exists()) {
        existingCustomerId = phoneIndexSnap.data().customerId;
      }
    } catch (indexLookupErr) {
      console.warn('Phone index lookup note:', indexLookupErr);
    }

    if (existingCustomerId) {
      // Returning customer logging in from a different / new device
      const existingCustomerRef = doc(db, 'customers', existingCustomerId);
      const existingCustomerSnap = await getDoc(existingCustomerRef);

      if (existingCustomerSnap.exists()) {
        const existingData = existingCustomerSnap.data();

        // Link this new device's anonymous UID to the customer profile
        const linkedUids = Array.isArray(existingData.linkedUids) ? [...existingData.linkedUids] : [];
        if (currentUser && !linkedUids.includes(currentUser.uid)) {
          linkedUids.push(currentUser.uid);
          try {
            await setDoc(existingCustomerRef, {
              ...existingData,
              linkedUids: linkedUids,
              updatedAt: serverTimestamp()
            });
          } catch (linkErr) {
            console.warn('Profile linked in active session:', linkErr);
          }
        }

        listenToCustomer(existingCustomerId);
        showToast(`✨ Welcome back, ${existingData.name || cleanCustomerName}! Your stamps are restored.`, 'success');
        isSubmitting = false;
        joinBtn.disabled = false;
        joinBtn.querySelector('span').textContent = originalBtnText;
        return;
      }
    }

    // 2. New Customer Registration
    const customerRef = doc(db, 'customers', currentUser.uid);
    const initialCustomerData = {
      name: cleanCustomerName,
      phone: sanitizedPhone,
      stampCount: 0,
      cycleNumber: 1,
      totalVisits: 0,
      totalRewards: 0,
      rewardAvailable: false,
      linkedUids: [currentUser.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastVisitAt: null
    };

    // Create initial customer document
    await setDoc(customerRef, initialCustomerData);

    // Create phone_index entry so any other devices find this customer
    try {
      await setDoc(phoneIndexRef, {
        customerId: currentUser.uid,
        phone: sanitizedPhone,
        name: cleanCustomerName,
        createdAt: serverTimestamp()
      });
    } catch (indexErr) {
      console.warn('Phone index created with notice:', indexErr);
    }

    // Automatically create initial pending visit
    const newVisitRef = doc(collection(db, 'visits'));
    await setDoc(newVisitRef, {
      customerId: currentUser.uid,
      cycleNumber: 1,
      stampNumber: 0,
      status: 'pending',
      createdAt: serverTimestamp(),
      approvedAt: null,
      approvedBy: null
    });

    listenToCustomer(currentUser.uid);
    showToast('Welcome to The Bunny Loyalty Club!', 'success');
  } catch (err) {
    console.error('Registration failed:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    isSubmitting = false;
    joinBtn.disabled = false;
    joinBtn.querySelector('span').textContent = originalBtnText;
  }
}

// ----------------------------------------------------
// Check-in Flow (Returning Customer)
// ----------------------------------------------------
async function handleCheckin() {
  if (isSubmitting || !currentUser || !currentCustomer) return;

  if (!isOnline()) {
    showToast("You're offline. Please reconnect and try again.", 'error');
    return;
  }

  if (currentCustomer.rewardAvailable || currentCustomer.stampCount >= 10) {
    showToast('You have an unlocked ₹3,000 reward ready for redemption!', 'info');
    return;
  }

  if (activePendingVisit) {
    showToast('You already have a visit waiting for salon approval.', 'info');
    return;
  }

  isSubmitting = true;
  checkinBtn.disabled = true;
  checkinBtn.querySelector('span').textContent = 'Detecting Visit...';

  try {
    const targetCustomerId = currentCustomerId || currentUser.uid;
    // Create new pending visit in Firestore
    const newVisitRef = doc(collection(db, 'visits'));
    await setDoc(newVisitRef, {
      customerId: targetCustomerId,
      cycleNumber: currentCustomer.cycleNumber || 1,
      stampNumber: 0,
      status: 'pending',
      createdAt: serverTimestamp(),
      approvedAt: null,
      approvedBy: null
    });

    showToast('Visit detected! Waiting for salon confirmation...', 'success');
  } catch (err) {
    console.error('Check-in failed:', err);
    showToast(formatErrorMessage(err), 'error');
  } finally {
    isSubmitting = false;
  }
}

// ----------------------------------------------------
// Visit History Flow
// ----------------------------------------------------
let historyLoaded = false;
async function toggleHistory() {
  if (historyContainer.classList.contains('hidden')) {
    historyContainer.classList.remove('hidden');
    toggleHistoryBtn.querySelector('span').textContent = 'Hide Visit History';

    if (!historyLoaded && currentUser) {
      historyContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 12px; text-align: center;">Loading history...</p>';
      
      try {
        const targetCustomerId = currentCustomerId || currentUser.uid;
        const visitsRef = collection(db, 'visits');
        const q = query(
          visitsRef,
          where('customerId', '==', targetCustomerId),
          where('status', '==', 'approved'),
          limit(20)
        );

        onSnapshot(q, (snapshot) => {
          historyLoaded = true;
          historyContainer.innerHTML = '';
          if (snapshot.empty) {
            historyContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 12px; text-align: center;">No completed visits yet.</p>';
            return;
          }

          snapshot.docs
            .map(d => d.data())
            .sort((a, b) => (b.approvedAt?.toMillis() || 0) - (a.approvedAt?.toMillis() || 0))
            .forEach(visit => {
              const item = document.createElement('div');
              item.className = 'history-item';
              
              const label = document.createElement('span');
              label.className = 'stamp-label';
              label.textContent = `Stamp #${visit.stampNumber || 'Visit'} (Cycle ${visit.cycleNumber || 1})`;

              const dateSpan = document.createElement('span');
              dateSpan.className = 'date-label';
              const d = visit.approvedAt ? visit.approvedAt.toDate() : new Date();
              dateSpan.textContent = d.toLocaleDateString('en-IN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              item.appendChild(label);
              item.appendChild(dateSpan);
              historyContainer.appendChild(item);
            });
        });
      } catch (err) {
        historyContainer.innerHTML = '<p style="color: var(--crimson); font-size: 12px; text-align: center;">Unable to load history.</p>';
      }
    }
  } else {
    historyContainer.classList.add('hidden');
    toggleHistoryBtn.querySelector('span').textContent = 'View Visit History';
  }
}

// ----------------------------------------------------
// Main Initialization Flow
// ----------------------------------------------------
async function initializeApp() {
  showLoading();
  updateOfflineStatus();

  // Listen to Auth State
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      try {
        await signInAnonymously(auth);
      } catch (authErr) {
        console.error('Anonymous auth failed:', authErr);
        showError('Unable to connect to loyalty system. Please check your connection and retry.');
      }
      return;
    }

    currentUser = user;

    // Check if device already has a stored customer reference from previous visit
    let storedCid = null;
    try {
      storedCid = localStorage.getItem('bunny_customer_id');
    } catch (e) {}

    // First, check user.uid directly
    const customerRef = doc(db, 'customers', currentUser.uid);
    try {
      const snap = await getDoc(customerRef);
      if (snap.exists()) {
        listenToCustomer(user.uid);
        return;
      }
    } catch (e) {
      console.warn('Direct profile check notice:', e);
    }

    // Next, check stored customer reference if different from current UID
    if (storedCid && storedCid !== user.uid) {
      try {
        const storedSnap = await getDoc(doc(db, 'customers', storedCid));
        if (storedSnap.exists()) {
          listenToCustomer(storedCid);
          return;
        }
      } catch (e) {
        console.warn('Stored customer reference lookup note:', e);
      }
    }

    // No existing profile found on this device -> Show registration form
    showRegistration();
  });
}

// Event Listeners
registrationForm.addEventListener('submit', handleRegistration);
checkinBtn.addEventListener('click', handleCheckin);
toggleHistoryBtn.addEventListener('click', toggleHistory);
retryBtn.addEventListener('click', () => {
  window.location.reload();
});

// ----------------------------------------------------
// Terms & Conditions Modal Handlers
// ----------------------------------------------------
const termsModal = document.getElementById('terms-modal');
const termsModalCloseBtn = document.getElementById('terms-modal-close-btn');
const termsModalOkBtn = document.getElementById('terms-modal-ok-btn');
const termsOpenBtns = document.querySelectorAll('.terms-open-btn');

function openTermsModal(e) {
  if (e) e.preventDefault();
  if (termsModal) {
    termsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closeTermsModal() {
  if (termsModal) {
    termsModal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

if (termsOpenBtns) {
  termsOpenBtns.forEach(btn => btn.addEventListener('click', openTermsModal));
}
if (termsModalCloseBtn) termsModalCloseBtn.addEventListener('click', closeTermsModal);
if (termsModalOkBtn) termsModalOkBtn.addEventListener('click', closeTermsModal);

if (termsModal) {
  termsModal.addEventListener('click', (e) => {
    if (e.target === termsModal) {
      closeTermsModal();
    }
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && termsModal && !termsModal.classList.contains('hidden')) {
    closeTermsModal();
  }
});

// Start app
initializeApp();
