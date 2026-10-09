import { sdk } from '../sdk.js';

// Cached points per currency value (lazy loaded)
let _cachedPointsPerCurrency = null;
// Optional override (null = no override)
let _pointsPerCurrencyOverride = null;
// Optional mapping override (e.g. { INR: 1/50, USD: 1/50 })
let _pointsPerCurrencyMapping = null;

async function getPointsPerCurrency() {
    // If an override is set, always use it
    if (_pointsPerCurrencyOverride != null) return _pointsPerCurrencyOverride;
    if (_cachedPointsPerCurrency != null) return _cachedPointsPerCurrency;
    // Default to 1 point per 50 currency units unless a rule or override is present
    _cachedPointsPerCurrency = 1/50; // default (1 pt per 50 currency units)
    if (!sdk || !sdk.db) return _cachedPointsPerCurrency;
    try {
        const snap = await sdk.db.collection('LoyaltyRules').get();
        const rules = [];
        snap.forEach(d => rules.push({ id: d.id, ...(d.data() || {}) }));
        const spendRule = rules.find(r => r.type === 'spend_ratio' && (r.active === undefined ? true : r.active));
        if (spendRule) {
            if (typeof spendRule.pointsPerCurrency === 'number' && !isNaN(spendRule.pointsPerCurrency)) {
                _cachedPointsPerCurrency = Number(spendRule.pointsPerCurrency) || 1;
            } else if (spendRule.description) {
                const m = spendRule.description.match(/(\d+(?:\.\d+)?)\s*point[s]?\s*per\s*[₹$]?\s*(\d+(?:\.\d+)?)/i);
                if (m) {
                    const num = Number(m[1]);
                    const denom = Number(m[2]) || 1;
                    if (!isNaN(num) && !isNaN(denom) && denom !== 0) {
                        _cachedPointsPerCurrency = num / denom;
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Failed to load LoyaltyRules', e);
    }
    return _cachedPointsPerCurrency;
}

// New: return mapping or numeric depending on override
async function getPointsPerCurrencyForCurrency(currency) {
    // If an explicit mapping override is present, return it
    if (_pointsPerCurrencyMapping != null) return _pointsPerCurrencyMapping;
    // Otherwise fall back to numeric override / cached value
    return getPointsPerCurrency();
}

export function setPointsPerCurrencyOverride(val) {
    if (val === null || typeof val === 'undefined') {
        _pointsPerCurrencyOverride = null;
    } else {
        const n = Number(val);
        _pointsPerCurrencyOverride = isNaN(n) ? null : n;
    }
}

// Allow setting a mapping of currency -> pointsPerCurrency (e.g. { INR: 1/50, USD: 1/50 })
export function setPointsPerCurrencyMapping(map) {
    if (!map) {
        _pointsPerCurrencyMapping = null;
        return;
    }
    // Expect an object mapping currency codes (or '*' for default) to numeric rate
    _pointsPerCurrencyMapping = map;
}

// Helper: determine if an order should be considered settled/paid for loyalty awarding
function orderIsSettled(o) {
    if (!o) return false;
    // Support wrapped order objects where the actual payload is under `data`
    const od = o.data || o;
    const status = (od.currentStatus && od.currentStatus.label) || od.status || od.statusLabel || '';
    const isSettledFlag = Boolean(od.paid || od.settled || (Number(od.settledAmount || od.amountSettled || 0) > 0));
    const statusPaid = /COMPLETED|PAID/i.test(status);
    return isSettledFlag || statusPaid;
}

/**
 * Calculate points to award for a given currency amount.
 * By default awards 1 point per 1 currency unit unless overridden by LoyaltyRules.
 */
export async function calculatePointsForAmount(amount, currency = null) {
    // Determine applicable rate. This supports either:
    // - numeric rate (points per currency unit)
    // - mapping object where keys are currency codes or '*' for default
    let rate = await getPointsPerCurrency();
    try {
        const mapping = await getPointsPerCurrencyForCurrency(currency);
        if (mapping && typeof mapping === 'object') {
            // Prefer exact match, then wildcard '*', then fallback to numeric rate if present
            if (currency && mapping[currency]) {
                rate = mapping[currency];
            } else if (mapping['*']) {
                rate = mapping['*'];
            }
        }
    } catch (e) {
        // ignore and use rate
    }

    const pts = Math.floor((Number(amount) || 0) * (Number(rate) || 0));
    return pts > 0 ? pts : 0;
}

/**
 * Award points to a customer and write a LoyaltyHistory entry.
 * Returns the new loyaltyPoints value (or null on failure).
 */
export async function awardPointsToCustomer(customerId, points, opts = {}) {
    if (!customerId) return null;
    if (!sdk || !sdk.db) throw new Error('DB not available');
    try {
    try { console.log('[awardPointsToCustomer] called', { customerId, points, opts }); if (sdk && sdk.db) try { sdk.db.collection('LoyaltyAudit').doc().set({ event: 'awardCalled', customerId, points, opts, ts: new Date() }); } catch(e){} } catch(e){}
        const custRef = sdk.db.collection('Customers').doc(customerId);
        // Read current points
        const snap = await custRef.get();
        const existing = (snap && snap.exists && typeof snap.data === 'function') ? snap.data() : {};
        const oldPoints = Number(existing.loyaltyPoints || 0) || 0;
        const newPoints = oldPoints + Number(points || 0);

        // Update customer loyaltyPoints
        // Safety: If this is an 'earn' (positive points) call tied to an order,
        // ensure the order did not use loyalty points. Business rule: when any
        // loyalty is used for an order, no points should be awarded for that order.
        if (Number(points || 0) > 0 && opts && opts.orderId) {
            try {
                // Check order document for loyalty usage
                const ordSnap = await sdk.db.collection('Orders').doc(opts.orderId).get();
                const ord = ordSnap && ordSnap.exists ? (ordSnap.data ? ordSnap.data() : ordSnap._data || {}) : {};
                const usedOnOrder = Number(ord.loyaltyPointsUsed || ord.redeemedPoints || 0) || 0;
                if (usedOnOrder > 0) {
                    try { console.log('[awardPointsToCustomer] skipping earn: order used loyalty', { orderId: opts.orderId, usedOnOrder }); } catch(e){}
                    try { if (sdk && sdk.db) sdk.db.collection('LoyaltyAudit').doc().set({ event: 'awardSkipped_orderUsedLoyalty', orderId: opts.orderId, customerId, usedOnOrder, ts: new Date() }); } catch(e){}
                    return oldPoints; // don't award
                }
            } catch (e) {
                // ignore order read errors and proceed to history check
            }

            try {
                // Check LoyaltyHistory for any negative entries tied to this order
                // Avoid composite queries that mix equality and range filters (may require composite index).
                const histSnap = await sdk.db.collection('LoyaltyHistory')
                    .where('orderId', '==', opts.orderId)
                    .limit(50)
                    .get();
                let foundRedeem = false;
                if (histSnap && histSnap.docs && histSnap.docs.length > 0) {
                    for (const d of histSnap.docs) {
                        try {
                            const pts = (d.data && d.data().points) || (d._data && d._data.points) || 0;
                            if (Number(pts) < 0) { foundRedeem = true; break; }
                        } catch (inner) {}
                    }
                }
                if (foundRedeem) {
                    try { console.log('[awardPointsToCustomer] skipping earn: LoyaltyHistory shows redeem for order', { orderId: opts.orderId }); } catch(e){}
                    try { if (sdk && sdk.db) sdk.db.collection('LoyaltyAudit').doc().set({ event: 'awardSkipped_historyShowsRedeem', orderId: opts.orderId, customerId, ts: new Date() }); } catch(e){}
                    return oldPoints; // don't award
                }
            } catch (e) {
                // if history check fails, continue and allow award (best-effort)
            }
        }

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
            await custRef.update(sanitize({ loyaltyPoints: newPoints }));
            try { console.debug('[awardPointsToCustomer] updated customer loyaltyPoints via update', { customerId, oldPoints, newPoints }); } catch(e){}
        } catch (e) {
            try {
                await custRef.set({ loyaltyPoints: newPoints }, { merge: true });
                try { console.debug('[awardPointsToCustomer] updated customer loyaltyPoints via set(merge)', { customerId, oldPoints, newPoints }); } catch(e){}
            } catch (setErr) {
                console.error('[awardPointsToCustomer] failed to persist loyaltyPoints for customer', customerId, setErr);
                throw setErr;
            }
        }

        // Write history entry
        try {
            await sdk.db.collection('LoyaltyHistory').doc().set({
                customerId,
                customerName: opts.customerName || null,
                points: Number(points || 0),
                type: opts.type || (points >= 0 ? 'earn' : 'redeem'),
                orderId: opts.orderId || null,
                note: opts.note || null,
                createdAt: new Date()
            });
            try { console.debug('[awardPointsToCustomer] wrote LoyaltyHistory entry', { customerId, points, orderId: opts.orderId || null }); } catch(e){}
        } catch (e) {
            console.warn('Failed to write LoyaltyHistory', e);
        }

        try { window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId, updatedFields: { loyaltyPoints: newPoints } } })); } catch (e) {}

        return newPoints;
    } catch (e) {
        console.error('awardPointsToCustomer error', e);
        return null;
    }
}

/**
 * Compute available points for a customer as:
 *   earnedPoints = floor(sum of completed/paid orders finalAmount)
 *   available = earnedPoints (ignoring redeemedPoints temporarily)
 * Returns { earnedPoints, redeemedPoints, available }
 */
export async function computeAvailablePoints(customerId) {
    if (!customerId) return { earnedPoints: 0, redeemedPoints: 0, available: 0 };
    if (!sdk || !sdk.db) throw new Error('DB not available');
    try {
        // Sum completed/paid orders
        let totalSpend = 0;
        try {
            // Primary query: orders with custId field
            let ordersSnap = await sdk.db.collection('Orders').where('custId', '==', customerId).get();
            let orders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
            // If no orders found, try fallback to nested customer.id (some orders store customer under customer.id)
            if ((!orders || orders.length === 0)) {
                try {
                    ordersSnap = await sdk.db.collection('Orders').where('customer.id', '==', customerId).get();
                    orders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
                } catch (e2) {
                    // ignore fallback failure
                }
            }

            // Only include orders that are settled/paid (exclude pending COD / unsettled)
            const qualifying = orders.filter(o => orderIsSettled(o));

            // Sum amounts eligible for earning points — prefer settledAmount, then finalAmount; subtract any loyaltyDiscount
            totalSpend = qualifying.reduce((s, o) => {
                const od = o.data || o;
                const gross = Number(od.settledAmount ?? od.finalAmount ?? od.itemTotal ?? od.total ?? 0) || 0;
                const loyaltyDisc = Number(od.loyaltyDiscountAmount || od.loyaltyDiscount || 0) || 0;
                return s + Math.max(0, gross - loyaltyDisc);
            }, 0);
            try { console.debug('[computeAvailablePoints] customerId=', customerId, 'ordersFound=', orders.length, 'qualifying=', qualifying.length, 'totalSpend=', totalSpend); } catch (e) {}
        } catch (e) {
            console.warn('computeAvailablePoints: failed to sum orders', e);
            totalSpend = 0;
        }

            // If we couldn't determine spend from Orders (no qualifying orders or query failed),
            // fall back to any stored aggregate on the Customers document (totalPaid/totalSpent/total).
            // This helps when Orders are not readable due to permissions or historical data is stored
            // as a denormalized aggregate on the customer record.
            try {
                if ((!totalSpend || totalSpend === 0) && sdk && sdk.db) {
                    const custSnap = await sdk.db.collection('Customers').doc(customerId).get();
                    if (custSnap && custSnap.exists) {
                        const cd = custSnap.data ? custSnap.data() : (custSnap._data || {});
                        const fallbackTotal = Number(cd.totalPaid || cd.totalSpent || cd.total || 0) || 0;
                        if (fallbackTotal > 0) {
                            totalSpend = fallbackTotal;
                            try { console.debug('[computeAvailablePoints] used Customers aggregate fallback totalSpend=', totalSpend, 'for customer=', customerId); } catch(e){}
                        }
                    }
                }
            } catch (e) {
                // ignore fallback failure
                try { console.warn('[computeAvailablePoints] customer aggregate fallback failed', e); } catch(e){}
            }

            // Use configured points-per-currency (from LoyaltyRules) when available
        let rate = 1;
        try {
            rate = await getPointsPerCurrency();
        } catch (e) {
            rate = 1;
        }

        const earnedPoints = Math.floor(totalSpend * (Number(rate) || 1));

        // Compute redeemed points by summing negative entries in LoyaltyHistory
        let redeemed = 0;
        try {
            const histSnap = await sdk.db.collection('LoyaltyHistory')
                .where('customerId', '==', customerId)
                .where('points', '<', 0)
                .get();
            if (histSnap && histSnap.docs && histSnap.docs.length > 0) {
                // Filter out any non-operational history entries created by maintenance (e.g. type === 'recalc')
                redeemed = histSnap.docs.reduce((s, d) => {
                    const dd = (d.data && d.data()) || (d._data || {});
                    // Ignore recalc adjustment entries which should not count as customer-initiated redemptions
                    if (dd && dd.type && String(dd.type).toLowerCase() === 'recalc') return s;
                    const v = dd.points || 0;
                    return s + Math.abs(Number(v || 0));
                }, 0);
            }
        } catch (e) {
            console.warn('[computeAvailablePoints] failed to fetch LoyaltyHistory for redeemed sum', e);
            redeemed = 0;
        }
        const available = Math.max(0, Number(earnedPoints || 0) - Number(redeemed || 0));

        // Determine birthday eligibility from customer record (support multiple field names)
        let birthdayEligible = false;
        try {
            const custSnap = await sdk.db.collection('Customers').doc(customerId).get();
            const custData = (custSnap && custSnap.exists && typeof custSnap.data === 'function') ? custSnap.data() : (custSnap && custSnap._data) || {};
            const b = custData && (custData.birthday || custData.dob || custData.birthdate) ? (custData.birthday || custData.dob || custData.birthdate) : '';
            if (b) {
                const parseDOB = (val) => {
                    if (!val) return null;
                    if (val instanceof Date) return val;
                    if (typeof val === 'number' && !isNaN(val)) return new Date(val);
                    const s = String(val).trim();

                    // Try native Date parse first (handles ISO and many formats)
                    const iso = new Date(s);
                    if (!isNaN(iso.getTime())) return iso;

                    // Match three numeric groups separated by - or /
                    const m = s.match(/^(\d{1,4})[\-/](\d{1,2})[\-/](\d{1,4})$/);
                    if (!m) return null;
                    try {
                        const g1 = parseInt(m[1], 10);
                        const g2 = parseInt(m[2], 10);
                        const g3 = parseInt(m[3], 10);
                        let day, month, year;

                        // If first group is 4-digit, interpret as YYYY-MM-DD
                        if (String(m[1]).length === 4) {
                            year = g1; month = g2; day = g3;
                        } else if (String(m[3]).length === 4) {
                            // If last group is 4-digit, interpret as DD-MM-YYYY
                            day = g1; month = g2; year = g3;
                        } else {
                            // Ambiguous two-digit-year: assume DD-MM-YY
                            day = g1; month = g2; year = g3;
                            if (year < 100) year += (year > 30 ? 1900 : 2000);
                        }

                        if (month < 1 || month > 12) return null;
                        if (day < 1 || day > 31) return null;
                        return new Date(year, month - 1, day);
                    } catch (e) {
                        return null;
                    }
                };

                const dob = parseDOB(b);
                if (dob && !isNaN(dob.getTime())) {
                    const today = new Date();
                    birthdayEligible = (dob.getDate() === today.getDate() && dob.getMonth() === today.getMonth());
                }
            }
        } catch (e) {
            try { console.warn('[computeAvailablePoints] failed to determine birthday eligibility', e); } catch (ee) {}
            birthdayEligible = false;
        }

        try { console.debug('[computeAvailablePoints] customerId=', customerId, 'earnedPoints=', earnedPoints, 'redeemed=', redeemed, 'available=', available, 'rate=', rate, 'totalSpend=', totalSpend, 'birthdayEligible=', birthdayEligible); } catch (e) {}

        return { earnedPoints, redeemedPoints: redeemed, available, rate, totalSpend, birthdayEligible };

    } catch (e) {
        console.error('computeAvailablePoints error', e);
        return { earnedPoints: 0, redeemedPoints: 0, available: 0 };
    }
}

/**
 * Reconcile stored Customers.loyaltyPoints with the computed value.
 * If computedAvailable > 0 and differs from stored, update the Customers document
 * so UIs that read the stored field see the canonical computed value.
 * Returns an object: { computedAvailable, stored, updated: boolean }
 */
export async function syncCustomerLoyaltyPoints(customerId, computedAvailable = null) {
    if (!customerId) return { computedAvailable: 0, stored: 0, updated: false };
    if (!sdk || !sdk.db) throw new Error('DB not available');
    try {
        let computed = computedAvailable;
        if (computed == null) {
            const pts = await computeAvailablePoints(customerId);
            computed = Number(pts.available || 0) || 0;
        }

        // Read stored value
        let stored = 0;
        try {
            const snap = await sdk.db.collection('Customers').doc(customerId).get();
            if (snap && snap.exists) {
                const cd = (typeof snap.data === 'function') ? snap.data() : (snap.data || {});
                stored = Number(cd.loyaltyPoints || 0) || 0;
            }
        } catch (e) {
            console.warn('[syncCustomerLoyaltyPoints] failed to read customer', e);
        }

        // Only update when computed is positive and different from stored
        if (computed > 0 && Number(stored) !== Number(computed)) {
            try {
                await sdk.db.collection('Customers').doc(customerId).set({ loyaltyPoints: Number(computed) }, { merge: true });
                try { window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId, updatedFields: { loyaltyPoints: Number(computed) } } })); } catch (e) {}
                try { console.debug('[syncCustomerLoyaltyPoints] updated stored loyaltyPoints', { customerId, stored, computed }); } catch(e){}
                return { computedAvailable: computed, stored, updated: true };
            } catch (e) {
                console.warn('[syncCustomerLoyaltyPoints] failed to update customer loyaltyPoints', e);
                return { computedAvailable: computed, stored, updated: false };
            }
        }

        return { computedAvailable: computed, stored, updated: false };
    } catch (e) {
        console.error('[syncCustomerLoyaltyPoints] error', e);
        return { computedAvailable: 0, stored: 0, updated: false };
    }
}

// Recalculate loyalty points for all customers based on LoyaltyRules (spend_ratio)
export async function recalcAllCustomers(progressCb = null) {
    if (!sdk || !sdk.db) throw new Error('DB not available');

    // Use configured points-per-currency if available
    let pointsPerCurrency = 1;
    try { pointsPerCurrency = await getPointsPerCurrency(); } catch (e) { pointsPerCurrency = 1; }

    // Fetch all customers
    const customersSnap = await sdk.db.collection('Customers').get();
    const customers = customersSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));

    let processed = 0;
        for (const cust of customers) {
        try {
            // Fetch customer's qualifying orders (paid/completed)
            // Fetch all orders for customer and sum qualifying ones (no limit)
            // Fetch orders by custId primarily, fallback to customer.id if needed
            let ordersSnap = await sdk.db.collection('Orders').where('custId', '==', cust.id).get();
            let orders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
            if ((!orders || orders.length === 0)) {
                try {
                    ordersSnap = await sdk.db.collection('Orders').where('customer.id', '==', cust.id).get();
                    orders = ordersSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
                } catch (e2) {
                    // ignore fallback
                }
            }

            // Only include orders that are settled/paid (exclude pending COD / unsettled)
            const qualifying = orders.filter(o => orderIsSettled(o));

            // Sum completed/paid orders' eligible amounts (prefer settledAmount, fallback to finalAmount/itemTotal/total)
            let totalSpend = qualifying.reduce((s, o) => {
                const od = o.data || o;
                const gross = Number(od.settledAmount ?? od.finalAmount ?? od.itemTotal ?? od.total ?? 0) || 0;
                const loyaltyDisc = Number(od.loyaltyDiscountAmount || od.loyaltyDiscount || 0) || 0;
                return s + Math.max(0, gross - loyaltyDisc);
            }, 0);
            // If no qualifying orders found, fall back to any stored totalPaid/totalSpent on customer
            if (!totalSpend || totalSpend === 0) {
                totalSpend = Number(cust.totalPaid || cust.totalSpent || cust.total || 0) || 0;
            }

            // Compute earned points using configured rate
            const earnedPoints = Math.floor(totalSpend * (Number(pointsPerCurrency) || 1));

            // Compute redeemed points from LoyaltyHistory for this customer (sum of negative entries)
            let redeemedPoints = 0;
            try {
                const h = await sdk.db.collection('LoyaltyHistory')
                    .where('customerId', '==', cust.id)
                    .where('points', '<', 0)
                    .get();
                if (h && h.docs && h.docs.length > 0) {
                    // Ignore maintenance/adjustment entries (type === 'recalc') when computing redeemed totals
                    redeemedPoints = h.docs.reduce((s, d) => {
                        const dd = (d.data && d.data()) || (d._data || {});
                        if (dd && dd.type && String(dd.type).toLowerCase() === 'recalc') return s;
                        return s + Math.abs(Number(dd.points || 0));
                    }, 0);
                }
            } catch (e) {
                console.warn('recalcAllCustomers: failed to fetch LoyaltyHistory for', cust.id, e);
                redeemedPoints = 0;
            }

            // New loyalty points = earned points minus redeemed points
            const newPoints = Math.max(0, Number(earnedPoints || 0) - Number(redeemedPoints || 0));
            const oldPoints = Number(cust.loyaltyPoints || 0) || 0;
            const delta = newPoints - oldPoints;

            if (delta !== 0) {
                // Update customer loyaltyPoints to the recalculated canonical value.
                // NOTE: intentionally avoid writing an adjustment entry into LoyaltyHistory here
                // because computeAvailablePoints counts negative LoyaltyHistory entries when
                // computing redeemed totals. Writing recalc adjustments into the same collection
                // can lead to inflated redeemed sums when recalc runs multiple times.
                try {
                    await sdk.db.collection('Customers').doc(cust.id).update({ loyaltyPoints: newPoints });
                } catch (e) {
                    // fallback to set if update fails
                    try { await sdk.db.collection('Customers').doc(cust.id).set({ loyaltyPoints: newPoints }, { merge: true }); } catch (e2) { console.warn('Failed to update customer points', cust.id, e2); }
                }

                // Notify UI and other listeners that the customer's loyaltyPoints changed.
                try { window.dispatchEvent(new CustomEvent('customerUpdated', { detail: { customerId: cust.id, updatedFields: { loyaltyPoints: newPoints } } })); } catch (e) { /* ignore */ }
            }
        } catch (e) {
            console.warn('Failed to recalc for customer', cust.id, e);
        }

        processed += 1;
        if (typeof progressCb === 'function') progressCb(processed, customers.length);
    }

    return { processed: customers.length, rate: pointsPerCurrency };
}

export default { recalcAllCustomers };

// Debug helpers: expose core functions for quick console inspection in development only.
try {
    if (typeof window !== 'undefined') {
        if (!window.__computeAvailablePoints) window.__computeAvailablePoints = computeAvailablePoints;
        if (!window.__awardPointsToCustomer) window.__awardPointsToCustomer = awardPointsToCustomer;
        if (!window.__recalcAllCustomers) window.__recalcAllCustomers = recalcAllCustomers;
    }
} catch (e) { /* ignore in restricted environments */ }
