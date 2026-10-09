import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ChargesCalculator } from '../utils/ChargesCalculator.js';
import { UserSession } from '../utils/UserSession.js';
import { showToast, formatProductTitle } from '../utils.js';
import { ModalManager } from './ModalManager.js';
import { sdk } from '../sdk.js';
import { Item, MOrder, PaymentMode } from '../models/Order.js';
import { OrderStatus } from '../models/OrderStatus.js';
import { BluetoothPrinting } from '../utils/BluetoothPrinting.js';
import { deductInventoryForOrder } from '../utils/inventory.js';
import { appendCustomerPayment, propagateCustomerUpdate, isPhoneNumberExists } from '../utils/CustomerSync.js';
import { computeAvailablePoints, awardPointsToCustomer, calculatePointsForAmount } from '../utils/LoyaltyEngine.js';
import { PrintTemplate } from '../utils/PrintTemplate.js';
import { useLanguage } from '../contexts/LanguageContext.js';
import { PassbookCalculator } from '../utils/PassbookCalculator.js';



// CheckoutSheet component for handling order checkout
export function CheckoutSheet({ cart, clearCallback, tableId, checkout, orderId, priceVariant, onClose, initialUnitEntryMode }) {
    const { t } = useLanguage();

    // Defensive logger: some compiled/minified bundles mistakenly call `sole.error(...)`.
    // Use this helper to avoid a ReferenceError in catch blocks where we log errors.
    const safeLogError = (...args) => {
        try {
            // Convert arguments to a safe string to avoid objects that trigger devtools/external overlays
            const safeMsg = args.map(a => {
                try {
                    if (typeof a === 'string') return a;
                    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
                    return JSON.stringify(a);
                } catch (e) {
                    try { return String(a); } catch (e2) { return '[unserializable]'; }
                }
            }).join(' ');

            // Use only console.log — some dev overlays instrument console.error which can throw.
            try { if (typeof console !== 'undefined' && typeof console.log === 'function') console.log('[ERROR]', safeMsg); } catch (e) { /* ignore */ }
        } catch (outer) {
            // Never allow logging to throw
        }
    };

    // Reusable sanitizer for Firestore updates: converts objects with toJson() and
    // recursively copies arrays/objects into plain JSON so update() receives only
    // serializable values.
    const sanitizeForFirestore = (val) => {
        const sanitize = (v) => {
            // Coerce undefined to null (Firestore rejects undefined values)
            if (typeof v === 'undefined' || v === null) return null;
            if (Array.isArray(v)) return v.map(sanitize);
            if (typeof v === 'object') {
                if (typeof v.toJson === 'function') {
                    try { return v.toJson(); } catch (e) { /* fallthrough to manual copy */ }
                }
                const out = {};
                for (const k of Object.keys(v)) {
                    try { out[k] = sanitize(v[k]); } catch (e) { out[k] = null; }
                }
                return out;
            }
            // primitives (string/number/boolean)
            return v;
        };
        return sanitize(val);
    };
    const [discount, setDiscount] = useState(0);
    const [instructions, setInstructions] = useState('');
    const [showDiscountModal, setShowDiscountModal] = useState(false);
    const [percentMode, setPercentMode] = useState(false);
    const [discountInput, setDiscountInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentMode, setPaymentMode] = useState('CASH'); // CASH, DIGITAL, CREDIT
    const [showInstructionsModal, setShowInstructionsModal] = useState(false);
    const [customer, setCustomer] = useState(null);
    const [isEditingCustomerName, setIsEditingCustomerName] = useState(false);
    const [editCustomerName, setEditCustomerName] = useState('');
    const [editCustomerPhone, setEditCustomerPhone] = useState('');
    const editNameInputRef = useRef(null);
    const editPhoneInputRef = useRef(null);
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customersList, setCustomersList] = useState([]);
    const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
    const [customersError, setCustomersError] = useState(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 'auto', left: 'auto', width: 'auto' });
    const searchInputRef = useRef(null);
    // Loyalty / points state for selected customer
    const [loyaltyData, setLoyaltyData] = useState(null);
    // Whether the birthday loyalty rule is currently active (persisted in LoyaltyRules/rule_birthday)
    const [birthdayRuleActive, setBirthdayRuleActive] = useState(true);
    // Track recent redeem applied in this UI session so we can include it when creating a new order
    const [recentRedeem, setRecentRedeem] = useState({ points: 0, amount: 0, customerId: null });
    // Store lightweight order metadata (used when editing an existing order)
    const [orderMeta, setOrderMeta] = useState(null);
    // Hover state for loyalty buttons to enable hover darken effect
    const [hoveredLoyaltyBtn, setHoveredLoyaltyBtn] = useState(null);
    // Add state for auto print preference
    const [autoPrint, setAutoPrint] = useState(() => {
        return localStorage.getItem('autoPrintPreference') === 'true';
    });
    // Add state for bill image generation
    const [isGeneratingBill, setIsGeneratingBill] = useState(false);
    const [billImageUrl, setBillImageUrl] = useState(null);
    const [estimatedEarnedPoints, setEstimatedEarnedPoints] = useState(0);
    // Feature flag: when true, do NOT perform immediate backend deduction of redeemed points.
    // Points will be deducted only when the order is completed. This prevents a flow where
    // a cashier selects customer A, redeems points, then removes the customer (without
    // completing payment) and those points get lost/deleted from customer A.
    const DEFER_IMMEDIATE_REDEEM_DEDUCTION = true;

    // Load persisted birthday rule active flag and subscribe to live updates when possible
    useEffect(() => {
        let mounted = true;
        let unsub = null;
        (async () => {
            try {
                // Prefer existing sdk import, fall back to dynamic import for robustness
                let dbSdk = (typeof sdk !== 'undefined' && sdk && sdk.db) ? sdk : null;
                if (!dbSdk) {
                    try {
                        const mod = await import('../sdk.js');
                        dbSdk = mod && mod.sdk ? mod.sdk : null;
                    } catch (e) {
                        try { dbSdk = (typeof window !== 'undefined' && window.__sdkForDebug) ? window.__sdkForDebug : null; } catch (ee) { dbSdk = null; }
                    }
                }
                if (!dbSdk || !dbSdk.db) return;
                const docRef = dbSdk.db.collection('LoyaltyRules').doc('rule_birthday');

                // If realtime listener available, use it so toggles reflect immediately
                if (typeof docRef.onSnapshot === 'function') {
                    unsub = docRef.onSnapshot((snap) => {
                        if (!mounted) return;
                        const d = (snap && snap.data) ? snap.data() : (snap && snap._data) || {};
                        try { setBirthdayRuleActive(typeof d.active === 'undefined' ? true : Boolean(d.active)); } catch (e) { }
                    }, (err) => { console.warn('[CheckoutSheet] loyalty rule snapshot error', err); });
                } else {
                    const snap = await docRef.get();
                    if (!mounted) return;
                    const d = (snap && snap.data) ? snap.data() : (snap && snap._data) || {};
                    try { setBirthdayRuleActive(typeof d.active === 'undefined' ? true : Boolean(d.active)); } catch (e) { }
                }
            } catch (e) {
                console.warn('[CheckoutSheet] failed to load birthday rule', e);
            }
        })();
        return () => { mounted = false; try { if (typeof unsub === 'function') unsub(); } catch (e) { } };
    }, []);

    // Calculate dropdown position based on search input position
    useEffect(() => {
        const updatePosition = () => {
            if ((customersList.length > 0 || (customerSearch === '' && isLoadingCustomers)) && searchInputRef.current) {
                const inputRect = searchInputRef.current.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const spaceBelow = viewportHeight - inputRect.bottom;

                // If there's not enough space below, position above the input
                const position = {
                    top: spaceBelow < 250 ? `${inputRect.top - 10}px` : `${inputRect.bottom + 4}px`,
                    left: `${inputRect.left}px`,
                    width: `${inputRect.width}px`
                };

                setDropdownPosition(position);
            }
        };

        updatePosition();

        // Add scroll listener to update position when user scrolls
        const handleScroll = () => {
            updatePosition();
        };

        const container = searchInputRef.current?.closest('.overflow-auto');
        if (container) {
            container.addEventListener('scroll', handleScroll);
        }

        window.addEventListener('resize', updatePosition);

        return () => {
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
            window.removeEventListener('resize', updatePosition);
        };
    }, [customerSearch, customersList, isLoadingCustomers]);

    // Effect to handle closing the customer search popup when clicking outside or scrolling outside
    useEffect(() => {
        // Only attach listeners when the customer search popup is open
        if (customersList.length > 0 || (customerSearch === '' && isLoadingCustomers)) {
            // Function to check if click is outside the search input and popup
            const handleClickOutside = (event) => {
                // Check if click is inside the search input or popup
                const isClickInsideSearchInput = searchInputRef.current && searchInputRef.current.contains(event.target);
                const popupElement = document.getElementById('customer-search-popup');
                const isClickInsidePopup = popupElement && popupElement.contains(event.target);

                // If click is outside both, close the popup
                if (!isClickInsideSearchInput && !isClickInsidePopup) {
                    setCustomersList([]);
                    // Don't clear customerSearch to maintain user input
                }
            };

            // Function to handle scroll events outside the popup
            const handleScrollOutside = (event) => {
                // Close the popup on any scroll outside the popup
                const popupElement = document.getElementById('customer-search-popup');
                const isScrollInsidePopup = popupElement && popupElement.contains(event.target);

                // If scroll is outside the popup, close it
                if (!isScrollInsidePopup) {
                    setCustomersList([]);
                }
            };

            // Prevent background scrolling when popup is open
            const preventBackgroundScroll = (event) => {
                const popupElement = document.getElementById('customer-search-popup');
                const isScrollInsidePopup = popupElement && popupElement.contains(event.target);

                // Prevent scrolling of background elements when popup is open
                if (!isScrollInsidePopup && popupElement) {
                    event.preventDefault();
                }
            };

            // Handle Escape key to close the popup
            const handleEscapeKey = (event) => {
                if (event.key === 'Escape') {
                    setCustomersList([]);
                }
            };

            // Prevent background scrolling by adding a class to the body
            document.body.classList.add('overflow-hidden');

            // Attach event listeners
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('scroll', handleScrollOutside, true); // Use capture phase
            document.addEventListener('wheel', preventBackgroundScroll, { passive: false }); // Prevent wheel events
            document.addEventListener('keydown', handleEscapeKey); // Escape key handler

            // Cleanup function
            return () => {
                // Remove the overflow-hidden class when popup closes
                document.body.classList.remove('overflow-hidden');

                document.removeEventListener('mousedown', handleClickOutside);
                document.removeEventListener('scroll', handleScrollOutside, true);
                document.removeEventListener('wheel', preventBackgroundScroll, { passive: false });
                document.removeEventListener('keydown', handleEscapeKey);
            };
        } else {
            // Remove the overflow-hidden class when popup is not open
            document.body.classList.remove('overflow-hidden');
        }
    }, [customersList, customerSearch, isLoadingCustomers]);

    // Helper to remove selected customer safely: revert any immediate redeem deduction and clear recentRedeem
    const handleRemoveCustomer = async (custId) => {
        try {
            const toClearId = custId || (customer && customer.id) || (recentRedeem && recentRedeem.customerId) || null;
            // If a recent redeem exists and it was already deducted immediately for this customer, try to refund
            try {
                // Determine points that may have been redeemed for this customer in this session/order.
                // This may come from recentRedeem, current in-memory orderMeta, or persisted order document.
                try {
                    let pts = Number(recentRedeem && recentRedeem.points) || 0;
                    const redeemCustFromRecent = recentRedeem && recentRedeem.customerId ? recentRedeem.customerId : null;
                    const redeemCust = redeemCustFromRecent || (customer && customer.id) || null;

                    // If we don't have points info from recentRedeem, try orderMeta
                    if ((!pts || pts === 0) && orderMeta && Number(orderMeta.loyaltyPointsUsed || 0) > 0) {
                        pts = Number(orderMeta.loyaltyPointsUsed || 0) || 0;
                    }

                    // If still unknown and orderId exists, read order doc for persisted loyalty fields (best-effort)
                    if ((!pts || pts === 0) && orderId && sdk && sdk.db) {
                        try {
                            const orSnap = await sdk.db.collection('Orders').doc(orderId).get();
                            const od = orSnap && orSnap.exists ? (orSnap.data() || {}) : {};
                            pts = Number(od.loyaltyPointsUsed || od.redeemedPoints || 0) || 0;
                        } catch (e) {
                            // ignore read errors and proceed
                        }
                    }

                    // Only attempt a revert when we have a candidate customer and a positive points amount
                    // Only attempt backend revert if a backend deduction actually happened earlier.
                    // We track that via recentRedeem.deducted which is set when an immediate deduction was performed.
                    // Consider a backend deduction to have happened only if recentRedeem.deducted is true
                    // AND we did not globally defer immediate deductions. If DEFER_IMMEDIATE_REDEEM_DEDUCTION
                    // is enabled, recentRedeem.deducted will be false and we should NOT attempt any backend
                    // revert when the customer is removed (points were not actually deducted yet).
                    const deductionHappened = (!DEFER_IMMEDIATE_REDEEM_DEDUCTION) && Boolean(recentRedeem && recentRedeem.deducted === true);
                    // Try an immediate best-effort revert only when deduction occurred. Prefer deleting the matching negative LoyaltyHistory
                    // entry (so computeAvailablePoints won't keep counting a redeemed entry). If deletion is not
                    // possible, fall back to awarding points back to the customer.
                    if (pts > 0 && deductionHappened) {
                        const immediateTarget = (recentRedeem && recentRedeem.customerId) || (customer && customer.id) || toClearId || null;
                        if (immediateTarget) {
                            let immediateRestored = false;
                            try {
                                // If we recorded the specific LoyaltyHistory doc id at deduction time, prefer deleting it directly.
                                const recordedHistoryId = recentRedeem && recentRedeem.historyId ? recentRedeem.historyId : null;
                                let histQ = null;
                                if (recordedHistoryId) {
                                    try {
                                        const docSnap = await sdk.db.collection('LoyaltyHistory').doc(recordedHistoryId).get();
                                        if (docSnap && docSnap.exists) {
                                            histQ = { docs: [{ id: docSnap.id, data: () => docSnap.data() }] };
                                        }
                                    } catch (e) {
                                        // fall back to searching
                                        histQ = null;
                                    }
                                }
                                if (!histQ) {
                                    // Search recent negative history entries for this customer matching the redeemed pts
                                    histQ = await sdk.db.collection('LoyaltyHistory')
                                        .where('customerId', '==', immediateTarget)
                                        .where('points', '<', 0)
                                        .orderBy('createdAt', 'desc')
                                        .limit(20)
                                        .get();
                                }

                                const nowMs = Date.now();
                                if (histQ && histQ.docs && histQ.docs.length > 0) {
                                    for (const d of histQ.docs) {
                                        try {
                                            const dd = (d.data && d.data()) || (d._data || {});
                                            if (!dd) continue;
                                            const v = Number(dd.points || 0) || 0;
                                            if (Math.abs(v) !== Math.abs(pts)) continue;

                                            const createdAt = dd.createdAt ? new Date(dd.createdAt).getTime() : nowMs;
                                            const ageMs = nowMs - createdAt;
                                            if (ageMs > (10 * 60 * 1000)) continue; // only recent

                                            // If entry is tied to a settled order, skip
                                            if (dd.orderId) {
                                                try {
                                                    const linkedOrderSnap = await sdk.db.collection('Orders').doc(dd.orderId).get();
                                                    const linkedOrder = linkedOrderSnap && linkedOrderSnap.exists ? (linkedOrderSnap.data() || {}) : {};
                                                    const status = linkedOrder.currentStatus && linkedOrder.currentStatus.label ? linkedOrder.currentStatus.label : '';
                                                    const isSettled = Boolean(linkedOrder.paid || linkedOrder.settled || (Number(linkedOrder.settledAmount || 0) > 0)) || /COMPLETED|PAID/i.test(status);
                                                    if (isSettled) continue;
                                                } catch (e) { /* ignore and skip if uncertain */ }
                                            }

                                            // Delete the history doc and restore customer points by incrementing loyaltyPoints
                                            try {
                                                await sdk.db.collection('LoyaltyHistory').doc(d.id).delete();
                                            } catch (delErr) {
                                                console.warn('[handleRemoveCustomer] immediate revert: failed to delete LoyaltyHistory doc', d.id, delErr);
                                                continue;
                                            }

                                            try {
                                                const custRef = sdk.db.collection('Customers').doc(immediateTarget);
                                                // Use transaction when available to increment loyaltyPoints safely
                                                const incrementBy = Math.abs(v);
                                                let succeeded = false;
                                                try {
                                                    if (sdk && sdk.db && typeof sdk.db.runTransaction === 'function') {
                                                        await sdk.db.runTransaction(async (tx) => {
                                                            const s = await tx.get(custRef);
                                                            const ex = (s && s.exists && typeof s.data === 'function') ? s.data() : (s && s._data) || {};
                                                            const oldPoints = Number(ex.loyaltyPoints || 0) || 0;
                                                            const newPoints = Math.max(0, oldPoints + incrementBy);
                                                            tx.update(custRef, { loyaltyPoints: newPoints });
                                                        });
                                                        succeeded = true;
                                                    } else {
                                                        // Fallback: read & update
                                                        const snap = await custRef.get();
                                                        const existing = (snap && snap.exists && typeof snap.data === 'function') ? snap.data() : (snap && snap._data) || {};
                                                        const oldPoints = Number(existing.loyaltyPoints || 0) || 0;
                                                        const newPoints = Math.max(0, oldPoints + incrementBy);
                                                        try { await custRef.update({ loyaltyPoints: newPoints }); } catch (uErr) { try { await custRef.set({ loyaltyPoints: newPoints }, { merge: true }); } catch (u2) { console.warn('[handleRemoveCustomer] immediate revert failed to persist restored points', u2); } }
                                                        succeeded = true;
                                                    }
                                                } catch (txErr) {
                                                    console.warn('[handleRemoveCustomer] transaction-based restore failed', txErr);
                                                }

                                                if (succeeded) {
                                                    try { showToast(`Reverted ${Math.abs(v)} points for removed customer`, 'success'); } catch (e) { }
                                                    try { const snap2 = await sdk.db.collection('Customers').doc(immediateTarget).get(); const latest = (snap2 && snap2.exists) ? (snap2.data() || {}) : {}; const latestPts = Number(latest.loyaltyPoints || 0) || 0; window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId: immediateTarget, updatedFields: { loyaltyPoints: latestPts } } })); } catch (e) { }
                                                    immediateRestored = true;
                                                    break;
                                                }
                                            } catch (restoreErr) {
                                                console.warn('[handleRemoveCustomer] immediate revert: failed to restore customer points', restoreErr);
                                            }
                                        } catch (inner) { /* ignore candidate errors */ }
                                    }
                                }

                                // If no history doc was restored, fallback to awarding points back
                                if (!immediateRestored) {
                                    try {
                                        await awardPointsToCustomer(immediateTarget, Math.abs(pts), { orderId: null, type: 'reversal', note: 'Reverted redeem because customer removed from checkout' });
                                        try { showToast(`Reverted ${pts} points for removed customer`, 'success'); } catch (e) { }
                                        try {
                                            const snap2 = await sdk.db.collection('Customers').doc(immediateTarget).get();
                                            const latest = (snap2 && snap2.exists) ? (snap2.data() || {}) : {};
                                            const latestPts = Number(latest.loyaltyPoints || 0) || 0;
                                            window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId: immediateTarget, updatedFields: { loyaltyPoints: latestPts } } }));
                                        } catch (e) { try { window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId: immediateTarget } })); } catch (ee) { } }
                                        immediateRestored = true;
                                    } catch (e) {
                                        console.warn('[handleRemoveCustomer] immediate awardPointsToCustomer reversal failed', e);
                                    }
                                }
                            } catch (e) {
                                console.warn('[handleRemoveCustomer] immediate revert flow failed', e);
                            }

                            if (immediateRestored) {
                                // Mark pts as handled so existing history-delete revert flow is skipped
                                pts = 0;
                            }
                        }
                    }

                    // If we have a direct match (recentRedeem/orderMeta pointing to same customer), prefer that.
                    if (pts > 0 && redeemCust && toClearId && redeemCust === toClearId) {
                        try {
                            // Find recent negative LoyaltyHistory entries for this customer (prefer unlinked)
                            const histQ = await sdk.db.collection('LoyaltyHistory')
                                .where('customerId', '==', redeemCust)
                                .where('points', '<', 0)
                                .orderBy('createdAt', 'desc')
                                .limit(20)
                                .get();

                            let restored = false;
                            const nowMs = Date.now();
                            if (histQ && histQ.docs && histQ.docs.length > 0) {
                                for (const d of histQ.docs) {
                                    try {
                                        const dd = (d.data && d.data()) || (d._data || {});
                                        if (!dd) continue;
                                        const v = Number(dd.points || 0) || 0;
                                        // must be a negative entry matching the absolute pts
                                        if (Math.abs(v) !== Math.abs(pts)) continue;

                                        // If entry is linked to an order that appears completed, skip it
                                        if (dd.orderId) {
                                            // If linked to this same order and the order is not completed, allow revert
                                            if (String(dd.orderId) !== String(orderId)) continue;
                                            // Try to read order to ensure it's not completed
                                            try {
                                                const linkedOrderSnap = await sdk.db.collection('Orders').doc(dd.orderId).get();
                                                const linkedOrder = linkedOrderSnap && linkedOrderSnap.exists ? (linkedOrderSnap.data() || {}) : {};
                                                const status = linkedOrder.currentStatus && linkedOrder.currentStatus.label ? linkedOrder.currentStatus.label : '';
                                                const isSettled = Boolean(linkedOrder.paid || linkedOrder.settled || (Number(linkedOrder.settledAmount || 0) > 0)) || /COMPLETED|PAID/i.test(status);
                                                if (isSettled) continue; // don't revert deductions for completed orders
                                            } catch (e) {
                                                // ignore read errors and conservatively skip
                                                continue;
                                            }
                                        }

                                        const createdAt = dd.createdAt ? new Date(dd.createdAt).getTime() : nowMs;
                                        const ageMs = nowMs - createdAt;
                                        if (ageMs > (10 * 60 * 1000)) continue; // only recent entries

                                        // Delete the history doc then restore customer's loyaltyPoints by adding back pts
                                        try {
                                            await sdk.db.collection('LoyaltyHistory').doc(d.id).delete();
                                        } catch (delErr) {
                                            console.warn('[handleRemoveCustomer] failed to delete LoyaltyHistory doc', d.id, delErr);
                                            continue;
                                        }

                                        try {
                                            const custRef = sdk.db.collection('Customers').doc(redeemCust);
                                            const snap = await custRef.get();
                                            const existing = (snap && snap.exists && typeof snap.data === 'function') ? snap.data() : (snap && snap._data) || {};
                                            const oldPoints = Number(existing.loyaltyPoints || 0) || 0;
                                            const newPoints = Math.max(0, oldPoints + Math.abs(v));
                                            try {
                                                await custRef.update({ loyaltyPoints: newPoints });
                                            } catch (uErr) {
                                                try { await custRef.set({ loyaltyPoints: newPoints }, { merge: true }); } catch (u2) { console.warn('[handleRemoveCustomer] failed to persist restored points', u2); }
                                            }
                                            restored = true;
                                            try { showToast(`Reverted ${Math.abs(v)} points for removed customer`, 'success'); } catch (e) { }
                                            try { window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId: redeemCust, updatedFields: { loyaltyPoints: newPoints } } })); } catch (e) { }
                                        } catch (restoreErr) {
                                            console.warn('[handleRemoveCustomer] failed to restore customer points', restoreErr);
                                        }

                                        if (restored) break;
                                    } catch (inner) { /* ignore candidate errors */ }
                                }
                            }

                            // Fallback: if no history doc deleted, try a simple award back (best-effort)
                            if (!restored) {
                                try {
                                    await awardPointsToCustomer(redeemCust, Math.abs(pts), { orderId: null, type: 'reversal', note: 'Reverted redeem because customer was removed/cancelled' });
                                    try { showToast(`Reverted ${pts} points for removed customer`, 'success'); } catch (e) { }
                                    try {
                                        const snap2 = await sdk.db.collection('Customers').doc(redeemCust).get();
                                        const latest = (snap2 && snap2.exists) ? (snap2.data() || {}) : {};
                                        const latestPts = Number(latest.loyaltyPoints || 0) || 0;
                                        window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId: redeemCust, updatedFields: { loyaltyPoints: latestPts } } }));
                                    } catch (e) { try { window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId: redeemCust } })); } catch (ee) { } }
                                } catch (e) {
                                    console.warn('[handleRemoveCustomer] failed to revert deducted points', e);
                                }
                            }
                        } catch (e) {
                            console.warn('[handleRemoveCustomer] failed to clean up LoyaltyHistory', e);
                        }
                    }
                    else if (pts > 0 && !redeemCust && toClearId) {
                        // No direct customer link from recentRedeem/orderMeta; attempt a cross-customer heuristic search.
                        // Search recent negative LoyaltyHistory entries globally (small window) and attempt to find
                        // an entry that looks like it was created by this session: matching pts, recent createdAt,
                        // and optional staffId or note patterns. If found, restore points to that loyalty entry's customer.
                        try {
                            const nowMs = Date.now();
                            // Search last 30 recent negative entries (descending)
                            const histQ = await sdk.db.collection('LoyaltyHistory')
                                .where('points', '<', 0)
                                .orderBy('createdAt', 'desc')
                                .limit(30)
                                .get();

                            if (histQ && histQ.docs && histQ.docs.length > 0) {
                                let found = null;
                                for (const d of histQ.docs) {
                                    try {
                                        const dd = (d.data && d.data()) || (d._data || {});
                                        if (!dd) continue;
                                        const v = Number(dd.points || 0) || 0;
                                        if (Math.abs(v) !== Math.abs(pts)) continue;
                                        const createdAt = dd.createdAt ? new Date(dd.createdAt).getTime() : nowMs;
                                        const ageMs = nowMs - createdAt;
                                        if (ageMs > (15 * 60 * 1000)) continue; // only recent (15m)

                                        // If this entry has an orderId and that order appears completed, skip
                                        if (dd.orderId) {
                                            try {
                                                const linkedOrderSnap = await sdk.db.collection('Orders').doc(dd.orderId).get();
                                                const linkedOrder = linkedOrderSnap && linkedOrderSnap.exists ? (linkedOrderSnap.data() || {}) : {};
                                                const status = linkedOrder.currentStatus && linkedOrder.currentStatus.label ? linkedOrder.currentStatus.label : '';
                                                const isSettled = Boolean(linkedOrder.paid || linkedOrder.settled || (Number(linkedOrder.settledAmount || 0) > 0)) || /COMPLETED|PAID/i.test(status);
                                                if (isSettled) continue;
                                            } catch (e) {
                                                // ignore order read errors
                                            }
                                        }

                                        // Heuristic: prefer entries with staffId matching UserSession.profile.id, or note containing 'redeem' or 'checkout'
                                        let score = 0;
                                        try { if (dd.staffId && UserSession && UserSession.profile && dd.staffId === UserSession.profile.id) score += 2; } catch (e) { }
                                        try { if (dd.note && /redeem|checkout|immediate/i.test(String(dd.note))) score += 1; } catch (e) { }

                                        // If no better candidate chosen yet, pick this one (score 0 is acceptable)
                                        if (!found || score > found.score) {
                                            found = { doc: d, entry: dd, score };
                                        }
                                    } catch (inner) { /* ignore */ }
                                }

                                if (found && found.entry) {
                                    const dd = found.entry;
                                    try {
                                        // Attempt to delete and restore points to dd.customerId
                                        if (found.doc && found.doc.id) {
                                            try { await sdk.db.collection('LoyaltyHistory').doc(found.doc.id).delete(); } catch (delErr) { console.warn('[handleRemoveCustomer] heuristic delete failed', delErr); }
                                        }
                                        const cid = dd.customerId || null;
                                        if (cid) {
                                            try {
                                                await awardPointsToCustomer(cid, Math.abs(pts), { orderId: null, type: 'reversal', note: 'Heuristic revert after customer removed from checkout' });
                                                try { showToast(`Reverted ${pts} points for customer ${cid}`, 'success'); } catch (e) { }
                                                try { const snap2 = await sdk.db.collection('Customers').doc(cid).get(); const latest = (snap2 && snap2.exists) ? (snap2.data() || {}) : {}; const latestPts = Number(latest.loyaltyPoints || 0) || 0; window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId: cid, updatedFields: { loyaltyPoints: latestPts } } })); } catch (e) { }
                                            } catch (e) { console.warn('[handleRemoveCustomer] heuristic awardPointsToCustomer failed', e); }
                                        }
                                    } catch (e) { console.warn('[handleRemoveCustomer] heuristic revert failed', e); }
                                }
                            }
                        } catch (e) { console.warn('[handleRemoveCustomer] heuristic loyalty search failed', e); }
                    }
                } catch (e) { console.warn('[handleRemoveCustomer] redeem revert check failed', e); }
            } catch (e) { console.warn('[handleRemoveCustomer] redeem revert check failed', e); }

            // Also revert UI state produced by the redeem: discount, orderMeta loyalty fields, estimated points
            try {
                const pts = Number(recentRedeem && recentRedeem.points) || 0;
                const amt = Number(recentRedeem && recentRedeem.amount) || 0;
                if ((pts > 0 || amt > 0)) {
                    // NOTE: loyalty redemption is tracked separately from merchant `discount`.
                    // Do NOT mutate the global `discount` here — it represents merchant discounts
                    // and should not be changed when reverting a loyalty redeem. We only need
                    // to clear recentRedeem/orderMeta so UI shows no loyalty applied.
                    // (If merchant discount needs adjustment it should be handled separately.)

                    // Reduce orderMeta loyalty fields if present
                    try {
                        setOrderMeta(prev => {
                            const prevPts = Number(prev && prev.loyaltyPointsUsed ? prev.loyaltyPointsUsed : 0) || 0;
                            const prevAmt = Number(prev && prev.loyaltyDiscountAmount ? prev.loyaltyDiscountAmount : 0) || 0;
                            const newPts = Math.max(0, prevPts - pts);
                            const newAmt = Math.max(0, prevAmt - amt);
                            return { ...(prev || {}), loyaltyPointsUsed: newPts, loyaltyDiscountAmount: newAmt };
                        });
                    } catch (e) { console.warn('[handleRemoveCustomer] failed to adjust orderMeta', e); }

                    // Restore original loyalty points in UI if redemption was not confirmed
                    try {
                        if (recentRedeem && !recentRedeem.isConfirmed) {
                            // Restore the original loyalty points since redemption was cancelled
                            setLoyaltyData(ld => ld ? {
                                ...ld,
                                available: Number(recentRedeem.originalPoints || ld.originalPoints || 0)
                            } : ld);

                            setCustomer(cust => cust ? {
                                ...cust,
                                loyaltyPoints: Number(recentRedeem.originalPoints || cust.originalLoyaltyPoints || 0)
                            } : cust);
                        }
                    } catch (e) {
                        console.warn('[handleRemoveCustomer] failed to restore original loyalty points', e);
                        // Fallback: clear recentRedeem
                        try { setRecentRedeem({ points: 0, amount: 0, customerId: null }); } catch (e) { }
                    }

                    // Clear recentRedeem now so UI reflects no loyalty used
                    try { setRecentRedeem({ points: 0, amount: 0, customerId: null }); } catch (e) { }

                    // Recompute estimated earned points (best-effort) since loyalty usage may have changed
                    try {
                        (async () => {
                            try {
                                const ptsEst = await calculatePointsForAmount(Number(cartTotal || 0));
                                try { setEstimatedEarnedPoints(Number(ptsEst || 0)); } catch (e) { }
                            } catch (e) { /* ignore */ }
                        })();
                    } catch (e) { /* ignore */ }
                    // Notify UI consumers that the customer was updated so CustomerDetails and other
                    // components refresh their loyalty displays. Use toClearId which refers to
                    // the customer being removed (if available).
                    try {
                        try { window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId: toClearId } })); } catch (e) { }
                    } catch (e) { }
                } else {
                    // No recent redeem amount: still clear recentRedeem
                    try { setRecentRedeem({ points: 0, amount: 0, customerId: null }); } catch (e) { }
                }
            } catch (e) { console.warn('[handleRemoveCustomer] UI revert failed', e); }

            // Clear selected customer and loyalty card data
            try { setCustomer(null); } catch (e) { }
            try { setLoyaltyData(null); } catch (e) { }

            // If this checkout is editing an existing order or has an orderId, ensure any
            // persisted loyalty metadata is removed so live snapshot doesn't reintroduce
            // redeemed points when the user navigates away and returns.
            try {
                if (orderId && sdk && sdk.db) {
                    try {
                        const or = sdk.db.collection('Orders').doc(orderId);
                        // Reset loyalty fields to zero to avoid reloading redeemed values
                        await or.update({ loyaltyPointsUsed: 0, loyaltyDiscountAmount: 0 });
                        // Also update local orderMeta to match
                        try { setOrderMeta(prev => ({ ...(prev || {}), loyaltyPointsUsed: 0, loyaltyDiscountAmount: 0 })); } catch (e) { }
                        // Notify other components that order changed
                        try { window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId } })); } catch (e) { }
                    } catch (updErr) {
                        // If update failed, silently ignore - best-effort
                        console.warn('[handleRemoveCustomer] failed to clear loyalty fields on order', updErr);
                    }
                }
            } catch (e) { /* ignore */ }
        } catch (e) {
            console.warn('[handleRemoveCustomer] error', e);
            try { setRecentRedeem({ points: 0, amount: 0, customerId: null }); } catch (e) { }
            try { setCustomer(null); } catch (e) { }
            try { setLoyaltyData(null); } catch (e) { }
        }
    };

    // Add state for bill splitting
    const [showSplitBillModal, setShowSplitBillModal] = useState(false);
    const [splitType, setSplitType] = useState('equal'); // 'equal' or 'custom'
    const [numberOfPeople, setNumberOfPeople] = useState(2);
    const [splitData, setSplitData] = useState(null);
    const [customSplits, setCustomSplits] = useState([]);
    const [splitPayments, setSplitPayments] = useState([]);

    // Initialize local splitPayments when splitData is set/changed
    useEffect(() => {
        if (!splitData || !splitData.numberOfPeople) return;
        const arr = Array.from({ length: splitData.numberOfPeople }).map((_, i) => {
            const cs = splitData.customSplits ? (splitData.customSplits[i] || {}) : null;
            return {
                mode: null,
                amount: cs ? Number(cs.amount || 0) : Number(splitData.amountPerPerson || 0),
                paid: false,
                payer: null
            };
        });

        // Merge with any existing local state so we don't wipe out optimistic "paid" flags
        setSplitPayments((prev) => {
            try {
                if (!Array.isArray(prev) || prev.length === 0) return arr;
                const next = Array.from({ length: Math.max(arr.length, prev.length) }).map((_, i) => {
                    const server = arr[i] || null;
                    const local = prev[i] || null;
                    // If local was already paid, prefer local entirely to preserve mode/payer
                    if (local && local.paid) return { ...(server || {}), ...local };
                    // Otherwise prefer server-provided seeded values but keep any local mode/amount if present
                    return server || local || { mode: null, amount: 0, paid: false, payer: null };
                });
                return next;
            } catch (e) {
                console.error('Failed to merge initial splitPayments:', e);
                return arr;
            }
        });
    }, [splitData]);

    // Compute split totals and progress
    const splitProgress = useMemo(() => {
        if (!splitData) return { paid: 0, total: 0, percent: 0 };
        const total = splitData.type === 'equal'
            ? Number(splitData.totalAmount || (splitData.amountPerPerson * splitData.numberOfPeople) || 0)
            : (Array.isArray(splitData.customSplits) ? splitData.customSplits.reduce((s, c) => s + Number(c.amount || 0), 0) : 0);
        const paid = Array.isArray(splitPayments) ? splitPayments.reduce((s, p) => s + (p && p.paid ? Number(p.amount || 0) : 0), 0) : 0;
        const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
        return { paid, total, percent };
    }, [splitData, splitPayments]);

    // Per-item unit quantities for unit-priced products (keyed by productId::variantId)
    const [unitAmounts, setUnitAmounts] = useState({});
    // Per-item base amount override in currency for unit-priced products
    const [unitBaseAmounts, setUnitBaseAmounts] = useState({});
    // Per-item toggle for unit-priced input mode
    const [itemEntryModes, setItemEntryModes] = useState({}); // key -> 'units' | 'amount'

    // Live cart that can be updated from Firestore when orderId is provided
    const [liveCart, setLiveCart] = useState(cart || {});
    useEffect(() => {
        setLiveCart(cart || {});
    }, [cart]);

    useEffect(() => {
        try {
            if (!orderId || !sdk || !sdk.db) return;
            const ref = sdk.db.collection("Orders").doc(orderId);
            const unsub = ref.onSnapshot((doc) => {
                try {
                    if (!doc || !doc.exists) return;
                    const data = typeof doc.data === 'function' ? doc.data() : doc.data;
                    const items = Array.isArray(data?.items) ? data.items : [];
                    const nextCart = {};
                    items.forEach((it, idx) => {
                        if (!it || !it.pid) return;
                        const key = `${it.pid}_${it.variantId || 'base'}_${idx}`;
                        nextCart[key] = {
                            product: {
                                id: it.pid,
                                title: it.displayTitle || it.title || it.originalTitle || t('item'),
                                price: (it.variantPrice ?? it.basePrice ?? it.price ?? 0),
                                mrp: (it.mrp ?? it.variantPrice ?? it.basePrice ?? it.price ?? 0),
                                imgs: it.thumb ? [it.thumb] : [],
                                charges: it.charges || [],
                                cat: it.cat || 'Other',
                                veg: it.veg ?? false,
                                unitPricing: it.unitPricing
                            },
                            quantity: it.qnt || it.quantity || 1,
                            variant: it.variantId ? { id: it.variantId, name: it.variantName || '', price: it.variantPrice ?? undefined } : null,
                            addons: Array.isArray(it.addons) ? it.addons : [],
                            unitOverride: it.unitOverride || null
                        };
                    });
                    setLiveCart(nextCart);
                    // Restore split configuration from order if present, so closing the sheet preserves state
                    try {
                        if (data.splitBill && data.splitBill.enabled) {
                            // Normalize splitBill into our splitData shape
                            const sb = data.splitBill;
                            const restored = {
                                enabled: true,
                                type: sb.type || (sb.customSplits ? 'custom' : 'equal'),
                                numberOfPeople: sb.numberOfPeople || (sb.customSplits ? sb.customSplits.length : 0),
                                totalAmount: Number(sb.totalAmount || 0)
                            };
                            if (restored.type === 'equal') {
                                restored.amountPerPerson = Number(sb.amountPerPerson || (restored.totalAmount / Math.max(1, restored.numberOfPeople)) || 0);
                            } else {
                                restored.customSplits = Array.isArray(sb.customSplits) ? sb.customSplits.map(s => ({ name: s.name || '', amount: Number(s.amount || 0) })) : [];
                            }
                            setSplitData(restored);

                            // Reconstruct splitPayments from partialPayments entries on the order
                            const existingPartial = Array.isArray(data.partialPayments) ? data.partialPayments : [];
                            const paymentsArr = Array.from({ length: restored.numberOfPeople }).map((_, i) => {
                                const idx = i + 1;
                                const match = existingPartial.find(p => p && p.notes && String(p.notes).includes(`Split ${idx}`));
                                const amount = restored.type === 'equal' ? restored.amountPerPerson : (restored.customSplits[i] ? Number(restored.customSplits[i].amount || 0) : 0);
                                return {
                                    mode: match ? (match.paymentMode || match.mode || null) : null,
                                    amount: match ? Number(match.amount || 0) : amount,
                                    paid: !!match,
                                    payer: match ? (match.payer || (match.custName || null)) : null
                                };
                            });

                            // Merge server-derived payments with any local in-flight state to avoid
                            // overwriting a locally-updated "paid" flag when the snapshot lags.
                            setSplitPayments((prev) => {
                                try {
                                    // If no prev state, just use server data
                                    if (!Array.isArray(prev) || prev.length === 0) return paymentsArr;
                                    const next = Array.from({ length: Math.max(paymentsArr.length, prev.length) }).map((_, i) => {
                                        const server = paymentsArr[i] || null;
                                        const local = prev[i] || null;
                                        // Prefer local paid flags and payer/mode when already paid locally
                                        if (local && local.paid) {
                                            return {
                                                ...(server || {}),
                                                ...local
                                            };
                                        }
                                        // Otherwise prefer server values but fall back to local if server missing
                                        return server || local || { mode: null, amount: 0, paid: false, payer: null };
                                    });
                                    return next;
                                } catch (mergeErr) {
                                    console.error('Failed to merge splitPayments from snapshot:', mergeErr);
                                    return paymentsArr;
                                }
                            });
                        }
                    } catch (e) {
                        console.error('Failed to restore splitData from order snapshot:', e);
                    }
                } catch (e) {
                    console.error('CheckoutSheet live cart parse error:', e);
                }
            }, (err) => {
                console.error('CheckoutSheet onSnapshot error:', err);
            });
            return () => {
                try { unsub && unsub(); } catch (_) { }
            };
        } catch (err) {
            console.error('CheckoutSheet live update setup failed:', err);
        }
    }, [orderId]);

    // Reassign prop to use live cart so existing code paths work without refactors
    // eslint-disable-next-line no-param-reassign
    cart = liveCart;



    const getCartItemKey = useCallback((cartItem) => {
        const pid = cartItem?.product?.id || '';
        const vid = cartItem?.variant?.id || 'base';
        return `${pid}::${vid}`;
    }, []);

    // Initialize/maintain unit amounts when cart changes
    useEffect(() => {
        if (!cart) return;
        setUnitAmounts((prev) => {
            const next = { ...prev };
            Object.values(cart).forEach((ci) => {
                const key = getCartItemKey(ci);
                const ppu = Number(ci?.product?.unitPricing?.pricePerUnit);
                const enabled = !!(ci?.product?.unitPricing?.enabled) && !isNaN(ppu) && ppu > 0;
                if (enabled) {
                    if (next[key] === undefined || next[key] === null) {
                        // Seed from override if present, else empty
                        const ovUnits = ci?.unitOverride?.units;
                        next[key] = (ovUnits != null && !isNaN(Number(ovUnits))) ? Number(ovUnits) : '';
                    }
                } else if (next[key] !== undefined) {
                    delete next[key];
                }
            });
            return next;
        });
        setUnitBaseAmounts((prev) => {
            const next = { ...prev };
            Object.values(cart).forEach((ci) => {
                const key = getCartItemKey(ci);
                const ppu = Number(ci?.product?.unitPricing?.pricePerUnit);
                const enabled = !!(ci?.product?.unitPricing?.enabled) && !isNaN(ppu) && ppu > 0;
                if (enabled) {
                    if (next[key] === undefined || next[key] === null) {
                        const ovAmt = ci?.unitOverride?.amount;
                        next[key] = (ovAmt != null && !isNaN(Number(ovAmt))) ? Number(ovAmt) : '';
                    }
                } else if (next[key] !== undefined) {
                    delete next[key];
                }
            });
            return next;
        });
        // Initialize per-item modes
        setItemEntryModes((prev) => {
            const next = { ...prev };
            Object.values(cart).forEach((ci) => {
                const key = getCartItemKey(ci);
                const ppu = Number(ci?.product?.unitPricing?.pricePerUnit);
                const enabled = !!(ci?.product?.unitPricing?.enabled) && !isNaN(ppu) && ppu > 0;
                if (!enabled) { delete next[key]; return; }
                const mode = ci?.unitOverride?.mode;
                if (!next[key]) next[key] = (mode === 'amount' || mode === 'units') ? mode : (initialUnitEntryMode || 'amount');
            });
            return next;
        });
    }, [cart, getCartItemKey]);

    // Compute loyalty points for selected customer (uses the fixed rules set in LoyaltyRules.js)
    useEffect(() => {
        let cancelled = false;
        const compute = async () => {
            if (!customer || !customer.id) { setLoyaltyData(null); return; }

            // Quick synchronous birthday check: show the "Birthday benefit available"
            // label immediately when a selected customer's DOB matches today. This
            // pre-seeds `loyaltyData` so the UI is responsive while the full
            // async computeAvailablePoints runs and updates the complete data.
            try {
                const b = customer && (customer.birthday || customer.dob || customer.birthdate || '');
                const parseDOBQuick = (val) => {
                    if (!val) return null;
                    if (val instanceof Date) return val;
                    if (typeof val === 'number' && !isNaN(val)) return new Date(val);
                    const s = String(val).trim();
                    const iso = new Date(s);
                    if (!isNaN(iso.getTime())) return iso;
                    const m1 = s.match(/^(\d{1,2})[\-\/]?(\d{1,2})[\-\/]?(\d{2,4})$/);
                    if (m1) {
                        let day = parseInt(m1[1], 10);
                        let month = parseInt(m1[2], 10);
                        let year = parseInt(m1[3], 10);
                        if (year < 100) year += (year > 30 ? 1900 : 2000);
                        if (year > 31) { const y = day; day = month; month = year; year = y; }
                        return new Date(year, month - 1, day);
                    }
                    return null;
                };

                let quickBirthdayEligible = false;
                try {
                    const dob = parseDOBQuick(b);
                    if (dob && !isNaN(dob.getTime())) {
                        const today = new Date();
                        quickBirthdayEligible = (dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth());
                    }
                } catch (e) { quickBirthdayEligible = false; }

                if (quickBirthdayEligible && birthdayRuleActive) {
                    try {
                        setLoyaltyData(prev => ({
                            available: Number((customer && customer.loyaltyPoints) || 0) || 0,
                            earned: (prev && prev.earned) ? prev.earned : 0,
                            redeemed: (prev && prev.redeemed) ? prev.redeemed : 0,
                            birthdayEligible: true,
                            redeemThreshold: (prev && prev.redeemThreshold) ? prev.redeemThreshold : 50
                        }));
                    } catch (e) { /* non-fatal */ }
                }
            } catch (e) { /* ignore quick-check errors */ }

            // Refresh customer doc to ensure we use the freshest stored aggregate when available
            let canonicalCustomer = customer;
            try {
                if (sdk && sdk.db) {
                    const fresh = await sdk.db.collection('Customers').doc(customer.id).get();
                    if (fresh && fresh.exists) {
                        const cd = (typeof fresh.data === 'function') ? fresh.data() : (fresh.data || {});
                        canonicalCustomer = { id: fresh.id, ...(cd || {}) };
                        try {
                            // If local customer state is stale, update it so other UI parts see the fresh copy
                            setCustomer(prev => {
                                try {
                                    const prevId = prev && prev.id ? prev.id : null;
                                    if (prevId === canonicalCustomer.id) return { ...(prev || {}), ...(canonicalCustomer || {}) };
                                } catch (e) { }
                                return prev;
                            });
                        } catch (e) { /* non-fatal */ }
                    }
                }
            } catch (e) {
                console.warn('[CheckoutSheet] failed to refresh Customers doc before compute', e);
            }

            // Fetch qualifying orders (paid + completed) for this customer
            let orders = [];
            try {
                const snap = await sdk.db.collection('Orders')
                    .where('custId', '==', customer.id)
                    .orderBy('date', 'desc')
                    .get();
                orders = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
            } catch (e) {
                console.warn('Failed to fetch orders for loyalty calc', e);
            }

            const qualifying = (orders || []).filter(o => {
                const paid = !!o.paid;
                const status = (o.currentStatus && o.currentStatus.label) || o.status || o.statusLabel || '';
                const completed = /COMPLETED/i.test(status) || Boolean(o.paid && o.payMode);
                return paid && completed;
            });

            // Use computeAvailablePoints to get earned/redeemed/available
            try {
                let pts = await computeAvailablePoints(customer.id);
                // If computeAvailablePoints ran but didn't report birthdayEligible and the
                // refreshed canonicalCustomer has a birthday value, do one quick retry.
                // This helps when DB reads are transiently unavailable at first render.
                try {
                    const hasBirthdayField = !!(canonicalCustomer && (canonicalCustomer.birthday || canonicalCustomer.dob || canonicalCustomer.birthdate));
                    if (!pts.birthdayEligible && hasBirthdayField) {
                        // Short debounce before retry
                        await new Promise((res) => setTimeout(res, 300));
                        // Re-run compute if not cancelled
                        if (!cancelled) {
                            try { pts = await computeAvailablePoints(customer.id); } catch (e) { /* ignore second attempt errors */ }
                        }
                    }
                } catch (e) { /* ignore retry orchestration errors */ }
                // If computeAvailablePoints returned 0 available (due to missing Orders or transient failure),
                // prefer the stored customer.loyaltyPoints value from the refreshed customer doc so the checkout display matches CustomerDetails.
                if ((Number(pts.available || 0) === 0) && canonicalCustomer && (Number(canonicalCustomer.loyaltyPoints || 0) > 0)) {
                    try { pts.available = Number(canonicalCustomer.loyaltyPoints || 0); } catch (e) { }
                }

                // Reconcile stored customers.loyaltyPoints with computed available where appropriate
                try {
                    const { syncCustomerLoyaltyPoints } = await import('../utils/LoyaltyEngine.js');
                    try { syncCustomerLoyaltyPoints(customer.id, Number(pts.available || 0)).catch(() => { }); } catch (e) { }
                } catch (e) { /* dynamic import fallback ignored */ }
                const redeemThreshold = 50;

                // Prefer birthdayEligible reported by computeAvailablePoints (it reads canonical Customers doc),
                // but if not present, fall back to parsing the refreshed canonicalCustomer.
                let birthdayEligible = false;
                try {
                    if (typeof pts.birthdayEligible !== 'undefined') {
                        birthdayEligible = Boolean(pts.birthdayEligible);
                    } else {
                        const b = canonicalCustomer.birthday || canonicalCustomer.dob || canonicalCustomer.birthdate || '';
                        if (b) {
                            const parseDOB = (val) => {
                                if (!val) return null;
                                if (val instanceof Date) return val;
                                if (typeof val === 'number' && !isNaN(val)) return new Date(val);
                                const s = String(val).trim();
                                const iso = new Date(s);
                                if (!isNaN(iso.getTime())) return iso;
                                const m1 = s.match(/^(\d{1,2})[\-\/]?(\d{1,2})[\-\/]?(\d{2,4})$/);
                                if (m1) {
                                    let day = parseInt(m1[1], 10);
                                    let month = parseInt(m1[2], 10);
                                    let year = parseInt(m1[3], 10);
                                    if (year < 100) year += (year > 30 ? 1900 : 2000);
                                    if (year > 31) {
                                        const y = day; day = month; month = year; year = y;
                                    }
                                    return new Date(year, month - 1, day);
                                }
                                return null;
                            };
                            const dob = parseDOB(b);
                            if (dob && !isNaN(dob.getTime())) {
                                const today = new Date();
                                birthdayEligible = (dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth());
                            }
                        }
                    }
                } catch (e) { /* ignore */ }

                // Prefer the freshest stored loyaltyPoints from canonicalCustomer for display when it is larger
                const computedAvailable = Number(pts.available || 0) || 0;
                const storedAvailable = Number(canonicalCustomer && canonicalCustomer.loyaltyPoints ? canonicalCustomer.loyaltyPoints : 0) || 0;
                const displayAvailable = Math.max(computedAvailable, storedAvailable);
                const result = {
                    available: displayAvailable,
                    earned: Number(pts.earnedPoints || 0) || 0,
                    redeemed: Number(pts.redeemedPoints || 0) || 0,
                    birthdayEligible,
                    redeemThreshold
                };
                try { console.debug('[Loyalty debug][CheckoutSheet] computed:', pts, 'stored:', canonicalCustomer && canonicalCustomer.loyaltyPoints, 'display:', displayAvailable); } catch (e) { }
                if (!cancelled) setLoyaltyData(result);
            } catch (e) {
                console.warn('Failed to compute available points for checkout', e);
                if (!cancelled) {
                    // Fall back to stored customer.loyaltyPoints so the UI doesn't hide the loyalty card
                    try {
                        const fallbackPts = Number(customer && customer.loyaltyPoints ? customer.loyaltyPoints : 0) || 0;
                        try { console.debug('[Loyalty debug][CheckoutSheet] compute failed, using stored fallback:', fallbackPts); } catch (e) { }
                        setLoyaltyData({ available: fallbackPts, earned: 0, redeemed: 0, birthdayEligible: false, redeemThreshold: 50 });
                    } catch (err) {
                        setLoyaltyData(null);
                    }
                }
            }
        };

        compute();
        return () => { cancelled = true; };
    }, [customer]);

    // Recompute loyaltyData when external events update the customer (e.g. immediate backend updates or redeems)
    useEffect(() => {
        if (!customer || !customer.id) return;
        let mounted = true;
        const handler = async (e) => {
            try {
                const detail = (e && e.detail) ? e.detail : {};
                const cid = detail.customerId || (detail && detail.customer && detail.customer.id) || null;
                // If the event is not for our selected customer, ignore
                if (cid && cid !== customer.id) return;
                // Recompute loyalty points for the current customer
                try {
                    const ptsObj = await computeAvailablePoints(customer.id);
                    if (!mounted) return;
                    // Prefer stored customer.loyaltyPoints if it's larger as before
                    const stored = Number((customer && customer.loyaltyPoints) || 0) || 0;
                    const available = Math.max(Number(ptsObj.available || 0) || 0, stored);
                    try { setLoyaltyData({ available, earned: Number(ptsObj.earnedPoints || 0) || 0, redeemed: Number(ptsObj.redeemedPoints || 0) || 0, birthdayEligible: ptsObj.birthdayEligible || false, redeemThreshold: ptsObj.redeemThreshold || 50 }); } catch (e) { }
                } catch (e) {
                    // ignore compute errors
                }
            } catch (e) { console.warn('[CheckoutSheet] customerUpdated handler failed', e); }
        };

        try { window.addEventListener('customerUpdated', handler); } catch (e) { }
        try { window.addEventListener('loyaltyRedeemConfirmed', handler); } catch (e) { }
        return () => { mounted = false; try { window.removeEventListener('customerUpdated', handler); } catch (e) { } try { window.removeEventListener('loyaltyRedeemConfirmed', handler); } catch (e) { } };
    }, [customer]);

    // Keep selected customer's stored doc in sync via realtime listener so changes made elsewhere
    // (CustomerDetails, backend sync tasks) reflect immediately within Checkout UI.
    useEffect(() => {
        if (!customer || !customer.id || !sdk || !sdk.db) return undefined;
        let mounted = true;
        const ref = sdk.db.collection('Customers').doc(customer.id);
        let unsub = null;
        try {
            if (typeof ref.onSnapshot === 'function') {
                unsub = ref.onSnapshot((snap) => {
                    if (!mounted) return;
                    try {
                        if (!snap || !snap.exists) return;
                        const data = typeof snap.data === 'function' ? snap.data() : (snap.data || {});
                        // Update `customer` state with fresh canonical fields
                        try { setCustomer(prev => ({ ...(prev || {}), ...(data || {}), id: snap.id })); } catch (e) { }
                        // If loyaltyPoints changed, recompute loyaltyData quickly
                        try {
                            const storedPts = Number(data.loyaltyPoints || 0) || 0;
                            const currentAvailable = Number(loyaltyData && loyaltyData.available ? loyaltyData.available : 0) || 0;
                            if (storedPts !== currentAvailable) {
                                // Recompute available points using computeAvailablePoints but prefer stored when larger
                                (async () => {
                                    try {
                                        const ptsObj = await computeAvailablePoints(snap.id);
                                        const available = Math.max(Number(ptsObj.available || 0) || 0, storedPts);
                                        if (!mounted) return;
                                        try { setLoyaltyData({ available, earned: Number(ptsObj.earnedPoints || 0) || 0, redeemed: Number(ptsObj.redeemedPoints || 0) || 0, birthdayEligible: ptsObj.birthdayEligible || false, redeemThreshold: 50 }); } catch (e) { }
                                    } catch (e) {
                                        try { setLoyaltyData(prev => ({ ...(prev || {}), available: storedPts })); } catch (ee) { }
                                    }
                                })();
                            }
                        } catch (e) { /* ignore loyalty update errors */ }
                    } catch (e) { console.warn('[CheckoutSheet] customer onSnapshot handler failed', e); }
                }, (err) => { console.warn('[CheckoutSheet] customer onSnapshot error', err); });
            }
        } catch (e) {
            console.warn('[CheckoutSheet] failed to attach customer snapshot listener', e);
        }

        return () => { mounted = false; try { if (typeof unsub === 'function') unsub(); } catch (e) { } };
    }, [customer && customer.id]);

    // Helper to apply redeem (placeholder - emits event and toast; extend to modify order/customer as needed)
    const applyRedeemToOrder = async (opts = {}) => {
        console.debug('[applyRedeemToOrder] called with opts:', opts, 'customer?', customer ? customer.id : null, 'cartTotal', cartTotal, 'loyaltyData', loyaltyData);
        let __redeem_stage = 'start';
        try {
            // Support being invoked with an explicit customerId (modal passes this). If provided
            // and our local `customer` is missing or mismatched, fetch & update local customer so
            // the rest of the routine (which relies on component state) operates correctly.
            if (opts && opts.customerId && (!customer || customer.id !== opts.customerId)) {
                try {
                    if (sdk && sdk.db) {
                        const snap = await sdk.db.collection('Customers').doc(opts.customerId).get();
                        if (snap && snap.exists) {
                            const cd = (typeof snap.data === 'function') ? snap.data() : (snap.data || {});
                            // Update component state so later code using `customer` works as expected
                            try { setCustomer({ id: snap.id, ...(cd || {}) }); } catch (e) { /* non-fatal */ }
                        }
                    }
                } catch (e) {
                    console.warn('[applyRedeemToOrder] failed to refresh customer for opts.customerId', e);
                }
            }

            if (!customer || !customer.id) {
                showToast('No customer selected', 'error');
                return;
            }

            // Determine how many points to redeem. 1 point = ₹1.
            // Priority: opts.points (explicit request) when valid. Otherwise fall back to full available up to order total.
            const orderAmount = Number(cartTotal || 0) || 0;
            const availablePoints = Number(loyaltyData?.available || 0) || 0;
            let redeemPoints = 0;
            const hasRequestedPoints = opts && typeof opts.points === 'number' && isFinite(opts.points) && !isNaN(opts.points);
            if (hasRequestedPoints) {
                redeemPoints = Math.floor(opts.points);
            } else {
                // No explicit request: default to using up to available points but not exceeding order amount
                redeemPoints = Math.min(availablePoints, Math.floor(orderAmount));
            }

            if (redeemPoints <= 0) {
                showToast('No redeemable points available', 'error');
                return;
            }

            // Update customer loyaltyPoints using central awardPointsToCustomer (pass negative points to deduct)
            if (!sdk || !sdk.db) {
                showToast('Database not available to apply redeem', 'error');
                return;
            }

            try {
                // Cap redeemPoints to computed available if possible
                try {
                    __redeem_stage = 'computeAvailablePoints_before_award';
                    const computed = await computeAvailablePoints(customer.id);
                    const computedAvailable = Number(computed.available || 0) || 0;
                    // If the requested redeem points exceed the computed available, cap down to the computed available.
                    if (computedAvailable < redeemPoints) {
                        console.debug('[applyRedeemToOrder] requested points exceed computed available, capping', { requested: redeemPoints, computedAvailable });
                        // Informational: reduce redeemPoints to canonical available
                        redeemPoints = Math.max(0, Math.floor(Math.min(redeemPoints, computedAvailable)));
                        // If after capping there are no points left, abort
                        if (redeemPoints <= 0) {
                            showToast('Not enough points available to redeem', 'error');
                            return;
                        }
                    }
                } catch (e) {
                    // ignore compute errors and proceed with previously computed redeemPoints
                    console.warn('[applyRedeemToOrder] computeAvailablePoints failed (ignored)', e);
                }

                // NOTE: defer actual deduction of customer loyalty points until the order is
                // completed/printed. Previously we called awardPointsToCustomer here which
                // subtracted points immediately; that caused points to be lost if the order
                // was later cancelled. To avoid that, we record the recentRedeem and persist
                // loyalty metadata on the order (below) and perform the deduction when the
                // order is finalized (see completeOrder -> ensureRedeemDeducted).
                __redeem_stage = 'deferred_deduction_recorded';
                console.debug('[applyRedeemToOrder] deferring loyalty deduction until order completion', { redeemPoints });
            } catch (e) {
                console.error('[applyRedeemToOrder] failed to deduct loyalty points via awardPointsToCustomer', e);
                showToast('Failed to apply redeem to customer account', 'error');
                return;
            }

            // Loyalty redemption amount (1 point = ₹1). Do NOT fold this into the
            // merchant `discount` state because charges/taxes must be computed on the
            // merchant-discount-only base. Track loyalty separately and apply it
            // after tax calculation so CGST/SGST are not recalculated by loyalty.
            const discountAmount = redeemPoints;

            // Record recent redeem so new orders created in this UI include loyalty fields
            try {
                const redeemCustomerId = (customer && customer.id) || (opts && opts.customerId) || null;
                // Mark the redemption as confirmed since user has confirmed it
                setRecentRedeem({
                    points: redeemPoints,
                    amount: discountAmount,
                    customerId: redeemCustomerId,
                    isConfirmed: true  // Mark as confirmed when user confirms redemption
                });
                try {
                    console.log('[applyRedeemToOrder] recorded recentRedeem', { customerId: redeemCustomerId, points: redeemPoints, amount: discountAmount, orderId });
                    if (sdk && sdk.db) {
                        try { sdk.db.collection('LoyaltyAudit').doc().set({ event: 'applyRedeem', customerId: redeemCustomerId, points: redeemPoints, amount: discountAmount, orderId: orderId || null, ts: new Date() }); } catch (e) { }
                    }
                } catch (e) { }
            } catch (e) { /* non-fatal */ }

            // Also update local order meta so the Redeemed Points field in checkout updates immediately
            try {
                setOrderMeta(prev => ({
                    loyaltyPointsUsed: (Number(prev && prev.loyaltyPointsUsed) || 0) + Number(redeemPoints || 0),
                    loyaltyDiscountAmount: (Number(prev && prev.loyaltyDiscountAmount) || 0) + Number(discountAmount || 0)
                }));
            } catch (e) { /* ignore */ }

            // Optimistically update loyaltyData and customer state to reflect deduction immediately in UI
            try {
                // Store the original loyalty points before redemption for cancellation purposes
                const originalLoyaltyPoints = Number(customer.loyaltyPoints || 0);
                const redeemCustomerId = (customer && customer.id) || (opts && opts.customerId) || null;

                // Update UI immediately but don't save to database yet
                setLoyaltyData(ld => ld ? {
                    ...ld,
                    available: Math.max(0, Number(ld.available || 0) - redeemPoints),
                    originalPoints: originalLoyaltyPoints  // Store original points for cancellation
                } : ld);

                setCustomer(cust => cust ? {
                    ...cust,
                    loyaltyPoints: Math.max(0, Number(cust.loyaltyPoints || 0) - redeemPoints),
                    originalLoyaltyPoints: originalLoyaltyPoints  // Store original points for cancellation
                } : cust);

                // Store the redemption info for potential cancellation
                setRecentRedeem(prev => ({
                    ...(prev || {}),
                    points: redeemPoints,
                    amount: discountAmount,
                    customerId: redeemCustomerId,
                    originalPoints: originalLoyaltyPoints,
                    isConfirmed: false  // Mark as not yet confirmed
                }));
            } catch (e) { /* ignore */ }

            // Remove the immediate backend deduction to keep it UI-only until checkout completion
            // The DEFER_IMMEDIATE_REDEEM_DEDUCTION logic will be bypassed to ensure no backend updates
            if (!DEFER_IMMEDIATE_REDEEM_DEDUCTION) {
                try {
                    const cid = customer && customer.id ? customer.id : (opts && opts.customerId) || null;
                    if (cid) {
                        const newPts = await awardPointsToCustomer(cid, -Math.abs(redeemPoints), { orderId: null, type: 'redeem', note: 'Immediate redeem at checkout', staffId: UserSession?.profile?.id || null, customerName: customer?.name || null });
                        if (newPts != null) {
                            // Mark recentRedeem as having been deducted so code paths that run on completion can avoid double-deduct
                            try { setRecentRedeem(prev => ({ ...(prev || {}), points: redeemPoints, amount: discountAmount, deducted: true, newPoints: Number(newPts), customerId: cid })); } catch (e) { }
                            try { setCustomer(prev => ({ ...(prev || {}), loyaltyPoints: Number(newPts) })); } catch (e) { }
                            try { setLoyaltyData(prev => prev ? ({ ...(prev || {}), available: Number(newPts) }) : prev); } catch (e) { }
                            // Best-effort: find the LoyaltyHistory entry that was just created for this immediate deduction
                            // so we can reference it later for precise reverts if the customer is removed.
                            try {
                                const nowMs = Date.now();
                                const histQ = await sdk.db.collection('LoyaltyHistory')
                                    .where('customerId', '==', cid)
                                    .where('points', '==', -Math.abs(redeemPoints))
                                    .orderBy('createdAt', 'desc')
                                    .limit(5)
                                    .get();
                                if (histQ && histQ.docs && histQ.docs.length > 0) {
                                    for (const d of histQ.docs) {
                                        try {
                                            const dd = (d.data && d.data()) || (d._data || {});
                                            if (!dd) continue;
                                            // Accept entries created within a short window (2 minutes)
                                            const createdAt = dd.createdAt ? new Date(dd.createdAt).getTime() : nowMs;
                                            if ((nowMs - createdAt) <= (2 * 60 * 1000)) {
                                                try { setRecentRedeem(prev => ({ ...(prev || {}), historyId: d.id })); } catch (e) { }
                                                break;
                                            }
                                        } catch (inner) { /* ignore */ }
                                    }
                                }
                            } catch (e) {
                                // Non-fatal if we couldn't locate the history id
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[applyRedeemToOrder] immediate backend deduction failed (will retry on order completion)', e);
                    try { showToast('Points could not be deducted immediately; they will be deducted when order is completed', 'warn'); } catch (e) { }
                }
            } else {
                // When deferring immediate deduction we still mark recentRedeem without `deducted` flag
                try { setRecentRedeem(prev => ({ ...(prev || {}), points: redeemPoints, amount: discountAmount, deducted: false, customerId: (customer && customer.id) || (opts && opts.customerId) || null })); } catch (e) { }
            }

            // If we are editing an existing order, persist the loyalty usage onto the order document
            try {

                if (orderId) {
                    __redeem_stage = 'persisting_order_loyalty';
                    const orderRef = sdk.db.collection('Orders').doc(orderId);
                    // Update loyalty metadata on the order so prints and passbook show redeemed points
                    // Persist the actual redeemed points (redeemPoints) — do NOT trust opts.points directly here.
                    await orderRef.update(sanitizeForFirestore({ loyaltyPointsUsed: redeemPoints, loyaltyDiscountAmount: discountAmount }));

                    // If the redeem only partially covered the bill, ensure the order is marked UNSETTLED so remaining
                    // amount can be collected later. If it fully covers, we'll treat it as paid via LOYALTY when the cashier chooses to complete.
                    try {
                        const orderSnap = await orderRef.get();
                        const existing = orderSnap && orderSnap.exists ? (orderSnap.data() || {}) : {};
                        const total = Number(existing.total || existing.finalAmount || cartTotal || 0);
                        const paid = Number(existing.settledAmount || existing.paid ? existing.settledAmount : 0) || 0;
                        const remaining = Math.max(0, total - (paid + discountAmount));
                        if (remaining > 0) {
                            // Mark as UNSETTLED to allow later payment
                            await orderRef.update(sanitizeForFirestore({ payMode: 'UNSETTLED', paid: false, settled: false, settledAmount: Number(paid || 0) }));
                        }
                    } catch (e) { /* ignore */ }

                    // Ensure in-memory orderMeta reflects the persisted values so UI updates immediately
                    try {
                        // Ensure in-memory state reflects the canonical redeemed amount
                        setOrderMeta({ loyaltyPointsUsed: redeemPoints, loyaltyDiscountAmount: discountAmount });
                    } catch (e) { /* non-fatal */ }
                }
            } catch (e) {
                console.warn('Failed to persist loyalty usage on order', e);
            }

            // We intentionally avoid touching the customer's stored loyaltyPoints here.
            // Actual deduction will occur during order completion to ensure reversibility.

            // Emit events so other parts can react (Passbook listens for customerUpdated and orderCompleted)
            try {
                // Dispatch loyalty event for custom handlers
                console.debug('[applyRedeemToOrder] dispatching loyaltyRedeemConfirmed', { customerId: customer.id, points: redeemPoints, discount: discountAmount, orderId: orderId || null, stack: (new Error()).stack.split('\n').slice(1, 6) });
                // Set a short-lived global flag to suppress any accidental immediate auto-print triggered
                // by other listeners that react to order/customer updates. This ensures redeeming points
                // won't immediately open the print dialog even if the bill becomes fully covered.
                try { window.__lastLoyaltyRedeemSuppressPrint = true; } catch (e) { }
                // Reset suppression after 3 seconds
                try { setTimeout(() => { try { window.__lastLoyaltyRedeemSuppressPrint = false; } catch (e) { } }, 3000); } catch (e) { }
                window.dispatchEvent(new CustomEvent('loyaltyRedeemConfirmed', { detail: { customerId: customer.id, points: redeemPoints, discount: discountAmount, orderId: orderId || null, suppressAutoPrint: true } }));
            } catch (e) { console.warn('[applyRedeemToOrder] loyaltyRedeemConfirmed dispatch failed', e); }

            try {
                // Also dispatch a customerUpdated event to keep UI in sync
                const latest = await sdk.db.collection('Customers').doc(customer.id).get();
                const latestData = (latest && latest.exists) ? (latest.data() || {}) : {};
                console.debug('[applyRedeemToOrder] dispatching customerUpdated', { customerId: customer.id, updatedFields: { loyaltyPoints: latestData.loyaltyPoints } });
                window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId: customer.id, updatedFields: { loyaltyPoints: latestData.loyaltyPoints } } }));
            } catch (e) {
                console.warn('[applyRedeemToOrder] customerUpdated dispatch failed', e);
            }

            // Refresh computed points (best-effort) after the transaction so UI shows updated values
            try { const ptsObj = await computeAvailablePoints(customer.id); setLoyaltyData(ptsObj); } catch (e) { }
            // If redeem fully covers the payable amount, ask the cashier whether to print the bill now.
            try {
                const remainingAfterRedeem = Math.max(0, Number(cartTotal || 0) - Number(discountAmount || 0));
                console.debug('[applyRedeemToOrder] remainingAfterRedeem:', remainingAfterRedeem);

                if (remainingAfterRedeem <= 0) {
                    // Show a confirmation modal giving the cashier option to print now or return to checkout
                    if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
                        const modalId = 'redeem-fully-covered-' + Date.now();
                        const html = `
                            <div class="py-4">
                                <div class="flex items-center justify-center mb-4">
                                    <div class="w-14 h-14 bg-yellow-50 rounded-full flex items-center justify-center">
                                        <i class="ph ph-printer text-yellow-600 text-3xl"></i>
                                    </div>
                                </div>
                                <h3 class="text-center font-medium text-gray-800 mb-2">Bill Cleared with Loyalty Points</h3>
                                <p class="text-center text-gray-600 mb-4 px-4">The order is fully paid using loyalty points. Would you like to print the bill now?</p>
                                <div class="flex gap-2 px-4">
                                    <button id="print-now-btn" class="flex-1 py-2 bg-green-600 text-white rounded-lg">Print Now</button>
                                    <button id="later-btn" class="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg">No, Later</button>
                                </div>
                            </div>
                        `;

                        const modal = ModalManager.createCenterModal({
                            id: modalId,
                            title: '',
                            content: html,
                            onShown: (mc) => {
                                try {
                                    const container = mc && mc.container ? mc.container : document;
                                    const printBtn = container.querySelector ? container.querySelector('#print-now-btn') : document.getElementById('print-now-btn');
                                    const laterBtn = container.querySelector ? container.querySelector('#later-btn') : document.getElementById('later-btn');

                                    if (printBtn) {
                                        printBtn.addEventListener('click', async () => {
                                            try {
                                                // Close modal and trigger completeOrder with a LOYALTY payMode and print
                                                mc.close();
                                                setIsProcessing(true);
                                                // Use a distinct pay mode string so logic treats it as a fully-paid order
                                                await completeOrder('LOYALTY', true);
                                            } catch (err) {
                                                console.error('Failed to complete & print loyalty-paid order', err);
                                                showToast('Failed to print bill', 'error');
                                            } finally {
                                                setIsProcessing(false);
                                            }
                                        });
                                    }

                                    if (laterBtn) {
                                        laterBtn.addEventListener('click', () => {
                                            mc.close();
                                            try { showToast('Redeem applied. You can print from Unsettled Bills or Checkout.', 'success'); } catch (e) { }
                                        });
                                    }
                                } catch (e) {
                                    console.warn('redeem fully covered modal onShown failed', e);
                                }
                            }
                        });
                    } else {
                        // Fallback to confirm() if ModalManager not available
                        const confirmed = confirm('The order is fully paid using loyalty points. Print now?');
                        if (confirmed) {
                            setIsProcessing(true);
                            try { await completeOrder('LOYALTY', true); } catch (e) { console.error(e); showToast('Failed to print bill', 'error'); }
                            setIsProcessing(false);
                        } else {
                            showToast('Redeem applied. You can print from Unsettled Bills or Checkout.', 'success');
                        }
                    }
                } else {
                    showToast(`Redeemed ${redeemPoints} points → ${UserSession?.getCurrency()}${discountAmount.toFixed(2)} discount applied`, 'success');
                }
            } catch (modalErr) {
                console.warn('[applyRedeemToOrder] failed to show post-redeem modal', modalErr);
                showToast(`Redeemed ${redeemPoints} points → ${UserSession?.getCurrency()}${discountAmount.toFixed(2)} discount applied`, 'success');
            }

            console.debug('[applyRedeemToOrder] finished successfully');
        } catch (e) {
            try { console.error('applyRedeemToOrder error at stage', __redeem_stage, e); } catch (err) { console.error('applyRedeemToOrder error', e); }
            showToast('Failed to apply redeem: ' + (e && e.message ? e.message : 'Unknown error'), 'error');
        }
    };

    // Expose a debug helper to trigger redeem from the browser console
    try {
        window.__testApplyRedeem = async (override = {}) => {
            console.debug('window.__testApplyRedeem invoked', override);
            try {
                await applyRedeemToOrder({ ...(override || {}) });
                console.debug('window.__testApplyRedeem completed');
            } catch (err) {
                console.error('window.__testApplyRedeem error', err);
            }
        };
    } catch (e) { }

    const onUnitAmountChange = useCallback((cartItem, value) => {
        const key = getCartItemKey(cartItem);
        // Allow empty string while editing; clamp negatives to 0
        const num = value === '' ? '' : Math.max(0, Number(value));
        setUnitAmounts((prev) => ({ ...prev, [key]: num }));
        // Sync amount override when units change
        const ppu = Number(cartItem?.product?.unitPricing?.pricePerUnit);
        if (!isNaN(ppu) && ppu > 0) {
            const amt = num === '' ? '' : (Number(num) * ppu);
            setUnitBaseAmounts((prev) => ({ ...prev, [key]: amt === '' ? '' : Number(amt) }));
        }
    }, [getCartItemKey]);

    const onUnitBaseAmountChange = useCallback((cartItem, value) => {
        const key = getCartItemKey(cartItem);
        const num = value === '' ? '' : Math.max(0, Number(value));
        setUnitBaseAmounts((prev) => ({ ...prev, [key]: num }));
        // Sync units when amount changes
        const ppu = Number(cartItem?.product?.unitPricing?.pricePerUnit);
        if (!isNaN(ppu) && ppu > 0) {
            const units = num === '' ? '' : (Number(num) / ppu);
            setUnitAmounts((prev) => ({ ...prev, [key]: units === '' ? '' : Number(units) }));
        }
    }, [getCartItemKey]);

    const getEffectiveBasePriceForItem = useCallback((ci) => {
        // Non-unit base (exclude addons): prefer variant price, else product price
        const variantOrProductPrice = (ci?.variant?.price != null ? ci.variant.price : ci?.product?.price) || 0;
        const ppu = Number(ci?.product?.unitPricing?.pricePerUnit);
        const enabled = !!(ci?.product?.unitPricing?.enabled) && !isNaN(ppu) && ppu > 0;
        if (!enabled) return variantOrProductPrice;

        const key = getCartItemKey(ci);
        const override = ci?.unitOverride || {};
        const overrideMode = (override.mode === 'units' || override.mode === 'amount') ? override.mode : (itemEntryModes[key] || initialUnitEntryMode || 'amount');

        if (overrideMode === 'amount') {
            // Prefer persisted override amount; else local edit; else variant/product price
            const persistedAmount = override.amount;
            if (persistedAmount != null && !isNaN(Number(persistedAmount)) && Number(persistedAmount) >= 0) {
                return Number(persistedAmount);
            }
            const localAmount = unitBaseAmounts[key];
            if (localAmount != null && localAmount !== '' && !isNaN(Number(localAmount)) && Number(localAmount) >= 0) {
                return Number(localAmount);
            }
            return variantOrProductPrice;
        }

        // Units mode: prefer persisted override units; else local edit; else unitQuantity if present; else 1
        const persistedUnits = override.units;
        if (persistedUnits != null && !isNaN(Number(persistedUnits)) && Number(persistedUnits) >= 0) {
            return ppu * Number(persistedUnits);
        }
        const localUnits = unitAmounts[key];
        if (localUnits != null && localUnits !== '' && !isNaN(Number(localUnits)) && Number(localUnits) >= 0) {
            return ppu * Number(localUnits);
        }
        const uq = Number(ci?.unitQuantity);
        if (!isNaN(uq) && uq >= 0) return ppu * uq;
        return ppu * 1;
    }, [getCartItemKey, unitAmounts, unitBaseAmounts, itemEntryModes, initialUnitEntryMode]);

    // Persist per-item override (mode/units/amount) to order document
    const persistItemOverride = useCallback(async (cartItem, partial) => {
        try {
            if (!orderId) return; // only when editing an existing order
            const orderRef = sdk.db.collection("Orders").doc(orderId);
            const snap = await orderRef.get();
            if (!snap.exists) return;
            const data = snap.data();
            const updated = (data.items || []).map((i) => {
                const match = (i.pid === cartItem?.product?.id) && ((i.variantId || null) === (cartItem?.variant?.id || null));
                if (!match) return i;
                const prev = i.unitOverride || {};
                return { ...i, unitOverride: { ...prev, ...partial } };
            });
            await orderRef.update(sanitizeForFirestore({ items: updated }));
        } catch (e) {
            console.error('Checkout persistItemOverride failed:', e);
            showToast('Failed to save unit override', 'error');
        }
    }, [orderId]);

    // Persist split configuration to the Orders document so it survives closing the checkout sheet
    const persistSplitBillToOrder = useCallback(async (sd) => {
        try {
            if (!orderId || !sdk || !sdk.db) return;
            const orderRef = sdk.db.collection('Orders').doc(orderId);

            if (!sd) {
                // Clear splitBill field (set to null so readers treat it as disabled)
                await orderRef.update({ splitBill: null });
                console.log('[CheckoutSheet] Cleared splitBill on order:', orderId);
                return;
            }

            const payload = {
                enabled: true,
                type: sd.type,
                numberOfPeople: sd.numberOfPeople,
                totalAmount: sd.totalAmount
            };

            if (sd.type === 'equal') {
                payload.amountPerPerson = sd.amountPerPerson;
            } else {
                payload.customSplits = sd.customSplits || [];
            }

            await orderRef.update({ splitBill: payload });
            console.log('[CheckoutSheet] Persisted splitBill to order:', orderId, payload);
        } catch (e) {
            console.error('persistSplitBillToOrder error:', e);
        }
    }, [orderId]);

    // Calculate cart totals
    const cartSubTotal = useMemo(() => {
        if (!cart) return 0;
        return Object.values(cart).reduce((total, ci) => {
            const basePrice = getEffectiveBasePriceForItem(ci);
            const addonsTotal = ci.addons ? ci.addons.reduce((sum, addon) => sum + addon.price, 0) : 0;
            return total + ((basePrice + addonsTotal) * ci.quantity);
        }, 0);
    }, [cart, getEffectiveBasePriceForItem]);

    // Calculate charges (taxes, etc.)
    const chargesCalculation = useMemo(() => {
        if (!cart) return { calculatedCharges: [], totalChargesAmount: 0, finalAmount: 0 };

        // Collect all product charges
        const productCharges = [];
        let commonBulkTaxHashtag = null;
        let allProductsHaveSameHashtag = true;
        let firstProduct = true;

        Object.values(cart).forEach(item => {
            // Check for bulk tax update hashtag
            if (item.product.taxUpdateInfo && item.product.taxUpdateInfo.isFromBulkUpdate) {
                const productHashtag = item.product.taxUpdateInfo.hashtag;

                if (firstProduct) {
                    commonBulkTaxHashtag = productHashtag;
                    firstProduct = false;
                } else if (commonBulkTaxHashtag !== productHashtag) {
                    allProductsHaveSameHashtag = false;
                }
            } else {
                allProductsHaveSameHashtag = false;
            }

            if (item.product.charges && item.product.charges.length > 0) {
                productCharges.push(...item.product.charges);
            }
        });

        // Consolidate charges by name
        const consolidatedCharges = [];
        productCharges.forEach(charge => {
            const existingCharge = consolidatedCharges.find(c => c.name === charge.name && c.type === charge.type);
            if (existingCharge) {
                // For percentage charges, we don't need to sum the percentages
                if (charge.type !== 'percentage') {
                    existingCharge.value = (parseFloat(existingCharge.value) + parseFloat(charge.value)).toString();
                }
                // Ensure the inclusive property is consistent across all products
                // If any product has exclusive charges, the consolidated charge should be exclusive
                if (!charge.inclusive) {
                    existingCharge.inclusive = false;
                }
            } else {
                consolidatedCharges.push({ ...charge });
            }
        });

        // Add bulk tax update hashtag if all products have the same one
        if (allProductsHaveSameHashtag && commonBulkTaxHashtag) {
            consolidatedCharges.forEach(charge => {
                charge.bulkTaxHashtag = commonBulkTaxHashtag;
            });
        }

        // Validate and clean charges before passing to ChargesCalculator
        const validatedCharges = consolidatedCharges.map(charge => ({
            ...charge,
            name: charge.name || '',
            value: charge.value || 0,
            type: charge.type || (String(charge.value || '').includes('%') ? 'percentage' : 'fixed'),
            inclusive: Boolean(charge.inclusive)
        }));

        // Use ChargesCalculator to calculate final amounts
        const calculationResult = ChargesCalculator && typeof ChargesCalculator.calculateCharges === 'function'
            ? ChargesCalculator.calculateCharges(cartSubTotal, validatedCharges)
            : {
                calculatedCharges: [],
                finalAmount: cartSubTotal
            };

        // Calculate total charges amount
        const totalChargesAmount = calculationResult.calculatedCharges.reduce((sum, charge) => sum + (charge.calculatedAmount || 0), 0);

        // Apply discount to final amount
        const finalAmount = Math.max(0, calculationResult.finalAmount - (discount || 0));

        return {
            ...calculationResult,
            totalChargesAmount,
            finalAmount
        };
    }, [cart, cartSubTotal, discount]);

    // Extract values from calculation
    const { calculatedCharges, finalAmount } = chargesCalculation;
    const cartTotal = finalAmount;

    // Whether loyalty is currently applied (either persisted on orderMeta or in recentRedeem)
    // Only treat loyalty as active when there is a selected customer. If there is no
    // customer, we intentionally treat loyalty amounts as zero so the UI doesn't
    // rehydrate redeemed values when removed.
    const loyaltyPointsFromOrderOrRecent = customer && customer.id ? (Number(orderMeta?.loyaltyPointsUsed || recentRedeem?.points || 0) || 0) : 0;
    const loyaltyAmountFromOrderOrRecent = customer && customer.id ? (Number(orderMeta?.loyaltyDiscountAmount || recentRedeem?.amount || 0) || 0) : 0;
    const loyaltyUsed = (loyaltyPointsFromOrderOrRecent > 0 || loyaltyAmountFromOrderOrRecent > 0);
    const loyaltyAppliedAmount = loyaltyUsed ? loyaltyAmountFromOrderOrRecent : 0;

    // Estimate points to be earned for the current cart total (unless loyalty used to pay)
    useEffect(() => {
        // Handle UI updates for Discount Modal
        const discountAmountEl = document.getElementById('discount-amount');
        const finalTotalEl = document.getElementById('final-total');

        if (discountAmountEl && finalTotalEl) {
            const inputVal = parseFloat(discountInput) || 0;
            const calculatedDiscount = percentMode
                ? (inputVal * cartSubTotal / 100)
                : Math.min(inputVal, cartSubTotal);
            const final = Math.max(0, cartSubTotal - calculatedDiscount);
            const currency = UserSession?.getCurrency() || '₹';

            discountAmountEl.textContent = `- ${currency}${calculatedDiscount.toFixed(2)}`;
            finalTotalEl.textContent = `${currency}${final.toFixed(2)}`;
        }
    }, [discountInput, cartSubTotal, percentMode]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const loyaltyUsed = Number(orderMeta?.loyaltyPointsUsed || recentRedeem?.points || 0) > 0;
                if (loyaltyUsed) {
                    if (!cancelled) setEstimatedEarnedPoints(0);
                    return;
                }
                // Use cartTotal (finalAmount) to compute points
                const amount = Number(cartTotal || 0) || 0;
                const pts = await calculatePointsForAmount(amount);
                if (!cancelled) setEstimatedEarnedPoints(Number(pts || 0));
            } catch (e) {
                console.warn('[CheckoutSheet] failed to compute estimated earned points', e);
                if (!cancelled) setEstimatedEarnedPoints(0);
            }
        })();
        return () => { cancelled = true; };
    }, [cartTotal, orderMeta?.loyaltyPointsUsed, recentRedeem?.points]);

    // Format date properly
    const formatDate = (dateStr) => {
        if (!dateStr) return "Just now";

        try {
            const date = new Date(dateStr);
            // Check if date is valid
            if (isNaN(date.getTime())) return "Just now";

            // Format the date
            return date.toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch (error) {
            console.error("Error formatting date:", error);
            return "Just now";
        }
    };

    // Search and fetch customer data
    const searchCustomers = async (query) => {
        if (!query || query.length < 2) {
            setCustomersList([]);
            return;
        }

        setIsLoadingCustomers(true);
        setCustomersError(null);

        try {
            // Simple query similar to the Flutter implementation
            const customersRef = sdk.db.collection("Customers");

            // Basic query without compound indexing requirements or sellerId filter (handled by SDK)
            let snapshot = await customersRef.get();

            // Filter results client-side (like the Flutter implementation)
            const customers = [];
            const queryLower = query.toLowerCase();

            snapshot.forEach(doc => {
                const data = doc.data();
                const name = (data.name || "").toLowerCase();
                const phone = (data.phone || "").toLowerCase();

                // Simple string contains check like the Flutter code
                if (name.includes(queryLower) || phone.includes(queryLower)) {
                    customers.push({
                        id: doc.id,
                        name: data.name || "",
                        phone: data.phone || "",
                        balance: data.balance || 0,
                        lastPurchase: data.lastPurchase,
                        ...data
                    });
                }
            });

            // Sort by name (client side)
            customers.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

            setCustomersList(customers);
        } catch (error) {
            console.error("Error fetching customers:", error);
            setCustomersError("Failed to load customers");
            setCustomersList([]);
        } finally {
            setIsLoadingCustomers(false);
        }
    };

    // Debounced search for better performance
    const debouncedSearchCustomers = useCallback(
        (() => {
            let timeoutId = null;
            return (query) => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                timeoutId = setTimeout(() => {
                    searchCustomers(query);
                }, 300); // 300ms delay
            };
        })(),
        []
    );

    // When user presses Enter in the customer search input, try to auto-select a matching customer
    const handleCustomerSearchKey = async (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = (customerSearch || '').trim();
        if (!q) return;

        // Try exact match in currently loaded results (case-insensitive for name)
        try {
            const exact = customersList.find(c => ((c.name || '').toLowerCase() === q.toLowerCase()) || (String(c.phone || '') === q));
            if (exact) {
                setCustomer(exact);
                setCustomerSearch('');
                setCustomersList([]);
                // Compute canonical points and update UI
                (async () => {
                    try {
                        const ptsObj = await computeAvailablePoints(exact.id);
                        const computed = Number(ptsObj.available || 0) || 0;
                        const stored = Number(exact.loyaltyPoints || 0) || 0;
                        const final = Math.max(computed, stored);
                        try { setLoyaltyData({ available: final, earned: ptsObj.earnedPoints || 0, redeemed: ptsObj.redeemedPoints || 0, birthdayEligible: ptsObj.birthdayEligible || false, redeemThreshold: ptsObj.redeemThreshold || 50 }); } catch (e) { }
                        try { setCustomer(prev => ({ ...(prev || {}), loyaltyPoints: final })); } catch (e) { }
                        console.debug('[Checkout] Enter select exact -> computed points', { customerId: exact.id, computed, stored, final });
                    } catch (err) { console.warn('[Checkout] computeAvailablePoints after exact select failed', err); }
                })();
                return;
            }
        } catch (e) { /* ignore */ }

        // If input looks like a phone number, try querying by phone
        const phoneSan = q.replace(/\D/g, '');
        if (phoneSan.length >= 6) {
            try {
                const snap = await sdk.db.collection('Customers').where('phone', '==', phoneSan).get();
                if (snap && snap.docs && snap.docs.length > 0) {
                    const d = snap.docs[0];
                    const c = { id: d.id, ...(d.data() || {}) };
                    setCustomer(c);
                    setCustomerSearch('');
                    setCustomersList([]);
                    (async () => {
                        try {
                            const ptsObj = await computeAvailablePoints(c.id);
                            const computed = Number(ptsObj.available || 0) || 0;
                            const stored = Number(c.loyaltyPoints || 0) || 0;
                            const final = Math.max(computed, stored);
                            try { setLoyaltyData({ available: final, earned: ptsObj.earnedPoints || 0, redeemed: ptsObj.redeemedPoints || 0, birthdayEligible: ptsObj.birthdayEligible || false, redeemThreshold: ptsObj.redeemThreshold || 50 }); } catch (e) { }
                            try { setCustomer(prev => ({ ...(prev || {}), loyaltyPoints: final })); } catch (e) { }
                            console.debug('[Checkout] phone lookup select -> computed points', { customerId: c.id, computed, stored, final });
                        } catch (err) { console.warn('[Checkout] computeAvailablePoints after phone lookup failed', err); }
                    })();
                    return;
                }
            } catch (e) { console.warn('phone lookup failed', e); }
        }

        // If there's a single search result loaded, pick it
        if (customersList.length === 1) {
            const single = customersList[0];
            setCustomer(single);
            setCustomerSearch('');
            setCustomersList([]);
            (async () => {
                try {
                    const ptsObj = await computeAvailablePoints(single.id);
                    const computed = Number(ptsObj.available || 0) || 0;
                    const stored = Number(single.loyaltyPoints || 0) || 0;
                    const final = Math.max(computed, stored);
                    try { setLoyaltyData({ available: final, earned: ptsObj.earnedPoints || 0, redeemed: ptsObj.redeemedPoints || 0, birthdayEligible: ptsObj.birthdayEligible || false, redeemThreshold: ptsObj.redeemThreshold || 50 }); } catch (e) { }
                    try { setCustomer(prev => ({ ...(prev || {}), loyaltyPoints: final })); } catch (e) { }
                    console.debug('[Checkout] single result select -> computed points', { customerId: single.id, computed, stored, final });
                } catch (err) { console.warn('[Checkout] computeAvailablePoints after single select failed', err); }
            })();
            return;
        }

        showToast('Please select a customer from the list', 'error');
    };

    // Open customer selection modal
    const openCustomerModal = () => {
        setCustomerSearch('');
        setCustomersList([]);

        if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
            const customerModalContent = `
                <div class="mb-5">
                    <!-- Search input -->
                    <div class="relative">
                        <input
                            type="text"
                            id="customer-search-input"
                            placeholder="Search by name or phone number"
                            class="w-full px-4 py-3 pl-10 pr-8 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 bg-white shadow-sm"
                        />
                        <div class="absolute left-3 top-3.5" id="search-icon">
                            <i class="ph ph-magnifying-glass text-gray-400"></i>
                        </div>
                        <div class="absolute left-3 top-3.5 hidden" id="search-loading">
                            <div class="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <button
                            id="clear-search-btn"
                            class="absolute right-3 top-3 text-gray-400 hover:text-gray-600 hidden"
                        >
                            <i class="ph ph-x"></i>
                        </button>
                    </div>
                    <div class="mt-2 text-xs text-gray-500 flex justify-between items-center">
                        <span id="search-status">Enter 2+ characters to search</span>
                        <button 
                            id="refresh-customers-btn"
                            class="text-red-500 hover:text-red-600 flex items-center"
                        >
                            <i class="ph ph-arrows-clockwise mr-1 text-xs"></i>
                            Refresh
                        </button>
                    </div>

                    <!-- Create new customer form -->
                    <div class="border-t border-b my-4 py-4">
                        <div class="flex items-center justify-between mb-2">
                            <h4 class="text-sm font-medium text-gray-700">Add New Customer</h4>
                            <span class="text-xs text-gray-500">Required fields *</span>
                        </div>
                        <form id="new-customer-form" class="bg-white rounded-lg">
                            <div class="space-y-3">
                                <div>
                                    <div class="flex items-center mb-1">
                                        <label for="new-customer-name" class="text-sm text-gray-600">Name</label>
                                        <span class="text-red-500 ml-1">*</span>
                                    </div>
                                    <div class="relative">
                                        <i class="ph ph-user absolute left-3 top-2.5 text-gray-400"></i>
                                        <input
                                            id="new-customer-name"
                                            type="text"
                                            placeholder="Customer name"
                                            class="w-full pl-9 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-400"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label for="new-customer-phone" class="text-sm text-gray-600 block mb-1">Phone Number</label>
                                    <div class="relative">
                                        <i class="ph ph-phone absolute left-3 top-2.5 text-gray-400"></i>
                                        <input
                                            id="new-customer-phone"
                                            type="tel"
                                            placeholder="Phone number"
                                            class="w-full pl-9 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-400"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    class="w-full py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
                                >
                                    <i class="ph ph-user-plus mr-2"></i>
                                    Add Customer
                                </button>
                            </div>
                        </form>
                    </div>

                    <!-- Customer list -->
                    <div>
                        <h4 class="text-sm font-medium text-gray-700 mb-3" id="customers-list-title">
                            Recent Customers
                        </h4>
                        
                        <div id="customers-loading" class="flex justify-center items-center py-8">
                            <div class="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                            <span class="text-gray-500">Loading customers...</span>
                        </div>
                        
                        <div id="customers-error" class="text-center py-8 text-red-500 hidden">
                            <i class="ph ph-warning-circle text-2xl mb-2"></i>
                            <p id="error-message">Error loading customers</p>
                            <button 
                                id="try-again-btn"
                                class="mt-3 text-sm py-1.5 px-3 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                        
                        <div id="customers-empty" class="text-center py-8 text-gray-500 hidden">
                            <i class="ph ph-users text-3xl mb-2"></i>
                            <p id="empty-message">No customers found</p>
                            <p class="text-sm text-gray-400 mt-2">Try a different search or add a new customer</p>
                        </div>
                        
                        <div id="customers-list" class="space-y-2.5">
                            <!-- Customers will be added here dynamically -->
                        </div>
                    </div>
                </div>
            `;

            const customerModalFooter = `
                <div class="flex gap-3">
                    <button id="cancel-customer-select" class="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg">
                        Cancel
                    </button>
                </div>
            `;

            // Create the modal and attach handlers (ensure phone is mandatory on new customer creation)
            ModalManager.createCenterModal({
                id: 'checkout-customer-modal',
                title: 'Select Customer',
                content: customerModalContent,
                actions: customerModalFooter,
                size: 'md',
                onShown: (modalControl) => {
                    try {
                        const nameInput = document.getElementById('new-customer-name');
                        const phoneInput = document.getElementById('new-customer-phone');
                        const newCustomerForm = document.getElementById('new-customer-form');
                        const cancelBtn = document.getElementById('cancel-customer-select');
                        const refreshBtn = document.getElementById('refresh-customers-btn');

                        if (cancelBtn) cancelBtn.addEventListener('click', () => modalControl.close());

                        if (refreshBtn) refreshBtn.addEventListener('click', () => {
                            try { loadRecentCustomers(); } catch (e) { console.warn('refresh customers failed', e); }
                        });

                        if (newCustomerForm) {
                            newCustomerForm.addEventListener('submit', (e) => {
                                e && e.preventDefault && e.preventDefault();
                                const name = nameInput ? (nameInput.value || '').trim() : '';
                                const rawPhone = phoneInput ? (phoneInput.value || '').trim() : '';
                                const phoneSanitized = rawPhone.replace(/\D/g, '');

                                if (!name) {
                                    if (ModalManager && ModalManager.showToast) ModalManager.showToast('Customer name is required', { type: 'error' });
                                    else showToast('Customer name is required', 'error');
                                    nameInput && nameInput.focus && nameInput.focus();
                                    return;
                                }

                                // Phone is mandatory now
                                if (!phoneSanitized) {
                                    if (ModalManager && ModalManager.showToast) ModalManager.showToast('Phone number is required', { type: 'error' });
                                    else showToast('Phone number is required', 'error');
                                    phoneInput && phoneInput.focus && phoneInput.focus();
                                    return;
                                }

                                // Basic validation: require at least 10 digits
                                if (!/^[0-9]{10,}$/.test(phoneSanitized)) {
                                    if (ModalManager && ModalManager.showToast) ModalManager.showToast('Please enter a valid phone number', { type: 'error' });
                                    else showToast('Please enter a valid phone number', 'error');
                                    phoneInput && phoneInput.focus && phoneInput.focus();
                                    return;
                                }

                                // Check if customer with this phone number already exists
                                console.log('Checking if phone number exists:', phoneSanitized);
                                isPhoneNumberExists(phoneSanitized)
                                    .then(async (phoneExists) => {
                                        if (phoneExists) {
                                            console.log('Phone number already exists, showing error');
                                            if (ModalManager && ModalManager.showToast) {
                                                ModalManager.showToast("This Phone number already exists for a customer ! Please try another number.", { type: 'error' });
                                            } else {
                                                showToast("This Phone number already exists for a customer ! Please try another number.", 'error');
                                            }
                                            throw new Error('Phone number already exists');
                                        }

                                        const newCustomer = {
                                            name,
                                            phone: phoneSanitized,
                                            balance: 0,
                                            createdAt: new Date(),
                                            lastPurchase: new Date(),
                                            sellerId: UserSession?.seller?.id
                                        };

                                        const docRef = await sdk.db.collection('Customers').add(newCustomer);
                                        console.log('Customer added successfully, docRef:', docRef);
                                        try {
                                            setCustomer({ ...newCustomer, id: docRef.id });
                                        } catch (e) { console.warn('setCustomer failed', e); }

                                        try {
                                            if (ModalManager && ModalManager.showToast) ModalManager.showToast('New customer added', { type: 'success' });
                                            else showToast('New customer added', 'success');
                                            window.dispatchEvent(new CustomEvent('customerAdded', { detail: { id: docRef.id, ...newCustomer } }));
                                        } catch (e) { console.warn('customerAdded dispatch failed', e); }

                                        modalControl.close();
                                    })
                                    .catch((err) => {
                                        // Don't show error if it's the phone number duplicate error (already shown)
                                        if (err.message === 'Phone number already exists') {
                                            return;
                                        }
                                        console.error('Error adding customer:', err);
                                        if (ModalManager && ModalManager.showToast) ModalManager.showToast('Failed to add customer', { type: 'error' });
                                        else showToast('Failed to add customer', 'error');
                                    });
                            });
                        }

                        // Autofocus name input when modal opens
                        setTimeout(() => { try { nameInput && nameInput.focus && nameInput.focus(); } catch (e) { } }, 50);
                    } catch (ex) {
                        console.warn('Modal onShown handler error', ex);
                    }
                }
            });
        } else {
            setShowCustomerModal(true);
            // Load customers for the modal view
            loadRecentCustomers();
        }
    };

    // Load recent or top customers
    const loadRecentCustomers = async () => {
        setIsLoadingCustomers(true);
        setCustomersError(null);

        try {
            // Create simple query to get customers, avoiding complex indexing
            // No need for sellerId filter as it's handled by the SDK
            let customersRef = sdk.db.collection("Customers");
            let snapshot = await customersRef.get();

            // Process results
            const customers = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                customers.push({
                    id: doc.id,
                    name: data.name || "",
                    phone: data.phone || "",
                    balance: data.balance || 0,
                    lastPurchase: data.lastPurchase,
                    ...data
                });
            });

            // Sort by lastPurchase date if available (client-side)
            customers.sort((a, b) => {
                // If both have lastPurchase dates
                if (a.lastPurchase && b.lastPurchase) {
                    // Convert to Date objects if needed
                    const dateA = a.lastPurchase instanceof Date ? a.lastPurchase : new Date(a.lastPurchase);
                    const dateB = b.lastPurchase instanceof Date ? b.lastPurchase : new Date(b.lastPurchase);
                    // Reverse sort (newest first)
                    return dateB - dateA;
                }
                // If only one has lastPurchase
                if (a.lastPurchase) return -1;
                if (b.lastPurchase) return 1;
                // If neither has lastPurchase, sort by name
                return (a.name || "").localeCompare(b.name || "");
            });

            // Limit to 15 customers (client-side)
            setCustomersList(customers.slice(0, 15));
        } catch (error) {
            console.error("Error loading recent customers:", error);
            setCustomersError("Failed to load recent customers");
            setCustomersList([]);
        } finally {
            setIsLoadingCustomers(false);
        }
    };

    // Load auto print preference from localStorage during component initialization
    useEffect(() => {
        const savedPreference = localStorage.getItem('autoPrintPreference');
        if (savedPreference !== null) {
            setAutoPrint(savedPreference === 'true');
        }
    }, []);

    // Save auto print preference to localStorage
    const toggleAutoPrint = (value) => {
        const newValue = typeof value === 'boolean' ? value : !autoPrint;
        setAutoPrint(newValue);
        localStorage.setItem('autoPrintPreference', newValue.toString());
        showToast(`Auto print ${newValue ? 'enabled' : 'disabled'}`, "info");
    };

    // Previously showed a blocking phone-required modal. Instead, direct the user to
    // the customer modal to add or edit the customer's phone. Return false so the
    // checkout flow does not continue until phone is added via the customer UI.
    const showPhoneRequiredModal = async (customerData) => {
        // Don't open any modal here. Phone is mandatory when creating a customer.
        showToast(`Customer ${customerData.name} needs a phone number. Please add the phone when creating the customer.`, 'error');
        return false;
    };

    // Show out-of-stock modal
    const showOutOfStockModal = async (productName) => {
        return new Promise((resolve) => {
            if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
                const modalContent = `
                    <div class="text-center">
                        <div class="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                            <i class="ph ph-warning-circle text-2xl text-red-600"></i>
                        </div>
                        <h3 class="text-lg font-medium text-gray-800 mb-2">Item Out of Stock</h3>
                        <p class="text-gray-600 mb-6 px-4">
                            <strong class="text-gray-800">${productName}</strong> is currently out of stock.
                            <br><br>
                            You can either continue by ordering it on-demand or skip this item.
                        </p>
                        <div class="space-y-3 px-1">
                            <button 
                                id="continue-on-demand-btn" 
                                class="w-full py-3 bg-blue-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm"
                            >
                                <i class="ph ph-cooking-pot mr-2 text-lg"></i>
                                Continue On-Demand
                            </button>
                            <button 
                                id="skip-item-btn" 
                                class="w-full py-3 bg-orange-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-orange-600 transition-colors shadow-sm"
                            >
                                <i class="ph ph-x-circle mr-2 text-lg"></i>
                                Skip This Item
                            </button>
                            <button 
                                id="cancel-checkout-btn" 
                                class="w-full py-3 bg-gray-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-gray-600 transition-colors shadow-sm"
                            >
                                <i class="ph ph-x mr-2 text-lg"></i>
                                Cancel Checkout
                            </button>
                        </div>
                        <div class="mt-4 text-center text-xs text-gray-500">
                            <span class="flex items-center justify-center">
                                <i class="ph ph-info text-xs mr-1"></i>
                                On-demand items will be prepared fresh when ordered
                            </span>
                        </div>
                    </div>
                `;

                ModalManager.createCenterModal({
                    title: "",
                    content: modalContent,
                    onShown: (modalControl) => {
                        // Continue on-demand
                        document.getElementById('continue-on-demand-btn').addEventListener('click', () => {
                            modalControl.close();
                            resolve('continue');
                        });

                        // Skip item
                        document.getElementById('skip-item-btn').addEventListener('click', () => {
                            modalControl.close();
                            resolve('skip');
                        });

                        // Cancel checkout
                        document.getElementById('cancel-checkout-btn').addEventListener('click', () => {
                            modalControl.close();
                            resolve('cancel');
                        });
                    }
                });
            } else {
                // Fallback if ModalManager is not available
                const choice = confirm(`${productName} is out of stock. Click OK to continue on-demand, Cancel to skip.`);
                resolve(choice ? 'continue' : 'skip');
            }
        });
    };

    // Focus the edit input when edit mode starts
    useEffect(() => {
        if (isEditingCustomerName) {
            setTimeout(() => {
                try {
                    if (editNameInputRef.current) {
                        editNameInputRef.current.focus();
                        editNameInputRef.current.select && editNameInputRef.current.select();
                    }
                } catch (e) { /* ignore */ }
            }, 50);
        }
    }, [isEditingCustomerName]);

    // Handle checkout
    const handleCheckout = async (mode) => {
        if (!mode) {
            console.error("handleCheckout called without a payment mode");
            showToast("Payment mode not specified", "error");
            return;
        }

        console.log(`Starting checkout with mode: ${mode}`);
        let billPrintedSuccessfully = false;
        let userCancelledBluetooth = false;

        try {
            if (Object.keys(cart).length === 0) {
                showToast("Your cart is empty", "error");
                return;
            }

            // Check for out-of-stock items before proceeding
            const outOfStockItems = [];
            Object.values(cart).forEach(cartItem => {
                const product = cartItem.product;
                // Check if product is pre-prepared (has stock management) and is out of stock
                if (product.inventoryDeductionMode === 'pre-prepared' &&
                    product.stock !== undefined &&
                    product.stock <= 0) {
                    outOfStockItems.push({
                        cartItem,
                        productName: product.title
                    });
                }
            });

            // If there are out-of-stock items, show modal for each one
            if (outOfStockItems.length > 0) {
                console.log('Found out-of-stock items:', outOfStockItems);

                for (const { cartItem, productName } of outOfStockItems) {
                    const userChoice = await showOutOfStockModal(productName);

                    if (userChoice === 'continue') {
                        // Convert to on-demand for this order
                        console.log(`Converting ${productName} to on-demand for this order`);
                        cartItem.product.inventoryDeductionMode = 'on-demand';
                        cartItem.product.tempOnDemand = true; // Mark as temporarily converted
                    } else if (userChoice === 'skip') {
                        // Remove from cart
                        console.log(`Removing ${productName} from cart`);
                        const cartKey = Object.keys(cart).find(key => cart[key] === cartItem);
                        if (cartKey) {
                            delete cart[cartKey];
                        }
                    } else {
                        // User cancelled, abort checkout
                        console.log('User cancelled checkout due to out-of-stock items');
                        return;
                    }
                }

                // If all items were removed, show message and return
                if (Object.keys(cart).length === 0) {
                    showToast("All items were removed from cart", "info");
                    return;
                }
            }

            // CREDIT mode requires a customer with phone number
            if (mode === 'CREDIT' && !customer) {
                showToast("Please select a customer for credit purchase", "error");
                openCustomerModal();
                return;
            }

            // Verify customer has phone number if customer is selected
            if (customer && (!customer.phone || customer.phone.trim() === '')) {
                const customerNeedsPhone = await showPhoneRequiredModal(customer);
                if (!customerNeedsPhone) {
                    return; // User cancelled or couldn't add phone
                }
            }



            // Update payment mode if specified
            if (mode) {
                setPaymentMode(mode);
            }

            // Show checkout confirmation modal with three options
            if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
                const modalContent = `
                    <div class="py-4">
                        <div class="flex items-center justify-center mb-6">
                            <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                                <i class="ph ph-check-circle text-red-500 text-4xl"></i>
                            </div>
                        </div>
                        <h3 class="text-center font-medium text-gray-800 mb-2">${t('completeOrder')}</h3>
                        <p class="text-center text-gray-600 mb-6 px-4">
                            ${t('orderReadyForPayment').replace('{paymentmethod}', mode.toLowerCase())}
                        </p>
                        <div class="space-y-3 px-1">
                            <button 
                                id="print-only-btn" 
                                class="w-full py-3 bg-orange-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-orange-600 transition-colors shadow-sm"
                            >
                                <i class="ph ph-printer mr-2 text-lg"></i>
                                ${t('printBillOnly')}
                            </button>
                            <button 
                                id="save-checkout-btn" 
                                class="w-full py-3 bg-blue-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm"
                            >
                                <i class="ph ph-floppy-disk mr-2 text-lg"></i>
                                ${t('saveAndCheckout')}
                            </button>
                            <button 
                                id="save-print-btn" 
                                class="w-full py-3 bg-red-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                            >
                                <i class="ph ph-printer mr-2 text-lg"></i>
                                ${t('saveAndPrint')}
                            </button>
                        </div>
                        <div class="mt-4 text-center text-xs text-gray-500">
                            <span class="flex items-center justify-center">
                                <i class="ph ph-info text-xs mr-1"></i>
                                ${t('printOnlyDoesNotCompleteOrder')}
                            </span>
                        </div>
                    </div>
                `;

                await new Promise((resolve, reject) => {
                    ModalManager.createCenterModal({
                        title: "",
                        content: modalContent,
                        onShown: async (modalControl) => {
                            // Print bill only (preview) without completing order
                            document.getElementById('print-only-btn').addEventListener('click', async () => {
                                try {
                                    await printBillOnly(mode);
                                    // Don't close modal, allow multiple print attempts or other actions
                                } catch (error) {
                                    try { window.__lastCheckoutError = { ts: Date.now(), source: 'print-only-btn', message: error && (error.message || String(error)), stack: error && error.stack || null }; } catch (e) { }
                                    safeLogError("Error in print only:", error);
                                    showToast("Failed to print bill preview", "error");
                                }
                            });

                            // Save and checkout without printing
                            document.getElementById('save-checkout-btn').addEventListener('click', async () => {
                                modalControl.close();
                                try {
                                    setIsProcessing(true);
                                    await completeOrder(mode, false);
                                    resolve();
                                } catch (error) {
                                    try { window.__lastCheckoutError = { ts: Date.now(), source: 'save-checkout-btn', message: error && (error.message || String(error)), stack: error && error.stack || null }; } catch (e) { }
                                    safeLogError("Error in save & checkout:", error);
                                    reject(error);
                                } finally {
                                    setIsProcessing(false);
                                }
                            });

                            // Save and print
                            document.getElementById('save-print-btn').addEventListener('click', async () => {
                                modalControl.close();
                                try {
                                    setIsProcessing(true);
                                    await completeOrder(mode, true);
                                    resolve();
                                } catch (error) {
                                    try { window.__lastCheckoutError = { ts: Date.now(), source: 'save-print-btn', message: error && (error.message || String(error)), stack: error && error.stack || null }; } catch (e) { }
                                    safeLogError("Error in save & print:", error);
                                    reject(error);
                                } finally {
                                    setIsProcessing(false);
                                }
                            });
                        }
                    });
                });
            } else {
                // Fallback if ModalManager is not available
                setIsProcessing(true);
                try {
                    const shouldPrint = confirm("Do you want to print the bill?");
                    await completeOrder(mode, shouldPrint);
                } finally {
                    setIsProcessing(false);
                }
            }
        } catch (error) {
            try { window.__lastCheckoutError = { ts: Date.now(), source: 'handleCheckout', message: error && (error.message || String(error)), stack: error && error.stack || null }; } catch (e) { }
            safeLogError("Checkout error:", error);
            try {
                safeLogError("Error details:", {
                    message: error && error.message ? error.message : "No message",
                    stack: error && error.stack ? error.stack : "No stack trace",
                    name: error && error.name ? error.name : "No name"
                });
            } catch (e) { /* ignore */ }
            showToast("Failed to process order: " + (error && error.message ? error.message : "Unknown error"), "error");
            setIsProcessing(false);
        }
    };

    // Helper function to print bill only (preview) without completing order
    const printBillOnly = async (mode) => {
        try {
            setIsProcessing(true);

            // Prepare preview order data from current cart
            const previewOrderData = preparePreviewOrderData(mode);

            // If this preview is for an existing order, prefer the saved human-readable billNo
            // falling back to the document id when billNo is not present.
            try {
                if (orderId && sdk && sdk.db && typeof sdk.db.collection === 'function') {
                    const orderRef = sdk.db.collection('Orders').doc(orderId);
                    const snap = await orderRef.get();
                    const data = snap && snap.exists ? snap.data() : null;
                    previewOrderData.displayBillNo = (data && data.billNo) ? data.billNo : orderId;
                }
            } catch (e) {
                console.warn('Could not set displayBillNo on previewOrderData:', e);
            }

            // Print the preview bill using BluetoothPrinting
            const printSuccess = await BluetoothPrinting.printPreviewBill(previewOrderData, mode);

            if (printSuccess) {
                showToast("Bill preview printed successfully", "success");
            } else {
                showToast("Failed to print bill preview", "error");
            }

            return printSuccess;
        } catch (error) {
            console.error("Error printing bill preview:", error);
            showToast("Error printing bill preview: " + (error.message || "Unknown error"), "error");
            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    // Print a split bill preview for a single person (does not complete the full order)
    const printSplitBill = async (index, mode) => {
        if (!splitData || !splitData.numberOfPeople) {
            showToast('Split data not configured', 'error');
            return false;
        }

        const person = splitData.customSplits ? (splitData.customSplits[index] || {}) : { name: `Person ${index + 1}`, amount: splitData.amountPerPerson };
        const amount = Number(person.amount || 0);

        try {
            setIsProcessing(true);

            // Prepare a base preview order using existing helper
            const previewOrderData = preparePreviewOrderData(mode);

            // Keep original items and compute the normal bill (including taxes/charges).
            // Then add a single 'Split' adjustment charge so the final total equals the requested amount.
            const originalItems = Array.isArray(previewOrderData.items) ? previewOrderData.items : [];
            // Ensure items are preserved for normal tax/charge computation
            previewOrderData.items = originalItems.map(it => ({ ...(it || {}) }));

            // Use the PrintTemplate to compute the full total with current charges
            try {
                const tmpTemplate = new PrintTemplate({ type: 'bill', orderData: previewOrderData, seller: UserSession?.seller || {} });
                let computedTotal = Number(tmpTemplate.variables && tmpTemplate.variables.total) || 0;

                // adjustment = amount - computedTotal (positive -> increase, negative -> discount)
                const adjustment = Math.round((amount - computedTotal) * 100) / 100;
                if (Math.abs(adjustment) > 0.001) {
                    previewOrderData.charges = Array.isArray(previewOrderData.charges) ? previewOrderData.charges.slice() : [];
                    // Add a fixed charge (can be negative) labelled as the split adjustment
                    previewOrderData.charges.push({
                        name: `Split ${index + 1}${person.name ? ` - ${person.name}` : ''}`,
                        value: adjustment,
                        type: 'fixed',
                        inclusive: false
                    });

                    // Recompute totals after adding adjustment
                    const tmpTemplate2 = new PrintTemplate({ type: 'bill', orderData: previewOrderData, seller: UserSession?.seller || {} });
                    computedTotal = Number(tmpTemplate2.variables && tmpTemplate2.variables.total) || computedTotal;
                    // Expose computed totals back to previewOrderData for consistency
                    previewOrderData.total = Math.round(computedTotal * 100) / 100;
                } else {
                    // No adjustment needed; set total from computed value
                    previewOrderData.total = Math.round(computedTotal * 100) / 100;
                }
            } catch (e) {
                console.warn('Failed to compute charges for split preview, falling back to simple amount:', e);
                previewOrderData.total = amount;
            }
            // Use subtotal as sum of item line totals (template will render charges)
            const computedSub = previewOrderData.items.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qnt || 1)), 0);
            previewOrderData.subTotal = Math.round(computedSub * 100) / 100;
            previewOrderData.discount = previewOrderData.discount || 0;
            previewOrderData.splitData = {
                enabled: true,
                numberOfPeople: splitData.numberOfPeople,
                index: index,
                amount: amount,
                note: `Split ${index + 1} of ${splitData.numberOfPeople}`
            };
            previewOrderData.isPreview = true;

            // If this preview is for an existing order, prefer the saved human-readable billNo
            // falling back to the document id when billNo is not present.
            try {
                if (orderId && sdk && sdk.db && typeof sdk.db.collection === 'function') {
                    const orderRef = sdk.db.collection('Orders').doc(orderId);
                    const snap = await orderRef.get();
                    const data = snap && snap.exists ? snap.data() : null;
                    previewOrderData.displayBillNo = (data && data.billNo) ? data.billNo : orderId;
                }
            } catch (e) {
                console.warn('Could not set displayBillNo on previewOrderData:', e);
            }

            // Use BluetoothPrinting's preview print method (existing helper)
            if (BluetoothPrinting && typeof BluetoothPrinting.printPreviewBill === 'function') {
                const ok = await BluetoothPrinting.printPreviewBill(previewOrderData, mode);
                if (ok) {
                    showToast(`Printed split ${index + 1} (${mode})`, 'success');
                    return true;
                }
                showToast('Failed to print split bill', 'error');
                return false;
            }

            // Fallback: build HTML via PrintTemplate and open preview (best-effort)
            try {
                const template = new PrintTemplate({ type: 'bill', orderData: previewOrderData, seller: UserSession?.seller || {} });
                const html = template.toHTML();
                const win = window.open('', '_blank');
                if (win) {
                    win.document.write(html);
                    win.document.close();
                    showToast(`Opened preview for split ${index + 1}`, 'info');
                    return true;
                }
            } catch (e) {
                console.error('Fallback split print failed:', e);
            }

            showToast('Printing not available', 'error');
            return false;
        } catch (err) {
            console.error('printSplitBill error:', err);
            showToast('Error printing split bill', 'error');
            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    // Complete a split as a partial payment on the existing order (if orderId exists)
    const completeSplitPartialPayment = async (index, mode) => {
        if (!orderId) {
            // Fallback: no order exists yet — fallback to completing full order
            showToast('Order not yet created; completing full order instead', 'info');
            return completeOrder(mode, false);
        }

        if (!splitData) {
            showToast('No split configuration found', 'error');
            return false;
        }

        const person = splitData.customSplits ? (splitData.customSplits[index] || {}) : { amount: splitData.amountPerPerson };
        const amount = Number(person.amount || 0);

        try {
            setIsProcessing(true);
            const orderRef = sdk.db.collection('Orders').doc(orderId);
            const snap = await orderRef.get();
            const data = snap.exists ? snap.data() : {};

            const existingPartial = Array.isArray(data.partialPayments) ? data.partialPayments : [];
            const payment = {
                amount: Number(amount),
                paymentMode: mode,
                date: new Date(),
                notes: `Split ${index + 1}`,
                id: Date.now().toString(),
                payer: (customer && customer.name) ? customer.name : `Split ${index + 1}`
            };

            const prevSettled = Number(data.settledAmount || 0);
            const newSettled = prevSettled + payment.amount;

            // Robustly compute order total to avoid false positives when data.total is missing
            let orderTotal = 0;
            if (data && typeof data.total !== 'undefined' && data.total !== null) {
                orderTotal = Number(data.total) || 0;
            } else if (Array.isArray(data.items) && data.items.length > 0) {
                try {
                    orderTotal = data.items.reduce((s, it) => {
                        const price = Number(it.price || it.basePrice || 0);
                        const qty = Number(it.qnt || it.quantity || 1);
                        return s + (price * qty);
                    }, 0);
                } catch (e) {
                    orderTotal = Number(cartTotal || 0) || 0;
                }
            } else if (splitData && splitData.totalAmount) {
                orderTotal = Number(splitData.totalAmount) || 0;
            } else {
                orderTotal = Number(cartTotal || 0) || 0;
            }

            const isFullySettled = orderTotal > 0 ? (newSettled >= orderTotal) : (newSettled > 0 && Boolean(data.settled));

            const updateData = {
                partialPayments: [...existingPartial, payment],
                settledAmount: newSettled,
                settled: isFullySettled,
                paid: isFullySettled
            };

            // If fully settled, add COMPLETED status entry
            if (isFullySettled) {
                const now = new Date();
                updateData.status = [...(data.status || []), { label: 'COMPLETED', date: now }];
                updateData.currentStatus = { label: 'COMPLETED', date: now };
            } else {
                // Ensure order remains visible/open while splits are pending
                try {
                    const now = new Date();
                    updateData.status = [...(data.status || []), { label: 'SPLIT_PENDING', date: now }];
                    updateData.currentStatus = { label: 'SPLIT_PENDING', date: now };
                    updateData.splitBillIncomplete = true;
                    updateData.paid = false;
                    updateData.settled = false;
                } catch (e) {
                    console.error('Failed to set split pending status:', e);
                }
            }

            // Ensure splitBill persists on the order when we have a split configured
            try {
                if (splitData) {
                    updateData.splitBill = {
                        enabled: true,
                        type: splitData.type,
                        numberOfPeople: splitData.numberOfPeople,
                        totalAmount: splitData.totalAmount,
                        ...(splitData.type === 'equal' ? { amountPerPerson: splitData.amountPerPerson } : { customSplits: splitData.customSplits })
                    };
                }
            } catch (e) { console.warn('Failed to attach splitData to updateData:', e); }

            await orderRef.update(updateData);

            // Update local UI state to mark this split as paid
            try {
                // Build next splitPayments array (use existing splitPayments from state if available)
                const prevArray = Array.isArray(splitPayments) ? splitPayments : [];
                const next = [...prevArray];
                next[index] = {
                    ...(next[index] || {}),
                    mode,
                    amount,
                    paid: true,
                    payer: (customer && customer.name) ? customer.name : `Split ${index + 1}`
                };

                // Update state
                setSplitPayments(next);

                showToast(`Recorded payment of ${UserSession?.getCurrency()}${amount.toFixed(2)} as ${mode}`, 'success');

                // Dispatch event so other components refresh
                window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId } }));

                // If all splits are now paid, close the checkout similar to completeOrder
                const allPaid = next.length > 0 && next.every(p => p && p.paid);
                if (allPaid) {
                    // Notify other components that the order is completed
                    window.dispatchEvent(new CustomEvent('orderCompleted', { detail: { orderId } }));

                    // Give the UI a small moment to update then close
                    try {
                        // onClose is a prop passed into this component - call it to close checkout UI
                        onClose && onClose();
                    } catch (e) {
                        console.warn('Error calling onClose after all splits paid:', e);
                    }
                }

                return true;
            } catch (stateErr) {
                console.error('Error updating local splitPayments state:', stateErr);
            }

            // Defensive: verify the order in Firestore reflects completion; if not, write a finalizing update
            try {
                if (isFullySettled) {
                    const snap2 = await orderRef.get();
                    const newData = snap2.exists ? snap2.data() : {};
                    const now2 = new Date();
                    const needsFix = !(newData.currentStatus && newData.currentStatus.label === 'COMPLETED') || newData.paid !== true || newData.settled !== true;
                    if (needsFix) {
                        const finalStatus = { label: 'COMPLETED', date: now2 };
                        const finalUpdate = {
                            paid: true,
                            settled: true,
                            settledAmount: newSettled,
                            currentStatus: finalStatus,
                            status: [...(Array.isArray(newData.status) ? newData.status.filter(s => s && s.label !== 'COMPLETED') : []), finalStatus]
                        };
                        try {
                            await orderRef.update(finalUpdate);
                            console.log('[CheckoutSheet] Forced final completed state for order', orderId);
                        } catch (e) {
                            console.warn('[CheckoutSheet] Failed to force-complete order:', e);
                        }
                    }
                }
            } catch (verifyErr) {
                console.error('Error verifying order completion after split payment:', verifyErr);
            }

            return true;
        } catch (err) {
            console.error('completeSplitPartialPayment error:', err);
            showToast('Failed to record split payment', 'error');
            return false;
        } finally {
            setIsProcessing(false);
        }
    };

    // Show the standard checkout modal for a split selection and wire actions
    const openSplitModal = (index, mode) => {
        if (!ModalManager || typeof ModalManager.createCenterModal !== 'function') {
            // Fallback behavior: print preview
            printSplitBill(index, mode);
            return;
        }

        const modalContent = `
            <div class="py-4">
                <div class="flex items-center justify-center mb-6">
                    <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                        <i class="ph ph-check-circle text-red-500 text-4xl"></i>
                    </div>
                </div>
                <h3 class="text-center font-medium text-gray-800 mb-2">Complete Split Payment</h3>
                <p class="text-center text-gray-600 mb-6 px-4">Process payment for split ${index + 1}. Choose an option:</p>
                <div class="space-y-3 px-1">
                    <button id="split-print-only-btn" class="w-full py-3 bg-orange-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-orange-600 transition-colors shadow-sm"><i class="ph ph-printer mr-2 text-lg"></i>Print Bill Only</button>
                    <button id="split-save-checkout-btn" class="w-full py-3 bg-blue-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm"><i class="ph ph-floppy-disk mr-2 text-lg"></i>Save & Checkout</button>
                    <button id="split-save-print-btn" class="w-full py-3 bg-red-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"><i class="ph ph-printer mr-2 text-lg"></i>Save & Print</button>
                </div>
                <div class="mt-4 text-center text-xs text-gray-500"><span class="flex items-center justify-center"><i class="ph ph-info text-xs mr-1"></i>Print Only does not complete the order</span></div>
            </div>
        `;

        ModalManager.createCenterModal({
            title: '',
            content: modalContent,
            onShown: (modalControl) => {
                const printBtn = document.getElementById('split-print-only-btn');
                const saveBtn = document.getElementById('split-save-checkout-btn');
                const savePrintBtn = document.getElementById('split-save-print-btn');

                if (printBtn) {
                    printBtn.addEventListener('click', async () => {
                        try {
                            await printSplitBill(index, mode);
                        } catch (e) { console.error(e); }
                    });
                }

                if (saveBtn) {
                    saveBtn.addEventListener('click', async () => {
                        modalControl.close();
                        try {
                            setIsProcessing(true);
                            await completeSplitPartialPayment(index, mode);
                        } catch (e) { console.error(e); }
                        finally { setIsProcessing(false); }
                    });
                }

                if (savePrintBtn) {
                    savePrintBtn.addEventListener('click', async () => {
                        modalControl.close();
                        try {
                            setIsProcessing(true);
                            const ok = await completeSplitPartialPayment(index, mode);
                            if (ok) await printSplitBill(index, mode);
                        } catch (e) { console.error(e); }
                        finally { setIsProcessing(false); }
           
                    });
                }
            }
        });
    };

    // Helper function to prepare preview order data from cart
    const preparePreviewOrderData = (mode) => {
        // Generate a temporary preview order ID
        const previewOrderId = `PREVIEW-${Date.now()}`;

        // Convert cart items to order format (similar to completeOrder but without saving)
        const items = Object.values(cart).map(cartItem => {
            // Determine effective base price considering unit pricing
            const key = getCartItemKey(cartItem);
            const ppu = Number(cartItem?.product?.unitPricing?.pricePerUnit);
            const enabled = !!(cartItem?.product?.unitPricing?.enabled) && !isNaN(ppu) && ppu > 0;
            const unitsVal = unitAmounts[key];
            const units = typeof unitsVal === 'string' && unitsVal.trim() === '' ? NaN : Number(unitsVal);
            let basePrice = getEffectiveBasePriceForItem(cartItem);
            const addonsData = (cartItem.addons && cartItem.addons.length > 0)
                ? cartItem.addons.map(addon => ({ id: addon.id, name: addon.name, price: addon.price }))
                : [];
            const addonsTotal = (cartItem.addons && cartItem.addons.length > 0)
                ? cartItem.addons.reduce((sum, addon) => sum + addon.price, 0)
                : 0;

            let title = cartItem.product.title;
            if (cartItem.variant && cartItem.variant.name) {
                title = `${cartItem.product.title} (${cartItem.variant.name})`;
            }

            const itemData = {
                pid: cartItem.product.id,
                title: title,
                displayTitle: title,
                originalTitle: cartItem.product.title,
                thumb: cartItem.product.imgs?.[0] || null,
                cat: cartItem.product.cat || "Other",
                mrp: cartItem.product.mrp || cartItem.product.price,
                price: basePrice + addonsTotal,
                basePrice: basePrice,
                veg: cartItem.product.veg || false,
                served: false,
                qnt: cartItem.quantity,
                variantId: cartItem.variant?.id || null,
                variantName: cartItem.variant?.name || null,
                addons: addonsData,
                addonsTotal: addonsTotal,
                unitPricing: cartItem.product?.unitPricing ? { ...cartItem.product.unitPricing } : undefined
            };

            const amountOverride = Number(unitBaseAmounts[key]);
            if (!isNaN(amountOverride) && amountOverride > 0 && !isNaN(ppu) && ppu > 0) {
                itemData.unitQuantity = amountOverride / ppu;
            } else if (enabled && !isNaN(units) && units > 0) {
                itemData.unitQuantity = units;
            }

            return itemData;
        });

        // Create preview order data structure
        const previewOrderData = {
            id: previewOrderId,
            items: items,
            discount: discount,
            priceVariant: priceVariant,
            tableId: tableId,
            instructions: instructions.trim(),
            // Build charges for preview from product charge definitions (consolidated)
            // This ensures ChargesCalculator receives percentage/fixed/inclusive metadata
            // instead of attempting to reuse already-calculated charge entries.
            charges: (() => {
                try {
                    const productCharges = [];
                    let commonBulkTaxHashtag = null;
                    let allProductsHaveSameHashtag = true;
                    let firstProduct = true;

                    Object.values(cart).forEach(item => {
                        if (item && item.product) {
                            if (item.product.taxUpdateInfo && item.product.taxUpdateInfo.isFromBulkUpdate) {
                                const productHashtag = item.product.taxUpdateInfo.hashtag;
                                if (firstProduct) {
                                    commonBulkTaxHashtag = productHashtag;
                                    firstProduct = false;
                                } else if (commonBulkTaxHashtag !== productHashtag) {
                                    allProductsHaveSameHashtag = false;
                                }
                            } else {
                                allProductsHaveSameHashtag = false;
                            }

                            if (item.product.charges && item.product.charges.length > 0) {
                                productCharges.push(...item.product.charges);
                            }
                        }
                    });

                    // Consolidate by name+type
                    const consolidated = [];
                    productCharges.forEach(ch => {
                        if (!ch || !ch.name) return;
                        const existing = consolidated.find(c => c.name === ch.name && c.type === ch.type);
                        if (existing) {
                            if (ch.type !== 'percentage') {
                                existing.value = (parseFloat(existing.value || 0) + parseFloat(ch.value || 0)).toString();
                            }
                            if (!ch.inclusive) existing.inclusive = false;
                        } else {
                            consolidated.push({ ...ch });
                        }
                    });

                    if (allProductsHaveSameHashtag && commonBulkTaxHashtag) {
                        consolidated.forEach(c => { c.bulkTaxHashtag = commonBulkTaxHashtag; });
                    }

                    // Normalize into expected shape and filter out zero-value charges
                    const normalized = consolidated.map(ch => {
                        const rawValue = ch.value != null ? ch.value : 0;
                        const rawStr = String(rawValue || '').trim();
                        const isPercent = (ch.type === 'percentage') || rawStr.includes('%');
                        // Ensure value is stored consistently (number for fixed, string/number for percentage)
                        const value = isPercent ? rawStr : (parseFloat(rawStr) || 0);

                        return {
                            name: ch.name || '',
                            value: value,
                            type: isPercent ? 'percentage' : 'fixed',
                            inclusive: Boolean(ch.inclusive),
                            bulkTaxHashtag: ch.bulkTaxHashtag || null
                        };
                    })
                        // Remove charges that resolve to numeric zero (e.g., 0 or '0%') to avoid printing 0.00 lines
                        .filter(c => {
                            try {
                                if (c.type === 'percentage') {
                                    const num = parseFloat(String(c.value).replace('%', '').trim()) || 0;
                                    return !(num === 0);
                                } else {
                                    const num = parseFloat(c.value) || 0;
                                    return !(num === 0);
                                }
                            } catch (e) {
                                return true;
                            }
                        });

                    return normalized;
                } catch (e) {
                    console.warn('preparePreviewOrderData: failed to build consolidated charges', e);
                    return [];
                }
            })(),
            payMode: mode,
            customer: customer ? {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                email: customer.email
            } : null,
            timestamp: new Date().toISOString(),
            status: "PREVIEW",
            splitData: splitData,
            isPreview: true // Flag to indicate this is a preview
        };

        // Compute calculated charges and final amount for preview so print templates get full breakdown
        try {
            const totalItemsAmount = previewOrderData.items.reduce((s, it) => s + (Number(it.price || 0) * (Number(it.qnt || 0) || 1)), 0);
            const chargeCalc = (ChargesCalculator && typeof ChargesCalculator.calculateCharges === 'function')
                ? ChargesCalculator.calculateCharges(totalItemsAmount, previewOrderData.charges || [], Number(previewOrderData.discount || 0))
                : { calculatedCharges: previewOrderData.charges || [], finalAmount: Math.max(0, totalItemsAmount - Number(previewOrderData.discount || 0)) };

            previewOrderData.calculatedCharges = Array.isArray(chargeCalc.calculatedCharges) ? chargeCalc.calculatedCharges : (previewOrderData.calculatedCharges || []);
            previewOrderData.finalAmount = Number(chargeCalc.finalAmount || 0);

            // Best-effort total tax: sum tax-like entries from calculatedCharges, fallback to difference
            let previewTotalTax = (previewOrderData.calculatedCharges || []).reduce((sum, c) => {
                try {
                    const name = (c.displayName || c.name || '').toString().toLowerCase();
                    const amt = Number(c.calculatedAmount || c.amount || 0) || 0;
                    if (name.includes('tax') || name.includes('gst') || name.includes('vat') || name.includes('cgst') || name.includes('sgst')) return sum + amt;
                } catch (e) { }
                return sum;
            }, 0);
            if (!previewTotalTax || previewTotalTax === 0) {
                const base = Number(totalItemsAmount || 0) - Number(previewOrderData.discount || 0);
                const inferred = Number(previewOrderData.finalAmount || 0) - base;
                if (!isNaN(inferred) && inferred > 0) previewTotalTax = inferred;
            }
            previewOrderData.totalTaxAmount = Number(previewTotalTax || 0);
            // Diagnostic: log preview order tax/charges snapshot to help debug missing CGST/SGST
            try {
                console.debug('[preparePreviewOrderData][DIAG] previewOrderData.charges:', JSON.parse(JSON.stringify(previewOrderData.charges || [])));
                console.debug('[preparePreviewOrderData][DIAG] previewOrderData.calculatedCharges:', JSON.parse(JSON.stringify(previewOrderData.calculatedCharges || [])));
                console.debug('[preparePreviewOrderData][DIAG] previewOrderData.totalTaxAmount:', previewOrderData.totalTaxAmount);
            } catch (e) {
                console.warn('[preparePreviewOrderData][DIAG] failed to log preview order snapshot', e);
            }
        } catch (e) { /* ignore preview charge calc failures */ }

        // Include loyalty redemption metadata so preview shows points used and discount amount
        try {
            const pts = Number(recentRedeem?.points || 0) || 0;
            const amt = Number(recentRedeem?.amount || 0) || 0;

            // Calculate total of items to determine remaining amount after discounts and loyalty
            const totalItemsAmount = previewOrderData.items.reduce((s, it) => s + (Number(it.price || 0) * (Number(it.qnt || 0) || 1)), 0);
            const appliedDiscount = Number(previewOrderData.discount || 0) || 0;
            const remaining = totalItemsAmount - (appliedDiscount + amt);

            // If this preview follows a partial redeem (points applied but remaining > 0), mark as UNSETTLED
            if (pts > 0 && remaining > 0) {
                previewOrderData.payMode = 'UNSETTLED';
            }

            // Attach loyalty metadata so PrintTemplate shows points used and discount amount
            previewOrderData.loyaltyPointsUsed = pts > 0 ? pts : (previewOrderData.loyaltyPointsUsed || 0);
            previewOrderData.loyaltyDiscountAmount = amt > 0 ? amt : (previewOrderData.loyaltyDiscountAmount || 0);
        } catch (e) {
            // ignore
        }

        return previewOrderData;
    };

    // Helper function to complete the order
    const completeOrder = async (mode, shouldPrint = false) => {
        // Initialize billPrintedSuccessfully in this scope
        let billPrintedSuccessfully = false;
        // If we trigger an immediate print using in-memory orderData, mark it so background job can skip printing
        let printedNow = false;

        console.log('[CheckoutSheet] completeOrder called with:', {
            mode: mode,
            checkout: checkout,
            shouldPrint: shouldPrint,
            paymentModeState: paymentMode
        });

        // Use the paymentMode state if mode is not provided, default to CASH
        const finalMode = mode || paymentMode || 'CASH';
        console.log('[CheckoutSheet] Using final payment mode:', finalMode, {
            originalMode: mode,
            paymentModeState: paymentMode,
            shouldComplete: finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED'
        });

        // Ensure orderId exists or create a new one
        const targetOrderId = orderId || sdk.db.collection("Orders").doc().id;
        const orderRef = sdk.db.collection("Orders").doc(targetOrderId);

        // Convert cart items to Order items format
        const items = Object.values(cart).map(cartItem => {
            let finalItemData;
            try {
                // Attempt to use the SDK's Item.fromProduct
                const sdkItem = Item.fromProduct(cartItem.product, cartItem.quantity);
                finalItemData = sdkItem.data || {}; // Use .data if it exists, otherwise an empty object

                // Regardless of what Item.fromProduct does, explicitly set/override price and details
                // Note: By this point, if product has a variant, its price has already been applied to the product's price/mrp
                let effectivePrice = getEffectiveBasePriceForItem(cartItem);
                finalItemData.variantId = cartItem.variant?.id || null;
                finalItemData.variantName = cartItem.variant?.name || null;
                // Store original variant price for reference
                finalItemData.variantPrice = cartItem.variant?.price || null;

                // Update the item title to include the variant name if present
                if (cartItem.variant && cartItem.variant.name) {
                    finalItemData.title = `${cartItem.product.title} (${cartItem.variant.name})`;
                    finalItemData.displayTitle = finalItemData.title;
                    finalItemData.originalTitle = cartItem.product.title;
                }

                let addonsTotal = 0;
                if (cartItem.addons && cartItem.addons.length > 0) {
                    finalItemData.addons = cartItem.addons.map(addon => ({ id: addon.id, name: addon.name, price: addon.price }));
                    addonsTotal = cartItem.addons.reduce((sum, addon) => sum + addon.price, 0);
                    finalItemData.addonsTotal = addonsTotal;
                } else {
                    finalItemData.addons = [];
                    finalItemData.addonsTotal = 0;
                }

                // Crucial: Set the final price here, AFTER Item.fromProduct and AFTER calculating addons
                finalItemData.price = effectivePrice + addonsTotal;
                finalItemData.basePrice = effectivePrice; // Store the base price separately
                // Attach unitQuantity if provided
                const key = getCartItemKey(cartItem);
                const ppu = Number(cartItem?.product?.unitPricing?.pricePerUnit);
                const enabled = !!(cartItem?.product?.unitPricing?.enabled) && !isNaN(ppu) && ppu > 0;
                // amountOverride is the base-amount override entered for this cart line (Amount mode)
                const amountOverride = Number(unitBaseAmounts[key]);
                const unitsVal = unitAmounts[key];
                const units = typeof unitsVal === 'string' && unitsVal.trim() === '' ? NaN : Number(unitsVal);
                if (!isNaN(amountOverride) && amountOverride > 0 && !isNaN(ppu) && ppu > 0) {
                    finalItemData.unitQuantity = amountOverride / ppu;
                } else if (enabled && !isNaN(units) && units > 0) {
                    finalItemData.unitQuantity = units;
                }
                // Preserve original MRP and other necessary fields that Item.fromProduct might have set
                finalItemData.pid = finalItemData.pid || cartItem.product.id;
                finalItemData.thumb = finalItemData.thumb || cartItem.product.imgs?.[0] || null;
                finalItemData.cat = finalItemData.cat || cartItem.product.cat || "Other";
                finalItemData.mrp = finalItemData.mrp || cartItem.product.mrp || cartItem.product.price;
                finalItemData.veg = finalItemData.veg !== undefined ? finalItemData.veg : cartItem.product.veg || false;
                finalItemData.served = finalItemData.served !== undefined ? finalItemData.served : false;
                finalItemData.qnt = finalItemData.qnt || cartItem.quantity;
                // Attach unit pricing info if available on product
                if (cartItem.product?.unitPricing) {
                    finalItemData.unitPricing = { ...cartItem.product.unitPricing };
                }

                // Return an object that MOrder.fromItems expects (if it expects objects with a .data property)
                // Or, if MOrder.fromItems expects the data directly, this structure might need adjustment
                // For now, assuming Item.fromProduct returns an object that can be structured like { data: ... }
                return { data: finalItemData }; // This structure matches the fallback

            } catch (err) {
                console.error("Error or issue with Item.fromProduct, using manual fallback (in handleCheckout):", err);
                // Fallback: Manually construct the item data
                // Determine base price considering unit pricing
                let basePrice = getEffectiveBasePriceForItem(cartItem);
                const addonsData = (cartItem.addons && cartItem.addons.length > 0)
                    ? cartItem.addons.map(addon => ({ id: addon.id, name: addon.name, price: addon.price }))
                    : [];
                const addonsTotal = (cartItem.addons && cartItem.addons.length > 0)
                    ? cartItem.addons.reduce((sum, addon) => sum + addon.price, 0)
                    : 0;

                let title = cartItem.product.title;
                // Update the item title to include the variant name if present
                if (cartItem.variant && cartItem.variant.name) {
                    title = `${cartItem.product.title} (${cartItem.variant.name})`;
                }

                finalItemData = {
                    pid: cartItem.product.id,
                    title: title,
                    displayTitle: title,
                    originalTitle: cartItem.product.title,
                    thumb: cartItem.product.imgs?.[0] || null,
                    cat: cartItem.product.cat || "Other",
                    mrp: cartItem.product.mrp || cartItem.product.price,
                    price: basePrice + addonsTotal, // Final price calculation
                    basePrice: basePrice, // Store the base price separately
                    veg: cartItem.product.veg || false,
                    served: false,
                    qnt: cartItem.quantity,
                    variantId: cartItem.variant?.id || null,
                    variantName: cartItem.variant?.name || null,
                    addons: addonsData,
                    addonsTotal: addonsTotal,
                    unitPricing: cartItem.product?.unitPricing ? { ...cartItem.product.unitPricing } : undefined
                };

                // Attach unitQuantity if provided
                const key = getCartItemKey(cartItem);
                const ppu = Number(cartItem?.product?.unitPricing?.pricePerUnit);
                const enabled = !!(cartItem?.product?.unitPricing?.enabled) && !isNaN(ppu) && ppu > 0;
                // amountOverride is the base-amount override entered for this cart line (Amount mode)
                const amountOverride = Number(unitBaseAmounts[key]);
                const unitsVal = unitAmounts[key];
                const units = typeof unitsVal === 'string' && unitsVal.trim() === '' ? NaN : Number(unitsVal);
                if (!isNaN(amountOverride) && amountOverride > 0 && !isNaN(ppu) && ppu > 0) {
                    finalItemData.unitQuantity = amountOverride / ppu;
                } else if (enabled && !isNaN(units) && units > 0) {
                    finalItemData.unitQuantity = units;
                }

                // Add tax update info if present
                if (cartItem.product.taxUpdateInfo) {
                    finalItemData.taxUpdateInfo = cartItem.product.taxUpdateInfo;
                }

                return { data: finalItemData }; // Consistent return structure
            }
        });

        // Validate and sanitize charges format coming from calculatedCharges
        const validCharges = (function () {
            try {
                const mapped = (calculatedCharges || []).map(ch => (ch && typeof ch.toJson === 'function') ? ch.toJson() : (ch || {}));

                const sanitized = mapped.map(orig => {
                    const c = Object.assign({}, orig || {});
                    try {
                        // Recover missing value from calculatedAmount or amount if necessary
                        if (c.value === undefined || c.value === null) {
                            if (c.calculatedAmount !== undefined && c.calculatedAmount !== null) {
                                c.value = String(Number(c.calculatedAmount || 0));
                                c.type = c.type || 'fixed';
                            } else if (c.amount !== undefined && c.amount !== null) {
                                c.value = String(Number(c.amount || 0));
                                c.type = c.type || 'fixed';
                            }
                        }

                        // Normalize percentage representation
                        if (c.type === 'percentage' && typeof c.value === 'number') {
                            c.value = String(c.value) + '%';
                        }

                        c.inclusive = Boolean(c.inclusive);
                    } catch (e) {
                        // non-fatal; leave as-is
                    }
                    return c;
                });

                // Filter out zero-value charges similar to previous logic
                const finalList = sanitized.filter(c => {
                    try {
                        if (c.calculatedAmount !== undefined && Number(c.calculatedAmount) === 0) return false;
                        if (c.value != null && String(c.value).includes('%')) {
                            const pct = parseFloat(String(c.value).replace('%', '').trim()) || 0;
                            return pct !== 0;
                        }
                        if (c.value != null && !String(c.value).includes('%')) {
                            const num = parseFloat(c.value) || 0;
                            return num !== 0;
                        }
                        return true;
                    } catch (e) { return true; }
                });

                try { console.debug('[completeOrder][DIAG] validCharges (sanitized) before MOrder.fromItems:', JSON.parse(JSON.stringify(finalList || []))); } catch (e) { }
                return finalList;
            } catch (e) {
                try { console.warn('[completeOrder] failed to build validCharges, falling back', e); } catch (_) { }
                return (calculatedCharges || []).map(ch => (ch && typeof ch.toJson === 'function') ? ch.toJson() : ch);
            }
        })();

        // Create or update the order data
        let orderData;

        try {
            // For existing orders, fetch the existing bill number
            let existingBillNo = null;
            if (orderId && sdk && sdk.db && typeof sdk.db.collection === 'function') {
                try {
                    const orderRef = sdk.db.collection('Orders').doc(orderId);
                    const snap = await orderRef.get();
                    const data = snap && snap.exists ? snap.data() : null;
                    existingBillNo = (data && data.billNo) ? data.billNo : null;
                } catch (e) {
                    console.warn('Could not fetch existing bill number:', e);
                }
            }

            // Try using MOrder.fromItems first
            const order = MOrder.fromItems(
                targetOrderId,
                items,
                discount,
                priceVariant,
                tableId,
                instructions.trim(),
                validCharges,
                false, // isStoreClosing
                existingBillNo // existingBillNo
            );
            orderData = order.data;

            // Add payment mode
            orderData.payMode = finalMode;

            // Add customer details if a customer is selected
            if (customer) {
                orderData.custId = customer.id;
                orderData.customer = { id: customer.id, name: customer.name || '', phone: customer.phone || '' };
                // Keep legacy denormalized fields for compatibility
                orderData.custName = customer.name;
                orderData.custPhone = customer.phone;
            } else if (mode !== 'CREDIT') {
                // For non-credit transactions without customer, use guest details
                orderData.custId = 'guest';
                orderData.customer = { id: 'guest', name: 'Walk-in Customer', phone: '' };
                orderData.custName = 'Walk-in Customer';
                orderData.custPhone = '';
            }

            // Add split bill information if enabled
            if (splitData) {
                orderData.splitBill = {
                    enabled: true,
                    type: splitData.type,
                    numberOfPeople: splitData.numberOfPeople,
                    totalAmount: splitData.totalAmount,
                    ...(splitData.type === 'equal' ?
                        { amountPerPerson: splitData.amountPerPerson } :
                        { customSplits: splitData.customSplits }
                    )
                };
                console.log('CheckoutSheet - Adding split bill to order:', orderData.splitBill);
            }

            // If this is a split bill, do NOT auto-mark the order as paid/settled here.
            const isSplitFlow = !!(splitData || (orderData.splitBill && orderData.splitBill.enabled));
            // For CREDIT payment mode, mark as unpaid
            if (finalMode === 'CREDIT') {
                orderData.paid = false;
                orderData.settled = false;
                orderData.settledAmount = 0;
                orderData.partialPayments = [];
            } else if (finalMode === 'UNSETTLED') {
                orderData.paid = false;
                orderData.settled = false;
                orderData.settledAmount = 0;
                orderData.partialPayments = [];
            } else if (isSplitFlow) {
                // Keep as pending split - don't mark completed just because a single save occurred
                orderData.paid = false;
                orderData.settled = false;
                orderData.settledAmount = 0;
                orderData.partialPayments = orderData.partialPayments || [];
                orderData.status = orderData.status || [];
                orderData.currentStatus = orderData.currentStatus || { label: 'SPLIT_PENDING', date: new Date() };
            } else {
                // If loyalty discount exists, subtract it from final/settled amounts so persisted order reflects reduced grand total
                const loyaltyDisc = Number(orderData.loyaltyDiscountAmount || recentRedeem?.amount || 0) || 0;
                const baseFinal = Number(orderData.finalAmount || orderData.total || cartTotal) || 0;
                orderData.finalAmount = Math.max(0, baseFinal - loyaltyDisc);
                orderData.paid = true;
                orderData.settled = true;
                orderData.settledAmount = Number(orderData.finalAmount || 0);

                // If a recent redeem was applied in this UI (before order creation), include it on the order data
                if (recentRedeem && Number(recentRedeem.points || 0) > 0) {
                    orderData.loyaltyPointsUsed = Number(orderData.loyaltyPointsUsed || 0) + Number(recentRedeem.points || 0);
                    orderData.loyaltyDiscountAmount = Number(orderData.loyaltyDiscountAmount || 0) + Number(recentRedeem.amount || 0);
                }
            }
        } catch (err) {
            console.error("Error creating MOrder:", err);

            // Fallback for direct data creation
            const now = new Date();
            const seller = UserSession?.seller;

            // For existing orders, try to fetch the existing bill number
            let billNo = null;
            if (orderId && sdk && sdk.db && typeof sdk.db.collection === 'function') {
                try {
                    const orderRef = sdk.db.collection('Orders').doc(orderId);
                    const snap = await orderRef.get();
                    const data = snap && snap.exists ? snap.data() : null;
                    billNo = (data && data.billNo) ? data.billNo : null;
                } catch (e) {
                    console.warn('Could not fetch existing bill number in fallback:', e);
                }
            }

            // If we still don't have a bill number, generate a new one
            if (!billNo) {
                billNo = seller?.getBillNo ? seller.getBillNo() : Math.floor(Math.random() * 1000000);
            }

            orderData = {
                id: targetOrderId,
                billNo: billNo,
                items: items.map(item => item.data || item),
                sellerId: seller?.id,
                priceVariant: priceVariant,
                tableId: tableId,
                discount: discount,
                paid: finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED', // Set paid to false for CREDIT and UNSETTLED modes
                settled: finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED', // Set settled to false for CREDIT and UNSETTLED modes
                // If loyalty discount exists, subtract it from the settledAmount so persisted order reflects reduced grand total
                settledAmount: (function () {
                    const loyaltyDisc = Number(recentRedeem?.amount || 0) || 0;
                    if (finalMode === 'UNSETTLED') return 0;
                    if (finalMode === 'CREDIT') return 0;
                    return Math.max(0, Number(cartTotal || 0) - loyaltyDisc);
                })(),
                partialPayments: finalMode === 'UNSETTLED' ? [] : undefined,
                status: checkout && (finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED') ? [
                    {
                        label: "PLACED",
                        date: now
                    },
                    {
                        label: "KITCHEN",
                        date: now
                    },
                    {
                        label: "COMPLETED",
                        date: now
                    }
                ] : [
                    {
                        label: "PLACED",
                        date: now
                    },
                    {
                        label: "KITCHEN",
                        date: now
                    }
                ],
                currentStatus: {
                    label: checkout && (finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED') ? "COMPLETED" : "KITCHEN",
                    date: now
                },
                charges: (function () {
                    try {
                        const mapped = validCharges.map(c => (typeof c.toJson === 'function' ? c.toJson() : c));
                        // Sanitize each charge: ensure `value` exists (fallback to calculatedAmount/amount), normalize type and inclusive
                        const sanitized = mapped.map(orig => {
                            const c = Object.assign({}, orig || {});
                            try {
                                // If value is missing, attempt to recover from calculatedAmount or amount
                                if (c.value === undefined || c.value === null) {
                                    if (c.calculatedAmount !== undefined && c.calculatedAmount !== null) {
                                        c.value = String(Number(c.calculatedAmount || 0));
                                        c.type = c.type || 'fixed';
                                    } else if (c.amount !== undefined && c.amount !== null) {
                                        c.value = String(Number(c.amount || 0));
                                        c.type = c.type || 'fixed';
                                    }
                                }

                                // Normalize percentage representation
                                if (c.type === 'percentage' && typeof c.value === 'number') {
                                    c.value = String(c.value) + '%';
                                }

                                // Ensure inclusive is boolean
                                c.inclusive = Boolean(c.inclusive);
                            } catch (e) {
                                // non-fatal: leave as-is
                            }
                            return c;
                        });

                        // Filter out explicit zeros similar to original logic
                        const finalList = sanitized.filter(c => {
                            try {
                                // If there's an explicit calculatedAmount and it's zero, drop it
                                if (c.calculatedAmount !== undefined && Number(c.calculatedAmount) === 0) return false;
                                // If value contains a percent, drop if percent==0
                                if (c.value != null && String(c.value).includes('%')) {
                                    const pct = parseFloat(String(c.value).replace('%', '').trim()) || 0;
                                    return pct !== 0;
                                }
                                // For numeric/fixed values, drop if zero
                                if (c.value != null && !String(c.value).includes('%')) {
                                    const num = parseFloat(c.value) || 0;
                                    return num !== 0;
                                }
                                // Keep if we cannot determine
                                return true;
                            } catch (e) { return true; }
                        });

                        try { console.debug('[completeOrder][DIAG] Persisting sanitized charges (fallback):', JSON.parse(JSON.stringify(finalList || []))); } catch (e) { }
                        return finalList;
                    } catch (e) {
                        try { console.warn('[completeOrder] failed to sanitize charges before persist', e); } catch (_) { }
                        return (validCharges.map(c => (typeof c.toJson === 'function' ? c.toJson() : c)));
                    }
                })(),
                payMode: finalMode,
                instructions: instructions.trim(),
                date: now
            };

            // If a recent redeem was applied in this UI session, persist it onto the new order
            // so downstream completion logic and appendCustomerPayment can detect the loyalty usage
            // and avoid awarding points for the redeemed portion.
            try {
                const recentPts = Number(recentRedeem?.points || 0) || 0;
                const recentAmt = Number(recentRedeem?.amount || 0) || 0;
                if (recentPts > 0) {
                    orderData.loyaltyPointsUsed = recentPts;
                    orderData.loyaltyDiscountAmount = recentAmt;
                }
            } catch (e) {
                // non-fatal
            }

            // Add customer details if a customer is selected
            if (customer) {
                orderData.custId = customer.id;
                orderData.customer = { id: customer.id, name: customer.name || '', phone: customer.phone || '' };
                orderData.custName = customer.name;
                orderData.custPhone = customer.phone;
            } else if (mode !== 'CREDIT') {
                orderData.custId = 'guest';
                orderData.customer = { id: 'guest', name: 'Walk-in Customer', phone: '' };
                orderData.custName = 'Walk-in Customer';
                orderData.custPhone = '';
            }

            // Compute and attach calculatedCharges/finalAmount/totalTaxAmount so persisted order contains full breakdown
            try {
                const itemsTotal = (orderData.items || []).reduce((s, it) => s + (Number(it.price || 0) * (Number(it.qnt || it.quantity || 1) || 1)), 0);
                const chargeCalc = (ChargesCalculator && typeof ChargesCalculator.calculateCharges === 'function')
                    ? ChargesCalculator.calculateCharges(itemsTotal, orderData.charges || [], Number(orderData.discount || 0))
                    : { calculatedCharges: orderData.charges || [], finalAmount: Math.max(0, itemsTotal - Number(orderData.discount || 0)) };

                orderData.calculatedCharges = Array.isArray(chargeCalc.calculatedCharges) ? chargeCalc.calculatedCharges : (orderData.calculatedCharges || []);
                orderData.finalAmount = Number(chargeCalc.finalAmount || 0);

                // Compute total tax amount from calculated charges (best-effort)
                let oTotalTax = (orderData.calculatedCharges || []).reduce((sum, c) => {
                    try {
                        const name = (c.displayName || c.name || '').toString().toLowerCase();
                        const amt = Number(c.calculatedAmount || c.amount || 0) || 0;
                        if (name.includes('tax') || name.includes('gst') || name.includes('vat') || name.includes('cgst') || name.includes('sgst')) return sum + amt;
                    } catch (e) { }
                    return sum;
                }, 0);
                if (!oTotalTax || oTotalTax === 0) {
                    const baseNoTax = Number(itemsTotal || 0) - Number(orderData.discount || 0);
                    const inferred = Number(orderData.finalAmount || 0) - baseNoTax;
                    if (!isNaN(inferred) && inferred > 0) oTotalTax = inferred;
                }
                orderData.totalTaxAmount = Number(oTotalTax || 0);
            } catch (e) { /* non-fatal */ }

            // Add split bill information if enabled (fallback)
            if (splitData) {
                orderData.splitBill = {
                    enabled: true,
                    type: splitData.type,
                    numberOfPeople: splitData.numberOfPeople,
                    totalAmount: splitData.totalAmount,
                    ...(splitData.type === 'equal' ?
                        { amountPerPerson: splitData.amountPerPerson } :
                        { customSplits: splitData.customSplits }
                    )
                };
                console.log('CheckoutSheet - Adding split bill to order (fallback):', orderData.splitBill);
            }
        }

        if (!orderId) {
            // Create new order
            // Calculate payableAmount (single source of truth)
            const subTotalForPayable = (orderData.items || []).reduce((s, it) => s + (Number(it.price || 0) * (Number(it.qnt || it.quantity || 1) || 1)), 0);
            const taxTotalForPayable = Number(orderData.totalTaxAmount || 0);
            const discountForPayable = Number(orderData.discount || 0);
            const payableAmount = Math.max(0, subTotalForPayable + taxTotalForPayable - discountForPayable);
            orderData.payableAmount = payableAmount;

            console.log('[CHECKOUT] payableAmount (New Order)', { subTotal: subTotalForPayable, taxTotal: taxTotalForPayable, discount: discountForPayable, payableAmount });

            await orderRef.set(orderData);

            // Deduct inventory for on-demand products after order is saved
            try {
                console.log('[CheckoutSheet] Starting inventory deduction for new order cart:', cart);
                await deductInventoryForOrder(cart);
                console.log('[CheckoutSheet] Inventory deduction completed successfully for new order');
            } catch (inventoryError) {
                console.error('[CheckoutSheet] Error deducting inventory for new order:', inventoryError);
                // Don't block the order completion for inventory errors, but log and notify
                const errorMessage = inventoryError.message || 'Unknown inventory error';
                showToast(`Order completed but inventory deduction failed: ${errorMessage}`, 'warning');
            }

            // Process loyalty deduction immediately upon order completion (not in background)
            try {
                const shouldCompleteOrder = (finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED');
                const pts = Number(orderData && orderData.loyaltyPointsUsed) || Number(recentRedeem?.points || 0) || 0;
                const cid = (customer && customer.id) || orderData.custId || null;

                // Only process loyalty if redemption was confirmed
                if (shouldCompleteOrder && pts > 0 && cid && recentRedeem?.isConfirmed) {
                    try {
                        // Mark the redemption as confirmed in UI
                        try { setRecentRedeem(prev => ({ ...(prev || {}), isConfirmed: true })); } catch (e) { }

                        // Actually deduct the points from the customer's account
                        const newPts = await awardPointsToCustomer(cid, -Math.abs(pts), { orderId: targetOrderId, type: 'redeem', note: 'Redeem applied on order completion', staffId: UserSession?.profile?.id || null });

                        // Update local UI immediately
                        try {
                            if (newPts != null && typeof setCustomer === 'function') {
                                setCustomer(prev => ({ ...(prev || {}), loyaltyPoints: Number(newPts) }));
                                try { setLoyaltyData(prev => ({ ...(prev || {}), available: Number(newPts) })); } catch (e) { }
                            }
                        } catch (e) { }

                        // Also update the customer document immediately
                        try {
                            if (sdk && sdk.db) {
                                await sdk.db.collection('Customers').doc(cid).update({
                                    loyaltyPoints: Number(newPts)
                                });
                            }
                        } catch (updateErr) {
                            console.warn('[completeOrder] failed to update customer document', updateErr);
                        }
                    } catch (awardErr) {
                        console.error('[completeOrder] failed to award points to customer', awardErr);
                    }
                }

                // Handle loyalty points earning (when no redemption occurs)
                if (shouldCompleteOrder && cid && (!pts || pts === 0)) {
                    try {
                        // Calculate points to be earned for this transaction
                        const amount = Number(orderData.finalAmount || 0);
                        if (amount > 0) {
                            const earnedPts = await calculatePointsForAmount(amount);
                            if (earnedPts > 0) {
                                // Award the earned points to the customer
                                const newPts = await awardPointsToCustomer(cid, Math.abs(earnedPts), {
                                    orderId: targetOrderId,
                                    type: 'earn',
                                    note: 'Points earned on order completion',
                                    staffId: UserSession?.profile?.id || null
                                });

                                // Update local UI immediately
                                try {
                                    if (newPts != null && typeof setCustomer === 'function') {
                                        setCustomer(prev => ({ ...(prev || {}), loyaltyPoints: Number(newPts) }));
                                        try { setLoyaltyData(prev => ({ ...(prev || {}), available: Number(newPts) })); } catch (e) { }
                                    }
                                } catch (e) { }
                            }
                        }
                    } catch (earnErr) {
                        console.error('[completeOrder] failed to earn points for customer', earnErr);
                    }
                }
            } catch (e) {
                console.warn('[completeOrder] loyalty processing error', e);
            }
        } else {
            // Update existing order
            // FIX: Use a manual approach instead of arrayUnion which might be undefined
            const existingDoc = await orderRef.get();
            const existingData = existingDoc.exists ? existingDoc.data() : {};

            // Initialize update data object
            let updateData = {};

            if (checkout) {
                // If checkout mode, set paid flag based on payment mode
                updateData = {
                    paid: finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED',
                    settled: finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED',
                    payMode: finalMode
                };

                // Handle settlement amounts based on payment mode
                if (finalMode === 'UNSETTLED') {
                    updateData.settledAmount = 0;
                    updateData.partialPayments = [];
                } else if (finalMode !== 'CREDIT') {
                    // Subtract any recent loyalty discount so settledAmount reflects reduced grand total
                    const loyaltyDiscForUpdate = Number(existingData.loyaltyDiscountAmount || 0) || Number(recentRedeem?.amount || 0) || 0;
                    updateData.settledAmount = Math.max(0, Number(cartTotal || 0) - loyaltyDiscForUpdate);
                }

                // Add customer details if a customer is selected
                if (customer) {
                    updateData.custId = customer.id;
                    updateData.customer = { id: customer.id, name: customer.name || '', phone: customer.phone || '' };
                    updateData.custName = customer.name;
                    updateData.custPhone = customer.phone;
                } else if (mode !== 'CREDIT') {
                    updateData.custId = 'guest';
                    updateData.customer = { id: 'guest', name: 'Walk-in Customer', phone: '' };
                    updateData.custName = 'Walk-in Customer';
                    updateData.custPhone = '';
                }

                // Add bulk tax update information if present
                if (orderData.taxUpdateInfo) {
                    updateData.taxUpdateInfo = orderData.taxUpdateInfo;
                }

                // Add appropriate status based on payment mode
                const now = new Date();
                const existingStatus = existingData.status || [];

                // For paid modes (cash/UPI/digital), mark as completed immediately
                // Only CREDIT and UNSETTLED should remain incomplete
                const shouldCompleteOrder = finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED';

                if (shouldCompleteOrder) {
                    const hasCompletedStatus = existingStatus.some(s => s.label === 'COMPLETED');

                    if (!hasCompletedStatus) {
                        const completedStatus = {
                            label: 'COMPLETED',
                            date: now
                        };

                        updateData.status = [...existingStatus, completedStatus];
                        updateData.currentStatus = completedStatus;
                        console.log('[CheckoutSheet] Setting order status to COMPLETED for payment mode:', finalMode);
                    }
                } else {
                    // For credit/unsettled, add PLACED status if needed
                    const hasQrOrderStatus = existingStatus.some(s => s.label === OrderStatus.PLACED);

                    if (!hasQrOrderStatus) {
                        const newStatus = {
                            label: OrderStatus.PLACED,
                            date: now
                        };

                        updateData.status = [...existingStatus, newStatus];
                        updateData.currentStatus = newStatus;
                        console.log('[CheckoutSheet] Setting order status to PLACED for payment mode:', finalMode);
                    }
                }

                // Only add discount if it's set
                if (discount > 0) {
                    updateData.discount = (existingData.discount || 0) + discount;
                }
            } else {
                // If not in checkout mode, add items to the existing order
                updateData = {
                    // Manually merge items arrays rather than using arrayUnion
                    items: [
                        ...(existingData.items || []),
                        ...items.map(e => e.data || e)
                    ],
                    discount: (existingData.discount || 0) + discount
                };

                // Add customer details if a customer is selected
                if (customer) {
                    updateData.custId = customer.id;
                    updateData.customer = { id: customer.id, name: customer.name || '', phone: customer.phone || '' };
                    updateData.custName = customer.name;
                    updateData.custPhone = customer.phone;
                } else if (mode !== 'CREDIT') {
                    updateData.custId = 'guest';
                    updateData.customer = { id: 'guest', name: 'Walk-in Customer', phone: '' };
                    updateData.custName = 'Walk-in Customer';
                    updateData.custPhone = '';
                }
            }

            // Add instructions if specified
            if (instructions.trim()) {
                updateData.instructions = instructions.trim();
            }

            // If a recent redeem exists in this UI session, include it in the order update so
            // printed bills and passbook show redeemed points even when redeem was applied before completion.
            try {
                const pts = Number(recentRedeem?.points || 0) || 0;
                const amt = Number(recentRedeem?.amount || 0) || 0;
                if (pts > 0 || amt > 0) {
                    // Avoid double-counting: if the order document already contains loyalty values
                    // (for example applyRedeemToOrder persisted them earlier), prefer the larger
                    // / already-persisted values instead of blindly adding recentRedeem again.
                    const existingPts = Number(existingData.loyaltyPointsUsed || 0) || 0;
                    const existingAmt = Number(existingData.loyaltyDiscountAmount || 0) || 0;

                    // Set to the max of (existing, desired) so we don't duplicate points
                    const desiredPts = Math.max(existingPts, pts);
                    const desiredAmt = Math.max(existingAmt, amt);

                    updateData.loyaltyPointsUsed = desiredPts;
                    updateData.loyaltyDiscountAmount = desiredAmt;

                    // Also mirror into in-memory orderData so later logic (appendCustomerPayment) sees the values
                    try {
                        orderData = orderData || {};
                        orderData.loyaltyPointsUsed = desiredPts;
                        orderData.loyaltyDiscountAmount = desiredAmt;
                    } catch (e) { /* non-fatal */ }
                }
            } catch (e) {
                // Non-fatal
                console.warn('Failed to attach recentRedeem to order update', e);
            }

            // If items/discount/charges changed in this update, attach recalculated charges and totals
            // But preserve existing data when converting to UNSETTLED mode
            try {
                // For UNSETTLED mode, preserve existing items and charges exactly as they are
                if (finalMode === 'UNSETTLED') {
                    // Preserve existing items exactly as they are
                    if (existingData.items && Array.isArray(existingData.items)) {
                        updateData.items = existingData.items.map(item => ({ ...item }));
                    }
                    
                    // Preserve existing charges exactly as they are
                    if (existingData.charges && Array.isArray(existingData.charges)) {
                        updateData.charges = existingData.charges.map(charge => ({ ...charge }));
                    }
                    
                    // Preserve existing calculated charges exactly as they are
                    if (existingData.calculatedCharges && Array.isArray(existingData.calculatedCharges)) {
                        updateData.calculatedCharges = existingData.calculatedCharges.map(charge => ({ ...charge }));
                    }
                    
                    // Preserve existing totals
                    updateData.finalAmount = existingData.finalAmount || updateData.finalAmount;
                    updateData.totalTaxAmount = existingData.totalTaxAmount || updateData.totalTaxAmount;
                }
                
                // Compute items total from incoming updateData.items if present, otherwise fall back to existingData
                const itemsForCalc = (updateData.items && Array.isArray(updateData.items)) ? updateData.items : (existingData.items || []);
                const itemsTotal = (itemsForCalc || []).reduce((s, it) => s + (Number(it.price || it.basePrice || 0) * (Number(it.qnt || it.quantity || it.qty || 1) || 1)), 0);
                const discountForCalc = Number(updateData.discount != null ? updateData.discount : (existingData.discount || 0)) || 0;

                const chargeCalc = (ChargesCalculator && typeof ChargesCalculator.calculateCharges === 'function')
                    ? ChargesCalculator.calculateCharges(itemsTotal, updateData.charges || existingData.charges || [], discountForCalc)
                    : { calculatedCharges: updateData.charges || existingData.charges || [], finalAmount: Math.max(0, itemsTotal - discountForCalc) };

                updateData.calculatedCharges = Array.isArray(chargeCalc.calculatedCharges) ? chargeCalc.calculatedCharges : (existingData.calculatedCharges || []);
                updateData.finalAmount = Number(chargeCalc.finalAmount || 0);

                // Compute totalTax from calculatedCharges
                let updTax = (updateData.calculatedCharges || []).reduce((sum, c) => {
                    try {
                        const name = (c.displayName || c.name || '').toString().toLowerCase();
                        const amt = Number(c.calculatedAmount || c.amount || 0) || 0;
                        if (name.includes('tax') || name.includes('gst') || name.includes('vat') || name.includes('cgst') || name.includes('sgst')) return sum + amt;
                    } catch (e) { }
                    return sum;
                }, 0);
                if (!updTax || updTax === 0) {
                    const baseNoTax = Number(itemsTotal || 0) - discountForCalc;
                    const inferred = Number(updateData.finalAmount || existingData.finalAmount || 0) - baseNoTax;
                    if (!isNaN(inferred) && inferred > 0) updTax = inferred;
                }
                updateData.totalTaxAmount = Number(updTax || 0);
            } catch (e) { /* ignore calc failures for updates */ }

            // Sanitize updateData to plain JSON for Firestore: convert any objects with toJson()
            try {
                // Ensure any charges present on updateData have defined value/type/inclusive
                const normalizeCharge = (orig) => {
                    const c = Object.assign({}, orig || {});
                    try {
                        if (c.value === undefined || c.value === null) {
                            if (c.calculatedAmount !== undefined && c.calculatedAmount !== null) {
                                c.value = String(Number(c.calculatedAmount || 0));
                                c.type = c.type || 'fixed';
                            } else if (c.amount !== undefined && c.amount !== null) {
                                c.value = String(Number(c.amount || 0));
                                c.type = c.type || 'fixed';
                            }
                        }
                        if (c.type === 'percentage' && typeof c.value === 'number') {
                            c.value = String(c.value) + '%';
                        }
                        c.inclusive = Boolean(c.inclusive);
                    } catch (e) { }
                    return c;
                };

                if (updateData.charges && Array.isArray(updateData.charges)) {
                    updateData.charges = updateData.charges.map(c => normalizeCharge((typeof c.toJson === 'function') ? c.toJson() : c));
                    try { console.debug('[completeOrder][DIAG] normalized updateData.charges before sanitize:', JSON.parse(JSON.stringify(updateData.charges || []))); } catch (e) { }
                }
                if (updateData.calculatedCharges && Array.isArray(updateData.calculatedCharges)) {
                    updateData.calculatedCharges = updateData.calculatedCharges.map(c => normalizeCharge((typeof c.toJson === 'function') ? c.toJson() : c));
                }
                const sanitize = (val) => {
                    if (val == null) return val;
                    if (Array.isArray(val)) return val.map(sanitize);
                    if (typeof val === 'object') {
                        // If has toJson method, use it
                        if (typeof val.toJson === 'function') {
                            try { return val.toJson(); } catch (e) { /* fallthrough */ }
                        }
                        // Copy plain object, sanitizing nested values
                        const out = {};
                        for (const k of Object.keys(val)) {
                            try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                        }
                        return out;
                    }
                    // primitive
                    return val;
                };

                if (updateData.charges && Array.isArray(updateData.charges)) {
                    updateData.charges = updateData.charges.map(c => sanitize(c));
                }
                if (updateData.calculatedCharges && Array.isArray(updateData.calculatedCharges)) {
                    updateData.calculatedCharges = updateData.calculatedCharges.map(c => sanitize(c));
                }
                if (updateData.items && Array.isArray(updateData.items)) {
                    updateData.items = updateData.items.map(it => sanitize(it));
                }
                if (updateData.status && Array.isArray(updateData.status)) {
                    updateData.status = updateData.status.map(s => sanitize(s));
                }
            } catch (sanErr) {
                console.warn('[CheckoutSheet] sanitize updateData failed', sanErr);
            }

            // Calculate payableAmount (single source of truth) for update
            // User Rule: calculated ONLY from final items being checked out (cart -> items)
            // items variable is available from top of function
            const finalItemsForUpdate = items.map(i => i.data || i);
            const subTotalUpdate = finalItemsForUpdate.reduce((s, it) => s + (Number(it.price || 0) * (Number(it.qnt || it.quantity || 1) || 1)), 0);
            
            // Use updated tax/discount if available, else fallback to existing
            const taxTotalUpdate = Number(updateData.totalTaxAmount !== undefined ? updateData.totalTaxAmount : (existingData.totalTaxAmount || 0));
            const discountUpdate = Number(updateData.discount !== undefined ? updateData.discount : (existingData.discount || 0));
            
            const payableAmountUpdate = Math.max(0, subTotalUpdate + taxTotalUpdate - discountUpdate);
            updateData.payableAmount = payableAmountUpdate;

            console.log('[CHECKOUT] payableAmount (Update Order)', { subTotal: subTotalUpdate, taxTotal: taxTotalUpdate, discount: discountUpdate, payableAmount: payableAmountUpdate });

            await orderRef.update(sanitizeForFirestore(updateData));
        }

        // Deduct inventory for on-demand products after order is saved
        try {
            console.log('[CheckoutSheet] Starting inventory deduction for cart:', cart);
            // Debug: Log detailed cart contents
            Object.keys(cart).forEach(key => {
                const item = cart[key];
                console.log(`[CheckoutSheet] Cart item ${key}:`, item);
                console.log(`[CheckoutSheet] Product data:`, item.product);
                console.log(`[CheckoutSheet] Recipe items:`, item.product.recipeItems);
            });
            await deductInventoryForOrder(cart);
            console.log('[CheckoutSheet] Inventory deduction completed successfully');
        } catch (inventoryError) {
            console.error('[CheckoutSheet] Error deducting inventory:', inventoryError);
            // Don't block the order completion for inventory errors, but log and notify
            const errorMessage = inventoryError.message || 'Unknown inventory error';
            showToast(`Order completed but inventory deduction failed: ${errorMessage}`, 'warning');
            // Attach splitBill if applicable so updates preserve the split configuration
            try {
                if (splitData) {
                    updateData.splitBill = {
                        enabled: true,
                        type: splitData.type,
                        numberOfPeople: splitData.numberOfPeople,
                        totalAmount: splitData.totalAmount,
                        ...(splitData.type === 'equal' ? { amountPerPerson: splitData.amountPerPerson } : { customSplits: splitData.customSplits })
                    };
                }
            } catch (e) { console.warn('Failed to attach splitData to updateData:', e); }

            await orderRef.update(updateData);
        }

        // Show success message for order completion
        if (checkout) {
            console.log('[CheckoutSheet] Order completed successfully:', {
                orderId: targetOrderId,
                mode: finalMode,
                paid: finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED',
                status: (finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED') ? 'COMPLETED' : 'PLACED',
                shouldCompleteOrder: finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED'
            });

            // Dispatch event to notify other components (Dashboard, Passbook)
            const orderCompletedEvent = new CustomEvent('orderCompleted', {
                detail: {
                    orderId: targetOrderId,
                    mode: finalMode,
                    paid: finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED',
                    status: (finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED') ? 'COMPLETED' : 'PLACED'
                }
            });
            window.dispatchEvent(orderCompletedEvent);
            console.log('[CheckoutSheet] Dispatched orderCompleted event for order:', targetOrderId);

            if (finalMode === 'CREDIT') {
                showToast("Credit order completed!", "success");
            } else if (finalMode === 'UNSETTLED') {
                showToast("Unsettled bill created!", "success");
            } else {
                showToast("Order completed!", "success");
            }

            // If we have a linked customer (not a guest), append a payment summary to their Customer document
            try {
                if (customer && customer.id && checkout) {
                    // Build a lightweight payment entry
                    // Determine the canonical amount for the payment entry.
                    // Prefer settledAmount if present, then finalAmount, then cartTotal.
                    const canonicalSettled = Number(orderData && orderData.settledAmount != null ? orderData.settledAmount : (orderData && orderData.finalAmount != null ? orderData.finalAmount : cartTotal)) || 0;
                    const paymentEntry = {
                        orderId: targetOrderId,
                        amount: canonicalSettled,
                        payMode: finalMode,
                        isNewOrder: true,
                        date: new Date(),
                        // Propagate loyalty metadata so appendCustomerPayment can correctly exclude redeemed amount
                        loyaltyDiscountAmount: Number(orderData && orderData.loyaltyDiscountAmount) || Number(recentRedeem?.amount || 0) || 0,
                        loyaltyPointsUsed: Number(orderData && orderData.loyaltyPointsUsed) || Number(recentRedeem?.points || 0) || 0,
                        // Mark as settled/paid for award logic (avoid awarding for pending COD/UNSETTLED)
                        settled: Boolean(finalMode !== 'CREDIT' && finalMode !== 'UNSETTLED') || Boolean(orderData && orderData.settled)
                    };
                    appendCustomerPayment(customer.id, paymentEntry).catch(e => console.warn('appendCustomerPayment failed', e));
                }
            } catch (e) {
                console.warn('[CheckoutSheet] Failed to append customer payment', e);
            }

            // Handle printing if requested — try to show print preview immediately using in-memory orderData,
            // then run persistence/loyalty tasks in background so checkout doesn't block.
            if (shouldPrint && BluetoothPrinting) {
                // Attempt immediate, non-blocking print preview using in-memory orderData so the preview pops up fast.
                try {
                    // Schedule on next tick so UI can update before print dialog shows
                    setTimeout(() => {
                        try {
                            // call printPreviewBill with in-memory orderData; do not await here to avoid blocking
                            if (typeof BluetoothPrinting.printPreviewBill === 'function') {
                                BluetoothPrinting.printPreviewBill(orderData, finalMode, autoPrint).catch ? BluetoothPrinting.printPreviewBill(orderData, finalMode, autoPrint).catch(e => console.warn('[CheckoutSheet] immediate printPreviewBill failed', e)) : null;
                            } else if (typeof BluetoothPrinting.printBill === 'function') {
                                BluetoothPrinting.printBill(targetOrderId, finalMode, autoPrint).catch ? BluetoothPrinting.printBill(targetOrderId, finalMode, autoPrint).catch(e => console.warn('[CheckoutSheet] immediate printBill failed', e)) : null;
                            }
                        } catch (e) { console.warn('[CheckoutSheet] immediate print call error', e); }
                    }, 0);
                    printedNow = true;
                } catch (e) { console.warn('[CheckoutSheet] failed to start immediate print preview', e); }

                // Kick off background job as before to ensure persistence and loyalty deduction; it will skip printing if printedNow

                try {
                    // Kick off a background job to ensure persistence, deduct deferred redeems and print.
                    const backgroundPrintJob = async () => {
                        try {
                            // Ensure the order document has loyalty metadata before printing so the receipt shows redeemed points
                            try {
                                const snap = await orderRef.get();
                                const existing = snap && snap.exists ? (snap.data() || {}) : {};
                                const existingPts = Number(existing.loyaltyPointsUsed || 0) || 0;
                                const existingDisc = Number(existing.loyaltyDiscountAmount || 0) || 0;

                                const desiredPts = Number(orderData && orderData.loyaltyPointsUsed) || Number(recentRedeem?.points || 0) || 0;
                                const desiredDisc = Number(orderData && orderData.loyaltyDiscountAmount) || Number(recentRedeem?.amount || 0) || 0;

                                const toUpdate = {};
                                if (desiredPts > 0 && existingPts === 0) toUpdate.loyaltyPointsUsed = desiredPts;
                                if (desiredDisc > 0 && existingDisc === 0) toUpdate.loyaltyDiscountAmount = desiredDisc;

                                if (Object.keys(toUpdate).length > 0) {
                                    try {
                                        await orderRef.update(sanitizeForFirestore(toUpdate));
                                        orderData = orderData || {};
                                        if (toUpdate.loyaltyPointsUsed) orderData.loyaltyPointsUsed = toUpdate.loyaltyPointsUsed;
                                        if (toUpdate.loyaltyDiscountAmount) orderData.loyaltyDiscountAmount = toUpdate.loyaltyDiscountAmount;
                                    } catch (updErr) {
                                        console.warn('[CheckoutSheet] Failed to attach loyalty metadata before print (background)', updErr);
                                    }
                                }
                            } catch (ensureErr) {
                                console.warn('[CheckoutSheet] ensure loyalty metadata before print failed (background)', ensureErr);
                            }

                            // Small polling helper (same as before) but run in background with reduced timeout
                            const ensurePersistenceBeforePrint = async ({ orderRef, orderId, desiredPts = 0, desiredDisc = 0, desiredTaxRequired = false, desiredTaxAmount = 0, timeoutMs = 1500, intervalMs = 300 } = {}) => {
                                try {
                                    const deadline = Date.now() + (timeoutMs || 1500);
                                    while (Date.now() < deadline) {
                                        try {
                                            const snap = await orderRef.get();
                                            const data = snap && snap.exists ? (snap.data() || {}) : {};
                                            const havePts = Number(data.loyaltyPointsUsed || 0) || 0;
                                            const haveDisc = Number(data.loyaltyDiscountAmount || 0) || 0;

                                            const haveCalculatedCharges = Array.isArray(data.calculatedCharges) && data.calculatedCharges.length > 0;
                                            const haveTotalTax = Number(data.totalTaxAmount || data.totalTax || data.taxAmount || 0) > 0;

                                            const taxOk = !desiredTaxRequired || haveCalculatedCharges || haveTotalTax || (Number(desiredTaxAmount || 0) === 0);

                                            if ((desiredPts === 0 || havePts >= desiredPts) && (desiredDisc === 0 || haveDisc >= desiredDisc) && taxOk) {
                                                return true;
                                            }

                                            if (orderId) {
                                                try {
                                                    const histQ = await sdk.db.collection('LoyaltyHistory').where('orderId', '==', orderId).limit(1).get();
                                                    if (histQ && !histQ.empty) return true;
                                                } catch (histErr) { }
                                            }
                                        } catch (innerErr) { }
                                        await new Promise(r => setTimeout(r, intervalMs));
                                    }
                                } catch (err) {
                                    console.warn('[CheckoutSheet] ensurePersistenceBeforePrint encountered an error (background)', err);
                                }
                                return false;
                            };

                            try {
                                const desiredTaxAmount = Number(orderData && (orderData.totalTaxAmount || orderData.totalTax || orderData.taxAmount)) || 0;
                                const needTax = desiredTaxAmount > 0 || (Array.isArray(orderData && orderData.calculatedCharges) && orderData.calculatedCharges.length > 0);
                                try {
                                    const snapBefore = await orderRef.get();
                                    const existing = snapBefore && snapBefore.exists ? (snapBefore.data() || {}) : {};
                                    const existingHasCharges = Array.isArray(existing.calculatedCharges) && existing.calculatedCharges.length > 0;
                                    const existingTotalTax = Number(existing.totalTaxAmount || existing.totalTax || existing.taxAmount) || 0;
                                    const needsPersist = (needTax && (!existingHasCharges && !(existingTotalTax > 0)));
                                    if (needsPersist) {
                                        try {
                                            const toPersist = {
                                                calculatedCharges: Array.isArray(orderData.calculatedCharges) ? orderData.calculatedCharges : (orderData.charges || []),
                                                totalTaxAmount: Number(orderData.totalTaxAmount || orderData.totalTax || orderData.taxAmount) || 0
                                            };
                                            if ((Array.isArray(toPersist.calculatedCharges) && toPersist.calculatedCharges.length > 0) || (toPersist.totalTaxAmount && toPersist.totalTaxAmount > 0)) {
                                                await orderRef.update(sanitizeForFirestore(toPersist));
                                                orderData = orderData || {};
                                                if (toPersist.calculatedCharges && toPersist.calculatedCharges.length > 0) orderData.calculatedCharges = toPersist.calculatedCharges;
                                                if (toPersist.totalTaxAmount && toPersist.totalTaxAmount > 0) orderData.totalTaxAmount = toPersist.totalTaxAmount;
                                            }
                                        } catch (persistErr) { console.warn('[CheckoutSheet] failed to persist tax fields before print (background)', persistErr); }
                                    }
                                } catch (snapErr) { /* ignore */ }

                                await ensurePersistenceBeforePrint({ orderRef, orderId: targetOrderId, desiredPts: Number(orderData && orderData.loyaltyPointsUsed) || Number(recentRedeem?.points || 0) || 0, desiredDisc: Number(orderData && orderData.loyaltyDiscountAmount) || Number(recentRedeem?.amount || 0) || 0, desiredTaxRequired: needTax, desiredTaxAmount: desiredTaxAmount, timeoutMs: 1500, intervalMs: 250 });
                            } catch (pollErr) { console.warn('[CheckoutSheet] Poll before print failed (background)', pollErr); }

                            // ensure deferred redeem is deducted but do not block UI
                            const ensureRedeemDeducted = async ({ orderId, customerId, pts, note } = {}) => {
                                try {
                                    if (!customerId || !orderId) return false;
                                    try {
                                        const existingSnap = await sdk.db.collection('LoyaltyHistory').where('orderId', '==', orderId).limit(10).get();
                                        if (existingSnap && existingSnap.docs && existingSnap.docs.length > 0) {
                                            const hasNeg = existingSnap.docs.some(d => { const pts = (d.data && d.data().points) || (d._data && d._data.points) || 0; return Number(pts) < 0; });
                                            if (hasNeg) return true;
                                        }
                                    } catch (e) { }

                                    // try linking unlinked entries or award
                                    try {
                                        const histSnap = await sdk.db.collection('LoyaltyHistory').where('customerId', '==', customerId).orderBy('createdAt', 'desc').limit(20).get();
                                        if (histSnap && histSnap.docs && histSnap.docs.length > 0) {
                                            const candidate = histSnap.docs.map(d => ({ id: d.id, ...(d.data ? d.data() : d._data || {}) })).find(dd => {
                                                if (!dd) return false; if (dd.orderId) return false; const matchPts = Math.abs(Number(dd.points || 0)) === Math.abs(Number(pts || 0)); if (!matchPts) return false; const createdAt = dd.createdAt ? new Date(dd.createdAt) : new Date(); const ageMs = Date.now() - createdAt.getTime(); return ageMs < (10 * 60 * 1000);
                                            });
                                            if (candidate && candidate.id) {
                                                try { await sdk.db.collection('LoyaltyHistory').doc(candidate.id).update({ orderId }); return true; } catch (linkErr) { /* fallthrough */ }
                                            }
                                        }
                                    } catch (e) { /* ignore */ }

                                    try {
                                        const res = await awardPointsToCustomer(customerId, -Math.abs(pts || 0), { orderId, type: 'redeem', note: note || 'Redeem applied on order completion' });
                                        return res != null;
                                    } catch (e) { return false; }
                                } catch (e) { return false; }
                            };

                            try {
                                const deductPts = Number(orderData && orderData.loyaltyPointsUsed) || Number(recentRedeem?.points || 0) || 0;
                                const deductCustomerId = (orderData && orderData.custId) || (customer && customer.id) || (recentRedeem && recentRedeem.customerId) || null;
                                if (deductPts > 0 && deductCustomerId) {
                                    await ensureRedeemDeducted({ orderId: targetOrderId, customerId: deductCustomerId, pts: deductPts });
                                }
                            } catch (e) { console.warn('[completeOrder] failed to ensure deferred redeem deduction (background)', e); }

                            // Printing using in-memory orderData (compute taxes fallback if necessary) and attempt to print
                            try {
                                // Ensure loyalty fields exist on in-memory orderData
                                orderData = orderData || {};
                                const fallbackPts = Number(recentRedeem?.points || 0) || 0;
                                const fallbackAmt = Number(recentRedeem?.amount || 0) || 0;
                                orderData.loyaltyPointsUsed = Number(orderData.loyaltyPointsUsed || fallbackPts) || 0;
                                orderData.loyaltyDiscountAmount = Number(orderData.loyaltyDiscountAmount || fallbackAmt) || 0;

                                // Persist numeric loyalty discount on order if missing
                                try {
                                    const ptsNum = Number(orderData && orderData.loyaltyPointsUsed) || Number(recentRedeem && recentRedeem.points) || 0;
                                    const currAmt = Number(orderData && (orderData.loyaltyDiscountAmount || orderData.loyaltyDiscount) || 0) || 0;
                                    if (ptsNum > 0 && (!currAmt || currAmt === 0) && targetOrderId) {
                                        try { await orderRef.update(sanitizeForFirestore({ loyaltyPointsUsed: ptsNum, loyaltyDiscountAmount: Number(ptsNum) })); orderData.loyaltyPointsUsed = ptsNum; orderData.loyaltyDiscountAmount = Number(ptsNum); } catch (persistErr) { /* ignore */ }
                                    }
                                } catch (e) { }

                                // compute taxes if missing (same as before)
                                const missingCharges = !(Array.isArray(orderData && orderData.calculatedCharges) && orderData.calculatedCharges.length > 0);
                                const missingTotalTax = !(Number(orderData && (orderData.totalTaxAmount || orderData.totalTax || orderData.taxAmount)) > 0);
                                if (missingCharges || missingTotalTax) {
                                    try {
                                        const itemsForCalc = Array.isArray(orderData && orderData.items) ? orderData.items : [];
                                        const itemsTotal = (itemsForCalc || []).reduce((s, it) => s + (Number(it.price || it.basePrice || 0) * (Number(it.qnt || it.quantity || 1) || 1)), 0);
                                        const discountForCalc = Number(orderData && orderData.discount || 0) || 0;
                                        const chargeCalc = (ChargesCalculator && typeof ChargesCalculator.calculateCharges === 'function')
                                            ? ChargesCalculator.calculateCharges(itemsTotal, orderData.charges || [], discountForCalc)
                                            : { calculatedCharges: orderData.charges || [], finalAmount: Math.max(0, itemsTotal - discountForCalc) };
                                        orderData.calculatedCharges = Array.isArray(chargeCalc.calculatedCharges) ? chargeCalc.calculatedCharges : (orderData.calculatedCharges || []);
                                        orderData.finalAmount = Number(chargeCalc.finalAmount || 0);
                                        let computedTax = (orderData.calculatedCharges || []).reduce((sum, c) => { try { const name = (c.displayName || c.name || '').toString().toLowerCase(); const amt = Number(c.calculatedAmount || c.amount || c.value || 0) || 0; if (name.includes('tax') || name.includes('gst') || name.includes('vat') || name.includes('cgst') || name.includes('sgst')) return sum + amt; } catch (e) { } return sum; }, 0);
                                        if ((!computedTax || computedTax === 0) && !isNaN(orderData.finalAmount)) {
                                            const baseNoTax = Number(itemsTotal || 0) - discountForCalc;
                                            const inferred = Number(orderData.finalAmount || 0) - baseNoTax;
                                            if (!isNaN(inferred) && inferred > 0) computedTax = inferred;
                                        }
                                        orderData.totalTaxAmount = Number(computedTax || 0);
                                    } catch (e) { /* ignore */ }
                                }

                                // Only attempt printing here if we didn't already start an immediate print
                                if (!printedNow) {
                                    if (BluetoothPrinting && typeof BluetoothPrinting.printPreviewBill === 'function') {
                                        await BluetoothPrinting.printPreviewBill(orderData, finalMode, autoPrint);
                                    } else {
                                        await BluetoothPrinting.printBill(targetOrderId, finalMode, autoPrint);
                                    }
                                } else {
                                    console.debug('[CheckoutSheet] skipping background print because immediate print was started');
                                }
                            } catch (printErr) {
                                try { console.warn('[CheckoutSheet] background print failed, falling back to printBill', printErr); await BluetoothPrinting.printBill(targetOrderId, finalMode, autoPrint); } catch (finalErr) { console.error('Background print ultimately failed', finalErr); }
                            }
                        } catch (err) {
                            console.error('[CheckoutSheet] background print job failed', err);
                        }
                    };

                    // Start background print job but do not await it — give UI immediate control back
                    setTimeout(() => { backgroundPrintJob().catch(e => console.error('backgroundPrintJob error', e)); }, 50);
                    try { showToast('Order completed — printing started in background', 'success'); } catch (e) { }
                } catch (printError) {
                    console.error('Failed to start background printing job', printError);
                    showToast('Order completed, but printing failed to start', 'error');
                }
            }

            // Ask the user if they'd like to enable auto-print
            // but only ask if this preference isn't set yet, printing is available, and bill was printed successfully
            if (shouldPrint && billPrintedSuccessfully && localStorage.getItem('autoPrintPreference') === null && BluetoothPrinting) {
                setTimeout(() => {
                    if (ModalManager && typeof ModalManager.createDialog === 'function') {
                        ModalManager.createDialog({
                            title: "Enable Auto Print?",
                            content: `
                                    <div class="mb-4">
                                        <p class="mb-2">Would you like to enable automatic printing without dialog prompts for future bills?</p>
                                        <p class="text-xs text-gray-500">This will attempt to print directly to your default printer.</p>
                                    </div>
                                `,
                            actions: [
                                {
                                    label: "No, ask each time",
                                    action: () => toggleAutoPrint(false)
                                },
                                {
                                    label: "Yes, enable auto print",
                                    primary: true,
                                    action: () => toggleAutoPrint(true)
                                }
                            ]
                        });
                    }
                }, 1000);
            }
        } else {
            try {
                // Persist the used bill number so the canonical counter advances exactly once
                if (orderData && orderData.billNo) {
                    localStorage.setItem('BILL_NO', String(orderData.billNo));
                    console.log('[CheckoutSheet] Persisted BILL_NO:', orderData.billNo);
                }
            } catch (e) {
                console.warn('[CheckoutSheet] Failed to persist BILL_NO to localStorage', e);
            }
            showToast("Order placed successfully!", "success");
        }

        // Clear cart and close
        clearCallback && clearCallback();
        // Clear recent redeem after order completion so it doesn't affect future orders
        try { setRecentRedeem({ points: 0, amount: 0 }); } catch (e) { /* ignore */ }

        // Force a page refresh to show updated data in passbook and dashboard
        if (checkout) {
            console.log('[CheckoutSheet] Checkout completed, refreshing page data...');
            // Dispatch a custom event to notify other components
            window.dispatchEvent(new CustomEvent('orderCompleted', {
                detail: { orderId: targetOrderId, mode: finalMode }
            }));
        }

        onClose && onClose();

        return true;
    };

    // Handle discount application
    const applyDiscount = (amount) => {
        // If no amount is provided, use the current discountInput value
        if (amount === undefined) {
            amount = percentMode
                ? ((parseFloat(discountInput) || 0) * cartSubTotal / 100)
                : Math.min(parseFloat(discountInput) || 0, cartSubTotal);
        }

        if (isNaN(amount) || amount < 0) {
            if (ModalManager && typeof ModalManager.showToast === 'function') {
                ModalManager.showToast("Please enter a valid discount amount", { type: "error" });
            } else {
                showToast("Please enter a valid discount amount", "error");
            }
            return;
        }

        if (amount > cartSubTotal) {
            if (ModalManager && typeof ModalManager.showToast === 'function') {
                ModalManager.showToast("Discount cannot be greater than subtotal", { type: "error" });
            } else {
                showToast("Discount cannot be greater than subtotal", "error");
            }
            setDiscount(0);
        } else {
            setDiscount(amount);
            if (ModalManager && typeof ModalManager.showToast === 'function') {
                ModalManager.showToast(`Discount of ${UserSession?.getCurrency()}${amount.toFixed(2)} applied`, { type: "success" });
            } else {
                showToast(`Discount of ${UserSession?.getCurrency()}${amount.toFixed(2)} applied`, "success");
            }
        }
        setShowDiscountModal(false);
    };

    // Open discount modal
    const openDiscountModal = () => {
        if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
            // Seed discount input with current applied discount if available and not set
            // Note: If percentMode is true, we can't easily reverse engineer the percentage from amount
            // without knowing the subtotal at the time of application, so we only seed if we have a direct match or let user re-enter.
            // For now, simpler approach: Don't clear it blindly.
            if (!discountInput && discount > 0 && !percentMode) {
                setDiscountInput(discount.toString());
            }

            const currentInputVal = parseFloat(discountInput || (discount > 0 && !percentMode ? discount : 0)) || 0;
            const initialDiscount = percentMode
                ? (currentInputVal * cartSubTotal / 100)
                : Math.min(currentInputVal, cartSubTotal);

            const discountModalContent = `
                <div>
                    <!-- Toggle between percentage and fixed amount -->
                    <div class="flex items-center justify-between bg-gray-100 rounded-lg p-1 mb-4">
                        <button id="fixed-amount-btn" class="flex-1 py-2 rounded-md text-center ${!percentMode ? 'bg-white shadow-sm font-medium' : ''}">
                            Fixed Amount
                        </button>
                        <button id="percent-mode-btn" class="flex-1 py-2 rounded-md text-center ${percentMode ? 'bg-white shadow-sm font-medium' : ''}">
                            Percentage (%)
                        </button>
                    </div>

                    <!-- Input field -->
                    <div class="mb-5">
                        <label class="block text-sm text-gray-600 mb-2">
                            ${percentMode ? 'Discount Percentage' : 'Discount Amount'}
                        </label>
                        <div class="flex items-center border rounded-lg overflow-hidden shadow-sm">
                            <span class="px-3 py-2 bg-gray-100 text-gray-500">
                                ${percentMode ? '%' : UserSession?.getCurrency()}
                            </span>
                            <input
                                type="number"
                                id="discount-input"
                                value="${discountInput}"
                                placeholder="0"
                                class="flex-1 px-3 py-2 outline-none"
                            />
                        </div>
                        <p class="text-xs text-gray-500 mt-2">
                            ${percentMode
                    ? 'Enter percentage between 1-100'
                    : `Maximum discount: ${UserSession?.getCurrency()}${cartSubTotal}`}
                        </p>
                    </div>

                    <!-- Summary -->
                    <div class="bg-gray-50 rounded-lg p-4 mb-5">
                        <div className="flex justify-between mb-1">
                            <span className="text-gray-600">Subtotal:</span>
                            <span>${UserSession?.getCurrency()}${cartSubTotal}</span>
                        </div>
                        <div className="flex justify-between mb-1 text-green-600">
                            <span>Discount:</span>
                            <span id="discount-amount">
                                - ${UserSession?.getCurrency()}${initialDiscount.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex justify-between font-medium text-lg pt-2 border-t">
                            <span>Final Total:</span>
                            <span id="final-total">
                                ${UserSession?.getCurrency()}${(cartSubTotal - initialDiscount).toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>
            `;

            const discountFooter = `
                <div class="flex gap-3">
                    <button id="cancel-discount" class="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg">
                        Cancel
                    </button>
                    <button id="apply-discount" class="flex-1 py-2.5 bg-blue-600 text-white rounded-lg">
                        Apply Discount
                    </button>
                </div>
            `;

            const modal = ModalManager.createCenterModal({
                id: 'discount-modal',
                title: 'Apply Discount',
                content: discountModalContent,
                actions: discountFooter,
                onShown: (modalControl) => {
                    // Add event listeners
                    const fixedAmountBtn = document.getElementById('fixed-amount-btn');
                    const percentModeBtn = document.getElementById('percent-mode-btn');
                    const discountInputEl = document.getElementById('discount-input');
                    const cancelBtn = document.getElementById('cancel-discount');
                    const applyBtn = document.getElementById('apply-discount');

                    // Set up mode toggle
                    if (fixedAmountBtn) {
                        fixedAmountBtn.addEventListener('click', () => {
                            setPercentMode(false);
                            modalControl.close();
                            setTimeout(openDiscountModal, 50);
                        });
                    }

                    if (percentModeBtn) {
                        percentModeBtn.addEventListener('click', () => {
                            setPercentMode(true);
                            modalControl.close();
                            setTimeout(openDiscountModal, 50);
                        });
                    }

                    // Set up input changes
                    if (discountInputEl) {
                        discountInputEl.addEventListener('input', (e) => {
                            const newValue = e.target.value;
                            setDiscountInput(newValue);
                            // UI update handled by useEffect
                        });
                        // Auto focus
                        discountInputEl.focus();
                    }

                    // Set up buttons
                    if (cancelBtn) {
                        cancelBtn.addEventListener('click', () => modalControl.close());
                    }

                 if (applyBtn) {
    applyBtn.addEventListener('click', () => {
        const discountInputEl = document.getElementById('discount-input');
        const inputVal = parseFloat(discountInputEl?.value) || 0;

        const amount = percentMode
            ? (inputVal * cartSubTotal / 100)
            : Math.min(inputVal, cartSubTotal);

        applyDiscount(amount);
        modalControl.close();
    });
}

                }
            });
        } else {
            setShowDiscountModal(true);
        }
    };

    // Open instructions modal
    const openInstructionsModal = () => {
        if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
            const instructionsContent = `
                <div class="mb-5">
                    <textarea
                        id="instructions-textarea"
                        placeholder="Add any special instructions for this order..."
                        class="w-full p-3 border rounded-lg h-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >${instructions}</textarea>
                </div>
            `;

            const instructionsFooter = `
                <div class="flex gap-3">
                    <button id="cancel-instructions" class="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg">
                        Cancel
                    </button>
                    <button id="save-instructions" class="flex-1 py-2.5 bg-blue-600 text-white rounded-lg">
                        Save Instructions
                    </button>
                </div>
            `;

            const modal = ModalManager.createCenterModal({
                id: 'instructions-modal',
                title: 'Order Instructions',
                content: instructionsContent,
                actions: instructionsFooter,
                onShown: (modalControl) => {
                    // Add event listeners
                    const instructionsTextarea = document.getElementById('instructions-textarea');
                    const cancelBtn = document.getElementById('cancel-instructions');
                    const saveBtn = document.getElementById('save-instructions');

                    if (cancelBtn) {
                        cancelBtn.addEventListener('click', () => modalControl.close());
                    }

                    if (saveBtn) {
                        saveBtn.addEventListener('click', () => {
                            if (instructionsTextarea) {
                                setInstructions(instructionsTextarea.value);
                                if (ModalManager.showToast) {
                                    ModalManager.showToast("Instructions saved");
                                }
                            }
                            modalControl.close();
                        });
                    }
                }
            });
        } else {
            setShowInstructionsModal(true);
        }
    };

    // Helper function to generate actual bill content with real data
    const generateActualBillContent = (orderData, seller) => {
        const items = orderData.items || [];
        // Always compute subtotal from items to avoid stale persisted values
        const computedSubtotal = items.reduce((sum, item) => {
            const price = parseFloat(item.price || 0);
            const qty = parseFloat(item.qnt || item.quantity || 1);
            return sum + (price * qty);
        }, 0);
        const subtotal = computedSubtotal;
        const discount = parseFloat(orderData.discount || 0);
        const loyaltyPointsUsed = Number(orderData.loyaltyPointsUsed || orderData.redeemedPoints || 0) || 0;
        const loyaltyDiscountAmount = Number(orderData.loyaltyDiscountAmount || orderData.loyaltyDiscount || 0) || 0;
        // Prefer raw charges; fallback to precomputed charges array if provided by order
        const charges = (orderData.charges && Array.isArray(orderData.charges))
            ? orderData.charges
            : (orderData.calculatedCharges && Array.isArray(orderData.calculatedCharges))
                ? orderData.calculatedCharges
                : [];

        // Compute taxes/charges and final total using ChargesCalculator.
        // Use the same method as checkout:
        // - If the order provides raw charge definitions (values, percentages, types), prefer those.
        // - Otherwise fall back to the component's current `chargesCalculation` (so preview/save-and-print
        //   uses the exact same calculation as the active checkout cart).
        let chargeCalc;
        try {
            const looksLikeRawCharges = Array.isArray(orderData.charges) && orderData.charges.length > 0 && orderData.charges.some(c => (c && (c.value !== undefined || (typeof c.value === 'string' && c.value.includes('%')))));

            if (looksLikeRawCharges && ChargesCalculator && typeof ChargesCalculator.calculateCharges === 'function') {
                chargeCalc = ChargesCalculator.calculateCharges(subtotal, orderData.charges, discount);
            } else if (chargesCalculation && Array.isArray(calculatedCharges) && calculatedCharges.length > 0) {
                // Reuse the component's computed charges (from the current cart) so printing matches checkout
                chargeCalc = {
                    calculatedCharges: calculatedCharges.map(c => ({ ...c, calculatedAmount: Number(c.calculatedAmount || 0) })),
                    finalAmount: Number(finalAmount || 0)
                };
            } else if (ChargesCalculator && typeof ChargesCalculator.calculateCharges === 'function') {
                // Last resort: try to use orderData.charges (even if empty) so ChargesCalculator can compute as best-effort
                chargeCalc = ChargesCalculator.calculateCharges(subtotal, Array.isArray(orderData.charges) ? orderData.charges : [], discount);
            } else {
                chargeCalc = { calculatedCharges: Array.isArray(orderData.calculatedCharges) ? orderData.calculatedCharges : [], finalAmount: Math.max(0, subtotal - discount) };
            }
        } catch (e) {
            console.warn('[generateActualBillContent] charges calculation fallback due to error', e);
            chargeCalc = { calculatedCharges: Array.isArray(orderData.calculatedCharges) ? orderData.calculatedCharges : [], finalAmount: Math.max(0, subtotal - discount) };
        }

        const billNo = orderData.billNo || orderId || 'N/A';
        const customerName = orderData.customerName || orderData.customer?.name || 'Walk-in Customer';
        const customerPhone = orderData.customerPhone || orderData.customer?.phone || '';
        const orderDate = new Date().toLocaleString('en-GB');
        const paymentMode = orderData.paymentMode || orderData.payMode || 'CASH';
        const currency = (typeof UserSession !== 'undefined' && UserSession?.getCurrency) ? UserSession.getCurrency() : '₹';

        console.log("Generating bill content with:", { items, subtotal, discount, charges, chargeCalc });

        let itemsHtml = '';
        if (items && items.length > 0) {
            items.forEach((item) => {
                const qty = parseFloat(item.qnt || item.quantity || 1);
                const price = parseFloat(item.price || 0);
                const itemTotal = (price * qty).toFixed(2);
                itemsHtml += `
                    <div style="display: flex; justify-content: space-between; margin: 8px 0; border-bottom: 1px dotted #ccc; padding-bottom: 4px;">
                        <div style="flex: 1;">
                            <div style="font-weight: bold;">${item.title || 'Unknown Item'}</div>
                            <div style=\"font-size: 10px; color: #666;\">Qty: ${qty} × ${currency}${price.toFixed(2)}</div>
                        </div>
                        <div style="font-weight: bold; text-align: right;">${currency}${itemTotal}</div>
                    </div>
                `;
            });
        } else {
            itemsHtml = '<div style="text-align: center; color: #666; font-style: italic;">No items found</div>';
        }

        // Build charges/taxes section from calculated charges and extract CGST/SGST
        let chargesHtml = '';
        const breakdownList = (chargeCalc.calculatedCharges && chargeCalc.calculatedCharges.length > 0)
            ? chargeCalc.calculatedCharges
            : (Array.isArray(orderData.calculatedCharges) ? orderData.calculatedCharges.map(c => ({
                displayName: c.displayName || c.name || c.label || 'Charge',
                calculatedAmount: typeof c.calculatedAmount === 'number' ? c.calculatedAmount : (typeof c.amount === 'number' ? c.amount : 0),
                name: c.name || c.displayName || c.label || ''
            })) : []);

        // Compute CGST and SGST totals from breakdownList (if present)
        let cgstTotal = 0;
        let sgstTotal = 0;
        if (breakdownList.length > 0) {
            breakdownList.forEach(charge => {
                const lookup = (charge.name || charge.displayName || '').toString().toLowerCase();
                const amt = Number(charge.calculatedAmount || 0) || 0;
                if (lookup.includes('cgst') || lookup.includes('central')) cgstTotal += amt;
                else if (lookup.includes('sgst') || lookup.includes('state')) sgstTotal += amt;

                chargesHtml += `
                    <div style="display: flex; justify-content: space-between; margin: 4px 0;">
                        <span>${charge.displayName}</span>
                        <span>${currency}${(amt).toFixed(2)}</span>
                    </div>
                `;
            });
        }

        // Fallback 1: inspect orderData.charges for any tax-like entries if cgst/sgst not found
        if (cgstTotal === 0 && sgstTotal === 0 && Array.isArray(orderData.charges)) {
            orderData.charges.forEach(c => {
                try {
                    const name = (c.name || c.displayName || c.label || '').toString().toLowerCase();
                    const amt = Number(c.calculatedAmount ?? c.amount ?? c.value ?? 0) || 0;
                    if (name.includes('cgst') || name.includes('central')) cgstTotal += amt;
                    else if (name.includes('sgst') || name.includes('state')) sgstTotal += amt;
                } catch (e) { /* ignore */ }
            });
        }

        // Fallback 2: if still zero, check for order-level tax fields (totalTax, taxAmount) and split equally
        if (cgstTotal === 0 && sgstTotal === 0) {
            const totalTax = Number(orderData.totalTax || orderData.taxAmount || orderData.totalTaxAmount || 0) || 0;
            if (totalTax > 0) {
                cgstTotal = totalTax / 2;
                sgstTotal = totalTax / 2;
            }
        }

        // Fallback 3: if taxBreakdown array exists, attempt to extract CGST/SGST from it
        if (cgstTotal === 0 && sgstTotal === 0 && Array.isArray(orderData.taxBreakdown) && orderData.taxBreakdown.length > 0) {
            orderData.taxBreakdown.forEach(tb => {
                try {
                    const name = (tb.name || tb.label || tb.displayName || '').toString().toLowerCase();
                    const amt = Number(tb.amount ?? tb.value ?? tb.calculatedAmount ?? 0) || 0;
                    if (name.includes('cgst') || name.includes('central')) cgstTotal += amt;
                    else if (name.includes('sgst') || name.includes('state')) sgstTotal += amt;
                    else if ((name.includes('gst') || name.includes('tax')) && (cgstTotal === 0 && sgstTotal === 0)) {
                        cgstTotal += amt / 2;
                        sgstTotal += amt / 2;
                    }
                } catch (e) { /* ignore */ }
            });
        }

        // Ensure final total reflects subtotal - discount + exclusive taxes/charges only
        const finalTotal = (typeof chargeCalc.finalAmount === 'number' && !isNaN(chargeCalc.finalAmount))
            ? chargeCalc.finalAmount
            : Math.max(0, subtotal - discount);

        // Compute grand total after loyalty deduction (loyalty should reduce total-with-tax)
        const loyaltyDiscountNum = Number(loyaltyDiscountAmount || 0) || 0;
        const grandTotalNum = Math.max(0, Number(finalTotal || 0) - loyaltyDiscountNum);

        // Fallback 4: if CGST/SGST still not detected, infer tax as the difference between
        // finalTotal and (subtotal - discount). This handles cases where charges array
        // wasn't persisted but final total already accounts for taxes.
        if ((cgstTotal === 0 && sgstTotal === 0)) {
            try {
                const baseNoTax = Number(subtotal || 0) - Number(discount || 0);
                const combinedTax = Number(finalTotal || 0) - baseNoTax;
                if (!isNaN(combinedTax) && combinedTax > 0.001) {
                    const split = combinedTax / 2;
                    cgstTotal = split;
                    sgstTotal = split;
                }
            } catch (e) {
                // ignore inference errors
            }
        }

        // Business identity
        const businessName = seller?.businessName || seller?.name || 'RESTAURANT';
        const gst = seller?.gstIN || seller?.gst || 'N/A';
        const address = seller?.address || '';
        const phone = seller?.phone || '';
        const logoUrl = seller?.logo || seller?.avatar || seller?.profileImage || '';

        return `
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
                ${logoUrl
                ? `<img src="${logoUrl}" alt="Store Logo" style="width: 80px; height: 80px; object-fit: contain; display: block; margin: 0 auto 6px auto;" />`
                : `<i class=\"ph ph-storefront\" style=\"font-size:42px; display:block; margin:0 auto 6px auto;\"></i>`}
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">${businessName}</div>
                <div style="font-size: 12px;">${address}</div>
                <div style="font-size: 12px;">Phone: ${phone}</div>
                <div style="font-size: 12px;">GST: ${gst}</div>
            </div>
            
            <div style="text-align: center; margin-bottom: 15px;">
                <div style="font-size: 16px; font-weight: bold;">BILL/RECEIPT</div>
                <div style="font-size: 12px;">Bill #: ${billNo}</div>
                <div style="font-size: 12px;">Date: ${orderDate}</div>
                <div style="font-size: 12px;">Customer: ${customerName}</div>
                ${customerPhone ? `<div style="font-size: 12px;">Phone: ${customerPhone}</div>` : ''}
            </div>
            
            <div style="border-bottom: 1px dashed #ccc; margin: 15px 0; padding-bottom: 10px;">
                <div style="font-weight: bold; margin-bottom: 10px; text-align: center;">ORDER ITEMS</div>
                ${itemsHtml}
            </div>
            
            <div style="margin: 15px 0;">
                <div style="display: flex; justify-content: space-between; font-weight: bold;">
                    <span>Sub Total:</span>
                    <span>${currency}${subtotal.toFixed(2)}</span>
                </div>
                <div style="border-top: 1px dashed #ccc; margin: 8px 0;"></div>
                ${discount > 0 && !(loyaltyPointsUsed > 0) ? `
                    <div style="display: flex; justify-content: space-between; color: #d32f2f;">
                        <span>Discount:</span>
                        <span>- ${currency}${discount.toFixed(2)}</span>
                    </div>
                ` : ''}
                ${loyaltyPointsUsed > 0 ? `
                    <div style="display: flex; justify-content: space-between; color: #444; margin-top:6px;">
                        <span>Redeemed Points</span>
                        <span>- ${loyaltyPointsUsed} pts (${currency}${loyaltyDiscountAmount.toFixed(2)})</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; color: #d32f2f; margin-top:4px;">
                        <span>Loyalty Discount:</span>
                        <span>- ${currency}${loyaltyDiscountAmount.toFixed(2)}</span>
                    </div>
                ` : ''}
                ${chargesHtml}
                ${cgstTotal > 0 ? `
                    <div style="display: flex; justify-content: space-between; margin: 4px 0;">
                        <span>CGST:</span>
                        <span>${currency}${cgstTotal.toFixed(2)}</span>
                    </div>
                ` : ''}
                ${sgstTotal > 0 ? `
                    <div style="display: flex; justify-content: space-between; margin: 4px 0;">
                        <span>SGST:</span>
                        <span>${currency}${sgstTotal.toFixed(2)}</span>
                    </div>
                ` : ''}
                <div style="border-top: 1px solid #000; margin-top: 10px; padding-top: 10px;">
                    <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold;">
                        <span>TOTAL (with tax):</span>
                        <span>${currency}${(Number(finalTotal) || 0).toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; margin-top:6px;">
                        <span>Grand Total:</span>
                        <span>${currency}${(Number(grandTotalNum) || 0).toFixed(2)}</span>
                    </div>
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <div style="font-size: 12px;">Payment Mode: ${paymentMode}</div>
                <div style="font-size: 14px; font-weight: bold; margin-top: 10px;">Thank You!</div>
                <div style="font-size: 12px;">Visit Again</div>
            </div>
        `;
    };

    // Generate shareable bill image
    const generateBillImage = async () => {
        if (!orderId) {
            showToast("No order available to share", "error");
            return null;
        }

        setIsGeneratingBill(true);

        try {
            // Get order data - try multiple sources
            let orderData = await BluetoothPrinting?.getOrderData(orderId);
            // Unwrap structure returned by BluetoothPrinting (contains full/filtered)
            if (orderData && orderData.full) {
                orderData = orderData.full;
            }

            // If BluetoothPrinting doesn't have the data, or it lacks charges/calculatedCharges,
            // use the prepared preview order which includes calculated charges, loyalty metadata and other fields.
            if (!orderData || !orderData.items || orderData.items.length === 0 || !orderData.charges || (Array.isArray(orderData.charges) && orderData.charges.length === 0) || !orderData.calculatedCharges) {
                console.log("BluetoothPrinting data incomplete, using preview order data...");
                try {
                    // preparePreviewOrderData will include charges and loyalty metadata
                    orderData = preparePreviewOrderData(paymentMode || 'CASH');
                    // Preserve existing billNo when available, only use orderId as fallback for new orders
                    if (!orderData.billNo || orderData.billNo === 'N/A') {
                        // For existing orders, try to fetch the actual bill number from the database
                        if (orderId && sdk && sdk.db && typeof sdk.db.collection === 'function') {
                            try {
                                const orderRef = sdk.db.collection('Orders').doc(orderId);
                                const snap = await orderRef.get();
                                const data = snap && snap.exists ? snap.data() : null;
                                if (data && data.billNo) {
                                    orderData.billNo = data.billNo;
                                } else {
                                    orderData.billNo = orderId || 'N/A';
                                }
                            } catch (e) {
                                console.warn('Could not fetch billNo from database, using orderId as fallback:', e);
                                orderData.billNo = orderId || 'N/A';
                            }
                        } else {
                            orderData.billNo = orderId || 'N/A';
                        }
                    }
                    orderData.date = new Date();
                    console.log("Generated preview order data:", orderData);
                } catch (e) {
                    console.warn('Failed to generate preview order data, falling back to cart-only data', e);
                }
            }

            console.log("Order data for bill generation:", orderData);

            if (!orderData || !orderData.items || orderData.items.length === 0) {
                showToast("No order items found", "error");
                setIsGeneratingBill(false);
                return null;
            }

            // Get seller information
            const seller = UserSession?.seller || {};

            // Check if we have a custom template
            const hasCustomTemplate = seller.printTemplate &&
                seller.printTemplate.bill &&
                seller.printTemplate.bill.sections &&
                seller.printTemplate.bill.sections.length > 0;

            // Get template data if available
            const templateData = hasCustomTemplate ? seller.printTemplate.bill : null;

            // Generate bill content directly without iframe for faster processing
            console.log("Generating bill content directly...");

            // Create a temporary div to render the bill
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            tempDiv.style.width = '400px';
            tempDiv.style.backgroundColor = '#FFFFFF';
            tempDiv.style.padding = '20px';
            tempDiv.style.fontFamily = 'Arial, sans-serif';
            tempDiv.style.fontSize = '12px';
            tempDiv.style.color = '#000000';
            tempDiv.style.lineHeight = '1.4';

            // Generate the actual bill content with real data
            console.log("Generating bill content with orderData:", orderData);
            const billContent = generateActualBillContent(orderData, seller);
            console.log("Generated bill HTML content length:", billContent.length);

            tempDiv.innerHTML = billContent;

            // Add to DOM temporarily
            document.body.appendChild(tempDiv);

            // Wait a moment for layout
            await new Promise(resolve => setTimeout(resolve, 100));

            // Get the receipt content
            const receiptContent = tempDiv;

            console.log("Bill content added to DOM, dimensions:", {
                width: receiptContent.offsetWidth,
                height: receiptContent.offsetHeight,
                scrollWidth: receiptContent.scrollWidth,
                scrollHeight: receiptContent.scrollHeight
            });

            // Get content dimensions
            const width = receiptContent.offsetWidth || 300;
            const height = receiptContent.offsetHeight || 500;

            // Capture the receipt content as PNG with error handling
            let pngDataUrl;

            console.log("Attempting to capture bill image...");
            console.log("Receipt content dimensions:", width, "x", height);
            console.log("html2canvas available:", typeof window.html2canvas !== 'undefined');
            console.log("modernScreenshot available:", typeof window.modernScreenshot !== 'undefined');

            // Give a bit more time for libraries to load
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                // Preferred: html2canvas, with progressive fallbacks instead of early throw
                if (typeof window.html2canvas !== 'undefined') {
                    console.log("Using html2canvas for screenshot...");
                    try {
                        const canvas = await window.html2canvas(receiptContent, {
                            backgroundColor: '#FFFFFF',
                            scale: 2,
                            useCORS: true,
                            allowTaint: true,
                            logging: false,
                            width: width,
                            height: height,
                            scrollX: 0,
                            scrollY: 0,
                            foreignObjectRendering: false
                        });
                        pngDataUrl = canvas.toDataURL('image/png');
                        console.log("html2canvas screenshot generated successfully");
                    } catch (html2canvasError) {
                        console.error("html2canvas failed, trying modern-screenshot:", html2canvasError);
                        // Try fallback method without aborting
                        if (typeof window.modernScreenshot !== 'undefined') {
                            try {
                                const modernScreenshot = window.modernScreenshot;
                                pngDataUrl = await modernScreenshot.domToPng(receiptContent, {
                                    width: width,
                                    height: height,
                                    backgroundColor: '#FFFFFF',
                                    scale: 2,
                                });
                                console.log("modern-screenshot generated successfully");
                            } catch (modernScreenshotError) {
                                console.error("modern-screenshot failed as well, using canvas fallback:", modernScreenshotError);
                            }
                        }
                    }
                } else if (typeof window.modernScreenshot !== 'undefined') {
                    // If html2canvas is not present, try modern-screenshot directly
                    console.log("Using modern-screenshot for screenshot...");
                    try {
                        const modernScreenshot = window.modernScreenshot;
                        pngDataUrl = await modernScreenshot.domToPng(receiptContent, {
                            width: width,
                            height: height,
                            backgroundColor: '#FFFFFF',
                            scale: 2,
                        });
                        console.log("modern-screenshot generated successfully");
                    } catch (modernScreenshotError) {
                        console.error("modern-screenshot failed, will use canvas fallback:", modernScreenshotError);
                    }
                }

                // Method 3: Direct canvas rendering as final fallback
                if (!pngDataUrl) {
                    console.log("Using direct canvas rendering fallback...");

                    // Create a canvas with the bill content directly
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = width * 2;
                    canvas.height = height * 2;

                    // Fill with white background
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Set text properties
                    ctx.fillStyle = '#000000';
                    ctx.textBaseline = 'top';

                    // Draw bill header
                    ctx.font = 'bold 24px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('BILL/RECEIPT', canvas.width / 2, 20);

                    // Draw order details
                    ctx.font = '16px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(`Order ID: ${orderId || 'N/A'}`, 20, 80);
                    ctx.fillText(`Date: ${new Date().toLocaleDateString('en-GB')}`, 20, 110);
                    ctx.fillText(`Time: ${new Date().toLocaleTimeString('en-GB')}`, 20, 140);

                    // Draw items if available
                    if (orderData && orderData.items && orderData.items.length > 0) {
                        let yPos = 180;
                        ctx.font = 'bold 16px Arial';
                        ctx.fillText('ORDER ITEMS:', 20, yPos);
                        yPos += 30;

                        ctx.font = '12px Arial';
                        orderData.items.forEach((item, index) => {
                            if (index < 8) { // Show more items
                                const itemTitle = item.title || 'Unknown Item';
                                const itemQty = item.qnt || 1;
                                const itemPrice = item.price || 0;
                                const itemTotal = (itemPrice * itemQty).toFixed(2);

                                // Item name (truncate if too long)
                                const itemText = itemTitle.length > 25 ? itemTitle.substring(0, 25) + '...' : itemTitle;
                                ctx.fillText(itemText, 20, yPos);

                                // Quantity and price on next line
                                ctx.fillText(`Qty: ${itemQty} × ₹${itemPrice} = ₹${itemTotal}`, 30, yPos + 15);
                                yPos += 35;
                            }
                        });

                        // Draw totals
                        yPos += 20;
                        ctx.font = 'bold 14px Arial';
                        ctx.fillText(`Sub Total: ₹${(orderData.subTotal || 0).toFixed(2)}`, 20, yPos);
                        yPos += 25;

                        // Show discount if available and loyalty not used
                        if (!(orderData.loyaltyPointsUsed && Number(orderData.loyaltyPointsUsed) > 0) && orderData.discount && orderData.discount > 0) {
                            ctx.fillStyle = '#d32f2f';
                            ctx.fillText(`Discount: -${currency}${orderData.discount.toFixed(2)}`, 20, yPos);
                            ctx.fillStyle = '#000000';
                            yPos += 25;
                        }

                        // Show redeemed points if present
                        if (orderData.loyaltyPointsUsed && Number(orderData.loyaltyPointsUsed) > 0) {
                            try {
                                const lp = Number(orderData.loyaltyPointsUsed || 0) || 0;
                                const la = Number(orderData.loyaltyDiscountAmount || orderData.loyaltyDiscount || 0) || 0;
                                ctx.fillText(`Redeemed Points: ${lp} pts (-${currency}${la.toFixed(2)})`, 20, yPos);
                                yPos += 25;
                            } catch (e) { /* ignore formatting errors */ }
                        }

                        ctx.font = 'bold 18px Arial';
                        ctx.fillText(`TOTAL: ₹${(orderData.total || 0).toFixed(2)}`, 20, yPos);
                    } else {
                        // No items found
                        ctx.font = '14px Arial';
                        ctx.fillText('No items found in order', 20, 180);
                    }

                    // Draw footer
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('Thank You!', canvas.width / 2, canvas.height - 60);
                    ctx.fillText('Visit Again', canvas.width / 2, canvas.height - 40);

                    try {
                        pngDataUrl = canvas.toDataURL('image/png');
                        console.log("Direct canvas rendering successful");
                    } catch (canvasError) {
                        console.error("Canvas export failed:", canvasError);
                        throw new Error("Failed to generate bill image: Canvas export error");
                    }
                }
            } catch (screenshotError) {
                console.error("Error capturing screenshot:", screenshotError);
                throw new Error("Failed to generate bill image: " + (screenshotError.message || "Screenshot error"));
            }

            // Clean up
            document.body.removeChild(tempDiv);

            // Convert to JPEG for smaller file size and better compatibility
            let jpegDataUrl;
            try {
                // Create a canvas to convert PNG to JPEG
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();

                await new Promise((resolve, reject) => {
                    img.onload = () => {
                        canvas.width = img.width;
                        canvas.height = img.height;

                        // Fill with white background for JPEG
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);

                        // Draw the image
                        ctx.drawImage(img, 0, 0);

                        // Convert to JPEG with high quality
                        jpegDataUrl = canvas.toDataURL('image/jpeg', 0.9);
                        resolve();
                    };
                    img.onerror = reject;
                    img.src = pngDataUrl;
                });
            } catch (conversionError) {
                console.warn("Failed to convert to JPEG, using PNG:", conversionError);
                jpegDataUrl = pngDataUrl; // Fallback to PNG
            }

            // Set the bill image URL
            setBillImageUrl(jpegDataUrl);
            showToast("Bill image generated successfully", "success");
            return jpegDataUrl;
        } catch (error) {
            console.error("Error generating bill image:", error);
            showToast("Failed to generate bill image: " + (error.message || "Unknown error"), "error");
            return null;
        } finally {
            setIsGeneratingBill(false);
        }
    };

    // Helper function to convert data URL to Blob
    const dataURLtoBlob = (dataURL) => {
        if (!dataURL || typeof dataURL !== 'string' || !dataURL.startsWith('data:')) {
            console.error("Invalid dataURL provided to dataURLtoBlob:", dataURL);
            throw new Error("Invalid data URL format");
        }

        try {
            const arr = dataURL.split(',');
            if (arr.length < 2) {
                throw new Error("Invalid data URL format: missing comma separator");
            }

            const mimeMatch = arr[0].match(/:(.*?);/);
            if (!mimeMatch || !mimeMatch[1]) {
                throw new Error("Invalid data URL format: cannot extract MIME type");
            }

            const mime = mimeMatch[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);

            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }

            return new Blob([u8arr], { type: mime });
        } catch (error) {
            console.error("Error in dataURLtoBlob:", error);
            throw new Error("Failed to convert data URL to Blob: " + error.message);
        }
    };

    // Share bill via WhatsApp
    const shareBillViaWhatsApp = async () => {
        try {
            // Variable to hold the image data - either from state or newly generated
            let imageData = billImageUrl;

            if (!imageData) {
                console.log("Bill image not available, generating now...");
                // Generate the image and store the returned data directly
                imageData = await generateBillImage();
                if (!imageData) {
                    showToast("Could not generate bill image. Please try again.", "error");
                    return; // Exit if image generation failed
                }
                console.log("Bill image generated successfully");

                // No need to wait for state update since we're using the direct return value
            }

            console.log("Bill image available, proceeding with WhatsApp sharing");

            // Get order details for a more descriptive message
            const orderData = await BluetoothPrinting?.getOrderData(orderId);
            const billNo = orderData?.billNo || orderId || '';
            const total = orderData?.total || cartTotal || 0;

            // Create a more descriptive message
            const text = `Here is your bill #${billNo} from ${UserSession?.seller?.name || 'us'}.\nTotal: ${UserSession?.getCurrency()}${total.toFixed(2)}\nThank you for your business!`;

            // Validate imageData before proceeding
            if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:')) {
                console.error("Invalid image data:", imageData);
                showToast("Invalid bill image format. Please try again.", "error");
                return;
            }

            // Create a blob from the data URL for sharing
            let blob;
            try {
                blob = dataURLtoBlob(imageData);
                if (!blob) {
                    throw new Error("Failed to create blob from image data");
                }
            } catch (blobError) {
                console.error("Error creating blob:", blobError);
                showToast("Failed to process bill image. Please try again.", "error");
                return;
            }

            const file = new File([blob], `bill-${billNo}.png`, { type: "image/png" });

            // First try Web Share API if available - this can share both text and image on supported platforms
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Your Bill',
                        text: text
                    });
                    showToast("Bill shared successfully", "success");
                    return; // Exit if successful
                } catch (shareError) {
                    console.log("Web Share API failed, falling back to WhatsApp link", shareError);
                    // Continue to fallback methods
                }
            }

            // More reliable desktop detection - check for touch support and screen size
            const isDesktop = (window.innerWidth > 1024 && !('ontouchstart' in window)) ||
                !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            // If Web Share API is not available or failed, show a modal with options
            if (ModalManager && typeof ModalManager.createCenterModal === 'function') {
                // Save the bill image first for easy access
                const downloadLink = document.createElement('a');
                downloadLink.href = imageData; // Use our local imageData variable instead of billImageUrl
                downloadLink.download = `bill-${billNo}.png`;

                // Create modal content with specific WhatsApp Web instructions for desktop
                const modalContent = `
                    <div class="text-center">
                        <div class="mb-4">
                            <img src="${imageData}" alt="Bill" class="max-w-full h-auto mx-auto border rounded-lg shadow-sm" style="max-height: 300px;" />
                        </div>
                        ${isDesktop ? `
                        <div class="mb-4 bg-green-50 p-3 rounded-lg text-left">
                            <h4 class="font-medium text-green-800 mb-2">WhatsApp Web Sharing Guide:</h4>
                            <div class="flex items-center justify-center mb-3">
                                <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-2">
                                    <span class="text-green-800 font-bold">1</span>
                                </div>
                                <div class="flex-1">
                                    <p class="font-medium">Download the bill image first</p>
                                </div>
                            </div>
                            <div class="flex items-center justify-center mb-3">
                                <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-2">
                                    <span class="text-green-800 font-bold">2</span>
                                </div>
                                <div class="flex-1">
                                    <p class="font-medium">Copy the message text below</p>
                                </div>
                            </div>
                            <div class="flex items-center justify-center">
                                <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-2">
                                    <span class="text-green-800 font-bold">3</span>
                                </div>
                                <div class="flex-1">
                                    <p class="font-medium">Open WhatsApp Web and send both</p>
                                </div>
                            </div>
                        </div>
                        <div class="mb-4 bg-gray-50 p-3 rounded-lg">
                            <p class="text-sm text-gray-600 mb-2">Message text (click to copy):</p>
                            <div id="copy-text-area" class="text-sm bg-white p-3 rounded border cursor-pointer text-left flex items-center justify-between">
                                <span>${text.replace(/\n/g, '<br>')}</span>
                                <span class="text-blue-500 ml-2"><i class="ph ph-copy"></i></span>
                            </div>
                            <div id="copy-success" class="text-xs text-green-600 mt-1 hidden">
                                <i class="ph ph-check"></i> Copied to clipboard!
                            </div>
                        </div>
                        ` : `
                        <p class="mb-4 text-gray-700">WhatsApp can't directly attach images from web apps. Please choose one of these options:</p>
                        `}
                        <div class="space-y-3">
                            <button id="download-then-share" class="w-full py-2.5 bg-green-500 text-white rounded-lg flex items-center justify-center hover:bg-green-600 transition-colors">
                                <i class="ph ph-download mr-2"></i>
                                ${isDesktop ? 'Step 1: Download Bill Image' : 'Download bill image first'}
                            </button>
                            ${isDesktop ? `
                            <button id="copy-message" class="w-full py-2.5 bg-blue-500 text-white rounded-lg flex items-center justify-center hover:bg-blue-600 transition-colors">
                                <i class="ph ph-clipboard-text mr-2"></i>
                                Step 2: Copy Message Text
                            </button>
                            <button id="open-whatsapp-web" class="w-full py-2.5 bg-green-600 text-white rounded-lg flex items-center justify-center hover:bg-green-700 transition-colors">
                                <i class="ph ph-whatsapp-logo mr-2"></i>
                                Step 3: Open WhatsApp Web
                            </button>
                            ` : `
                            <button id="share-whatsapp-text" class="w-full py-2.5 bg-green-600 text-white rounded-lg flex items-center justify-center hover:bg-green-700 transition-colors">
                                <i class="ph ph-whatsapp-logo mr-2"></i>
                                Share text only via WhatsApp
                            </button>
                            `}
                        </div>
                        ${isDesktop ? `
                        <div class="mt-4 pt-3 border-t border-gray-200">
                            <div class="bg-blue-50 p-3 rounded-lg text-left">
                                <h5 class="font-medium text-blue-800 mb-2">How to attach the image in WhatsApp Web:</h5>
                                <ol class="text-sm text-blue-700 space-y-1 list-decimal pl-4">
                                    <li>In WhatsApp Web, click the <i class="ph ph-paperclip"></i> attachment icon</li>
                                    <li>Select "Photos & Videos"</li>
                                    <li>Navigate to your Downloads folder</li>
                                    <li>Select the bill image you just downloaded</li>
                                    <li>Paste the copied message text</li>
                                    <li>Click send</li>
                                </ol>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                `;

                ModalManager.createCenterModal({
                    title: 'Share Bill via WhatsApp',
                    content: modalContent,
                    onShown: (modalControl) => {
                        // Set up download button
                        const downloadBtn = document.getElementById('download-then-share');
                        if (downloadBtn) {
                            downloadBtn.addEventListener('click', () => {
                                try {
                                    // Download the image
                                    document.body.appendChild(downloadLink);
                                    downloadLink.click();
                                    document.body.removeChild(downloadLink);

                                    // Show toast
                                    showToast("Bill image downloaded successfully", "success");

                                    // Highlight the next step for desktop users
                                    if (isDesktop) {
                                        const copyBtn = document.getElementById('copy-message');
                                        if (copyBtn) {
                                            copyBtn.classList.add('animate-pulse');
                                            setTimeout(() => {
                                                copyBtn.classList.remove('animate-pulse');
                                            }, 2000);
                                        }

                                        // Mark this step as completed
                                        downloadBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
                                        downloadBtn.classList.add('bg-gray-400');
                                        downloadBtn.innerHTML = '<i class="ph ph-check mr-2"></i> Image Downloaded';
                                    } else {
                                        // For mobile, continue with opening WhatsApp
                                        const customerPhone = customer?.phone || '';
                                        let whatsappUrl;

                                        if (customerPhone && customerPhone.trim()) {
                                            // Format phone number - remove non-digits
                                            const phoneNumber = customerPhone.replace(/\D/g, '');
                                            whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(text)}`;
                                        } else {
                                            // No phone number, use general link
                                            whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
                                        }

                                        // Open WhatsApp after a short delay
                                        setTimeout(() => {
                                            window.open(whatsappUrl, '_blank');
                                            modalControl.close();
                                        }, 1000);
                                    }
                                } catch (err) {
                                    console.error("Error downloading image:", err);
                                    showToast("Failed to download image. Please try again.", "error");
                                }
                            });
                        }

                        // Set up copy message button for desktop
                        if (isDesktop) {
                            const copyMessageBtn = document.getElementById('copy-message');
                            if (copyMessageBtn) {
                                copyMessageBtn.addEventListener('click', () => {
                                    try {
                                        navigator.clipboard.writeText(text)
                                            .then(() => {
                                                showToast("Message copied to clipboard", "success");

                                                // Show visual feedback
                                                const copySuccess = document.getElementById('copy-success');
                                                if (copySuccess) {
                                                    copySuccess.classList.remove('hidden');
                                                    setTimeout(() => {
                                                        copySuccess.classList.add('hidden');
                                                    }, 2000);
                                                }

                                                // Mark this step as completed
                                                copyMessageBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                                                copyMessageBtn.classList.add('bg-gray-400');
                                                copyMessageBtn.innerHTML = '<i class="ph ph-check mr-2"></i> Message Copied';

                                                // Highlight the next step
                                                const whatsappBtn = document.getElementById('open-whatsapp-web');
                                                if (whatsappBtn) {
                                                    whatsappBtn.classList.add('animate-pulse');
                                                    setTimeout(() => {
                                                        whatsappBtn.classList.remove('animate-pulse');
                                                    }, 2000);
                                                }
                                            })
                                            .catch(err => {
                                                console.error('Failed to copy text: ', err);
                                                showToast("Failed to copy text. Please try selecting and copying manually.", "error");
                                            });
                                    } catch (err) {
                                        console.error("Error copying message:", err);
                                        showToast("Failed to copy message. Please try manually.", "error");
                                    }
                                });
                            }

                            // Set up copy text area functionality
                            const copyTextArea = document.getElementById('copy-text-area');
                            const copySuccess = document.getElementById('copy-success');
                            if (copyTextArea && copySuccess) {
                                copyTextArea.addEventListener('click', () => {
                                    navigator.clipboard.writeText(text)
                                        .then(() => {
                                            copySuccess.classList.remove('hidden');
                                            copyTextArea.classList.add('bg-green-50', 'border-green-200');

                                            // Mark the copy button as completed
                                            const copyMessageBtn = document.getElementById('copy-message');
                                            if (copyMessageBtn) {
                                                copyMessageBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
                                                copyMessageBtn.classList.add('bg-gray-400');
                                                copyMessageBtn.innerHTML = '<i class="ph ph-check mr-2"></i> Message Copied';
                                            }

                                            setTimeout(() => {
                                                copySuccess.classList.add('hidden');
                                                copyTextArea.classList.remove('bg-green-50', 'border-green-200');
                                            }, 2000);
                                        })
                                        .catch(err => {
                                            console.error('Failed to copy text: ', err);
                                            showToast("Failed to copy text. Please try selecting and copying manually.", "error");
                                        });
                                });
                            }
                        }

                        // Set up WhatsApp Web button for desktop
                        if (isDesktop) {
                            const openWhatsAppBtn = document.getElementById('open-whatsapp-web');
                            if (openWhatsAppBtn) {
                                openWhatsAppBtn.addEventListener('click', () => {
                                    try {
                                        // Check if customer phone is available
                                        const customerPhone = customer?.phone || '';
                                        let whatsappUrl;

                                        if (customerPhone && customerPhone.trim()) {
                                            // Format phone number - remove non-digits
                                            const phoneNumber = customerPhone.replace(/\D/g, '');
                                            whatsappUrl = `https://web.whatsapp.com/send?phone=${phoneNumber}`;
                                        } else {
                                            // No phone number, just open WhatsApp Web
                                            whatsappUrl = 'https://web.whatsapp.com/';
                                        }

                                        window.open(whatsappUrl, '_blank');

                                        // Mark this step as completed
                                        openWhatsAppBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
                                        openWhatsAppBtn.classList.add('bg-gray-400');
                                        openWhatsAppBtn.innerHTML = '<i class="ph ph-check mr-2"></i> WhatsApp Web Opened';

                                        showToast("WhatsApp Web opened. Please attach the downloaded bill image.", "info");
                                    } catch (err) {
                                        console.error("Error opening WhatsApp Web:", err);
                                        showToast("Failed to open WhatsApp Web. Please try manually.", "error");
                                    }
                                });
                            }
                        } else {
                            // Set up text-only share button for mobile
                            const shareTextBtn = document.getElementById('share-whatsapp-text');
                            if (shareTextBtn) {
                                shareTextBtn.addEventListener('click', () => {
                                    try {
                                        // Check if customer phone is available
                                        const customerPhone = customer?.phone || '';
                                        let whatsappUrl;

                                        if (customerPhone && customerPhone.trim()) {
                                            // Format phone number - remove non-digits
                                            const phoneNumber = customerPhone.replace(/\D/g, '');
                                            whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(text)}`;
                                        } else {
                                            // No phone number, use general link
                                            whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
                                        }

                                        window.open(whatsappUrl, '_blank');
                                        modalControl.close();
                                    } catch (err) {
                                        console.error("Error opening WhatsApp:", err);
                                        showToast("Failed to open WhatsApp. Please try manually.", "error");
                                    }
                                });
                            }
                        }
                    }
                });
            } else {
                // If modal manager is not available, fall back to basic approach
                // Download the image first
                try {
                    const downloadLink = document.createElement('a');
                    downloadLink.href = imageData; // Use our local imageData variable instead of billImageUrl
                    downloadLink.download = `bill-${billNo}.png`;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);

                    // Check if customer phone is available
                    const customerPhone = customer?.phone || '';
                    let whatsappUrl;

                    if (customerPhone && customerPhone.trim()) {
                        // Format phone number - remove non-digits
                        const phoneNumber = customerPhone.replace(/\D/g, '');

                        // Use different URLs for desktop and mobile
                        if (isDesktop) {
                            whatsappUrl = `https://web.whatsapp.com/send?phone=${phoneNumber}`;
                            showToast("Bill image downloaded. Please attach it manually in WhatsApp Web", "info");
                        } else {
                            whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(text)}`;
                            showToast("Bill image downloaded. Now you can attach it in WhatsApp", "success");
                        }
                    } else {
                        // No phone number, use general link
                        if (isDesktop) {
                            whatsappUrl = 'https://web.whatsapp.com/';
                            showToast("Bill image downloaded. Please attach it manually in WhatsApp Web", "info");
                        } else {
                            whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
                            showToast("Bill image downloaded. Now you can attach it in WhatsApp", "success");
                        }
                    }

                    // Open WhatsApp after a short delay
                    setTimeout(() => {
                        window.open(whatsappUrl, '_blank');
                    }, 1000);
                } catch (err) {
                    console.error("Error in basic sharing approach:", err);
                    showToast("Failed to share bill. Please try again.", "error");
                }
            }
        } catch (error) {
            console.error("Error sharing via WhatsApp:", error);
            showToast("Failed to share bill: " + (error.message || "Unknown error"), "error");
        }
    };

    // Share bill via SMS
    const shareBillViaSMS = async () => {
        let imageData = billImageUrl;

        if (!imageData) {
            imageData = await generateBillImage();
            if (!imageData) {
                return; // Exit if image generation failed
            }
        }

        try {
            const customerPhone = customer?.phone || '';
            const text = `Here is your bill from ${UserSession?.seller?.name || 'us'}`;

            // Use native SMS app through URL scheme
            const smsUrl = `sms:${customerPhone}?body=${encodeURIComponent(text)}`;
            window.open(smsUrl, '_blank');

            // If SMS URL fails, try Web Share API as fallback
            setTimeout(() => {
                // Create a blob from the data URL
                const blob = dataURLtoBlob(imageData);

                // Determine file extension and type based on image format
                const isJpeg = imageData.startsWith('data:image/jpeg');
                const filename = isJpeg ? "bill.jpg" : "bill.png";
                const fileType = isJpeg ? "image/jpeg" : "image/png";

                // Create a File object from the Blob
                const file = new File([blob], filename, { type: fileType });

                // Check if Web Share API with files is supported
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    navigator.share({
                        files: [file],
                        title: 'Your Bill',
                        text: text
                    }).catch(err => {
                        console.log("Web Share API fallback also failed:", err);
                    });
                }
            }, 1000); // Give some time for the SMS app to open
        } catch (error) {
            console.error("Error sharing via SMS:", error);
            showToast("Failed to share bill: " + (error.message || "Unknown error"), "error");
        }
    };

    // Share bill via Email
    const shareBillViaEmail = async () => {
        let imageData = billImageUrl;

        if (!imageData) {
            imageData = await generateBillImage();
            if (!imageData) {
                return; // Exit if image generation failed
            }
        }

        try {
            const customerEmail = customer?.email || '';
            const subject = `Your Bill from ${UserSession?.seller?.name || 'Restaurant'}`;
            const body = `Here is your bill from ${UserSession?.seller?.name || 'us'}. Thank you for your business!`;

            // Primary approach: Use mailto link for web email
            const mailtoUrl = `mailto:${customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

            // Try to open email client
            const newWindow = window.open(mailtoUrl, '_blank');

            // If window.open was blocked or failed, try Web Share API as fallback
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                console.log("Email client link failed, trying Web Share API fallback");

                // Create a blob from the data URL
                const blob = dataURLtoBlob(imageData);

                // Determine file extension and type based on image format
                const isJpeg = imageData.startsWith('data:image/jpeg');
                const filename = isJpeg ? "bill.jpg" : "bill.png";
                const fileType = isJpeg ? "image/jpeg" : "image/png";

                // Create a File object from the Blob
                const file = new File([blob], filename, { type: fileType });

                // Check if Web Share API with files is supported
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: subject,
                        text: body
                    });
                }
            }
        } catch (error) {
            console.error("Error sharing via Email:", error);
            showToast("Failed to share bill: " + (error.message || "Unknown error"), "error");
        }
    };

    // Add a download function for direct download of bill image
    const downloadBill = async () => {
        // Variable to hold the image data - either from state or newly generated
        let imageData = billImageUrl;

        if (!imageData) {
            console.log("Bill image not available for download, generating now...");
            // Generate the image and store the returned data directly
            imageData = await generateBillImage();
            if (!imageData) {
                showToast("Could not generate bill image. Please try again.", "error");
                return; // Exit if image generation failed
            }
            console.log("Bill image generated successfully for download");
        }

        try {
            // Determine file extension based on image format
            const isJpeg = imageData.startsWith('data:image/jpeg');
            const extension = isJpeg ? 'jpg' : 'png';

            // Generate a meaningful filename
            const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const orderNum = orderId ? orderId.slice(-6) : Math.random().toString(36).slice(-6);
            const filename = `bill-${timestamp}-${orderNum}.${extension}`;

            // Create an anchor element for download
            const downloadLink = document.createElement('a');
            downloadLink.href = imageData;
            downloadLink.download = filename;

            // Append to body, click and remove
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

            showToast(`Bill saved as ${filename}`, "success");
        } catch (error) {
            console.error("Error downloading bill:", error);
            showToast("Failed to download bill: " + (error.message || "Unknown error"), "error");
        }
    };

    // Direct function to create unsettled bill
    const createUnsettledBill = async (withPartialPayment = false) => {
        try {
            // Get the orderId from props or create a new one
            const targetOrderId = orderId || sdk.db.collection("Orders").doc().id;
            console.log("targetOrderId:", targetOrderId);

            let cleanOrderData;
            
            // If we're creating an unsettled bill from an existing order, preserve all existing data
            if (orderId) {
                try {
                    const existingOrderDoc = await sdk.db.collection("Orders").doc(orderId).get();
                    if (existingOrderDoc.exists) {
                        const existingOrderData = existingOrderDoc.data();
                        
                        // Preserve all existing order data
                        cleanOrderData = {
                            ...existingOrderData,
                            id: targetOrderId,
                            payMode: PaymentMode.UNSETTLED,
                            paid: false,
                            settled: false,
                            settledAmount: 0,
                            partialPayments: [],
                            // Preserve existing bill number
                            billNo: existingOrderData.billNo || null
                        };
                        
                        // Add customer if available and not already set
                        if (customer && !cleanOrderData.custId) {
                            cleanOrderData.custId = customer.id;
                            cleanOrderData.custName = customer.name;
                            cleanOrderData.custPhone = customer.phone;
                        }
                        
                        console.log("Preserved existing order data for unsettled bill:", cleanOrderData);
                    }
                } catch (e) {
                    console.warn("Failed to fetch existing order data:", e);
                }
            }
            
            // If we don't have existing order data, create a new order from cart
            if (!cleanOrderData) {
                // Convert cart items to Order items format
                const orderItems = Object.values(cart).map(cartItem => {
                    return Item.fromProduct(
                        cartItem.product,
                        cartItem.quantity,
                        cartItem.variant || null,
                        cartItem.addons || []
                    );
                });
                console.log("orderItems:", orderItems);

                // If we're creating an unsettled bill from an existing order, preserve the bill number
                let existingBillNo = null;
                if (orderId) {
                    try {
                        const existingOrderDoc = await sdk.db.collection("Orders").doc(orderId).get();
                        if (existingOrderDoc.exists) {
                            const existingOrderData = existingOrderDoc.data();
                            existingBillNo = existingOrderData.billNo || null;
                        }
                    } catch (e) {
                        console.warn("Failed to fetch existing order bill number:", e);
                    }
                }

                // Create order using MOrder class
                const order = MOrder.fromItems(
                    targetOrderId,
                    orderItems,
                    discount || 0,
                    priceVariant || null,
                    tableId || null,
                    instructions || null,
                    chargesCalculation.calculatedCharges || [],
                    false, // isStoreClosing
                    existingBillNo // existingBillNo to preserve bill number for unsettled bills
                );
                console.log("order.data before save:", order.data);

                // Set order status to UNSETTLED
                order.data.payMode = PaymentMode.UNSETTLED;

                // Add customer if available
                if (customer) {
                    order.data.custId = customer.id;
                    order.data.custName = customer.name;
                    order.data.custPhone = customer.phone;
                }

                // Deep clean function to remove all undefined values recursively
                const deepClean = (obj) => {
                    if (obj instanceof Date) return obj;
                    if (Array.isArray(obj)) {
                        return obj.map(item => deepClean(item)).filter(item => item !== undefined);
                    } else if (obj !== null && typeof obj === 'object') {
                        const cleaned = {};
                        Object.keys(obj).forEach(key => {
                            const value = deepClean(obj[key]);
                            if (value !== undefined) {
                                cleaned[key] = value;
                            }
                        });
                        return cleaned;
                    } else {
                        return obj === undefined ? undefined : obj;
                    }
                };

                cleanOrderData = deepClean(order.data);
                console.log("cleaned order data:", cleanOrderData);

                try {
                    if (Array.isArray(cleanOrderData.items)) {
                        cleanOrderData.items = cleanOrderData.items.map(it => {
                            const qty = Number(it.quantity ?? it.qnt ?? 1) || 1;
                            const price = Number(it.price ?? it.variantPrice ?? it.mrp ?? 0) || 0;
                            const addonsTotal = Array.isArray(it.addons) ? it.addons.reduce((s, a) => s + (Number(a.price) || 0), 0) : (Number(it.addonsTotal) || 0);
                            const total = Number(it.total ?? ((price + addonsTotal) * qty)) || 0;
                            return {
                                ...it,
                                quantity: qty,
                                qnt: qty,
                                price: price,
                                addonsTotal: addonsTotal,
                                total: total
                            };
                        });
                    }
                } catch (err) {
                    console.warn('Failed to normalize order items before save', err);
                }
            }

            // Save order to database
            await sdk.db.collection("Orders").doc(targetOrderId).set(cleanOrderData);

            // Handle printing for the unsettled bill
            let billPrintedSuccessfully = false;
            if (BluetoothPrinting) {
                try {
                    // Create order data for printing
                    const orderData = {
                        ...cleanOrderData,
                        id: targetOrderId,
                        // Add computed fields needed for printing
                        items: cleanOrderData.items || [],
                        charges: cleanOrderData.charges || [],
                        calculatedCharges: cleanOrderData.calculatedCharges || chargesCalculation.calculatedCharges || [],
                        discount: discount || 0,
                        // Add loyalty data if available
                        loyaltyPointsUsed: Number(recentRedeem?.points || 0) || 0,
                        loyaltyDiscountAmount: Number(recentRedeem?.amount || 0) || 0,
                        // Add tax information
                        totalTaxAmount: cleanOrderData.totalTaxAmount || chargesCalculation.totalChargesAmount || 0,
                        finalAmount: cleanOrderData.finalAmount || chargesCalculation.finalAmount || 0
                    };

                    // If this preview is for an existing order, prefer the saved human-readable billNo
                    // falling back to the document id when billNo is not present.
                    try {
                        if (orderId && sdk && sdk.db && typeof sdk.db.collection === 'function') {
                            const orderRef = sdk.db.collection('Orders').doc(orderId);
                            const snap = await orderRef.get();
                            const data = snap && snap.exists ? snap.data() : null;
                            orderData.displayBillNo = (data && data.billNo) ? data.billNo : orderId;
                        }
                    } catch (e) {
                        console.warn('Could not set displayBillNo on orderData:', e);
                    }

                    // Ensure tax charges are properly included - compute taxes if missing
                    const missingCharges = !(Array.isArray(orderData.calculatedCharges) && orderData.calculatedCharges.length > 0);
                    const missingTotalTax = !(Number(orderData.totalTaxAmount) > 0);
                    if (missingCharges || missingTotalTax) {
                        try {
                            const itemsForCalc = Array.isArray(orderData.items) ? orderData.items : [];
                            const itemsTotal = (itemsForCalc || []).reduce((s, it) => s + (Number(it.price || it.basePrice || 0) * (Number(it.qnt || it.quantity || 1) || 1)), 0);
                            const discountForCalc = Number(orderData.discount || 0) || 0;
                            const chargeCalc = (ChargesCalculator && typeof ChargesCalculator.calculateCharges === 'function')
                                ? ChargesCalculator.calculateCharges(itemsTotal, orderData.charges || [])
                                : { calculatedCharges: orderData.charges || [], finalAmount: Math.max(0, itemsTotal) };
                            orderData.calculatedCharges = Array.isArray(chargeCalc.calculatedCharges) ? chargeCalc.calculatedCharges : (orderData.calculatedCharges || []);
                            orderData.finalAmount = Number(chargeCalc.finalAmount || 0) - discountForCalc;
                            let computedTax = (orderData.calculatedCharges || []).reduce((sum, c) => {
                                try {
                                    const name = (c.displayName || c.name || '').toString().toLowerCase();
                                    const amt = Number(c.calculatedAmount || c.amount || c.value || 0) || 0;
                                    if (name.includes('tax') || name.includes('gst') || name.includes('vat') || name.includes('cgst') || name.includes('sgst'))
                                        return sum + amt;
                                } catch (e) { }
                                return sum;
                            }, 0);
                            if ((!computedTax || computedTax === 0) && !isNaN(orderData.finalAmount)) {
                                const baseNoTax = Number(itemsTotal || 0) - discountForCalc;
                                const inferred = Number(orderData.finalAmount || 0) - baseNoTax;
                                if (!isNaN(inferred) && inferred > 0) computedTax = inferred;
                            }
                            orderData.totalTaxAmount = Number(computedTax || 0);
                        } catch (e) {
                            console.warn('[createUnsettledBill] tax calculation failed', e);
                        }
                    }

                    // Try immediate print preview using in-memory orderData
                    setTimeout(() => {
                        try {
                            if (typeof BluetoothPrinting.printPreviewBill === 'function') {
                                BluetoothPrinting.printPreviewBill(orderData, 'UNSETTLED', autoPrint).catch ?
                                    BluetoothPrinting.printPreviewBill(orderData, 'UNSETTLED', autoPrint).catch(e =>
                                        console.warn('[createUnsettledBill] immediate printPreviewBill failed', e)) : null;
                            } else if (typeof BluetoothPrinting.printBill === 'function') {
                                BluetoothPrinting.printBill(targetOrderId, 'UNSETTLED', autoPrint).catch ?
                                    BluetoothPrinting.printBill(targetOrderId, 'UNSETTLED', autoPrint).catch(e =>
                                        console.warn('[createUnsettledBill] immediate printBill failed', e)) : null;
                            }
                        } catch (e) {
                            console.warn('[createUnsettledBill] immediate print call error', e);
                        }
                    }, 0);
                    billPrintedSuccessfully = true;
                } catch (printError) {
                    console.error('Failed to start printing for unsettled bill', printError);
                    showToast('Unsettled bill created but printing failed', 'warning');
                }
            }

            // If partial payment is requested, open the payment modal
            if (withPartialPayment) {
                setTimeout(() => openPartialPaymentModal(targetOrderId), 500);
            } else {
                const printMessage = billPrintedSuccessfully ? "Unsettled bill created and sent to printer!" : "Unsettled bill created successfully";
                showToast(printMessage, "success");
            }

            // Clear cart if callback provided
            if (clearCallback) clearCallback();

            return true;
        } catch (error) {
            console.error("Error creating unsettled bill:", error);
            showToast("Failed to create unsettled bill: " + (error && error.message ? error.message : JSON.stringify(error)), "error");
            return false;
        }
    };

    // Handle unsettled bill creation
    const handleUnsettledBill = () => {
        const modalContent = `
            <div class="py-4">
                <div class="flex items-center justify-center mb-6">
                    <div class="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center">
                        <i class="ph ph-clock-clockwise text-yellow-500 text-4xl"></i>
                    </div>
                </div>
                <h3 class="text-center font-medium text-gray-800 mb-2">${t('createUnsettledBill')}</h3>
                <p class="text-center text-gray-600 mb-6 px-4">
                    ${t('unsettledBillDescription')}
                </p>
                <div class="space-y-4 px-1">
                    <button 
                        id="create-unsettled-btn" 
                        class="w-full py-3 bg-yellow-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-yellow-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <i class="ph ph-clock-clockwise mr-2 text-lg"></i>
                        ${t('createUnsettledBill')}
                    </button>
                    <button 
                        id="partial-payment-btn" 
                        class="w-full py-3 bg-blue-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-blue-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <i class="ph ph-currency-circle-dollar mr-2 text-lg"></i>
                        ${t('payPartialAmountNow')}
                    </button>
                </div>
                <div class="mt-4 text-center text-xs text-gray-500">
                    <span class="flex items-center justify-center">
                        <i class="ph ph-info text-xs mr-1"></i>
                        ${t('unsettledBillsCanBeSettled')}
                    </span>
                </div>
            </div>
        `;

        ModalManager.createCenterModal({
            title: "",
            content: modalContent,
            onShown: (modalControl) => {
                // Create unsettled bill without payment
                const createBtn = document.getElementById('create-unsettled-btn');
                const partialBtn = document.getElementById('partial-payment-btn');

                if (createBtn) {
                    createBtn.onclick = async () => {
                        try {
                            // Disable buttons to prevent double-clicks
                            createBtn.disabled = true;
                            partialBtn.disabled = true;

                            modalControl.close();

                            // Create unsettled bill
                            await createUnsettledBill(false);
                        } catch (error) {
                            console.error("Error in unsettled bill creation:", error);
                            showToast("Failed to create unsettled bill", "error");
                        }
                    };
                }

                if (partialBtn) {
                    partialBtn.onclick = async () => {
                        try {
                            // Disable buttons to prevent double-clicks
                            createBtn.disabled = true;
                            partialBtn.disabled = true;

                            modalControl.close();

                            // Create unsettled bill with partial payment
                            await createUnsettledBill(true);
                        } catch (error) {
                            console.error("Error in partial payment creation:", error);
                            showToast("Failed to create bill with partial payment", "error");
                        }
                    };
                }
            }
        });
    };

    // Open partial payment modal for unsettled bills
    const openPartialPaymentModal = (orderIdToSettle) => {
        if (!orderIdToSettle) {
            showToast("No order ID available for payment", "error");
            return;
        }

        // Calculate the total amount for the order
        const orderTotal = cartTotal || 0;

        if (orderTotal <= 0) {
            showToast("Cannot process payment for zero amount", "error");
            return;
        }

        const modalContent = `
            <div class="py-4">
                <div class="flex items-center justify-center mb-6">
                    <div class="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                        <i class="ph ph-currency-circle-dollar text-blue-500 text-4xl"></i>
                    </div>
                </div>
                <h3 class="text-center font-medium text-gray-800 mb-2">Add Partial Payment</h3>
                <p class="text-center text-gray-600 mb-6 px-4">
                    Enter the amount being paid for this order.
                </p>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm text-gray-600 mb-2">Payment Amount</label>
                        <div class="flex items-center border rounded-lg overflow-hidden shadow-sm">
                            <span class="px-3 py-2 bg-gray-100 text-gray-500">
                                ${UserSession?.getCurrency()}
                            </span>
                            <input
                                type="number"
                                id="payment-amount-input"
                                placeholder="0.00"
                                min="0.01"
                                max="${orderTotal.toFixed(2)}"
                                step="0.01"
                                class="flex-1 px-3 py-2 outline-none"
                            />
                        </div>
                        <p class="text-xs text-gray-500 mt-2">
                            Maximum: ${UserSession?.getCurrency()}${orderTotal.toFixed(2)}
                        </p>
                    </div>

                    <div>
                        <label class="block text-sm text-gray-600 mb-2">Payment Method</label>
                        <select 
                            id="payment-method-select" 
                            class="w-full px-3 py-2 border rounded-lg outline-none shadow-sm"
                        >
                            <option value="CASH">Cash</option>
                            <option value="DIGITAL">Digital Payment</option>
                            <option value="CREDIT">Credit</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm text-gray-600 mb-2">Notes (Optional)</label>
                        <textarea 
                            id="payment-notes-input"
                            placeholder="Add any notes about this payment..."
                            class="w-full px-3 py-2 border rounded-lg outline-none shadow-sm resize-none"
                            rows="2"
                        ></textarea>
                    </div>

                    <button 
                        id="add-payment-btn" 
                        class="w-full py-3 bg-green-500 text-white rounded-lg font-medium flex items-center justify-center hover:bg-green-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <i class="ph ph-plus mr-2 text-lg"></i>
                        Add Payment
                    </button>
                </div>
            </div>
        `;

        ModalManager.createCenterModal({
            title: "",
            content: modalContent,
            onShown: (modalControl) => {
                const amountInput = document.getElementById('payment-amount-input');
                const methodSelect = document.getElementById('payment-method-select');
                const notesInput = document.getElementById('payment-notes-input');
                const addBtn = document.getElementById('add-payment-btn');

                // Focus on amount input
                if (amountInput) {
                    amountInput.focus();
                }

                if (addBtn) {
                    addBtn.onclick = async () => {
                        try {
                            const amount = parseFloat(amountInput.value);
                            const paymentMethod = methodSelect.value;
                            const notes = notesInput.value.trim();

                            if (!amount || amount <= 0) {
                                showToast("Please enter a valid payment amount", "error");
                                return;
                            }

                            if (amount > orderTotal) {
                                showToast(`Payment amount cannot exceed ${UserSession?.getCurrency()}${orderTotal.toFixed(2)}`, "error");
                                return;
                            }

                            // Disable button and show loading
                            addBtn.disabled = true;
                            addBtn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>Processing...';

                            // Get the order to add payment to
                            const orderRef = sdk.db.collection("Orders").doc(orderIdToSettle);
                            const orderDoc = await orderRef.get();

                            if (!orderDoc.exists) {
                                showToast("Order not found", "error");
                                return;
                            }

                            const orderData = orderDoc.data();
                            const order = new MOrder(orderData);

                            // Add the partial payment
                            const paymentResult = await order.addPartialPayment(amount, paymentMethod, notes);

                            modalControl.close();

                            if (paymentResult.isFullySettled) {
                                showToast(`Payment successful! Order fully settled.`, "success");
                            } else {
                                const pendingAmount = paymentResult.pendingAmount;
                                showToast(`Payment of ${UserSession?.getCurrency()}${amount.toFixed(2)} added. Pending: ${UserSession?.getCurrency()}${pendingAmount.toFixed(2)}`, "success");
                            }

                        } catch (error) {
                            console.error("Error adding partial payment:", error);
                            showToast("Failed to add payment: " + (error.message || "Unknown error"), "error");

                            // Re-enable button
                            addBtn.disabled = false;
                            addBtn.innerHTML = 'Add Payment';
                        }
                    };
                }
            }
        });
    };

    if (Object.keys(cart).length === 0) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-stretch justify-end z-70" onClick={() => onClose?.()}>
            <div
                className="bg-white h-full w-4/5 sm:w-4/5 md:w-1/2 lg:w-1/2 xl:w-2/5 flex flex-col min-h-0 overflow-hidden shadow-lg animate-slideInRight relative"
                onClick={(e) => e.stopPropagation()}
                style={{ backgroundColor: "#fffcfc" }}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 bg-white" style={{ backgroundColor: "#fff8f8" }}>
                    <div className="flex items-center justify-between p-4 border-b relative">
                        <div className="flex items-center">
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                                <i className="ph ph-shopping-cart text-red-600 text-xl"></i>
                            </div>
                            <h2 className="text-2xl font-semibold text-gray-800">Checkout</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={openDiscountModal}
                                className="p-2 hover:bg-red-50 rounded-full transition-colors"
                                title="Apply Discount"
                            >
                                <i className="ph ph-tag text-red-600"></i>
                            </button>
                            <button
                                onClick={openInstructionsModal}
                                className="p-2 hover:bg-red-50 rounded-full transition-colors"
                                title="Add Instructions"
                            >
                                <i className="ph ph-note-pencil text-gray-600"></i>
                            </button>
                            <button
                                onClick={toggleAutoPrint}
                                className={`p-2 ${autoPrint ? 'bg-red-50' : 'hover:bg-red-50'} rounded-full transition-colors`}
                                title={autoPrint ? "Disable Auto Print" : "Enable Auto Print"}
                            >
                                <i className={`ph ph-printer ${autoPrint ? 'text-red-600' : 'text-gray-600'}`}></i>
                            </button>
                            <button
                                onClick={() => onClose?.()}
                                className="p-2 hover:bg-red-50 rounded-full transition-colors"
                                aria-label="Close"
                            >
                                <i className="ph ph-x text-red-600"></i>
                            </button>
                        </div>
                    </div>

                    {/* Order Info */}
                    <div className="bg-pink-50 px-4 py-2 border-b flex justify-between items-center">
                        <div className="text-sm text-gray-600 flex items-center">
                            <i className="ph ph-shopping-bag text-red-500 mr-1"></i>
                            {Object.values(cart).reduce((total, item) => total + item.quantity, 0)} items
                        </div>
                        <div className="text-sm text-gray-600 flex items-center">
                            <i className="ph ph-calendar text-red-500 mr-1"></i>
                            {formatDate(new Date())}
                        </div>
                    </div>
                </div>

                {/* Main content - Scrollable area */}
                <div
                    className="overflow-y-auto flex-1 relative min-h-0"
                    style={{ scrollbarWidth: 'thin', backgroundColor: "#fffcfc" }}
                >
                    {/* Items list */}
                    <div className="p-4">
                        <h3 className="font-medium text-gray-700 mb-3">Order Items</h3>
                        {/* Removed global unit entry mode toggle; per-item controls below */}
                        <div className="space-y-3">
                            {Object.values(cart).map((item, index) => (
                                <div key={index} className="flex items-start p-3 bg-white rounded-xl shadow-sm hover:shadow transition-shadow duration-200">
                                    <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden mr-3 flex-shrink-0">
                                        {item.product.imgs && item.product.imgs.length > 0 ? (
                                            <img
                                                src={item.product.imgs[0]}
                                                alt={item.product.title}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="%23ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <i className="ph ph-image text-gray-400 text-xl" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-900 text-xl">
                                            {formatProductTitle(item)}
                                            {((item.freeItem === true && (item.freeItemSource === 'birthday' || !item.freeItemSource)) || (item.product && (item.product.freeItem === true || item.product.freeItemSource === 'birthday')) || item.birthdayBenefit) && (
                                                <span className="ml-2 inline-block px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">Birthday</span>
                                            )}
                                        </div>

                                        {/* Show selected add-ons if any */}
                                        {item.addons && item.addons.length > 0 && (
                                            <div className="text-base text-gray-600 mt-0.5">
                                                Add-ons: {item.addons.map(addon => addon.name).join(', ')}
                                            </div>
                                        )}

                                        <div className="text-base text-gray-600 mt-0.5">
                                            {item.quantity} × {UserSession?.getCurrency()}{getEffectiveBasePriceForItem(item).toFixed(2)}
                                            {item.addons && item.addons.length > 0 && (
                                                <span className="text-gray-500">
                                                    {' '}(+{UserSession?.getCurrency()}{item.addons.reduce((sum, addon) => sum + addon.price, 0)} add-ons)
                                                </span>
                                            )}
                                        </div>

                                        {/* Unit pricing info */}
                                        {item.product?.unitPricing?.enabled && item.product?.unitPricing?.displayUnit && item.product?.unitPricing?.pricePerUnit > 0 && (
                                            <div className="mt-1 space-y-1">
                                                <div className="text-sm text-blue-600">
                                                    {UserSession?.getCurrency()}{Number(item.product.unitPricing.pricePerUnit).toFixed(2)} / {item.product.unitPricing.displayUnit}
                                                </div>

                                                {/* Unit calculation display */}
                                                {item.product?.unitCalculation && (
                                                    <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200">
                                                        <div className="text-sm text-green-700 font-medium flex items-center gap-1">
                                                            <i className="ph ph-calculator text-xs"></i>
                                                            Unit Calculation Applied
                                                        </div>
                                                        <div className="text-xs text-green-600 mt-1">
                                                            {item.product.unitCalculation.mode === 'weight' ? (
                                                                <>
                                                                    {item.product.unitCalculation.inputValue} {item.product.unitCalculation.unit} ×
                                                                    {UserSession?.getCurrency()}{item.product.unitCalculation.pricePerUnit.toFixed(2)} =
                                                                    {UserSession?.getCurrency()}{item.product.unitCalculation.calculatedPrice.toFixed(2)}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    Price set to: {UserSession?.getCurrency()}{item.product.unitCalculation.calculatedPrice.toFixed(2)}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Per-item Unit/Amount toggle */}
                                                <div className="flex items-center gap-2">
                                                    <div className="inline-flex bg-gray-100 rounded-full p-0.5 text-[10px]">
                                                        <button
                                                            type="button"
                                                            className={`px-2 py-0.5 rounded-full ${(itemEntryModes[getCartItemKey(item)] || 'amount') === 'units' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}
                                                            onClick={() => {
                                                                const key = getCartItemKey(item);
                                                                setItemEntryModes((p) => ({ ...p, [key]: 'units' }));
                                                                // Seed units to 1 if empty so user sees PPU immediately
                                                                const currentUnits = unitAmounts[key];
                                                                if (currentUnits == null || currentUnits === '' || isNaN(Number(currentUnits))) {
                                                                    setUnitAmounts((p) => ({ ...p, [key]: 1 }));
                                                                    // keep amount in sync
                                                                    const ppu = Number(item?.product?.unitPricing?.pricePerUnit);
                                                                    if (!isNaN(ppu) && ppu > 0) {
                                                                        setUnitBaseAmounts((p) => ({ ...p, [key]: ppu * 1 }));
                                                                    }
                                                                    persistItemOverride(item, { mode: 'units', units: 1 });
                                                                } else {
                                                                    persistItemOverride(item, { mode: 'units' });
                                                                }
                                                            }}
                                                        >Units</button>
                                                        <button
                                                            type="button"
                                                            className={`px-2 py-0.5 rounded-full ${(itemEntryModes[getCartItemKey(item)] || 'amount') === 'amount' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}
                                                            onClick={() => {
                                                                const key = getCartItemKey(item);
                                                                setItemEntryModes((p) => ({ ...p, [key]: 'amount' }));
                                                                persistItemOverride(item, { mode: 'amount' });
                                                            }}
                                                        >Amount</button>
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <label className="text-xs text-gray-500">Units</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        placeholder={`e.g. 250`}
                                                        value={unitAmounts[getCartItemKey(item)] ?? ''}
                                                        onChange={(e) => onUnitAmountChange(item, e.target.value)}
                                                        onBlur={() => {
                                                            const key = getCartItemKey(item);
                                                            const v = unitAmounts[key];
                                                            const num = v === '' ? null : Number(v);
                                                            persistItemOverride(item, { units: (num != null && !isNaN(num) && num >= 0) ? num : null });
                                                        }}
                                                        disabled={(itemEntryModes[getCartItemKey(item)] || 'amount') === 'amount'}
                                                        aria-disabled={(itemEntryModes[getCartItemKey(item)] || 'amount') === 'amount'}
                                                        className={`w-24 px-2 py-1 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-400 ${((itemEntryModes[getCartItemKey(item)] || 'amount') === 'amount') ? 'border-gray-100 bg-gray-50 text-gray-400' : 'border-gray-200'}`}
                                                    />
                                                    <span className="text-xs text-gray-500">{item.product.unitPricing.displayUnit}</span>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <label className="text-xs text-gray-500">Amount</label>
                                                    <span className="text-xs text-gray-400">{UserSession?.getCurrency()}</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        placeholder={`e.g. 100`}
                                                        value={unitBaseAmounts[getCartItemKey(item)] ?? ''}
                                                        onChange={(e) => onUnitBaseAmountChange(item, e.target.value)}
                                                        onBlur={() => {
                                                            const key = getCartItemKey(item);
                                                            const v = unitBaseAmounts[key];
                                                            const num = v === '' ? null : Number(v);
                                                            persistItemOverride(item, { amount: (num != null && !isNaN(num) && num >= 0) ? num : null });
                                                        }}
                                                        disabled={(itemEntryModes[getCartItemKey(item)] || 'amount') === 'units'}
                                                        aria-disabled={(itemEntryModes[getCartItemKey(item)] || 'amount') === 'units'}
                                                        className={`w-24 px-2 py-1 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-red-400 ${((itemEntryModes[getCartItemKey(item)] || 'amount') === 'units') ? 'border-gray-100 bg-gray-50 text-gray-400' : 'border-gray-200'}`}
                                                    />
                                                </div>
                                                {(() => {
                                                    const key = getCartItemKey(item);
                                                    const unitsVal = unitAmounts[key];
                                                    const units = unitsVal === '' ? NaN : Number(unitsVal);
                                                    const amtVal = unitBaseAmounts[key];
                                                    const amount = amtVal === '' ? NaN : Number(amtVal);
                                                    const ppu = Number(item.product.unitPricing.pricePerUnit);
                                                    if (!isNaN(amount) && amount > 0) {
                                                        const inferredUnits = !isNaN(ppu) && ppu > 0 ? (amount / ppu) : null;
                                                        return (
                                                            <div className="text-[10px] text-gray-500">
                                                                Using amount {UserSession?.getCurrency()}{amount.toFixed(2)}{inferredUnits != null ? ` ≈ ${inferredUnits.toFixed(2)} ${item.product.unitPricing.displayUnit}` : ''}
                                                            </div>
                                                        );
                                                    }
                                                    if (!isNaN(units) && units > 0 && !isNaN(ppu) && ppu > 0) {
                                                        const calc = ppu * units;
                                                        return (
                                                            <div className="text-[10px] text-gray-500">
                                                                Using {units} {item.product.unitPricing.displayUnit} → {UserSession?.getCurrency()}{calc.toFixed(2)} base
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                <div className="text-[10px] text-gray-400">Original price: {UserSession?.getCurrency()}{(item?.variant?.price ?? item.product.price).toFixed(2)}</div>
                                            </div>
                                        )}

                                        {item.product.veg !== undefined && (
                                            <div className="mt-1">
                                                <span className={`inline-block w-4 h-4 border ${item.product.veg ? 'border-green-500' : 'border-red-500'} p-0.5 rounded-sm`}>
                                                    <span className={`block w-full h-full rounded-sm ${item.product.veg ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="font-medium text-right whitespace-nowrap text-red-600">
                                        {(() => {
                                            const base = getEffectiveBasePriceForItem(item);
                                            const addons = item.addons ? item.addons.reduce((sum, addon) => sum + addon.price, 0) : 0;
                                            const total = (base + addons) * item.quantity;
                                            return `${UserSession?.getCurrency()}${total.toFixed(2)}`;
                                        })()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Instructions */}
                    <div className="px-4 pb-4">
                        <h3 className="font-medium text-gray-700 mb-2">Special Instructions</h3>
                        <textarea
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder="Add any special instructions here"
                            className="w-full p-3 border border-gray-200 rounded-lg resize-none text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                            rows="2"
                            maxLength={300}
                        />
                    </div>
                </div>

                {/* Order summary - Scrollable section */}
                <div className="bg-white border-t shadow-md overflow-y-auto max-h-[55vh]" style={{ backgroundColor: "#fff8f8", scrollbarWidth: 'thin' }}>
                    <div className="p-4">
                        {/* Product Summary List */}
                        <div className="space-y-2 mb-4">
                            {Object.values(cart).map((item, index) => (
                                <div key={index} className="flex items-center justify-between text-base">
                                    <div className="flex items-center space-x-2">
                                        <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                            {item.product.imgs && item.product.imgs.length > 0 ? (
                                                <img
                                                    src={item.product.imgs[0]}
                                                    alt={item.product.title}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        e.target.onerror = null;
                                                        e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="%23ccc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <i className="ph ph-image text-gray-400 text-sm" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-900 text-lg">
                                                {formatProductTitle(item)}
                                                {((item.freeItem === true && (item.freeItemSource === 'birthday' || !item.freeItemSource)) || (item.product && (item.product.freeItem === true || item.product.freeItemSource === 'birthday')) || item.birthdayBenefit) && (
                                                    <span className="ml-2 inline-block px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">Birthday</span>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-500">
                                                {UserSession?.getCurrency()}{getEffectiveBasePriceForItem(item).toFixed(2)}
                                                {item.addons && item.addons.length > 0 && (
                                                    <span> • {item.addons.map(addon => addon.name).join(', ')}</span>
                                                )}
                                            </div>
                                            {item.product?.unitPricing?.enabled && item.product?.unitPricing?.displayUnit && item.product?.unitPricing?.pricePerUnit > 0 && (
                                                <div className="text-sm text-blue-600">
                                                    {UserSession?.getCurrency()}{Number(item.product.unitPricing.pricePerUnit).toFixed(2)} / {item.product.unitPricing.displayUnit}
                                                </div>
                                            )}
                                            {(() => {
                                                const key = getCartItemKey(item);
                                                const unitsVal = unitAmounts[key];
                                                const units = unitsVal === '' ? NaN : Number(unitsVal);
                                                if (!isNaN(units) && units > 0) {
                                                    return (
                                                        <div className="text-[10px] text-gray-500">Units: {units} {item.product.unitPricing?.displayUnit || ''}</div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-gray-600 font-medium text-lg">{item.quantity}</span>
                                        {item.product.veg !== undefined && (
                                            <span className={`inline-block w-4 h-4 border ${item.product.veg ? 'border-green-500' : 'border-red-500'} p-0.5 rounded-sm`}>
                                                <span className={`block w-full h-full rounded-sm ${item.product.veg ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-lg">
                                <span className="text-gray-600">{t('subTotal')}</span>
                                <span className="font-medium">{UserSession?.getCurrency()}{cartSubTotal.toFixed(2)}</span>
                            </div>

                            {/* Charges */}
                            {calculatedCharges && calculatedCharges.length > 0 && (
                                <div className="flex justify-between text-gray-600 text-base">
                                    <span>Tax & Charges</span>
                                    <div className="text-right">
                                        {calculatedCharges.map((charge, index) => (
                                            <div key={index} className="font-medium">
                                                {charge.displayName}: {UserSession?.getCurrency()}{charge.calculatedAmount.toFixed(2)}
                                                {charge.isInclusive && (
                                                    <span className="text-xs text-green-600 ml-1">(included)</span>
                                                )}
                                            </div>
                                        ))}
                                        {/* Add explanatory text for inclusive charges */}
                                        {calculatedCharges.some(charge => charge.isInclusive) && (
                                            <div className="text-xs text-green-600 mt-1 italic">
                                                * Inclusive charges are already included in the price
                                            </div>
                                        )}
                                        {calculatedCharges.some(charge => charge.bulkTaxHashtag) && (
                                            <div className="text-sm text-blue-500 mt-1">
                                                Bulk Tax Update Applied
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {discount > 0 && !(Number(orderMeta?.loyaltyPointsUsed || recentRedeem?.points || 0) > 0) && (
                                <div className="flex justify-between text-green-600 text-lg">
                                    <span>Discount</span>
                                    <span className="font-medium">- {UserSession?.getCurrency()}{discount.toFixed(2)}</span>
                                </div>
                            )}

                            {/* Charges Summary removed - avoid duplicating tax lines in checkout UI */}

                            {/* Always show redeemed points field (default to 0 when none) */}
                            {/* Show estimated earned points unless loyalty was used to pay */}
                            <div className="flex justify-between text-sm mt-2">
                                <span className="text-gray-600">Points to be earned</span>
                                <span className="font-medium text-gray-900">
                                    {loyaltyUsed ? 'No points (paid with loyalty)' : `${Number(estimatedEarnedPoints || 0)} pts`}
                                </span>
                            </div>

                            {/* Removed: Total (with tax) per request */}

                            {/* For order details (not checkout), show tax and total-with-tax breakdown */}
                            {!checkout && (
                                <>
                                    {/* Total Tax (if any) and breakdown is shown elsewhere; show summary here */}
                                    {(calculatedCharges && calculatedCharges.length > 0) && (
                                        (() => {
                                            // compute tax sum from calculatedCharges (names like CGST/SGST/Tax)
                                            const totalTax = (calculatedCharges || []).reduce((s, c) => {
                                                try {
                                                    const name = (c && (c.displayName || c.name || '') || '').toString();
                                                    if (/cgst|sgst|tax/i.test(name)) return s + (Number(c.calculatedAmount || c.amount || 0) || 0);
                                                    return s;
                                                } catch (e) { return s; }
                                            }, 0);
                                            const totalWithTax = (Number(cartSubTotal || 0) - Number(discount || 0)) + Number(totalTax || 0);

                                            return (
                                                <>
                                                    <div className="flex justify-between text-sm mt-1">
                                                        <span className="text-blue-600">Total Tax</span>
                                                        <span className="font-medium text-blue-600">{UserSession?.getCurrency()}{totalTax.toFixed(2)}</span>
                                                    </div>

                                                    {/* Total with tax: subtotal - discount + tax */}
                                                    <div className="flex justify-between text-sm mt-1">
                                                        <span className="text-gray-600">Total (with tax)</span>
                                                        <span className="font-medium text-gray-900">{UserSession?.getCurrency()}{totalWithTax.toFixed(2)}</span>
                                                    </div>
                                                </>
                                            );
                                        })()
                                    )}
                                </>
                            )}

                            {/* Always show redeemed points and grand total (checkout and order details) */}
                            <div className="flex justify-between text-sm mt-1">
                                <span className="text-gray-600">Redeemed Points</span>
                                <span className="font-medium text-gray-900">
                                    {loyaltyUsed ? `${loyaltyPointsFromOrderOrRecent} pts` : `0 pts`}&nbsp;
                                    <span className="text-gray-500">(- {UserSession?.getCurrency()}{(Number(loyaltyAppliedAmount || 0)).toFixed(2)})</span>
                                </span>
                            </div>

                            <div className="border-t border-gray-200 pt-2 flex justify-between mt-2">
                                <span className="font-semibold text-xl">{t('grandTotal')}</span>
                                <span className="font-bold text-xl text-red-600">
                                    {UserSession?.getCurrency()}{(() => {
                                        // Recompute tax sum from calculatedCharges to match the Total (with tax) row above
                                        const totalTax = (calculatedCharges || []).reduce((s, c) => {
                                            try {
                                                const name = (c && (c.displayName || c.name || '') || '').toString();
                                                if (/cgst|sgst|tax/i.test(name)) return s + (Number(c.calculatedAmount || c.amount || 0) || 0);
                                            } catch (e) { /* ignore */ }
                                            return s;
                                        }, 0);
                                        const totalWithTax = (Number(cartSubTotal || 0) - Number(discount || 0)) + Number(totalTax || 0);
                                        const la = Number(loyaltyAppliedAmount || 0);
                                        return Math.max(0, totalWithTax - la).toFixed(2);
                                    })()}
                                </span>

                                {/* <span className="font-bold text-xl text-red-600">{UserSession?.getCurrency()}{cartTotal.toFixed(2)}</span> */}
                            </div>
                        </div>

                        {/* Print Status Indicator */}
                        <div className="mt-2 flex items-center justify-center text-xs text-gray-500">
                            <i className={`ph ${autoPrint ? 'ph-printer' : 'ph-printer-off'} mr-1`}></i>
                            <span>{autoPrint ? "Auto-print enabled" : t('printingIsOptional')}</span>
                        </div>

                        {/* Customer Section */}
                        <div className="mt-4">
                            {customer ? (
                                <div className="bg-red-50 rounded-lg mb-3 overflow-hidden">
                                    <div className="flex items-start p-3">
                                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                                            <i className="ph ph-user text-red-600"></i>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {!isEditingCustomerName ? (
                                                <div className="flex items-center gap-3">
                                                    <div className="font-medium text-gray-900 truncate">{customer.name}</div>
                                                    <button
                                                        onClick={() => { setIsEditingCustomerName(true); setEditCustomerName(customer.name || ''); setEditCustomerPhone(customer.phone || ''); setTimeout(() => { try { editNameInputRef.current && editNameInputRef.current.focus(); editNameInputRef.current.select && editNameInputRef.current.select(); } catch (err) { /* ignore */ } }, 50); }}
                                                        className="px-3 py-1 bg-white border border-gray-200 rounded-md hover:bg-gray-50 text-gray-700 shadow-sm text-sm font-medium"
                                                        title="Edit customer"
                                                        aria-label="Edit customer"
                                                    >
                                                        EDIT
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        ref={editNameInputRef}
                                                        type="text"
                                                        value={editCustomerName}
                                                        onChange={(e) => setEditCustomerName(e.target.value)}
                                                        className="px-3 py-1 border rounded w-56"
                                                    />
                                                    <input
                                                        ref={editPhoneInputRef}
                                                        type="tel"
                                                        value={editCustomerPhone}
                                                        onChange={(e) => setEditCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                                                        placeholder="Phone"
                                                        className="px-3 py-1 border rounded w-40"
                                                    />
                                                    <button
                                                        onClick={async (e) => {
                                                            e && e.preventDefault();
                                                            const newName = (editCustomerName || '').trim();
                                                            const newPhoneRaw = (editCustomerPhone || '').trim();
                                                            const newPhone = newPhoneRaw.replace(/\D/g, '');
                                                            if (!newName) { showToast('Name cannot be empty', 'error'); return; }
                                                            if (!newPhone) { showToast('Phone cannot be empty', 'error'); return; }
                                                            if (!/^[0-9]{10,}$/.test(newPhone)) { showToast('Please enter a valid phone number', 'error'); return; }
                                                            try {
                                                                if (customer && customer.id) {
                                                                    await sdk.db.collection('Customers').doc(customer.id).update({ name: newName, phone: newPhone });
                                                                    try { await propagateCustomerUpdate(customer.id, { name: newName, phone: newPhone }); } catch (e) { console.warn('propagateCustomerUpdate failed', e); }
                                                                }
                                                                setCustomer(prev => ({ ...prev, name: newName, phone: newPhone }));
                                                                setIsEditingCustomerName(false);
                                                                showToast('Customer updated', 'success');
                                                            } catch (err) {
                                                                console.error('Failed to update customer', err);
                                                                showToast('Failed to update customer', 'error');
                                                            }
                                                        }}
                                                        className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => { setIsEditingCustomerName(false); setEditCustomerName(customer.name || ''); setEditCustomerPhone(customer.phone || ''); }}
                                                        className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            )}

                                            {customer.phone && (
                                                <div className="text-sm text-gray-600 flex items-center mt-0.5">
                                                    <i className="ph ph-phone text-xs mr-1.5"></i>
                                                    {customer.phone}
                                                </div>
                                            )}
                                            {/* Loyalty summary inserted here (system UI style) */}
                                            {loyaltyData && (
                                                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
                                                    <div className="flex items-start gap-4">
                                                        <div className="flex-1">
                                                            <div className="text-sm text-gray-600">Loyalty Points</div>
                                                            <div className="text-2xl font-extrabold text-gray-900">{loyaltyData.available}</div>

                                                            {/* Earn-on-spend summary removed per request */}
                                                        </div>

                                                        <div className="text-right min-w-[140px]">
                                                            {(loyaltyData.birthdayEligible && birthdayRuleActive) ? (
                                                                <div className="text-sm text-green-600 font-medium">Birthday benefit available</div>
                                                            ) : null}
                                                            <div className="text-xs text-gray-500 mt-1">Redeem after {loyaltyData.redeemThreshold} pts</div>
                                                        </div>
                                                    </div>

                                                    <div className="mt-3 flex flex-wrap items-center gap-3">
                                                        <button
                                                            onClick={() => {
                                                                if (!loyaltyData || loyaltyData.available < loyaltyData.redeemThreshold) {
                                                                    showToast(`Customer needs ${loyaltyData.redeemThreshold} points to redeem`, 'error');
                                                                    return;
                                                                }

                                                                // Use a unique modal id to avoid id collisions and to reliably find buttons
                                                                const modalId = 'confirm-redeem-' + Date.now();
                                                                // Build confirmation modal with namespaced button ids
                                                                const modalHtml = `
                                                                    <div class="p-4">
                                                                        <p class="text-gray-700 mb-3">Confirm redeeming points for customer <strong>${customer.name}</strong>.</p>
                                                                        <p class="text-sm text-gray-600 mb-4">Enter how many points to redeem (1 point = ₹1). Max available: <strong>${loyaltyData.available}</strong>. Order total: <strong>${UserSession?.getCurrency()}${cartTotal.toFixed(2)}</strong></p>
                                                                        <div class="mb-3">
                                                                            <label class="text-sm text-gray-600">Points to use</label>
                                                                            <input id="${modalId}-points" type="number" min="0" max="${loyaltyData.available}" value="${Math.min(loyaltyData.available, Math.floor(cartTotal))}" class="w-full mt-1 px-3 py-2 border rounded" />
                                                                        </div>
                                                                        <div class="text-sm text-gray-600 mb-2">This will deduct points from the customer's balance and apply an equal discount to the order.</div>
                                                                        <div class="flex gap-2 mt-4">
                                                                            <button id="${modalId}-confirm" class="px-4 py-2 bg-red-500 text-white rounded-lg">Confirm</button>
                                                                            <button id="${modalId}-cancel" class="px-4 py-2 bg-gray-200 rounded-lg">Cancel</button>
                                                                        </div>
                                                                    </div>
                                                                `;

                                                                const confirmModal = ModalManager.createCenterModal({
                                                                    id: modalId,
                                                                    title: 'Confirm Redeem',
                                                                    content: modalHtml,
                                                                    onShown: (mc) => {
                                                                        // Prefer querying inside the modal container to avoid missing elements
                                                                        const container = (mc && mc.container) ? mc.container : document;
                                                                        const confirmBtn = (container.querySelector) ? container.querySelector(`#${modalId}-confirm`) : document.getElementById(`${modalId}-confirm`);
                                                                        const cancelBtn = (container.querySelector) ? container.querySelector(`#${modalId}-cancel`) : document.getElementById(`${modalId}-cancel`);

                                                                        console.debug('[Redeem Modal] onShown - modalId:', modalId, 'container:', mc && mc.container, 'confirmBtn found:', !!confirmBtn, 'cancelBtn found:', !!cancelBtn);


                                                                        // Ensure single invocation even if multiple handlers are attached
                                                                        let invoked = false;
                                                                        const boundHandler = async (e) => {
                                                                            if (invoked) {
                                                                                console.debug('[Redeem Modal] confirm handler already invoked, ignoring duplicate');
                                                                                return;
                                                                            }
                                                                            invoked = true;
                                                                            const __startTs = Date.now();
                                                                            console.debug('[Redeem Modal] confirm handler invoked - start', { modalId, customerId: customer?.id, loyaltyPoints: loyaltyData?.available, cartTotal, ts: __startTs });
                                                                            try {
                                                                                if (confirmBtn) confirmBtn.disabled = true;
                                                                                // Read user input reliably from the modal
                                                                                const inputEl = container.querySelector(`#${modalId}-points`);
                                                                                // If the input element is present, parse and validate it. Otherwise abort.
                                                                                if (!inputEl) {
                                                                                    showToast('Points input not found in modal', 'error');
                                                                                    if (confirmBtn) confirmBtn.disabled = false;
                                                                                    return;
                                                                                }
                                                                                let pointsToUse = Number(inputEl.value);
                                                                                if (!isFinite(pointsToUse) || isNaN(pointsToUse)) {
                                                                                    showToast('Please enter a valid numeric points amount', 'error');
                                                                                    if (confirmBtn) confirmBtn.disabled = false;
                                                                                    return;
                                                                                }
                                                                                pointsToUse = Math.floor(pointsToUse || 0);
                                                                                if (pointsToUse <= 0) {
                                                                                    showToast('Please enter a points amount greater than zero', 'error');
                                                                                    if (confirmBtn) confirmBtn.disabled = false;
                                                                                    return;
                                                                                }
                                                                                // Cap points to available and order total
                                                                                const capped = Math.min(pointsToUse, loyaltyData.available, Math.floor(cartTotal));
                                                                                if (capped !== pointsToUse) {
                                                                                    console.debug('[Redeem Modal] requested points adjusted to cap', { requested: pointsToUse, capped, available: loyaltyData.available, orderMax: Math.floor(cartTotal) });
                                                                                }
                                                                                pointsToUse = capped;
                                                                                const __afterValidateTs = Date.now();
                                                                                console.debug('[Redeem Modal] input validated', { requested: pointsToUse, afterValidateMs: (__afterValidateTs - __startTs) });

                                                                                // Show message and schedule modal close + background apply after 3s
                                                                                try { showToast('Applying redeem — returning to checkout in 3s...', 'success'); } catch (e) { }

                                                                                // Cleanup listeners now to avoid duplicate handlers
                                                                                try { safeCleanup(); } catch (e) { }

                                                                                setTimeout(() => {
                                                                                    try { mc.close(); } catch (e) { }
                                                                                    (async () => {
                                                                                        try {
                                                                                            const bgStart = Date.now();
                                                                                            console.debug('[Redeem Modal] background apply starting (after 3s)', { bgStart });
                                                                                            await applyRedeemToOrder({ customerId: customer.id, points: pointsToUse, timestamp: new Date() });
                                                                                            console.debug('[Redeem Modal] background apply finished', { durationMs: Date.now() - bgStart });
                                                                                        } catch (err) {
                                                                                            console.error('applyRedeemToOrder (background) failed', err);
                                                                                            try { showToast('Failed to apply redeem (server). Changes will be reverted.', 'error'); } catch (e) { }
                                                                                            try {
                                                                                                if (sdk && sdk.db && customer && customer.id) {
                                                                                                    const latest = await sdk.db.collection('Customers').doc(customer.id).get();
                                                                                                    const latestData = (latest && latest.exists) ? (latest.data() || {}) : {};
                                                                                                    try { setCustomer(prev => ({ ...(prev || {}), loyaltyPoints: Number(latestData.loyaltyPoints || 0) })); } catch (e) { }
                                                                                                    try { const ptsObj = await computeAvailablePoints(customer.id); setLoyaltyData(ptsObj); } catch (e) { }
                                                                                                }
                                                                                            } catch (revertErr) { console.warn('Failed to revert optimistic redeem UI', revertErr); }
                                                                                        }
                                                                                    })();
                                                                                }, 3000);
                                                                            } catch (err) {
                                                                                console.error('redeem confirm failed', err);
                                                                                showToast('Failed to apply redeem', 'error');
                                                                                try { if (confirmBtn) confirmBtn.disabled = false; } catch (e) { }
                                                                            }
                                                                        };

                                                                        // Attach both an event listener and an `onclick` fallback so browsers which for
                                                                        // some reason don't preserve dynamically added listeners still execute the handler.
                                                                        let cleaned = false;
                                                                        const safeCleanup = () => {
                                                                            if (cleaned) return;
                                                                            cleaned = true;
                                                                            try { if (confirmBtn && confirmBtn.removeEventListener) confirmBtn.removeEventListener('click', boundHandler); } catch (e) { }
                                                                            try { if (cancelBtn && cancelBtn.removeEventListener) cancelBtn.removeEventListener('click', cancelHandler); } catch (e) { }
                                                                            try { container.removeEventListener('click', delegation); } catch (e) { }
                                                                            try { if (confirmBtn) confirmBtn.onclick = null; } catch (e) { }
                                                                        };

                                                                        const cancelHandler = () => { try { mc.close(); } catch (e) { } };

                                                                        if (confirmBtn) {
                                                                            try { confirmBtn.addEventListener('click', boundHandler); } catch (e) { console.warn('addEventListener(confirm) failed', e); }
                                                                            try { confirmBtn.onclick = boundHandler; } catch (e) { /* non-fatal */ }
                                                                        }

                                                                        if (cancelBtn) {
                                                                            try { cancelBtn.addEventListener('click', cancelHandler); } catch (e) { console.warn('addEventListener(cancel) failed', e); }
                                                                            try { cancelBtn.onclick = cancelHandler; } catch (e) { /* non-fatal */ }
                                                                        }

                                                                        // Fallback: delegation on the container in case direct binding misses
                                                                        const delegation = (ev) => {
                                                                            const target = ev.target;
                                                                            if (!target) return;
                                                                            const clickedConfirm = target.closest && target.closest(`#${modalId}-confirm`);
                                                                            if (clickedConfirm) {
                                                                                try { safeCleanup(); } catch (e) { }
                                                                                boundHandler(ev);
                                                                            }
                                                                            const clickedCancel = target.closest && target.closest(`#${modalId}-cancel`);
                                                                            if (clickedCancel) {
                                                                                try { safeCleanup(); } catch (e) { }
                                                                                mc.close();
                                                                            }
                                                                        };

                                                                        // Attach delegation after a tick (safe fallback)
                                                                        setTimeout(() => {
                                                                            try { container.addEventListener('click', delegation); console.debug('[Redeem Modal] delegation attached for', modalId); } catch (e) { console.warn('Failed to attach delegation for', modalId, e); }
                                                                        }, 0);
                                                                    }
                                                                });
                                                            }}
                                                            className={`px-4 py-2 rounded-lg text-white text-sm font-medium ${loyaltyData.available >= loyaltyData.redeemThreshold ? '' : 'opacity-60 cursor-not-allowed'}`}
                                                            style={(() => {
                                                                if (!(loyaltyData && loyaltyData.available >= loyaltyData.redeemThreshold)) return { backgroundColor: '#E0E0E0', color: '#777' };
                                                                const base = { backgroundColor: '#F44336' };
                                                                if (hoveredLoyaltyBtn === 'redeem') return { ...base, backgroundColor: '#D32F2F' };
                                                                return base;
                                                            })()}
                                                            onMouseEnter={() => setHoveredLoyaltyBtn('redeem')}
                                                            onMouseLeave={() => setHoveredLoyaltyBtn(null)}
                                                            disabled={!(loyaltyData.available >= loyaltyData.redeemThreshold)}
                                                        >
                                                            Redeem
                                                        </button>

                                                        {/* Always show Free Item button but disable when ineligible. */}
                                                        {(() => {
                                                            // Determine birthday eligibility: prefer loyaltyData when available,
                                                            // otherwise fall back to customer record fields (birthday/dob/birthdate).
                                                            const hasCustomer = Boolean(customer && customer.id);
                                                            const ldBirthday = Boolean(loyaltyData && loyaltyData.birthdayEligible);

                                                            const customerBirthdayField = (customer && (customer.birthday || customer.dob || customer.birthdate));
                                                            const isCustomerBirthday = (() => {
                                                                try {
                                                                    if (!customerBirthdayField) return false;
                                                                    // Normalize to Date when possible
                                                                    let d = null;
                                                                    if (customerBirthdayField instanceof Date) d = customerBirthdayField;
                                                                    else if (typeof customerBirthdayField === 'number' && !isNaN(customerBirthdayField)) d = new Date(customerBirthdayField);
                                                                    else {
                                                                        const s = String(customerBirthdayField).trim();
                                                                        const iso = new Date(s);
                                                                        if (!isNaN(iso.getTime())) d = iso;
                                                                        else {
                                                                            const m = s.match(/^(\d{1,2})[\/\-]?(\d{1,2})[\/\-]?(\d{2,4})$/);
                                                                            if (m) {
                                                                                let day = parseInt(m[1], 10);
                                                                                let month = parseInt(m[2], 10);
                                                                                let year = parseInt(m[3], 10);
                                                                                if (year < 100) year += (year > 30 ? 1900 : 2000);
                                                                                if (year > 31) {
                                                                                    const y = day; day = month; month = year; year = y;
                                                                                }
                                                                                d = new Date(year, month - 1, day);
                                                                            }
                                                                        }
                                                                    }
                                                                    if (!d || isNaN(d.getTime())) return false;
                                                                    const today = new Date();
                                                                    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth();
                                                                } catch (e) { return false; }
                                                            })();

                                                            const isEligible = hasCustomer && birthdayRuleActive && (ldBirthday || isCustomerBirthday);

                                                            return (
                                                                <button
                                                                    onClick={async () => {
                                                                        try {
                                                                            if (!isEligible) return;
                                                                            // Keep backward-compatible events
                                                                            try { window.dispatchEvent(new CustomEvent('giveBirthdayFreeItem', { detail: { customerId: customer.id } })); } catch (e) { }
                                                                            try { window.dispatchEvent(new CustomEvent('giveBirthdayFreeDessert', { detail: { customerId: customer.id } })); } catch (e) { }

                                                                            // Inline free-item chooser (persisted-first, single-select)
                                                                            if (!sdk || !sdk.db) { showToast('Database unavailable', 'error'); return; }

                                                                            // load persisted free items
                                                                            let persisted = [];
                                                                            try {
                                                                                const doc = await sdk.db.collection('LoyaltyRules').doc('rule_birthday').get();
                                                                                if (doc && doc.exists) {
                                                                                    const d = doc.data ? doc.data() : (doc._data || {});
                                                                                    persisted = Array.isArray(d.freeItems) ? d.freeItems.map(fi => ({ pid: fi.pid, title: fi.title || '' })) : [];
                                                                                }
                                                                            } catch (e) { persisted = []; }

                                                                            // fetch menu products (small sample)
                                                                            const menu = [];
                                                                            try { const snap = await sdk.db.collection('Products').limit(50).get(); snap.docs.forEach(d => menu.push({ id: d.id, ...(d.data ? d.data() : {}) })); } catch (e) { }

                                                                            const resolvedPersisted = [];
                                                                            for (const p of persisted) {
                                                                                try {
                                                                                    const pdoc = await sdk.db.collection('Products').doc(p.pid).get();
                                                                                    if (pdoc && pdoc.exists) resolvedPersisted.push({ pid: p.pid, ...(pdoc.data ? pdoc.data() : {}), exists: true });
                                                                                    else resolvedPersisted.push({ pid: p.pid, title: p.title || 'Untitled', exists: false, _persistedFallback: true });
                                                                                } catch (e) { resolvedPersisted.push({ pid: p.pid, title: p.title || 'Untitled', exists: false, _persistedFallback: true }); }
                                                                            }

                                                                            const otherProducts = menu.filter(m => !resolvedPersisted.find(r => r.pid === m.id)).slice(0, 40);

                                                                            const persistedHtml = resolvedPersisted.length ? `
                                                                                <div class="mb-2 text-sm font-medium">Previously saved</div>
                                                                                ${resolvedPersisted.map(r => `
                                                                                    <div class="flex items-center justify-between p-2 border-b" data-pid="${r.pid}">
                                                                                        <label class="flex items-center gap-3 min-w-0">
                                                                                            <input type="radio" name="choose-free-item" data-pid="${r.pid}" data-title="${(r.title || '').replace(/</g, '&lt;')}" />
                                                                                            <div class="truncate text-sm">${(r.title || 'Untitled').replace(/</g, '&lt;')}${r._persistedFallback ? ' <span class="text-xs text-gray-400">(archived)</span>' : ''}</div>
                                                                                        </label>
                                                                                        <div class="text-xs text-gray-500">₹${Number(r.price || 0).toFixed(2)}</div>
                                                                                    </div>
                                                                                `).join('')}
                                                                            ` : '';

                                                                            const othersHtml = otherProducts.length ? `
                                                                                <div class="mt-3 mb-2 text-sm font-medium">Add more from menu</div>
                                                                                ${otherProducts.map(p => `
                                                                                    <div class="flex items-center justify-between p-2 border-b" data-pid="${p.id}">
                                                                                        <label class="flex items-center gap-3 min-w-0">
                                                                                            <input type="radio" name="choose-free-item" data-pid="${p.id}" data-title="${(p.title || p.name || '').replace(/</g, '&lt;')}" />
                                                                                            <div class="truncate text-sm">${(p.title || p.name || 'Untitled').replace(/</g, '&lt;')}</div>
                                                                                        </label>
                                                                                        <div class="text-xs text-gray-500">₹${Number(p.price || p.basePrice || 0).toFixed(2)}</div>
                                                                                    </div>
                                                                                `).join('')}
                                                                            ` : '';

                                                                            const html = `
                                                                                <div class="space-y-3">
                                                                                    <p class="text-sm text-gray-600">Select one free item to add to the order. It will be added with price ₹0.00.</p>
                                                                                    <div style="max-height:320px; overflow:auto;" id="free-items-chooser">
                                                                                        ${persistedHtml}
                                                                                        ${othersHtml}
                                                                                    </div>
                                                                                </div>
                                                                            `;

                                                                            const modal = ModalManager.createCenterModal({
                                                                                id: 'choose-birthday-free-' + Date.now(),
                                                                                title: 'Choose Free Item - Birthday',
                                                                                content: html,
                                                                                actions: `<div class="flex gap-2"><button id="free-add-save" class="py-2 px-3 bg-green-600 text-white rounded">Add to order</button><button id="free-add-cancel" class="py-2 px-3 bg-gray-200 rounded">Cancel</button></div>`,
                                                                                size: 'md',
                                                                                onShown: (mc) => {
                                                                                    try {
                                                                                        const container = mc && mc.container ? mc.container : document;
                                                                                        const saveBtn = container.querySelector('#free-add-save');
                                                                                        const cancelBtn = container.querySelector('#free-add-cancel');
                                                                                        if (cancelBtn) cancelBtn.addEventListener('click', () => mc.close());
                                                                                        if (saveBtn) {
                                                                                            saveBtn.addEventListener('click', async () => {
                                                                                                try {
                                                                                                    const selected = container.querySelector('input[name="choose-free-item"]:checked');
                                                                                                    if (!selected) { showToast('Select a free item', 'error'); return; }
                                                                                                    const pid = selected.getAttribute('data-pid');
                                                                                                    let title = selected.getAttribute('data-title') || '';
                                                                                                    try {
                                                                                                        const pdoc = await sdk.db.collection('Products').doc(pid).get();
                                                                                                        if (pdoc && pdoc.exists) {
                                                                                                            const pdata = pdoc.data ? pdoc.data() : (pdoc._data || {});
                                                                                                            title = pdata.title || pdata.name || title || 'Free Item';
                                                                                                        }
                                                                                                    } catch (e) { }

                                                                                                    const freeLine = { pid, title: title || 'Free Item', price: 0, basePrice: 0, qnt: 1, quantity: 1, freeItem: true, freeItemSource: 'birthday' };
                                                                                                    // Prefer persisting to the active order document when we have an orderId
                                                                                                    try {
                                                                                                        if (orderId && sdk && sdk.db) {
                                                                                                            const orderRef = sdk.db.collection('Orders').doc(orderId);
                                                                                                            const docSnap = await orderRef.get();
                                                                                                            const od = (docSnap && docSnap.exists) ? (docSnap.data() || {}) : {};
                                                                                                            const items = Array.isArray(od.items) ? od.items.slice() : [];
                                                                                                            items.push(freeLine);

                                                                                                            // update birthdayFreeItemsUsed as well (best-effort)
                                                                                                            const used = Array.isArray(od.birthdayFreeItemsUsed) ? od.birthdayFreeItemsUsed.slice() : [];
                                                                                                            used.push({ pid, ts: new Date() });

                                                                                                            const sanitize = (val) => {
                                                                                                                if (typeof val === 'undefined' || val === null) return null;
                                                                                                                if (Array.isArray(val)) return val.map(sanitize);
                                                                                                                if (typeof val === 'object') {
                                                                                                                    const out = {};
                                                                                                                    for (const k of Object.keys(val)) {
                                                                                                                        try { out[k] = sanitize(val[k]); } catch (e) { out[k] = null; }
                                                                                                                    }
                                                                                                                    return out;
                                                                                                                }
                                                                                                                return val;
                                                                                                            };

                                                                                                            await orderRef.update({ items: sanitize(items), birthdayFreeItemsUsed: sanitize(used) });
                                                                                                            try { window.dispatchEvent(new CustomEvent('orderUpdated', { detail: { orderId: orderId, type: 'free-item', item: pid } })); } catch (e) { }
                                                                                                        } else if (typeof checkout === 'object' && typeof checkout.addItem === 'function') {
                                                                                                            // fallback to internal API
                                                                                                            checkout.addItem(freeLine);
                                                                                                        } else if (typeof cart !== 'undefined' && Array.isArray(cart.items)) {
                                                                                                            cart.items.push(freeLine);
                                                                                                        }
                                                                                                    } catch (e) { console.warn('Failed to add free line to cart/order', e); }

                                                                                                    showToast('Free item added to order', 'success');
                                                                                                    mc.close();
                                                                                                } catch (err) { console.error(err); showToast('Failed to add free item', 'error'); }
                                                                                            });
                                                                                        }
                                                                                    } catch (e) { console.warn('free items chooser onShown failed', e); }
                                                                                }
                                                                            });
                                                                        } catch (e) { console.warn('free item click handler failed', e); }
                                                                    }}
                                                                    className={`px-3 py-2 rounded-lg text-sm font-medium ${isEligible ? 'text-white' : 'text-gray-400'}`}
                                                                    style={(() => {
                                                                        if (!isEligible) return { backgroundColor: '#F0F0F0', cursor: 'not-allowed' };
                                                                        return hoveredLoyaltyBtn === 'free' ? { backgroundColor: '#D32F2F', color: '#fff' } : { backgroundColor: '#F44336', color: '#fff' };
                                                                    })()}
                                                                    onMouseEnter={() => setHoveredLoyaltyBtn(isEligible ? 'free' : null)}
                                                                    onMouseLeave={() => setHoveredLoyaltyBtn(null)}
                                                                    disabled={!isEligible}
                                                                    title={isEligible ? 'Give free item to customer' : 'Customer not eligible for birthday free item'}
                                                                >
                                                                    Free Item
                                                                </button>
                                                            );
                                                        })()}

                                                        {/* Discount button removed as requested */}
                                                    </div>

                                                    {typeof customer.balance === 'number' && customer.balance < 0 && (
                                                        <div className="mt-3 text-sm text-red-600">
                                                            <i className="ph ph-currency-circle-dollar text-xs mr-1.5"></i>
                                                            Previous Due: {UserSession?.getCurrency()}{Math.abs(customer.balance).toFixed(2)}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => { try { handleRemoveCustomer(); } catch (e) { } }}
                                            className="p-1.5 rounded-full hover:bg-red-100 text-red-600 transition-colors"
                                            title="Remove customer"
                                        >
                                            <i className="ph ph-x"></i>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="mb-3">
                                    {/* Search Input */}
                                    <div className="relative mb-2">
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            placeholder={t('searchCustomersByNameOrPhone')}
                                            value={customerSearch}
                                            onChange={(e) => {
                                                setCustomerSearch(e.target.value);
                                                debouncedSearchCustomers(e.target.value);
                                            }}
                                            onKeyDown={handleCustomerSearchKey}
                                            onFocus={() => {
                                                // Load recent customers when focused
                                                if (customersList.length === 0) {
                                                    loadRecentCustomers();
                                                }
                                            }}
                                            onBlur={(e) => {
                                                // Small delay to allow for click events on the popup
                                                setTimeout(() => {
                                                    // Check if focus moved to the popup or another element within the search area
                                                    const relatedTarget = e.relatedTarget;
                                                    const isFocusInPopup = relatedTarget && relatedTarget.closest && relatedTarget.closest('.fixed.z-50.bg-white.rounded-lg.border.border-gray-200.shadow-lg');
                                                    const isFocusInSearchArea = relatedTarget && searchInputRef.current && searchInputRef.current.contains(relatedTarget);

                                                    // Only close if focus moved outside both search input and popup
                                                    if (!isFocusInPopup && !isFocusInSearchArea) {
                                                        // Don't clear the customer list here, let the click outside handler do it
                                                        // This prevents race conditions between blur and click events
                                                    }
                                                }, 150);
                                            }}
                                            className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                                        />
                                        <div className="absolute left-3 top-3.5">
                                            {isLoadingCustomers ? (
                                                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <i className="ph ph-magnifying-glass text-gray-400"></i>
                                            )}
                                        </div>
                                        <div className="absolute right-3 top-3.5 flex">
                                            {customerSearch && (
                                                <button
                                                    onClick={() => {
                                                        setCustomerSearch('');
                                                        setCustomersList([]);
                                                    }}
                                                    className="p-0.5 text-gray-400 hover:text-gray-600"
                                                >
                                                    <i className="ph ph-x"></i>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Quick Add New Customer Form - Displayed when no search results */}
                                    {customerSearch && customerSearch.length >= 2 && customersList.length === 0 && !isLoadingCustomers && (
                                        <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg">
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="text-sm font-medium text-gray-700">Add "{customerSearch}" as new customer</h4>
                                                <span className="text-xs text-red-500">* Required</span>
                                            </div>

                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-xs text-gray-600 block mb-1">
                                                        Name <span className="text-red-500">*</span>
                                                    </label>
                                                    <div className="relative">
                                                        <i className="ph ph-user absolute left-3 top-2.5 text-gray-400"></i>
                                                        <input
                                                            id="quick-customer-name"
                                                            type="text"
                                                            defaultValue={customerSearch}
                                                            placeholder="Customer name"
                                                            className="w-full pl-9 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-400"
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-xs text-gray-600 block mb-1">Phone Number</label>
                                                    <div className="relative">
                                                        <i className="ph ph-phone absolute left-3 top-2.5 text-gray-400"></i>
                                                        <input
                                                            id="quick-customer-phone"
                                                            type="tel"
                                                            placeholder="Phone number"
                                                            maxLength={10}
                                                            inputMode="numeric"
                                                            pattern="[0-9]{10}"
                                                            onInput={(e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); }}
                                                            className="w-full pl-9 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-400"
                                                        />
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        const nameInput = document.getElementById('quick-customer-name');
                                                        const phoneInput = document.getElementById('quick-customer-phone');

                                                        if (!nameInput.value.trim()) {
                                                            if (ModalManager && ModalManager.showToast) {
                                                                ModalManager.showToast("Customer name is required", { type: "error" });
                                                            } else {
                                                                showToast("Customer name is required", "error");
                                                            }
                                                            nameInput.focus();
                                                            return;
                                                        }

                                                        // Sanitize and validate phone number - now mandatory
                                                        const rawPhone = (phoneInput.value || '').trim();
                                                        const phoneSanitized = rawPhone.replace(/\D/g, '');
                                                        if (!phoneSanitized) {
                                                            if (ModalManager && ModalManager.showToast) {
                                                                ModalManager.showToast('Phone number is required', { type: 'error' });
                                                            } else {
                                                                showToast('Phone number is required', 'error');
                                                            }
                                                            phoneInput.focus();
                                                            return;
                                                        }

                                                        if (!/^[0-9]{10,}$/.test(phoneSanitized)) {
                                                            if (ModalManager && ModalManager.showToast) {
                                                                ModalManager.showToast('Please enter a valid phone number', { type: 'error' });
                                                            } else {
                                                                showToast('Please enter a valid phone number', 'error');
                                                            }
                                                            phoneInput.focus();
                                                            return;
                                                        }

                                                        // Create new customer
                                                        const newCustomer = {
                                                            name: nameInput.value.trim(),
                                                            phone: phoneSanitized,
                                                            balance: 0,
                                                            createdAt: new Date(),
                                                            lastPurchase: new Date(),
                                                            sellerId: UserSession?.seller?.id
                                                        };

                                                        // Check if customer with this phone number already exists
                                                        isPhoneNumberExists(phoneSanitized)
                                                            .then((phoneExists) => {
                                                                if (phoneExists) {
                                                                    if (ModalManager && ModalManager.showToast) {
                                                                        ModalManager.showToast("This Phone number already exists for a customer ! Please try another number.", { type: 'error' });
                                                                    } else {
                                                                        showToast("This Phone number already exists for a customer ! Please try another number.", 'error');
                                                                    }
                                                                    throw new Error('Phone number already exists');
                                                                }

                                                                // Add to Firestore
                                                                return sdk.db.collection("Customers").add(newCustomer);
                                                            })
                                                            .then(docRef => {
                                                                // Set as selected customer
                                                                setCustomer({
                                                                    ...newCustomer,
                                                                    id: docRef.id
                                                                });

                                                                if (ModalManager && ModalManager.showToast) {
                                                                    ModalManager.showToast("New customer added", { type: "success" });
                                                                } else {
                                                                    showToast("New customer added", "success");
                                                                }

                                                                setCustomerSearch('');
                                                                setCustomersList([]);
                                                                // Notify other parts of the app that a customer was added from checkout
                                                                try { window.dispatchEvent(new CustomEvent('customerAdded', { detail: { id: docRef.id, ...newCustomer } })); } catch (e) { console.warn('customerAdded dispatch failed', e); }
                                                            })
                                                            .catch(error => {
                                                                // Don't show error if it's the phone number duplicate error (already shown)
                                                                if (error.message === 'Phone number already exists') {
                                                                    return;
                                                                }
                                                                console.error("Error adding customer:", error);
                                                                if (ModalManager && ModalManager.showToast) {
                                                                    ModalManager.showToast("Failed to add customer", { type: "error" });
                                                                } else {
                                                                    showToast("Failed to add customer", "error");
                                                                }
                                                            });
                                                    }}
                                                    className="w-full py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
                                                >
                                                    <i className="ph ph-user-plus mr-2"></i>
                                                    Add Customer
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Autocomplete Results */}
                                    {(customersList.length > 0 || (customerSearch === '' && isLoadingCustomers)) && (
                                        <div
                                            id="customer-search-popup"
                                            className="fixed z-50 bg-white rounded-lg border border-gray-200 shadow-lg max-h-60 overflow-y-auto"
                                            style={{
                                                top: dropdownPosition.top,
                                                left: dropdownPosition.left,
                                                width: dropdownPosition.width,
                                                maxHeight: '200px'
                                            }}
                                        >
                                            {isLoadingCustomers ? (
                                                <div className="p-4 text-center text-gray-500">
                                                    <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin mx-auto mb-1"></div>
                                                    <div className="text-sm">Loading customers...</div>
                                                </div>
                                            ) : (
                                                <>
                                                    {customersList.map(cust => (
                                                        <div
                                                            key={cust.id}
                                                            className="p-2 hover:bg-red-50 cursor-pointer border-b border-gray-100 flex items-center"
                                                            onClick={() => {
                                                                setCustomer(cust);
                                                                try { setLoyaltyData({ available: Number(cust.loyaltyPoints || 0) || 0, earned: 0, redeemed: 0, birthdayEligible: false, redeemThreshold: 50 }); } catch (e) { }
                                                                setCustomerSearch('');
                                                                setCustomersList([]);
                                                            }}
                                                            onMouseDown={(e) => {
                                                                // Prevent blur event from closing the popup before click handling
                                                                e.preventDefault();
                                                            }}
                                                        >
                                                            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mr-2">
                                                                <i className="ph ph-user text-gray-500"></i>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-medium text-gray-800">{cust.name}</div>
                                                                <div className="flex items-center justify-between">
                                                                    <div className="text-sm text-gray-500 flex items-center">
                                                                        {cust.phone && (
                                                                            <span className="flex items-center mr-2">
                                                                                <i className="ph ph-phone text-xs mr-1"></i>
                                                                                {cust.phone}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        {typeof cust.loyaltyPoints === 'number' && (
                                                                            <div className="text-xs bg-yellow-50 border border-yellow-100 text-yellow-800 px-2 py-0.5 rounded">{cust.loyaltyPoints} pts</div>
                                                                        )}
                                                                        {cust.balance < 0 && (
                                                                            <div className="text-xs text-red-500">{UserSession?.getCurrency()}{Math.abs(cust.balance).toFixed(2)} due</div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {customersList.length === 0 && (
                                                        <div className="p-3 text-center text-gray-500">
                                                            <i className="ph ph-users text-xl mb-1"></i>
                                                            <div>No customers found</div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Action buttons */}
                        {!checkout ? (
                            <div className="mt-4 space-y-3">
                                {/* Split Bill Button - Show in order creation mode */}
                                {!splitData && (
                                    <button
                                        onClick={() => setShowSplitBillModal(true)}
                                        className="w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium flex items-center justify-center hover:bg-blue-600 transition-colors"
                                    >
                                        <i className="ph ph-users text-lg mr-2" />
                                        Split Bill
                                    </button>
                                )}

                                {/* Split Bill Summary */}
                                {splitData && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-blue-800">
                                                <i className="ph ph-users text-blue-600 mr-1" />
                                                Split among {splitData.numberOfPeople} people
                                            </span>
                                            <button
                                                onClick={async () => { setSplitData(null); await persistSplitBillToOrder(null); }}
                                                className="text-blue-600 hover:text-blue-800"
                                            >
                                                <i className="ph ph-x" />
                                            </button>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="w-full bg-white rounded-full h-3 mb-3 border border-gray-200 overflow-hidden">
                                            <div
                                                className="h-3 bg-green-400"
                                                style={{ width: `${(splitPayments.filter(s => s && s.paid).length / Math.max(1, splitData.numberOfPeople)) * 100}%` }}
                                            />
                                        </div>

                                        {splitData.type === 'equal' ? (
                                            <p className="text-sm text-blue-700">
                                                Each person pays: <span className="font-medium">{UserSession?.getCurrency()}{splitData.amountPerPerson.toFixed(2)}</span>
                                            </p>
                                        ) : (
                                            <div className="space-y-1">
                                                {splitData.customSplits.map((split, index) => {
                                                    const paidInfo = splitPayments[index];
                                                    return (
                                                        <div key={index} className="flex justify-between text-sm text-blue-700 items-center">
                                                            <div className="min-w-0">
                                                                <div className="truncate">{split.name || `Person ${index + 1}`}</div>
                                                                {paidInfo && paidInfo.paid && (
                                                                    <div className="text-xs text-gray-600">{UserSession?.getCurrency()}{paidInfo.amount.toFixed(2)} paid by {paidInfo.payer || `split ${index + 1}`}</div>
                                                                )}
                                                            </div>
                                                            <div className="font-medium">{UserSession?.getCurrency()}{split.amount.toFixed(2)}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    onClick={() => handleCheckout(paymentMode)}
                                    disabled={isProcessing}
                                    className={`w-full bg-red-500 text-white py-3 rounded-lg font-medium flex items-center justify-center hover:bg-red-600 transition-colors ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''}`}
                                >
                                    {isProcessing ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                            {t('processing')}
                                        </>
                                    ) : (
                                        <>
                                            <span>{t('placeOrder')}</span>
                                            <i className="ph ph-arrow-right ml-2" />
                                        </>
                                    )}
                                </button>
                            </div>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {/* Split Bill Section - Always visible */}
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3">
                                    <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                                        <i className="ph ph-users mr-2 text-gray-600"></i>
                                        {t('billSplitting')}
                                    </h4>

                                    {!splitData ? (
                                        <button
                                            onClick={() => {
                                                console.log('Split Bill button clicked!');
                                                setShowSplitBillModal(true);
                                            }}
                                            className="w-full bg-blue-500 text-white py-2.5 rounded-lg font-medium flex items-center justify-center hover:bg-blue-600 transition-colors"
                                        >
                                            <i className="ph ph-users text-lg mr-2" />
                                            {t('splitBillAmongPeople')}
                                        </button>
                                    ) : (
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="font-medium text-blue-800">
                                                    <i className="ph ph-users text-blue-600 mr-1" />
                                                    {t('splitAmong', { count: splitData.numberOfPeople })}
                                                </span>
                                                <button
                                                    onClick={async () => { setSplitData(null); await persistSplitBillToOrder(null); }}
                                                    className="text-blue-600 hover:text-blue-800"
                                                >
                                                    <i className="ph ph-x" />
                                                </button>
                                            </div>
                                            {splitData.type === 'equal' ? (
                                                <p className="text-sm text-blue-700">
                                                    {t('eachPersonPays')}: <span className="font-medium">{UserSession?.getCurrency()}{splitData.amountPerPerson.toFixed(2)}</span>
                                                    Each person pays: <span className="font-medium">{UserSession?.getCurrency()}{Number(splitData.amountPerPerson || 0).toFixed(2)}</span>
                                                </p>
                                            ) : (
                                                <div className="space-y-1">
                                                    {splitData.customSplits.map((split, index) => (
                                                        <div key={index} className="flex justify-between text-sm text-blue-700">
                                                            <span>{split.name || `${t('person')} ${index + 1}`}</span>
                                                            <span className="font-medium">{UserSession?.getCurrency()}{Number(split.amount || 0).toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <button
                                                onClick={() => setShowSplitBillModal(true)}
                                                className="w-full mt-2 bg-blue-100 text-blue-700 py-1.5 rounded text-sm font-medium hover:bg-blue-200 transition-colors"
                                            >
                                                {t('editSplit')}
                                            </button>
                                        </div>
                                    )}
                                </div>


                                <h3 className="font-medium text-center text-gray-700 mb-2">Select Payment Method</h3>
                                {/* If splitData is set, render repeated payment controls for each person */}
                                {splitData && splitData.numberOfPeople ? (
                                    <div className="space-y-3">
                                        {/* Overall progress bar */}
                                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mb-2">
                                            <div className="h-3 bg-green-500 transition-all duration-300" style={{ width: `${splitProgress.percent}%` }} />
                                        </div>
                                        <div className="text-xs text-gray-600 mb-2">{UserSession?.getCurrency()}{splitProgress.paid.toFixed(2)} paid of {UserSession?.getCurrency()}{splitProgress.total.toFixed(2)} ({splitProgress.percent}%)</div>
                                        {Array.from({ length: splitData.numberOfPeople }).map((_, idx) => {
                                            const person = splitData.customSplits ? (splitData.customSplits[idx] || {}) : { name: `Person ${idx + 1}`, amount: splitData.amountPerPerson };
                                            const paid = !!(splitPayments[idx] && splitPayments[idx].paid);
                                            return (
                                                <div key={idx} className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="font-medium">Select payment method for split {idx + 1}</div>
                                                        <div className="text-sm text-gray-600">{UserSession?.getCurrency()}{Number(person.amount || 0).toFixed(2)}</div>
                                                    </div>
                                                    {paid ? (
                                                        <div className="flex items-center justify-center py-6">
                                                            <div className="text-center">
                                                                <div className="text-lg font-semibold text-green-700">
                                                                    Split {idx + 1} Paid {UserSession?.getCurrency()}{Number(splitPayments[idx].amount || 0).toFixed(2)} via <span className="uppercase">{splitPayments[idx].mode || 'UNKNOWN'}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-4 gap-2">
                                                            <button
                                                                onClick={async () => {
                                                                    if (isProcessing) return;
                                                                    setIsProcessing(true);
                                                                    try {
                                                                        const next = [...(splitPayments || [])];
                                                                        next[idx] = { mode: 'CASH', amount: person.amount };
                                                                        setSplitPayments(next);
                                                                        openSplitModal(idx, 'CASH');
                                                                    } catch (e) {
                                                                        console.error('Split payment error:', e);
                                                                    } finally {
                                                                        setIsProcessing(false);
                                                                    }
                                                                }}
                                                                disabled={isProcessing}
                                                                className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''} ${splitPayments[idx]?.mode === 'CASH' ? 'ring-2 ring-red-300' : ''}`}
                                                            >
                                                                <i className="ph ph-money text-lg mb-0.5" />
                                                                <span className="text-xs">Cash</span>
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    if (isProcessing) return;
                                                                    setIsProcessing(true);
                                                                    try {
                                                                        const next = [...(splitPayments || [])];
                                                                        next[idx] = { mode: 'DIGITAL', amount: person.amount };
                                                                        setSplitPayments(next);
                                                                        openSplitModal(idx, 'DIGITAL');
                                                                    } catch (e) {
                                                                        console.error('Split payment error:', e);
                                                                    } finally {
                                                                        setIsProcessing(false);
                                                                    }
                                                                }}
                                                                disabled={isProcessing}
                                                                className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''} ${splitPayments[idx]?.mode === 'DIGITAL' ? 'ring-2 ring-red-300' : ''}`}
                                                            >
                                                                <i className="ph ph-credit-card text-lg mb-0.5" />
                                                                <span className="text-xs">UPI/Card</span>
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    if (isProcessing || !customer) return;
                                                                    setIsProcessing(true);
                                                                    try {
                                                                        const next = [...(splitPayments || [])];
                                                                        next[idx] = { mode: 'CREDIT', amount: person.amount };
                                                                        setSplitPayments(next);
                                                                        openSplitModal(idx, 'CREDIT');
                                                                    } catch (e) {
                                                                        console.error('Split payment error:', e);
                                                                    } finally {
                                                                        setIsProcessing(false);
                                                                    }
                                                                }}
                                                                disabled={isProcessing || !customer}
                                                                title={!customer ? "Select a customer first" : ""}
                                                                className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${isProcessing || !customer ? 'opacity-75 cursor-not-allowed' : ''} ${splitPayments[idx]?.mode === 'CREDIT' ? 'ring-2 ring-red-300' : ''}`}
                                                            >
                                                                <i className="ph ph-notebook text-lg mb-0.5" />
                                                                <span className="text-xs">Credit</span>
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    if (isProcessing) return;
                                                                    setIsProcessing(true);
                                                                    try {
                                                                        const next = [...(splitPayments || [])];
                                                                        next[idx] = { mode: 'UNSETTLED', amount: person.amount };
                                                                        setSplitPayments(next);
                                                                        openSplitModal(idx, 'UNSETTLED');
                                                                    } catch (e) {
                                                                        console.error('Split payment error:', e);
                                                                    } finally {
                                                                        setIsProcessing(false);
                                                                    }
                                                                }}
                                                                disabled={isProcessing}
                                                                className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''} ${splitPayments[idx]?.mode === 'UNSETTLED' ? 'ring-2 ring-red-300' : ''}`}
                                                            >
                                                                <i className="ph ph-clock-clockwise text-lg mb-0.5" />
                                                                <span className="text-xs">Unsettled</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-4 gap-2">
                                        <button
                                            onClick={function () {
                                                if (isProcessing) return;
                                                setIsProcessing(true);
                                                setTimeout(() => {
                                                    const mode = 'CASH';
                                                    setPaymentMode(mode);
                                                    handleCheckout(mode);
                                                }, 10);
                                            }}
                                            disabled={isProcessing}
                                            className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''} ${paymentMode === 'CASH' ? 'ring-2 ring-red-300' : ''}`}
                                        >
                                            <i className="ph ph-money text-lg mb-0.5" />
                                            <span className="text-xs">Cash</span>
                                        </button>
                                        <button
                                            onClick={function () {
                                                if (isProcessing) return;
                                                setIsProcessing(true);
                                                setTimeout(() => {
                                                    const mode = 'DIGITAL';
                                                    setPaymentMode(mode);
                                                    handleCheckout(mode);
                                                }, 10);
                                            }}
                                            disabled={isProcessing}
                                            className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''} ${paymentMode === 'DIGITAL' ? 'ring-2 ring-red-300' : ''}`}
                                        >
                                            <i className="ph ph-credit-card text-lg mb-0.5" />
                                            <span className="text-xs">UPI/Card</span>
                                        </button>
                                        <button
                                            onClick={function () {
                                                if (isProcessing || !customer) return;
                                                setIsProcessing(true);
                                                setTimeout(() => {
                                                    const mode = 'CREDIT';
                                                    setPaymentMode(mode);
                                                    handleCheckout(mode);
                                                }, 10);
                                            }}
                                            disabled={isProcessing || !customer}
                                            className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${isProcessing || !customer ? 'opacity-75 cursor-not-allowed' : ''} ${paymentMode === 'CREDIT' ? 'ring-2 ring-red-300' : ''}`}
                                            title={!customer ? "Select a customer first" : ""}
                                        >
                                            <i className="ph ph-notebook text-lg mb-0.5" />
                                            <span className="text-xs">Credit</span>
                                        </button>
                                        <button
                                            onClick={() => handleUnsettledBill()}
                                            disabled={isProcessing}
                                            className={`bg-red-500 text-white py-2.5 px-1 rounded-lg font-medium flex flex-col items-center justify-center hover:bg-red-600 transition-colors ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''} ${paymentMode === 'UNSETTLED' ? 'ring-2 ring-red-300' : ''}`}
                                        >
                                            <i className="ph ph-clock-clockwise text-lg mb-0.5" />
                                            <span className="text-xs">Unsettled</span>
                                        </button>
                                    </div>
                                )}

                                {/* Credit info if customer selected */}
                                {customer && typeof customer.balance === 'number' && (
                                    <div className="text-sm text-center text-gray-600 mt-2">
                                        {customer.balance < 0 ? (
                                            <>
                                                <span className="text-gray-700 font-medium">Current Due: </span>
                                                <span className="text-red-600 font-medium">{UserSession?.getCurrency()}{Math.abs(customer.balance).toFixed(2)}</span>
                                                <span className="mx-1">+</span>
                                                <span className="text-red-600 font-medium">{UserSession?.getCurrency()}{cartTotal.toFixed(2)}</span>
                                                <span className="mx-1">=</span>
                                                <span className="text-red-600 font-medium">{UserSession?.getCurrency()}{(Math.abs(customer.balance) + cartTotal).toFixed(2)}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-gray-700 font-medium">New Due: </span>
                                                <span className="text-red-600 font-medium">{UserSession?.getCurrency()}{cartTotal.toFixed(2)}</span>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Share bill options - Add this section */}
                                {orderId && (
                                    <div className="mt-6 mx-4">
                                        <h3 className="font-medium text-center text-gray-700 mb-4">{t('shareBillWithCustomer')}</h3>
                                        <div className="flex justify-center gap-6">
                                            <div className="flex flex-col items-center group">
                                                <button
                                                    onClick={function () { shareBillViaWhatsApp(); }}
                                                    disabled={isGeneratingBill}
                                                    className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-full flex items-center justify-center hover:bg-green-600 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 mb-2"
                                                >
                                                    <i className="ph ph-whatsapp-logo text-xl group-hover:scale-110 transition-transform" />
                                                </button>
                                                <span className="text-xs text-gray-600 font-medium">{t('whatsapp')}</span>
                                            </div>
                                            <div className="flex flex-col items-center group">
                                                <button
                                                    onClick={function () { shareBillViaSMS(); }}
                                                    disabled={isGeneratingBill}
                                                    className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 mb-2"
                                                >
                                                    <i className="ph ph-chat-text text-xl group-hover:scale-110 transition-transform" />
                                                </button>
                                                <span className="text-xs text-gray-600 font-medium">{t('text')}</span>
                                            </div>
                                            <div className="flex flex-col items-center group">
                                                <button
                                                    onClick={function () { shareBillViaEmail(); }}
                                                    disabled={isGeneratingBill}
                                                    className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-full flex items-center justify-center hover:bg-purple-600 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 mb-2"
                                                >
                                                    <i className="ph ph-envelope text-xl group-hover:scale-110 transition-transform" />
                                                </button>
                                                <span className="text-xs text-gray-600 font-medium">{t('email')}</span>
                                            </div>
                                            <div className="flex flex-col items-center group">
                                                <button
                                                    onClick={function () { downloadBill(); }}
                                                    disabled={isGeneratingBill}
                                                    className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-700 text-white rounded-full flex items-center justify-center hover:bg-gray-700 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95 mb-2"
                                                >
                                                    <i className="ph ph-download text-xl group-hover:scale-110 transition-transform" />
                                                </button>
                                                <span className="text-xs text-gray-600 font-medium">{t('save')}</span>
                                            </div>
                                        </div>
                                        {isGeneratingBill && (
                                            <div className="mt-4 text-center text-sm text-gray-600 flex items-center justify-center">
                                                <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                                                {t('generatingBillImage')}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Processing state indicator */}
                                {isProcessing && (
                                    <div className="mt-3 py-3 bg-gray-100 rounded-lg text-center text-gray-700">
                                        <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                        {t('processingPayment')}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Split Bill Modal */}
            {showSplitBillModal && (() => {
                // Create a portal container at the end of body for highest z-index
                const portalContainer = document.createElement('div');
                portalContainer.style.position = 'fixed';
                portalContainer.style.top = '0';
                portalContainer.style.left = '0';
                portalContainer.style.width = '100%';
                portalContainer.style.height = '100%';
                portalContainer.style.zIndex = '2147483647'; // Maximum z-index value
                portalContainer.style.pointerEvents = 'none';
                document.body.appendChild(portalContainer);

                // Clean up when modal closes
                const cleanup = () => {
                    if (portalContainer.parentNode) {
                        portalContainer.parentNode.removeChild(portalContainer);
                    }
                };

                // Use setTimeout to ensure cleanup happens after render
                setTimeout(() => {
                    if (!showSplitBillModal) cleanup();
                }, 0);

                return ReactDOM.createPortal(
                    <div
                        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
                        style={{ zIndex: 'auto', pointerEvents: 'auto' }}
                        onClick={(e) => {
                            // Only close if clicking on the backdrop, not the modal content
                            if (e.target === e.currentTarget) {
                                setShowSplitBillModal(false);
                                cleanup();
                            }
                        }}
                    >
                        <div
                            className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-gray-200">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-medium text-gray-800">{t('splitBill')}</h3>
                                    <button
                                        onClick={() => {
                                            setShowSplitBillModal(false);
                                            cleanup();
                                        }}
                                        className="text-gray-400 hover:text-gray-600"
                                    >
                                        <i className="ph ph-x text-xl" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-4">
                                {/* Bill Summary */}
                                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                                    <div className="text-center mb-3">
                                        <h4 className="font-medium text-gray-800 mb-1">{t('billSummary')}</h4>
                                        <p className="text-xs text-blue-600">{t('splittingDividesTotal')}</p>
                                    </div>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-gray-600">{t('subtotal')}:</span>
                                        <span className="font-medium">{UserSession?.getCurrency()}{cartSubTotal.toFixed(2)}</span>
                                    </div>
                                    {discount > 0 && !(Number(orderMeta?.loyaltyPointsUsed || recentRedeem?.points || 0) > 0) && (
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-gray-600">Discount:</span>
                                            <span className="font-medium text-green-600">-{UserSession?.getCurrency()}{discount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {chargesCalculation.totalChargesAmount > 0 && (
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-gray-600">{t('taxesAndCharges')}:</span>
                                            <span className="font-medium">{UserSession?.getCurrency()}{chargesCalculation.totalChargesAmount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="border-t pt-2 mt-2">
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-gray-800">{t('totalToSplit')}:</span>
                                            <span className="font-bold text-lg text-blue-600">{UserSession?.getCurrency()}{chargesCalculation.finalAmount.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Split Type Selection */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('splitType')}</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setSplitType('equal')}
                                            className={`p-3 rounded-lg border text-center ${splitType === 'equal' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
                                        >
                                            <i className="ph ph-equals text-lg block mb-1" />
                                            <span className="text-sm">{t('equalSplit')}</span>
                                        </button>
                                        <button
                                            onClick={() => setSplitType('custom')}
                                            className={`p-3 rounded-lg border text-center ${splitType === 'custom' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}
                                        >
                                            <i className="ph ph-sliders text-lg block mb-1" />
                                            <span className="text-sm">{t('customSplit')}</span>
                                        </button>
                                    </div>
                                </div>

                                {splitType === 'equal' && (
                                    <SplitBillEqualComponent
                                        totalAmount={chargesCalculation.finalAmount}
                                        numberOfPeople={numberOfPeople}
                                        setNumberOfPeople={setNumberOfPeople}
                                    />
                                )}

                                {splitType === 'custom' && (
                                    <SplitBillCustomComponent
                                        cart={cart}
                                        totalAmount={chargesCalculation.finalAmount}
                                        discount={discount}
                                        charges={chargesCalculation.totalChargesAmount}
                                        customSplits={customSplits}
                                        setCustomSplits={setCustomSplits}
                                    />
                                )}

                                {/* Action Buttons */}
                                <div className="flex gap-2 mt-6">
                                    <button
                                        onClick={() => {
                                            setShowSplitBillModal(false);
                                            cleanup();
                                        }}
                                        className="flex-1 bg-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                                    >
                                        {t('cancel')}
                                    </button>
                                    <button
                                        onClick={() => {
                                            // compute totals and guard again on click
                                            const totalCustomAmount = Array.isArray(customSplits) ? customSplits.reduce((sum, split) => sum + Number(split.amount || 0), 0) : 0;
                                            const finalAmt2 = Number(chargesCalculation.finalAmount || 0);
                                            const remaining2 = Math.round((finalAmt2 - totalCustomAmount) * 100);
                                            if (splitType === 'custom' && remaining2 !== 0) {
                                                showToast(`Split amounts must equal total bill (₹${chargesCalculation.finalAmount.toFixed(2)}). Current total: ₹${totalCustomAmount.toFixed(2)}`, 'error');
                                                return;
                                            }

                                            if (splitType === 'equal') {
                                                const amountPerPerson = chargesCalculation.finalAmount / numberOfPeople;
                                                setSplitData({
                                                    type: 'equal',
                                                    numberOfPeople,
                                                    amountPerPerson,
                                                    totalAmount: chargesCalculation.finalAmount
                                                });
                                                if (orderId) persistSplitBillToOrder({ type: 'equal', numberOfPeople, amountPerPerson, totalAmount: chargesCalculation.finalAmount });
                                            } else {
                                                // Validate custom splits
                                                const totalCustomAmount = Array.isArray(customSplits) ? customSplits.reduce((sum, split) => sum + Number(split.amount || 0), 0) : 0;
                                                const difference = Math.abs(totalCustomAmount - chargesCalculation.finalAmount);

                                                if (difference > 0.01) { // Allow small rounding differences
                                                    showToast(`${t('splitAmountsMustEqualTotalBill', { currency: '₹', total: chargesCalculation.finalAmount.toFixed(2), current: totalCustomAmount.toFixed(2) })}`, 'error');
                                                    return;
                                                }

                                                setSplitData({
                                                    type: 'custom',
                                                    numberOfPeople: customSplits.length,
                                                    customSplits: [...customSplits],
                                                    totalAmount: chargesCalculation.finalAmount
                                                });
                                                if (orderId) persistSplitBillToOrder({ type: 'custom', numberOfPeople: customSplits.length, customSplits: [...customSplits], totalAmount: chargesCalculation.finalAmount });
                                            }

                                            setShowSplitBillModal(false);
                                            cleanup();
                                            showToast('Bill split applied successfully!', 'success');
                                        }}
                                        disabled={splitType === 'custom' && Math.round((Number(chargesCalculation.finalAmount || 0) - (Array.isArray(customSplits) ? customSplits.reduce((s, p) => s + Number(p.amount || 0), 0) : 0)) * 100) !== 0}
                                        className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${(splitType === 'custom' && Math.round((Number(chargesCalculation.finalAmount || 0) - (Array.isArray(customSplits) ? customSplits.reduce((s, p) => s + Number(p.amount || 0), 0) : 0)) * 100) !== 0) ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
                                    >
                                        {t('applySplit')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    , portalContainer);
            })()}


        </div>
    );
}

// Equal Split Component
function SplitBillEqualComponent({ totalAmount, numberOfPeople, setNumberOfPeople }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Number of People</label>
            <div className="flex items-center gap-3 mb-4">
                <button
                    onClick={() => setNumberOfPeople(Math.max(2, numberOfPeople - 1))}
                    className="w-10 h-10 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center justify-center"
                >
                    <i className="ph ph-minus" />
                </button>
                <div className="flex-1 text-center">
                    <input
                        type="number"
                        min="2"
                        max="20"
                        value={numberOfPeople}
                        onChange={(e) => setNumberOfPeople(Math.max(2, Math.min(20, parseInt(e.target.value) || 2)))}
                        className="w-full text-center text-lg font-medium py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                </div>
                <button
                    onClick={() => setNumberOfPeople(Math.min(20, numberOfPeople + 1))}
                    className="w-10 h-10 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center justify-center"
                >
                    <i className="ph ph-plus" />
                </button>
            </div>

            <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-center">
                    <p className="text-sm text-blue-600 mb-1">Amount per person</p>
                    <p className="text-2xl font-bold text-blue-800">
                        {UserSession?.getCurrency()}{(totalAmount / numberOfPeople).toFixed(2)}
                    </p>
                </div>
            </div>
        </div>
    );
}

// Custom Split Component
function SplitBillCustomComponent({ cart, totalAmount, discount, charges, customSplits, setCustomSplits }) {
    // Let user pick number of people; align UI with Equal split: min 2, max 20, +/- buttons and amount preview
    const [peopleCount, setPeopleCount] = useState((customSplits && customSplits.length) || 2);

    // Note: Add-person flow removed — number of people is managed via the Number input

    const amountInputsRef = useRef({});

    const updatePersonAmount = (personId, amount) => {
        // Persist the typed value into state on blur or programmatic updates.
        // Capture scroll position and restore after React paint to avoid unwanted jumps.
        const prevY = (typeof window !== 'undefined') ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0) : 0;
        setCustomSplits((prev) => {
            try {
                const next = (Array.isArray(prev) ? prev.map(person => person.id === personId ? { ...person, amount: (amount === '' ? '' : String(amount)) } : person) : []);
                // Restore scroll after paint
                try {
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        try { window.scrollTo(0, prevY); } catch (e) { }
                    }));
                } catch (e) {
                    setTimeout(() => { try { window.scrollTo(0, prevY); } catch (er) { } }, 50);
                }
                return next;
            } catch (err) {
                console.error('updatePersonAmount error:', err);
                return prev;
            }
        });
    };

    const setPersonAmountAndSyncInput = (personId, amount) => {
        const s = (amount === '' ? '' : String(amount));
        // Update state
        setCustomSplits(customSplits.map(person => person.id === personId ? { ...person, amount: s } : person));
        // Also update the uncontrolled input DOM value if present to keep UI in sync
        try {
            const el = amountInputsRef.current && amountInputsRef.current[personId];
            if (el) el.value = s;
        } catch (e) { }
    };

    const updatePersonName = (personId, name) => {
        setCustomSplits(customSplits.map(person =>
            person.id === personId ? { ...person, name } : person
        ));
    };

    const removePerson = (personId) => {
        setCustomSplits(customSplits.filter(person => person.id !== personId));
    };

    const totalSplitAmount = customSplits.reduce((sum, person) => sum + Number(person.amount || 0), 0);
    const remainingAmount = Number(totalAmount || 0) - totalSplitAmount;

    useEffect(() => {
        // keep peopleCount in sync if customSplits changes externally
        try {
            const len = Array.isArray(customSplits) ? customSplits.length : 0;
            if (len > 0 && len !== peopleCount) setPeopleCount(len);
        } catch (e) { }
    }, [customSplits]);

    useEffect(() => {
        // When the custom split UI opens and there are no split rows yet,
        // seed rows immediately so Person 1 / Person 2 are visible without pressing Add.
        try {
            const len = Array.isArray(customSplits) ? customSplits.length : 0;
            if (len === 0) {
                // seed with the current peopleCount (defaults to 2)
                updatePeopleCount(peopleCount);
            }
        } catch (e) { }
        // Intentionally run only on mount; updatePeopleCount and peopleCount are stable for this use
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updatePeopleCount = (value) => {
        let n = Math.max(2, Number(value) || 2);
        n = Math.min(20, n);
        // Build next splits array seeded with equal amounts by default
        // Seed splits: keep existing amounts where present, otherwise default amount to 0 (user requested)
        const next = Array.from({ length: n }).map((_, i) => {
            const existing = (customSplits && customSplits[i]) ? customSplits[i] : null;
            return {
                id: existing ? existing.id : (Date.now() + i),
                name: existing ? existing.name : `Person ${i + 1}`,
                // If an existing person has an amount, preserve it; otherwise default to 0 (not equal split)
                amount: existing ? Number(existing.amount || 0) : 0,
                items: existing ? existing.items || [] : []
            };
        });
        const prevY = (typeof window !== 'undefined' && window.scrollY) ? window.scrollY : 0;
        setPeopleCount(n);
        setCustomSplits((prev) => {
            const result = next;
            // Focus the last input after DOM updates to keep viewport stable
            setTimeout(() => {
                try {
                    const last = result && result.length ? result[result.length - 1] : null;
                    if (last) {
                        const el = amountInputsRef.current && amountInputsRef.current[last.id];
                        if (el) {
                            el.focus();
                            el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                        }
                    }
                } catch (e) { console.warn('Failed to focus after updatePeopleCount', e); }
                try { window.scrollTo(0, prevY); } catch (e) { }
            }, 50);
            return result;
        });
    };

    return (
        <div>
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Number of People</label>
                <div className="flex items-center gap-3 mb-4">
                    <button
                        onClick={() => updatePeopleCount(Math.max(2, peopleCount - 1))}
                        className="w-10 h-10 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center justify-center"
                    >
                        <i className="ph ph-minus" />
                    </button>
                    <div className="flex-1 text-center">
                        <input
                            type="number"
                            min="2"
                            max="20"
                            value={peopleCount}
                            onChange={(e) => updatePeopleCount(Math.max(2, Math.min(20, parseInt(e.target.value) || 2)))}
                            className="w-full text-center text-lg font-medium py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                    </div>
                    <button
                        onClick={() => updatePeopleCount(Math.min(20, peopleCount + 1))}
                        className="w-10 h-10 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center justify-center"
                    >
                        <i className="ph ph-plus" />
                    </button>
                </div>

                {/* amount-per-person preview intentionally removed for custom split */}
            </div>

            <div className="space-y-3 mb-4">
                {customSplits.map((person, index) => (
                    <div key={person.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <input
                                type="text"
                                value={person.name}
                                onChange={(e) => updatePersonName(person.id, e.target.value)}
                                className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="Person name"
                            />
                            <button
                                onClick={() => removePerson(person.id)}
                                className="text-red-500 hover:text-red-700"
                            >
                                <i className="ph ph-trash" />
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">{UserSession?.getCurrency()}</span>
                            <div className="flex flex-1 items-center gap-2">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    defaultValue={person.amount}
                                    ref={(el) => {
                                        if (!amountInputsRef || !amountInputsRef.current) return;
                                        if (el) amountInputsRef.current[person.id] = el; else delete amountInputsRef.current[person.id];
                                    }}
                                    onBlur={(e) => updatePersonAmount(person.id, e.target.value)}
                                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    placeholder="0.00"
                                />
                                {index === customSplits.length - 1 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // Compute sum of all other splits and set this person's amount to remaining total
                                            const sumExceptCurrent = customSplits.reduce((s, p) => s + (p.id === person.id ? 0 : Number(p.amount || 0)), 0);
                                            const newAmount = Math.max(0, Number(totalAmount || 0) - sumExceptCurrent);
                                            setPersonAmountAndSyncInput(person.id, newAmount);
                                        }}
                                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                                    >
                                        Add remaining
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Add Person removed — use the Number of People controls above to change the count */}

            {customSplits.length > 0 && (
                <div className="mt-4 bg-gray-50 rounded-lg p-3">
                    <div className="flex justify-between text-sm mb-1">
                        <span>Total Split:</span>
                        <span className="font-medium">{UserSession?.getCurrency()}{totalSplitAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className={remainingAmount > 0 ? 'text-red-600' : remainingAmount < 0 ? 'text-orange-600' : 'text-green-600'}>
                            {remainingAmount > 0 ? 'Remaining:' : remainingAmount < 0 ? 'Over by:' : 'Balanced:'}
                        </span>
                        <span className={`font-medium ${remainingAmount > 0 ? 'text-red-600' : remainingAmount < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            {UserSession?.getCurrency()}{Math.abs(remainingAmount).toFixed(2)}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
