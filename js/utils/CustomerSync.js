import { sdk } from '../sdk.js';
import { calculatePointsForAmount, awardPointsToCustomer } from './LoyaltyEngine.js';

/**
 * Check if a phone number already exists for another customer
 * @param {string} phone - The phone number to check
 * @param {string} excludeId - Optional customer ID to exclude from the check (for updates)
 * @returns {Promise<boolean>} - True if phone number exists for another customer
 */
export async function isPhoneNumberExists(phone, excludeId = null) {
    if (!phone) return false;
    
    try {
        if (!sdk || !sdk.db) {
            console.warn('isPhoneNumberExists: sdk.db not available');
            return false;
        }
        
        const customersRef = sdk.db.collection('Customers');
        const query = customersRef.where('phone', '==', phone);
        const snapshot = await query.get();
        
        if (!snapshot || !snapshot.docs) return false;
        
        // If excluding an ID (for updates), filter it out
        const docs = excludeId 
            ? snapshot.docs.filter(doc => doc.id !== excludeId)
            : snapshot.docs;
            
        return docs.length > 0;
    } catch (error) {
        console.error('Error checking phone number existence:', error);
        return false; // Fail safe - allow creation if we can't check
    }
}

/**
 * Propagate changes from a Customer document to Orders that denormalize customer fields.
 * Updates Orders where `custId === customerId` and sets custName/custPhone/custEmail
 * based on the provided `updatedFields` object. Dispatches a `customerUpdated` event
 * after finishing so UI components can react.
 */
export async function propagateCustomerUpdate(customerId, updatedFields = {}) {
    if (!customerId) return;
    try {
        if (!sdk || !sdk.db) {
            console.warn('propagateCustomerUpdate: sdk.db not available');
            return;
        }

        const ordersRef = sdk.db.collection('Orders');

        // Query orders that reference this customer by id
        const query = ordersRef.where('custId', '==', customerId);
        let snapshot;
        try {
            snapshot = await query.get();
        } catch (err) {
            // Some environments may not support get() on query; try onSnapshot fallback
            console.warn('propagateCustomerUpdate: query.get() failed, attempting onSnapshot fallback', err);
            snapshot = await new Promise((resolve, reject) => {
                const unsub = query.onSnapshot(s => { unsub(); resolve(s); }, reject);
                // If onSnapshot doesn't fire, timeout after 5s
                setTimeout(() => { try { unsub(); } catch (e) {} ; resolve({ docs: [] }); }, 5000);
            });
        }

        if (!snapshot || !Array.isArray(snapshot.docs)) return;

        const ops = [];
        snapshot.docs.forEach(doc => {
            const updateObj = {};
            if (typeof updatedFields.name !== 'undefined') updateObj.custName = updatedFields.name;
            if (typeof updatedFields.phone !== 'undefined') updateObj.custPhone = updatedFields.phone;
            if (typeof updatedFields.email !== 'undefined') updateObj.custEmail = updatedFields.email;
            // Also keep the canonical embedded customer snapshot in-sync
            const custObj = {};
            if (typeof updatedFields.name !== 'undefined') custObj.name = updatedFields.name;
            if (typeof updatedFields.phone !== 'undefined') custObj.phone = updatedFields.phone;
            if (typeof updatedFields.email !== 'undefined') custObj.email = updatedFields.email;
            if (Object.keys(custObj).length > 0) {
                // Use existing id on order if present, else set id to customerId
                custObj.id = doc.data && doc.data().custId ? doc.data().custId : customerId;
                updateObj.customer = custObj;
            }

            if (Object.keys(updateObj).length > 0) {
                try {
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
                    ops.push(ordersRef.doc(doc.id).update(sanitize(updateObj)).catch(e => {
                        console.warn('propagateCustomerUpdate: failed to update order', doc.id, e);
                    }));
                } catch (e) {
                    console.warn('propagateCustomerUpdate: error scheduling update for', doc.id, e);
                }
            }
        });

        await Promise.all(ops);

        // Notify other parts of the app only if there is something meaningful to propagate
        try {
            if (updatedFields && Object.keys(updatedFields).length > 0) {
                window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId, updatedFields } }));
            }
        } catch (e) {}
    } catch (e) {
        console.error('propagateCustomerUpdate error', e);
    }
}

/**
 * Append a payment / completed-order summary to a Customer document.
 * Writes/merges fields: lastPurchase, totalSpent (increment), orderCount (increment), recentPayments (prepended, capped).
 * Also dispatches a `customerUpdated` event with the updated fields so UI can refresh in-memory caches.
 */
export async function appendCustomerPayment(customerId, payment = {}) {
    if (!customerId) return;
    try {
        if (!sdk || !sdk.db) {
            console.warn('appendCustomerPayment: sdk.db not available');
            return;
        }

        const custRef = sdk.db.collection('Customers').doc(customerId);
        let snap;
        try {
            snap = await custRef.get();
        } catch (e) {
            console.warn('appendCustomerPayment: could not get customer doc, proceeding to set merge', e);
            snap = null;
        }

        const existing = (snap && snap.exists && typeof snap.data === 'function') ? snap.data() : (snap && snap._data) || {};

    const amount = Number(payment.amount || 0);
        const now = payment.date ? (payment.date instanceof Date ? payment.date : new Date(payment.date)) : new Date();
        const prevTotal = Number(existing.totalSpent || existing.total || 0) || 0;
        const prevCount = Number(existing.orderCount || 0) || 0;
        const newTotal = prevTotal + amount;
        const newCount = prevCount + (payment.isNewOrder ? 1 : 1);

        const prevRecent = Array.isArray(existing.recentPayments) ? existing.recentPayments : [];
        const entry = {
            orderId: payment.orderId || null,
            date: now,
            amount: amount,
            payMode: payment.payMode || payment.paymentMethod || 'CASH',
            label: payment.label || (`Paid ${payment.payMode || payment.paymentMethod || 'CASH'}`)
        };

    // Include loyalty discount metadata on the recent payment entry if available
    const providedLoyaltyDiscount = Number(payment.loyaltyDiscountAmount || payment.loyaltyDiscount || 0) || 0;
    if (providedLoyaltyDiscount > 0) entry.loyaltyDiscountAmount = providedLoyaltyDiscount;

        const updatedFields = {
            lastPurchase: now,
            totalSpent: newTotal,
            orderCount: newCount,
            recentPayments: [entry, ...prevRecent].slice(0, 20)
        };

        try {
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
            await custRef.update(sanitize(updatedFields));
        } catch (err) {
            // If update fails (document missing), fall back to set with merge
            try { await custRef.set(updatedFields, { merge: true }); } catch (e2) { console.warn('appendCustomerPayment: set(merge) failed', e2); }
        }

        // Loyalty: award points for the payment amount excluding any portion paid using loyalty points
        try {
            // Only award for real customers (not guest)
            if (customerId && customerId !== 'guest') {
                // Ensure this is a completed/paid payment. Skip awarding for pending COD or unpaid orders.
                const payModeCheck = (payment.payMode || payment.paymentMethod || entry.payMode || '').toString().toUpperCase();
                const statusStr = (payment.status || payment.orderStatus || '').toString();
                const isSettled = Boolean(payment.paid || payment.settled || (Number(payment.settledAmount || payment.amountSettled || 0) > 0));
                const statusPaid = /COMPLETED|PAID/i.test(statusStr);
                const isCompletedPaid = isSettled || statusPaid;

                if (!isCompletedPaid) {
                    // Do not award points for pending/unsettled payments (e.g., pending COD)
                    // We still record the payment entry above but skip loyalty awarding.
                } else {
                // Determine loyalty discount / points used (prefer payment metadata, fallback to order doc if available)
                let loyaltyDiscount = providedLoyaltyDiscount;
                let loyaltyPointsUsed = Number(payment.loyaltyPointsUsed || payment.loyaltyPoints || 0) || 0;
                if ((!loyaltyDiscount || loyaltyDiscount === 0) || (!loyaltyPointsUsed || loyaltyPointsUsed === 0)) {
                    if (payment.orderId) {
                        try {
                            const ord = await sdk.db.collection('Orders').doc(payment.orderId).get();
                            const od = ord && (typeof ord.data === 'function' ? ord.data() : ord._data) || {};
                            loyaltyDiscount = loyaltyDiscount || Number(od.loyaltyDiscountAmount || od.loyaltyDiscount || 0) || 0;
                            loyaltyPointsUsed = loyaltyPointsUsed || Number(od.loyaltyPointsUsed || 0) || 0;
                        } catch (e) {
                            // non-fatal - if fetching order fails just assume 0
                            loyaltyDiscount = loyaltyDiscount || 0;
                            loyaltyPointsUsed = loyaltyPointsUsed || 0;
                        }
                    }
                }

                // Also check LoyaltyHistory for any negative entries tied to this order (definitive sign of redemption)
                // Note: avoid composing range+equality filters server-side which may require composite indexes in Firestore.
                // Instead query by orderId only and filter client-side. Limit the number of docs to a reasonable bound.
                let redeemedByOrder = 0;
                try {
                    if (payment.orderId) {
                        const histSnap = await sdk.db.collection('LoyaltyHistory')
                            .where('orderId', '==', payment.orderId)
                            .limit(50)
                            .get();
                        if (histSnap && histSnap.docs && histSnap.docs.length > 0) {
                            redeemedByOrder = histSnap.docs.reduce((s, d) => {
                                const pts = (d.data && d.data().points) || (d._data && d._data.points) || 0;
                                return s + (Number(pts) < 0 ? Math.abs(Number(pts)) : 0);
                            }, 0);
                        }
                    }
                } catch (e) {
                    console.warn('appendCustomerPayment: failed to query LoyaltyHistory for order', payment.orderId, e);
                    redeemedByOrder = 0;
                }

                // Debug: log findings
                try { console.debug('appendCustomerPayment - loyalty detect', { paymentOrderId: payment.orderId, providedLoyaltyDiscount, loyaltyPointsUsed, loyaltyDiscount, redeemedByOrder }); } catch (e) {}

                // Determine the net awardable amount after accounting for loyalty redemption.
                // We consider any of: explicit loyaltyDiscount on payment/order, loyaltyPointsUsed, or negative LoyaltyHistory entries for the order.
                const effectiveLoyaltyDiscount = Math.max(Number(loyaltyDiscount || 0), Number(loyaltyPointsUsed || 0), Number(redeemedByOrder || 0));

                try { console.debug('appendCustomerPayment - effectiveLoyaltyDiscount computed', { paymentOrderId: payment.orderId, effectiveLoyaltyDiscount }); } catch(e){}

                // If any loyalty discount was used for this order, do NOT award points for the order.
                // Additionally ensure the redeem was actually deducted (negative LoyaltyHistory exists);
                // if not, create it now so the customer's stored points reflect the redemption.
                if (Number(effectiveLoyaltyDiscount || 0) > 0) {
                    entry.loyaltyDiscountAmount = Number(effectiveLoyaltyDiscount);
                    console.debug('appendCustomerPayment - loyalty used, ensuring deduction exists then skipping award', { paymentOrderId: payment.orderId, effectiveLoyaltyDiscount });

                    // If an orderId is available, ensure a negative LoyaltyHistory entry exists for this order.
                    if (payment.orderId) {
                        try {
                            const histSnap = await sdk.db.collection('LoyaltyHistory')
                                .where('orderId', '==', payment.orderId)
                                .limit(20)
                                .get();
                            const hasNegative = histSnap && histSnap.docs && histSnap.docs.some(d => {
                                const pts = (d.data && d.data().points) || (d._data && d._data.points) || 0;
                                return Number(pts) < 0;
                            });
                            if (!hasNegative) {
                                // No persisted deduction found: perform deduction now
                                try {
                                    const pts = -Math.abs(Number(effectiveLoyaltyDiscount || 0));
                                    console.log('appendCustomerPayment - performing missing deduction for order', { orderId: payment.orderId, pts });
                                    if (sdk && sdk.db) {
                                        try { sdk.db.collection('LoyaltyAudit').doc().set({ event: 'ensureDeduct_before_award', orderId: payment.orderId, customerId, pts, ts: new Date() }); } catch(e) {}
                                    }
                                    await awardPointsToCustomer(customerId, pts, { orderId: payment.orderId, type: 'redeem', note: 'Deduct redeem on payment (ensured by appendCustomerPayment)' });
                                    console.log('appendCustomerPayment - performed missing deduction for order', { orderId: payment.orderId, pts });
                                    try { if (sdk && sdk.db) sdk.db.collection('LoyaltyAudit').doc().set({ event: 'ensureDeduct_after_award', orderId: payment.orderId, customerId, pts, ts: new Date() }); } catch(e) {}
                                } catch (e) {
                                    console.warn('appendCustomerPayment - failed to create missing redeem deduction', e);
                                }
                            }
                        } catch (e) {
                            console.warn('appendCustomerPayment - failed to query LoyaltyHistory for negative entries', e);
                        }
                    }

                    // After ensuring deduction, skip awarding (per business rule)
                    return;
                }

                // Award points only for the remaining amount after loyalty discount
                const awardableAmount = Math.max(0, amount - effectiveLoyaltyDiscount);
                try {
                    // Idempotency: don't award if we already created an earn entry for this order
                    if (payment.orderId) {
                            try {
                                const earnSnap = await sdk.db.collection('LoyaltyHistory')
                                    .where('orderId', '==', payment.orderId)
                                    .limit(50)
                                    .get();
                                const hasEarn = earnSnap && earnSnap.docs && earnSnap.docs.some(d => {
                                    const pts = (d.data && d.data().points) || (d._data && d._data.points) || 0;
                                    return Number(pts) > 0;
                                });
                                if (hasEarn) {
                                    console.debug('appendCustomerPayment - skipping award because earn entry already exists for order', payment.orderId);
                                    // Skip awarding
                                    return;
                                }
                            } catch (e) {
                                // If the check fails, fall back to attempting award (non-fatal)
                                console.warn('appendCustomerPayment: failed to query existing LoyaltyHistory for idempotency', e);
                            }
                    }

                    const pts = await calculatePointsForAmount(awardableAmount);
                    if (pts > 0) {
                        const note = (awardableAmount !== amount)
                            ? `Earned ${pts} pts for ₹${awardableAmount} (excluded ₹${effectiveLoyaltyDiscount} redeemed)`
                            : `Earned ${pts} pts for ₹${awardableAmount}`;
                        try {
                            const res = await awardPointsToCustomer(customerId, pts, { orderId: payment.orderId, customerName: existing.name || null, type: 'earn', note });
                            console.debug('appendCustomerPayment - awardPointsToCustomer returned', { customerId, pts, res });
                        } catch (e) {
                            console.error('appendCustomerPayment - awardPointsToCustomer failed', e);
                        }
                    }
                } catch (e) {
                    console.warn('appendCustomerPayment: failed to award points', e);
                }
                }
            }
        } catch (e) {
            console.warn('appendCustomerPayment: loyalty award failed', e);
        }

        try { window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId, updatedFields } })); } catch (e) {}
    } catch (e) {
        console.error('appendCustomerPayment error', e);
    }
}

/**
 * Reverse a previously appended payment / order for a customer.
 * Decrements totalSpent and orderCount and removes matching recentPayments entries.
 */
export async function removeCustomerPayment(customerId, payment = {}) {
    if (!customerId) return;
    try {
        if (!sdk || !sdk.db) {
            console.warn('removeCustomerPayment: sdk.db not available');
            return;
        }

        const custRef = sdk.db.collection('Customers').doc(customerId);
        let snap;
        try {
            snap = await custRef.get();
        } catch (e) {
            console.warn('removeCustomerPayment: could not get customer doc', e);
            snap = null;
        }

        const existing = (snap && snap.exists && typeof snap.data === 'function') ? snap.data() : (snap && snap._data) || {};

        const amount = Math.max(0, Number(payment.amount ?? payment.finalAmount ?? payment.settledAmount ?? payment.total ?? 0) || 0);
        const prevTotal = Number(existing.totalSpent || existing.total || 0) || 0;
        const prevCount = Number(existing.orderCount || 0) || 0;

        const newTotal = Math.max(0, prevTotal - amount);
        const newCount = Math.max(0, prevCount - 1);

        // Filter out recentPayments that match this orderId
        const prevRecent = Array.isArray(existing.recentPayments) ? existing.recentPayments : [];
        const filteredRecent = prevRecent.filter(r => {
            try {
                return !(r && (r.orderId === (payment.orderId || payment.id)));
            } catch (e) { return true; }
        });

        const updatedFields = {
            totalSpent: newTotal,
            orderCount: newCount,
            recentPayments: filteredRecent
        };

        try {
            const sanitize2 = (val) => {
                if (typeof val === 'undefined' || val === null) return null;
                if (Array.isArray(val)) return val.map(sanitize2);
                if (typeof val === 'object') {
                    const out = {};
                    for (const k of Object.keys(val)) {
                        try { out[k] = sanitize2(val[k]); } catch (e) { out[k] = null; }
                    }
                    return out;
                }
                return val;
            };
            await custRef.update(sanitize2(updatedFields));
        } catch (err) {
            try { await custRef.set(updatedFields, { merge: true }); } catch (e2) { console.warn('removeCustomerPayment: set(merge) failed', e2); }
        }

        try { window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId, updatedFields } })); } catch (e) {}
    } catch (e) {
        console.error('removeCustomerPayment error', e);
    }
}
