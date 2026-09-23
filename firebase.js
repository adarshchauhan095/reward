// Firebase Configuration & Initialization
// Production-ready for GitHub Pages deployment with Vanilla ES Modules

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  runTransaction, 
  serverTimestamp,
  Timestamp,
  getDocs,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyATHq95j7hGb7jUWZIGxlBo3pvRVBMr9Zs",
  authDomain: "the-bunny-salon.firebaseapp.com",
  projectId: "the-bunny-salon",
  storageBucket: "the-bunny-salon.firebasestorage.app",
  messagingSenderId: "86841917639",
  appId: "1:86841917639:web:5edb1ed4d72d3e0510bee2",
  measurementId: "G-N0CVN4QZ8H"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Re-export common functions for clean module imports
export {
  signInAnonymously,
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
  runTransaction,
  serverTimestamp,
  Timestamp
};

/**
 * Format raw Firebase errors into user-friendly messages.
 * Never exposes raw internal codes or sensitive stack traces to customers.
 */
export function formatErrorMessage(error) {
  if (!error) return 'An unexpected error occurred. Please try again.';
  
  const code = error.code || '';
  const message = error.message || '';

  if (code === 'permission-denied' || message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
    return 'Action not permitted. Please contact salon staff if this persists.';
  }
  if (code === 'auth/network-request-failed' || message.includes('offline') || !navigator.onLine) {
    return "You're offline. Please check your internet connection and try again.";
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') {
    return 'Invalid staff email or password. Please try again.';
  }
  if (code === 'unavailable' || message.includes('unavailable')) {
    return 'Service temporarily unavailable. Please try again in a moment.';
  }

  // Return clean custom message if thrown intentionally by logic/transactions
  if (typeof error === 'string') return error;
  if (error.message && !error.message.startsWith('Firebase:')) return error.message;

  return 'Something went wrong. Please try again or ask salon staff for assistance.';
}

/**
 * Check network connectivity helper
 */
export function isOnline() {
  return typeof navigator !== 'undefined' && navigator.onLine !== false;
}
