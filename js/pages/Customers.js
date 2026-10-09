console.log('Importing CustomerDetails...');
import { useState, useEffect, useMemo, useRef } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Order } from '../models/Order.js';
import { sdk } from '../sdk.js';
import { UserSession } from '../utils/UserSession.js';
import { CustomerCard } from '../components/CustomerCard.js';
import { CustomerDetails } from '../components/CustomerDetails.js'
import { ModalManager } from '../components/ModalManager.js';
import { propagateCustomerUpdate, isPhoneNumberExists } from '../utils/CustomerSync.js';
import { removeCustomerPayment } from '../utils/CustomerSync.js';
import LoyaltyRules from '../components/LoyaltyRules.js';
import Levels from '../components/Levels.js';
import SearchBar from '../components/SearchBar.js';
import { ChargesCalculator } from '../utils/ChargesCalculator.js';

// Customers Component
export default function Customers() {
    // ...existing code...
    // ...existing code...
    // All useState declarations first
    const [tierDropdownOpen, setTierDropdownOpen] = useState(false);
    const [customers, setCustomers] = useState([]);
    const customersRef = useRef([]);
    const customersRefreshTimeoutRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all', 'creditors'
    const [tierFilter, setTierFilter] = useState('all'); // 'all', 'Gold', 'Silver', 'Bronze'
    const [levels, setLevels] = useState([]);
    const [spendSort, setSpendSort] = useState('none'); // 'none' | 'asc' | 'desc'
    const [aovSort, setAovSort] = useState('none'); // 'none' | 'asc' | 'desc'
    const [spendDropdownOpen, setSpendDropdownOpen] = useState(false);
    const [aovDropdownOpen, setAovDropdownOpen] = useState(false);
    const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [customerCardLoaded, setCustomerCardLoaded] = useState(false);
    const [customersUnsubscribe, setCustomersUnsubscribe] = useState(null);
    // New for tab switching
    const [activeTab, setActiveTab] = useState('database'); // 'database' | 'loyalty' | 'levels'
    // Date range filter state
    const [dateRange, setDateRange] = useState([null, null]);
    const [startDate, endDate] = dateRange;
    // Persistent debug instance ID (after all useState)
    const [instanceId] = useState(() => Math.random().toString(36).substr(2, 6));
    console.log(`[RENDER][${instanceId}] Customers component. tierFilter:`, tierFilter, '| searchQuery:', searchQuery);
    // Close dropdown when clicking outside
    useEffect(() => {
        if (!tierDropdownOpen) return;
        function handleClick(e) {
            setTierDropdownOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [tierDropdownOpen]);

    // Close spend/aov dropdowns when clicking outside (simple global handler)
    useEffect(() => {
        if (!spendDropdownOpen && !aovDropdownOpen) return;
        function handleClick(e) {
            // Close both dropdowns on any outside click. Internal dropdowns stopPropagation on clicks.
            setSpendDropdownOpen(false);
            setAovDropdownOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [spendDropdownOpen, aovDropdownOpen]);


    useEffect(() => {
        console.log('tierFilter state changed:', tierFilter);
    }, [tierFilter]);

    // Debug logs for sort state changes
    useEffect(() => {
        console.log('[Customers.js] spendSort changed ->', spendSort);
    }, [spendSort]);

    useEffect(() => {
        console.log('[Customers.js] aovSort changed ->', aovSort);
    }, [aovSort]);

    // Handler to open the editable customer details modal
    function openCustomerDetailsModal(customer) {
        try {
            console.log('[Customers.js] Creating CustomerDetails instance for:', customer);
            const details = new CustomerDetails();
            console.log('[Customers.js] Calling showCustomerDetailsModal for:', customer);
            details.showCustomerDetailsModal(customer);
        } catch (e) {
            console.error('[Customers.js] Error opening customer details modal:', e);
            alert('Unable to open customer details modal.');
        }
    }

    useEffect(() => {
        // Check if CustomerCard component is loaded
        if (!CustomerCard) {
            // Load CustomerCard component dynamically
            // First ensure ModalManager is loaded
            const loadDependencies = async () => {
                try {
                    // Now load CustomerCard
                    const script = document.createElement('script');
                    script.src = 'js/components/CustomerCard.js';

                    script.onload = () => {
                        console.log("CustomerCard loaded successfully");
                        setCustomerCardLoaded(true);
                    };

                    document.head.appendChild(script);
                } catch (error) {
                    console.error("Error loading dependencies:", error);
                    setCustomerCardLoaded(true); // Set to true anyway to prevent infinite loading
                }
            };

            loadDependencies();
        } else {
            setCustomerCardLoaded(true);
        }

        fetchCustomers();
        // subscribe to LoyaltyLevels so we can compute tiers dynamically
        let unsubLevels = null;
        try {
            if (sdk && sdk.db && typeof sdk.db.collection === 'function') {
                const col = sdk.db.collection('LoyaltyLevels');
                if (col && typeof col.onSnapshot === 'function') {
                    unsubLevels = col.onSnapshot(snap => {
                        try {
                            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                            items.sort((a, b) => (Number(b.condition || 0) - Number(a.condition || 0)));
                            setLevels(items);
                        } catch (e) { console.warn('LoyaltyLevels mapping error', e); }
                    }, e => console.warn('Failed to listen LoyaltyLevels', e));
                }
            }
        } catch (e) { console.warn('LoyaltyLevels subscribe error', e); }
        // Listen for customerAdded events from other parts of the app (checkout, modals)
        const onCustomerAdded = (e) => {
            try {
                const newCust = e?.detail;
                if (!newCust || !newCust.id) return;
                console.log('[Customers.js] customerAdded event received', newCust);
                setCustomers(prev => {
                    // avoid duplicate
                    if (prev.some(c => c.id === newCust.id)) return prev;
                    return [newCust, ...prev];
                });
            } catch (err) {
                console.warn('Error handling customerAdded event', err);
            }
        };
        // Listen for customerUpdated events to keep local cache in sync
        const onCustomerUpdated = (e) => {
            try {
                const detail = e?.detail || {};
                const cid = detail.customerId || (detail.id || null);
                const updatedFields = detail.updatedFields || {};
                if (!cid) return;
                console.log('[Customers.js] customerUpdated event received for', cid, updatedFields);

                // Update in-memory list and keep customersRef in sync.
                // Avoid triggering a full fetch on every update because
                // we already maintain a realtime listener via onSnapshot.
                setCustomers(prev => {
                    const exists = prev.some(c => c.id === cid);
                    if (exists) {
                        const updated = prev.map(c => c.id === cid ? ({ ...c, ...updatedFields }) : c);
                        try { customersRef.current = updated; } catch(e){}
                        return updated;
                    }

                    // If caller sent a full customer object (or name), prepend it so UI can show it
                    if (detail && (detail.name || detail.phone)) {
                        const newCust = { id: cid, ...(detail || {}) };
                        const updated = [newCust, ...prev];
                        try { customersRef.current = updated; } catch(e){}
                        return updated;
                    }

                    return prev;
                });

                // Respect explicit requests to force a full refresh (rare). Use detail.forceRefresh = true
                if (detail && detail.forceRefresh) {
                    try {
                        if (customersRefreshTimeoutRef.current) clearTimeout(customersRefreshTimeoutRef.current);
                        customersRefreshTimeoutRef.current = setTimeout(() => {
                            try { fetchCustomers(); } catch (e) { /* non-fatal */ }
                            finally { customersRefreshTimeoutRef.current = null; }
                        }, 500);
                    } catch (e) { /* ignore */ }
                }
            } catch (err) {
                console.warn('Error handling customerUpdated event', err);
            }
        };
        window.addEventListener('customerAdded', onCustomerAdded);
        window.addEventListener('customerUpdated', onCustomerUpdated);
        // cleanup: remove listener when component unmounts
        return () => {
            try { window.removeEventListener('customerAdded', onCustomerAdded); } catch (e) { console.warn('Failed to remove customerAdded listener', e); }
            try { window.removeEventListener('customerUpdated', onCustomerUpdated); } catch (e) { console.warn('Failed to remove customerUpdated listener', e); }
            try { if (typeof unsubLevels === 'function') unsubLevels(); } catch (e) {}
        };
    }, []);

    // Listen for activation from other components (e.g., Levels -> view customers in a tier)
    useEffect(() => {
        const handler = (e) => {
            try {
                const tier = e?.detail?.tier || (e && e.tier) || null;
                if (!tier) return;
                const t = String(tier).trim();
                // Map to exact option values used by the select so the dropdown value matches
                const up = t.toUpperCase();
                let mapped = t;
                if (up === 'VIP') mapped = 'VIP';
                else if (up === 'GOLD') mapped = 'Gold';
                else if (up === 'SILVER') mapped = 'Silver';
                else if (up === 'BRONZE') mapped = 'Bronze';

                setActiveTab('database'); // ensure the customers view is visible
                setTierFilter(mapped);
                // scroll to top to show filters
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch (err) { console.warn('activateTierFilter handler error', err); }
        };
        window.addEventListener('activateTierFilter', handler);
        return () => window.removeEventListener('activateTierFilter', handler);
    }, []);
    

    // Fetch customers from SDK
    const fetchCustomers = async () => {
        try {
            setLoading(true);
            // Use the SDK to fetch customers as in the Flutter code
            const customersQuery = sdk.db.collection("Customers");

            // Cancel any existing listener
            if (customersUnsubscribe) {
                customersUnsubscribe();
            }

            // Setup real-time listener
            const unsubscribe = customersQuery.onSnapshot(snapshot => {
                const customersList = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Propagate changes for modified customer docs
                try {
                    const modified = snapshot.docChanges ? snapshot.docChanges().filter(c => c.type === 'modified' || c.type === 'changed') : [];
                    (modified || []).forEach(change => {
                        try {
                            const id = change.doc.id || (change.id);
                            const updatedFields = change.doc.data ? change.doc.data() : (change.doc && change.doc._data) || {};
                            // Call propagate helper with only changed fields
                            propagateCustomerUpdate(id, updatedFields).catch(e => console.warn('propagateCustomerUpdate error', e));
                        } catch (e) { /* non-fatal */ }
                    });
                } catch (e) {
                    // Older SDKs may not expose docChanges() in the same way; ignore
                }

                // Sort customers so the most recent (newest join date) appear first
                // Handles Firestore Timestamp (has toDate), JS Date, string or numeric timestamps
                customersList.sort((a, b) => {
                    const toMillis = (d) => {
                        if (!d) return 0;
                        if (typeof d.toDate === 'function') {
                            try { return d.toDate().getTime(); } catch (e) { return 0; }
                        }
                        const parsed = new Date(d);
                        return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
                    };
                    return toMillis(b.date) - toMillis(a.date);
                });

                setCustomers(customersList);
                    try { customersRef.current = customersList; } catch (e) {}
                setLoading(false);
            }, error => {
                console.error('Error listening to customers:', error);
                setError('Failed to load customers');
                setLoading(false);
            });

            // Store the unsubscribe function in state
            setCustomersUnsubscribe(() => unsubscribe);
        } catch (err) {
            console.error('Error setting up customers listener:', err);
            setError('Failed to load customers');
            setLoading(false);
        }
    };

    // Clean up listener when component unmounts
    useEffect(() => {
        return () => {
            if (customersUnsubscribe) {
                customersUnsubscribe();
            }
        };
    }, [customersUnsubscribe]);

    // keep customersRef up to date for use in other listeners (orders)
    useEffect(() => {
        try { customersRef.current = customers; } catch (e) {}
    }, [customers]);

    // Fetch all orders for all customers (for metrics) - realtime
    const [orders, setOrders] = useState([]);
    useEffect(() => {
        if (!sdk || !sdk.db) return;
        console.log('[Customers.js] Subscribing to Orders collection for metrics');
        const ordersRef = sdk.db.collection("Orders");
        const unsubscribe = ordersRef.onSnapshot(snapshot => {
            try {
                // build an array of order data, but filter out orphan 'pending cod' orders
                const currentCustomerIds = new Set((customersRef.current || []).map(c => c.id));
                const orderDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const visibleOrderDocs = orderDocs.filter(data => {
                    try {
                        const status = String(data.status || data.paymentStatus || data.paymentMethod || '').toLowerCase();
                        // if order is pending COD and references a custId that doesn't exist, drop it
                        if (status.includes('pending cod') || status.includes('pending-cod') || status.includes('pending_cod')) {
                            const custId = data.custId || (data.customer && data.customer.id) || null;
                            if (custId && !currentCustomerIds.has(custId)) return false;
                        }
                    } catch (e) { /* ignore and keep the order */ }
                    return true;
                });

                const fetchedOrders = visibleOrderDocs.map(doc => {
                    const data = doc;

                    // Normalize items and compute itemTotal
                    const items = Array.isArray(data.items) ? data.items : [];
                    const itemTotal = items.reduce((sum, item) => {
                        const qty = Number(item.quantity ?? item.qnt ?? 1) || 1;
                        const addonsTotal = Array.isArray(item.addons) ? item.addons.reduce((s, a) => s + (Number(a.price) || 0), 0) : (Number(item.addonsTotal) || 0);
                        // If item.total exists and is numeric and > 0, prefer it; else compute from price * qty + addons
                        const unitPrice = Number(item.price ?? item.variantPrice ?? item.mrp ?? 0) || 0;
                        const lineTotal = (typeof item.total === 'number' && !isNaN(item.total)) ? Number(item.total) : ((unitPrice + addonsTotal) * qty);
                        return sum + lineTotal;
                    }, 0);

                    // Use ChargesCalculator to compute finalAmount and calculated charges if possible
                    let finalAmount = data.finalAmount ?? null;
                    let calculatedCharges = data.calculatedCharges || [];
                    try {
                        const discount = Number(data.discount) || 0;
                        const charges = Array.isArray(data.charges) ? data.charges : [];
                        const calc = ChargesCalculator.calculateCharges(itemTotal, charges, discount);
                        calculatedCharges = calc.calculatedCharges || calculatedCharges;
                        finalAmount = calc.finalAmount;
                    } catch (e) {
                        // fallback: if no charges available and no finalAmount, leave as-is or compute simple 18% tax
                        if (finalAmount == null) {
                            const taxAmount = itemTotal * 0.18;
                            finalAmount = itemTotal + taxAmount;
                        }
                    }

                    return {
                        ...data,
                        items,
                        itemTotal,
                        calculatedCharges,
                        finalAmount
                    };
                });

                setOrders(fetchedOrders);
                console.log('[Customers.js] Orders snapshot received, count:', fetchedOrders.length);
                // Detect removed orders and update customer aggregates
                try {
                    const changes = snapshot.docChanges ? snapshot.docChanges() : [];
                    (changes || []).forEach(change => {
                        try {
                            if (change.type === 'removed') {
                                const removed = { id: change.doc.id, ...(change.doc.data ? change.doc.data() : {}) };
                                const custId = removed.custId || (removed.customer && removed.customer.id) || null;
                                if (custId && custId !== 'guest') {
                                    // Remove payment entry and adjust totals
                                    removeCustomerPayment(custId, { orderId: removed.id, amount: removed.finalAmount || removed.settledAmount || removed.total || 0 }).catch(e => console.warn('removeCustomerPayment failed', e));
                                }
                            }
                        } catch (e) { /* ignore per-change errors */ }
                    });
                } catch (e) { console.warn('Error handling order changes for customer sync', e); }
            } catch (err) {
                console.error('[Customers.js] Error processing orders snapshot', err);
            }
        }, err => {
            console.error('[Customers.js] Error listening to Orders:', err);
            setOrders([]);
        });

        return () => {
            try { unsubscribe(); console.log('[Customers.js] Unsubscribed from Orders'); } catch (e) {}
        };
    }, []);

    // Helper: Calculate metrics for a customer
    function getCustomerMetrics(customer) {
        // Find orders that belong to this customer. Some orders may store customer info differently
        const custOrders = orders
            .filter(o => {
                if (!o) return false;
                try {
                    // Direct match by custId
                    if (o.custId && customer.id && o.custId === customer.id) return true;
                    // Match by phone (some flows persist custPhone)
                    if (customer.phone && (o.custPhone === customer.phone || o.custPhone === (customer.phone || ''))) return true;
                    // Match by name as fallback
                    if (customer.name && o.custName && o.custName === customer.name) return true;
                } catch (e) {
                    return false;
                }
                return false;
            })
            .map(o => new Order(o));

        const totalOrders = custOrders.length;
        // Calculate total spend using finalAmount (preferred), then itemTotal, then items sum, then total
        const totalSpend = custOrders.reduce((sum, o) => {
            const fa = Number(o.data?.finalAmount ?? o.data?.finalAmount) || NaN;
            if (!isNaN(fa) && fa !== 0) return sum + fa;

            if (typeof o.itemTotal === 'number' && !isNaN(o.itemTotal)) return sum + Number(o.itemTotal);

            if (Array.isArray(o.items)) {
                const itemsSum = o.items.reduce((s, item) => {
                    const qty = Number(item.quantity ?? item.qnt ?? item.qnt ?? 1) || 1;
                    const price = Number(item.price ?? item.variantPrice ?? item.mrp ?? 0) || 0;
                    const lineTotal = Number(item.total ?? ((price) * qty)) || 0;
                    return s + lineTotal;
                }, 0);
                return sum + itemsSum;
            }

            const t = Number(o.total ?? o.data?.total ?? 0) || 0;
            return sum + t;
        }, 0);

        const aov = totalOrders > 0 ? (totalSpend / totalOrders) : 0;
        // Use placeDate getter for correct date
        const lastOrder = custOrders.length > 0 ? new Date(Math.max(...custOrders.map(o => o.placeDate ? new Date(o.placeDate).getTime() : 0))) : null;
        // Visit frequency: average gap in days between orders
        let visitFrequency = null;
        if (custOrders.length > 1) {
            const sorted = custOrders
                .map(o => o.placeDate ? new Date(o.placeDate).getTime() : 0)
                .filter(ts => ts > 0)
                .sort((a, b) => a - b);
            let totalGap = 0;
            for (let i = 1; i < sorted.length; i++) {
                totalGap += (sorted[i] - sorted[i - 1]);
            }
            visitFrequency = totalGap / (sorted.length - 1) / (1000 * 60 * 60 * 24); // in days
        }
        // Tier: compute from LoyaltyLevels if available, else fallback heuristic
        let tier = 'Bronze';
        try {
            if (Array.isArray(levels) && levels.length) {
                // levels are sorted descending by condition (highest first)
                const matched = levels.find(l => {
                    const cond = Number(l.condition || 0) || 0;
                    return totalSpend >= cond;
                });
                if (matched) {
                    // prefer name but fallback to id
                    tier = String(matched.name || matched.id || 'Bronze');
                }
            } else {
                // fallback heuristic aligned with Levels defaults
                // VIP: spend >= 5000
                // Gold: spend >= 1500
                // Silver: spend >= 400
                if (totalSpend >= 5000) tier = 'VIP';
                else if (totalSpend >= 1500) tier = 'Gold';
                else if (totalSpend >= 400) tier = 'Silver';
            }
        } catch (e) {
            // keep fallback (aligned with Levels defaults)
            if (totalSpend >= 5000) tier = 'VIP';
            else if (totalSpend >= 1500) tier = 'Gold';
            else if (totalSpend >= 400) tier = 'Silver';
        }
        // Preferred items: top 3 most ordered
        const itemCounts = {};
        custOrders.forEach(o => {
            (o.items || []).forEach(item => {
                const key = item.title || item.pid || item.productId || item.name;
                if (!key) return;
                itemCounts[key] = (itemCounts[key] || 0) + (item.quantity || item.qnt || 1);
            });
        });
        const preferredItems = Object.entries(itemCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name);
        // Contact preferences (mock: WhatsApp if phone, Email if email, SMS if phone)
        const contactPrefs = [];
        if (customer.phone) contactPrefs.push('WhatsApp', 'SMS');
        if (customer.email) contactPrefs.push('Email');
        return {
            totalOrders,
            totalSpend,
            aov,
            lastOrder,
            visitFrequency,
            tier,
            preferredItems,
            contactPrefs
        };
    }

    // Filter customers based on search query and filter type
    // Filter customers by join date (customer.date) within selected range
    const filteredCustomers = useMemo(() => {
    const filtered = customers.filter(customer => {
            // Search filter
            const matchesSearch = (customer?.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
                (customer?.phone || '').includes(searchQuery);

            // Type filter
            const matchesType = filterType === 'all' ||
                (filterType === 'creditors' && (customer?.balance || 0) < 0);

            // Tier filter (use getCustomerMetrics)
            const customerTierRaw = getCustomerMetrics(customer).tier || '';
            const customerTier = String(customerTierRaw || '').toLowerCase();
            const filterTier = String(tierFilter || 'all').toLowerCase();
            const matchesTier = filterTier === 'all' || (customerTier === filterTier);

            // Date filter: joined within selected range
            let matchesDate = true;
            if (startDate && endDate) {
                let joinDate = customer.date;
                // Firestore Timestamp
                if (joinDate && typeof joinDate.toDate === 'function') {
                    joinDate = joinDate.toDate();
                } else if (typeof joinDate === 'string' || typeof joinDate === 'number') {
                    joinDate = new Date(joinDate);
                }
                if (joinDate instanceof Date && !isNaN(joinDate.getTime())) {
                    // Only include if joinDate is within [startDate, endDate] (inclusive)
                    matchesDate = joinDate >= startDate && joinDate <= endDate;
                } else {
                    // If no valid join date, exclude from results
                    matchesDate = false;
                }
            }

            return matchesSearch && matchesType && matchesTier && matchesDate;
        });
    console.log('Filtering customers by join date. tierFilter:', tierFilter, 'Filtered count:', filtered.length, 'Date range:', startDate, endDate, '| searchQuery:', searchQuery);
        // After filtering, sort customers by most recent order date (descending).
        // Use getCustomerMetrics(customer).lastOrder if available, otherwise fall back to customer's join date (`customer.date`).
        const toTime = (cust) => {
            try {
                const metrics = getCustomerMetrics(cust);
                const last = metrics && metrics.lastOrder ? metrics.lastOrder : null;
                if (last) {
                    const t = (last instanceof Date) ? last.getTime() : new Date(last).getTime();
                    if (!isNaN(t)) return t;
                }

                // Fallback to customer's join date
                let d = cust && cust.date;
                if (d && typeof d.toDate === 'function') d = d.toDate();
                const parsed = new Date(d);
                return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
            } catch (e) {
                return 0;
            }
        };

        // If spendSort or aovSort selected, sort by those metrics. Otherwise fallback to lastOrder/join date.
        if (spendSort !== 'none') {
            filtered.sort((a, b) => {
                const ma = getCustomerMetrics(a);
                const mb = getCustomerMetrics(b);
                const va = Number(ma.totalSpend || 0);
                const vb = Number(mb.totalSpend || 0);
                return spendSort === 'asc' ? va - vb : vb - va;
            });
        } else if (aovSort !== 'none') {
            filtered.sort((a, b) => {
                const ma = getCustomerMetrics(a);
                const mb = getCustomerMetrics(b);
                const va = Number(ma.aov || 0);
                const vb = Number(mb.aov || 0);
                return aovSort === 'asc' ? va - vb : vb - va;
            });
        } else {
            filtered.sort((a, b) => {
                return toTime(b) - toTime(a);
            });
        }

        return filtered;
    }, [customers, searchQuery, filterType, tierFilter, orders, startDate, endDate, spendSort, aovSort]);

    // Function to show the "Add Customer" modal
    const addCustomer = () => {
        setIsAddCustomerModalOpen(true);
    };

    // Function to handle importing customers
    const importCustomers = () => {
        setIsImportModalOpen(true);
    };

    // Function to export customers to CSV
    const exportAll = async () => {
        try {
            // Check if we have customers to export
            if (!customers || customers.length === 0) {
                showToast("No customers available to export", "error");
                return;
            }

            // Prepare data for export with safe handling of all fields
            const data = customers.map(c => ({
                name: c.name || "",
                phone: c.phone || "",
                balance: c.balance || 0,
                totalSpent: c.totalSpent || 0,
                orderCount: c.orderCount || 0,
                date: formatDateForExport(c.date)
            }));

            // Create CSV content with safer string handling
            const headers = Object.keys(data[0]).join(',');
            const rows = data.map(obj =>
                Object.values(obj).map(val => {
                    if (val === null || val === undefined) return '""';
                    return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
                }).join(',')
            );
            const csvContent = [headers, ...rows].join('\n');

            // Create download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `customers_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up the URL object
            setTimeout(() => URL.revokeObjectURL(url), 100);

            showToast(`${customers.length} customers exported to CSV`);
        } catch (error) {
            console.error("Error exporting customers:", error);
            showToast(`Failed to export: ${error.message || "Unknown error"}`, "error");
        }
    };

    // Delete a customer (with confirmation). This will remove the customer document from Firestore.
    const deleteCustomer = async (customer) => {
        try {
            if (!customer || !customer.id) return;

            const confirmed = window.confirm(`Delete customer "${customer.name || customer.id}"? This will remove the customer record but will not delete past orders. Proceed?`);
            if (!confirmed) return;

            await sdk.db.collection('Customers').doc(customer.id).delete();
            showToast('Customer deleted', 'success');
            // fetchCustomers will pick up deletion via onSnapshot, but call it defensively
            try { fetchCustomers(); } catch (e) { /* ignore */ }
        } catch (err) {
            console.error('Failed to delete customer', err);
            showToast('Failed to delete customer', 'error');
        }
    };

    // Helper to safely format dates for export
    const formatDateForExport = (dateValue) => {
        if (!dateValue) return "";

        try {
            // Handle Firestore timestamp objects
            if (dateValue && typeof dateValue.toDate === 'function') {
                return dateValue.toDate().toISOString();
            }

            // Handle JavaScript Date objects and strings
            const date = new Date(dateValue);
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }

            // Return original if we can't parse it
            return String(dateValue);
        } catch (e) {
            console.warn("Date formatting error:", e);
            return "";
        }
    };


// Using shared SearchBar component from ../components/SearchBar.js

    // "No Customers" empty state component
    const NoCustomers = () => (
        <div className="text-center py-16 px-4 bg-white rounded-xl shadow-sm mt-4 border border-gray-100">
            <div className="mb-4">
                <i className="ph ph-users text-6xl text-gray-200" />
            </div>
            <h3 className="text-xl font-medium text-gray-500 mb-2">No Customers yet</h3>
            <p className="text-gray-400">Add your first customer to get started</p>
		</div>
    );


    // Context menu for customer actions
    const ContextMenu = () => (
        <div className="relative">
            <button
                className="p-2.5 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-red-100"
                onClick={() => document.getElementById('customer-actions-menu').classList.toggle('hidden')}
            >
                <i className="ph ph-dots-three-vertical text-gray-700" />
            </button>
            <div id="customer-actions-menu" className="absolute right-0 mt-2 z-10 hidden bg-white rounded-lg shadow-lg overflow-hidden w-48 border border-gray-100">
                <ul className="py-1">
                    <li>
                        <button
                            onClick={() => {
                                document.getElementById('customer-actions-menu').classList.add('hidden');
                                addCustomer();
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center text-gray-700"
                        >
                            <i className="ph ph-user-plus mr-3 text-gray-500" />
                            <span>Add Customer</span>
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => {
                                document.getElementById('customer-actions-menu').classList.add('hidden');
                                importCustomers();
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center text-gray-700"
                        >
                            <i className="ph ph-upload-simple mr-3 text-gray-500" />
                            <span>Import Customers</span>
                        </button>
                    </li>
                    <li>
                        <button
                            onClick={() => {
                                document.getElementById('customer-actions-menu').classList.add('hidden');
                                exportAll();
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center text-gray-700"
                        >
                            <i className="ph ph-download-simple mr-3 text-gray-500" />
                            <span>Export CSV</span>
                        </button>
                    </li>
                </ul>
            </div>
		</div>
    );

    // Show success dialog after import
    const showImportSuccessDialog = (fileCount) => {
        if (ModalManager) {
            const modal = ModalManager.createCenterModal({
                id: 'import-success-modal',
                title: `${fileCount} File(s) Uploaded`,
                content: `<p class="text-gray-600 mb-4">We will inform you in app notification after your customers are added.</p>`,
                actions: `<button class="w-full py-3 bg-red-500 text-white rounded-lg" id="import-success-ok">OK</button>`,
                size: 'sm',
                onShown: (modalControl) => {
                    document.getElementById('import-success-ok').addEventListener('click', () => {
                        modalControl.close();
                    });
                }
            });
        } else {
            // Fallback to original implementation
            // Create the modal container if it doesn't exist
            let modalContainer = document.getElementById('import-success-modal');
            if (!modalContainer) {
                modalContainer = document.createElement('div');
                modalContainer.id = 'import-success-modal';
                document.body.appendChild(modalContainer);
            }

            // Create a simple modal using vanilla JS
            modalContainer.innerHTML = `
                <div class="fixed inset-0 z-50 flex items-center justify-center">
                    <div class="fixed inset-0 bg-black bg-opacity-50"></div>
                    <div class="bg-white w-full max-w-sm rounded-xl shadow-lg overflow-hidden relative z-10 p-6">
                        <h3 class="text-xl font-medium mb-2">${fileCount} File(s) Uploaded</h3>
                        <p class="text-gray-600 mb-4">We will inform you in app notification after your customers are added.</p>
                        <button class="w-full py-3 bg-red-500 text-white rounded-lg" onclick="document.getElementById('import-success-modal').remove()">
                            OK
                        </button>
                    </div>
                </div>
            `;
        }
    };

    // Handle showing toast notifications
    const showToast = (message, type = "success") => {
        // Create toast container if it doesn't exist
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'fixed bottom-4 right-4 z-[9999]';
            document.body.appendChild(toastContainer);
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `p-3 rounded-lg shadow-lg mb-2 flex items-center ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
        toast.innerHTML = `
            <i class="ph ${type === 'success' ? 'ph-check-circle' : 'ph-x-circle'} mr-2"></i>
            <span>${message}</span>
        `;

        // Add to container and set timeout to remove
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.remove();
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
            }
        }, 3000);
    };

    // Add Customer Modal component
    const AddCustomerModal = () => {
        const [formData, setFormData] = useState({ name: '', phone: '' });
        const [submitting, setSubmitting] = useState(false);
        const [error, setError] = useState(null);

        const handleSubmit = async (e) => {
            e.preventDefault();
            if (!formData.name || !formData.phone) {
                setError('Please fill all required fields');
                return;
            }

            try {
                setSubmitting(true);
                setError(null);

                // Check if customer with this phone number already exists
                const phoneExists = await isPhoneNumberExists(formData.phone);
                if (phoneExists) {
                    setError('This Phone number already exists for a customer ! Please try another number.');
                    return;
                }

                // Generate an ID using phone and timestamp
                const id = `${formData.phone.replace(/\s/g, '')}_${Date.now()}`;

                await sdk.db.collection("Customers").doc(id).set({
                    name: formData.name,
                    phone: formData.phone,
                    date: new Date(),
                    balance: 0,
                    totalSpent: 0,
                    orderCount: 0
                });

                setSubmitting(false);
                setIsAddCustomerModalOpen(false);
                showToast("Customer added successfully");
                    fetchCustomers(); // Refresh the list
                    try { window.dispatchEvent(new CustomEvent('customerAdded', { detail: { id, name: formData.name, phone: formData.phone } })); } catch (e) {}
            } catch (error) {
                console.error("Error adding customer:", error);
                setError('Failed to add customer. Please try again.');
                setSubmitting(false);
            }
        };

        // Use ModalManager if available
        console.log('ModalManager available:', !!ModalManager, 'isAddCustomerModalOpen:', isAddCustomerModalOpen);
        if (ModalManager && isAddCustomerModalOpen) {
            useEffect(() => {
                console.log('Creating add customer modal with ModalManager');
                const modal = ModalManager.createCenterModal({
                    id: 'add-customer-modal',
                    title: 'Add New Customer',
                    content: `
                        <form id="add-customer-form" class="p-2">
                            <div class="mb-6">
                                <div class="flex justify-center mb-6">
                                    <div class="bg-blue-50 rounded-full p-4">
                                        <i class="ph ph-user-plus text-4xl text-blue-500"></i>
                                    </div>
                                </div>
                                
                                <div class="mb-4">
                                    <label class="block text-gray-700 mb-2 text-sm font-medium">Name</label>
                                    <div class="relative">
                                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <i class="ph ph-user text-gray-400"></i>
                                        </div>
                                        <input
                                            type="text"
                                            id="customer-name-input"
                                            class="w-full py-2.5 pl-10 pr-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter customer name"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label class="block text-gray-700 mb-2 text-sm font-medium">Phone</label>
                                    <div class="relative">
                                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <i class="ph ph-phone text-gray-400"></i>
                                        </div>
                                        <input
                                            type="tel"
                                            id="customer-phone-input"
                                            maxlength="10"
                                            inputmode="numeric"
                                            pattern="[0-9]{10}"
                                            class="w-full py-2.5 pl-10 pr-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter phone number"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                        </form>
                    `,
                    actions: `
                        <div class="flex space-x-3">
                            <button 
                                type="button" 
                                id="cancel-customer-btn" 
                                class="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                id="submit-customer-btn"
                                class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
                            >
                                Add Customer
                            </button>
                        </div>
                    `,
                    size: 'md',
                        onShown: (modalControl) => {
                        // Defensive DOM lookups: the modal content may not be present in certain environments
                        const nameInput = document.getElementById('customer-name-input');
                        const phoneInput = document.getElementById('customer-phone-input');
                        const submitBtn = document.getElementById('submit-customer-btn');
                        const cancelBtn = document.getElementById('cancel-customer-btn');

                        // Sanitize phone input if present
                        if (phoneInput) {
                            phoneInput.addEventListener('input', () => {
                                phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
                            });
                        } else {
                            console.warn('[AddCustomerModal] phone input not found in onShown');
                        }

                        if (cancelBtn) {
                            cancelBtn.addEventListener('click', () => {
                                modalControl.close();
                            });
                        } else {
                            console.warn('[AddCustomerModal] cancel button not found in onShown');
                        }

                        if (submitBtn) {
                            submitBtn.addEventListener('click', async () => {
                                // Validate presence of inputs
                                if (!nameInput || !phoneInput) {
                                    ModalManager.showToast('Form inputs not available', { type: 'error' });
                                    return;
                                }

                                if (!nameInput.value || !phoneInput.value) {
                                    ModalManager.showToast("Please fill all required fields", { type: "error" });
                                    return;
                                }

                                // Validate phone format (10 digits)
                                if (!/^[0-9]{10}$/.test(phoneInput.value.trim())) {
                                    ModalManager.showToast('Please enter a valid 10-digit phone number (numbers only).', { type: 'error' });
                                    if (phoneInput.focus) phoneInput.focus();
                                    return;
                                }

                                try {
                                    // Check if customer with this phone number already exists
                                    const phoneExists = await isPhoneNumberExists(phoneInput.value);
                                    if (phoneExists) {
                                        ModalManager.showToast("This Phone number already exists for a customer ! Please try another number.", { type: "error" });
                                        return;
                                    }

                                    submitBtn.disabled = true;
                                    submitBtn.innerHTML = `<div class="flex justify-center items-center">
                                        <div class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                                        Adding...
                                    </div>`;

                                    // Generate an ID using phone and timestamp
                                    const id = `${phoneInput.value.replace(/\s/g, '')}_${Date.now()}`;

                                    await sdk.db.collection("Customers").doc(id).set({
                                        name: nameInput.value,
                                        phone: phoneInput.value,
                                        date: new Date(),
                                        balance: 0,
                                        totalSpent: 0,
                                        orderCount: 0
                                    });

                                    modalControl.close();
                                    ModalManager.showToast("Customer added successfully");
                                    fetchCustomers(); // Refresh the list
                                    try { window.dispatchEvent(new CustomEvent('customerAdded', { detail: { id, name: nameInput.value, phone: phoneInput.value } })); } catch (e) {}
                                } catch (error) {
                                    console.error("Error adding customer:", error);
                                    ModalManager.showToast("Failed to add customer. Please try again.", { type: "error" });
                                    submitBtn.disabled = false;
                                    submitBtn.textContent = "Add Customer";
                                }
                            });
                        } else {
                            console.warn('[AddCustomerModal] submit button not found in onShown');
                        }

                        // Focus the name input if available
                        if (nameInput && nameInput.focus) nameInput.focus();
                    },
                    onClose: () => {
                        setIsAddCustomerModalOpen(false);
                    }
                });

                return () => {
                    // Clean up
                    if (modal && modal.close) {
                        modal.close();
                    }
                };
            }, [isAddCustomerModalOpen]);

            // The modal is created via useEffect, so return null here
            return null;
        }

        // Fallback to original implementation if ModalManager is not available
        console.log('Using fallback implementation for add customer modal');
        return (
            <div className={`fixed inset-0 z-50 flex items-center justify-center ${isAddCustomerModalOpen ? 'visible' : 'invisible'}`}>
                <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsAddCustomerModalOpen(false)}></div>
                <div className="bg-white w-full max-w-md rounded-xl shadow-lg overflow-hidden relative z-10">
                    <div className="p-5">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-medium text-gray-800">Add New Customer</h3>
                            <button onClick={() => setIsAddCustomerModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                                <i className="ph ph-x text-xl" />
                            </button>
                        </div>

                        <div className="flex justify-center mb-6">
                            <div className="bg-blue-50 rounded-full p-4">
                                <i className="ph ph-user-plus text-4xl text-blue-500"></i>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="mb-4">
                                <label className="block text-gray-700 mb-2 text-sm font-medium">Name</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <i className="ph ph-user text-gray-400"></i>
                                    </div>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full py-2.5 pl-10 pr-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Enter customer name"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-gray-700 mb-2 text-sm font-medium">Phone</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <i className="ph ph-phone text-gray-400"></i>
                                    </div>
                                        <input
                                            type="tel"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0,10) })}
                                            maxLength={10}
                                            inputMode="numeric"
                                            className="w-full py-2.5 pl-10 pr-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Enter phone number"
                                            required
                                        />
                                </div>
                                {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
                            </div>

                            <div className="flex space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddCustomerModalOpen(false)}
                                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:opacity-70"
                                >
                                    {submitting ? (
                                        <div className="flex justify-center items-center">
                                            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                                            Adding...
                                        </div>
                                    ) : 'Add Customer'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    };

    // Import Customers Modal component
    const ImportCustomersModal = () => {
        const [uploading, setUploading] = useState(false);
        const [error, setError] = useState(null);

        const handleFileUpload = async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) {
                setError('Please select at least one file');
                return;
            }

            try {
                setUploading(true);
                setError(null);

                // In real implementation, you would upload these files to your server
                // for processing. For now, we'll simulate a successful upload.

                setTimeout(() => {
                    setUploading(false);
                    setIsImportModalOpen(false);

                    // Show success dialog
                    showImportSuccessDialog(files.length);
                }, 2000);
            } catch (error) {
                console.error("Error uploading files:", error);
                setError('Failed to upload files. Please try again.');
                setUploading(false);
            }
        };

        // Use ModalManager if available
        if (ModalManager && isImportModalOpen) {
            useEffect(() => {
                const modal = ModalManager.createCenterModal({
                    id: 'import-customers-modal',
                    title: 'Import Customers',
                    content: `
                        <div class="text-center p-2">
                            <div class="mb-6 flex justify-center">
                                <div class="bg-blue-50 rounded-full p-5">
                                    <i class="ph ph-users-three text-5xl text-blue-500"></i>
                                </div>
                            </div>
                            <div class="text-left mb-6">
                                <div class="flex items-start mb-3">
                                    <div class="bg-blue-50 rounded-full p-1 mr-3 mt-0.5">
                                        <span class="flex items-center justify-center w-5 h-5 text-xs text-blue-600 font-medium">1</span>
                                    </div>
                                    <p class="text-gray-600">Upload your customers file (CSV, Excel, or PDF)</p>
                                </div>
                                <div class="flex items-start mb-3">
                                    <div class="bg-blue-50 rounded-full p-1 mr-3 mt-0.5">
                                        <span class="flex items-center justify-center w-5 h-5 text-xs text-blue-600 font-medium">2</span>
                                    </div>
                                    <p class="text-gray-600">We'll process your file and add customers automatically</p>
                                </div>
                                <div class="flex items-start">
                                    <div class="bg-blue-50 rounded-full p-1 mr-3 mt-0.5">
                                        <span class="flex items-center justify-center w-5 h-5 text-xs text-blue-600 font-medium">3</span>
                                    </div>
                                    <p class="text-gray-600">You'll be notified when the import is complete</p>
                                </div>
                            </div>
                            <div class="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 mb-4">
                                <label id="upload-files-btn" class="block w-full py-3 px-6 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 transition-colors">
                                    <i class="ph ph-file-arrow-up mr-2"></i>
                                    Choose Files
                                    <input type="file" class="hidden" id="customer-files-input" accept=".csv,.xlsx,.xls,.pdf" multiple>
                                </label>
                                <p class="text-xs text-gray-500 mt-2">Supported formats: CSV, Excel, PDF</p>
                            </div>
                        </div>
                    `,
                    actions: `
                        <button 
                            type="button" 
                            id="cancel-import-btn" 
                            class="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                    `,
                    size: 'md',
                    onShown: (modalControl) => {
                        const fileInput = document.getElementById('customer-files-input');
                        const uploadBtn = document.getElementById('upload-files-btn');
                        const cancelBtn = document.getElementById('cancel-import-btn');

                        cancelBtn.addEventListener('click', () => {
                            modalControl.close();
                        });

                        fileInput.addEventListener('change', async (e) => {
                            const files = e.target.files;
                            if (!files || files.length === 0) {
                                ModalManager.showToast("Please select at least one file", { type: "error" });
                                return;
                            }

                            try {
                                // Show uploading state
                                uploadBtn.classList.add('opacity-70');
                                uploadBtn.classList.remove('hover:bg-blue-700');
                                uploadBtn.innerHTML = `
                                    <div class="flex justify-center items-center">
                                        <div class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                                        Uploading...
                                    </div>
                                `;
                                uploadBtn.style.pointerEvents = 'none';

                                // Simulate upload
                                setTimeout(() => {
                                    modalControl.close();
                                    showImportSuccessDialog(files.length);
                                }, 2000);
                            } catch (error) {
                                console.error("Error uploading files:", error);
                                ModalManager.showToast("Failed to upload files. Please try again.", { type: "error" });
                                uploadBtn.classList.remove('opacity-70');
                                uploadBtn.classList.add('hover:bg-blue-700');
                                uploadBtn.innerHTML = `<i class="ph ph-file-arrow-up mr-2"></i> Choose Files`;
                                uploadBtn.style.pointerEvents = 'auto';
                            }
                        });
                    },
                    onClose: () => {
                        setIsImportModalOpen(false);
                    }
                });

                return () => {
                    // Clean up
                    if (modal && modal.close) {
                        modal.close();
                    }
                };
            }, [isImportModalOpen]);

            // The modal is created via useEffect, so return null here
            return null;
        }

        // Fallback to original implementation if ModalManager is not available
        return (
            <div className={`fixed inset-0 z-50 flex items-center justify-center ${isImportModalOpen ? 'visible' : 'invisible'}`}>
                <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsImportModalOpen(false)}></div>
                <div className="bg-white w-full max-w-md rounded-xl shadow-lg overflow-hidden relative z-10 p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-medium text-gray-800">Import Customers</h3>
                        <button onClick={() => setIsImportModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                            <i className="ph ph-x text-xl" />
                        </button>
                    </div>

                    <div className="mb-6 flex justify-center">
                        <div className="bg-blue-50 rounded-full p-5">
                            <i className="ph ph-users-three text-5xl text-blue-500"></i>
                        </div>
                    </div>

                    <div className="text-left mb-6">
                        <div className="flex items-start mb-3">
                            <div className="bg-blue-50 rounded-full p-1 mr-3 mt-0.5">
                                <span className="flex items-center justify-center w-5 h-5 text-xs text-blue-600 font-medium">1</span>
                            </div>
                            <p className="text-gray-600">Upload your customers file (CSV, Excel, or PDF)</p>
                        </div>
                        <div className="flex items-start mb-3">
                            <div className="bg-blue-50 rounded-full p-1 mr-3 mt-0.5">
                                <span className="flex items-center justify-center w-5 h-5 text-xs text-blue-600 font-medium">2</span>
                            </div>
                            <p className="text-gray-600">We'll process your file and add customers automatically</p>
                        </div>
                        <div className="flex items-start">
                            <div className="bg-blue-50 rounded-full p-1 mr-3 mt-0.5">
                                <span className="flex items-center justify-center w-5 h-5 text-xs text-blue-600 font-medium">3</span>
                            </div>
                            <p className="text-gray-600">You'll be notified when the import is complete</p>
                        </div>
                    </div>

                    <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 mb-4">
                        <label className={`block w-full py-3 px-6 bg-blue-600 text-white rounded-md cursor-pointer transition-colors ${uploading ? 'opacity-70' : 'hover:bg-blue-700'}`}>
                            {uploading ? (
                                <div className="flex justify-center items-center">
                                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                                    Uploading...
                                </div>
                            ) : (
                                <>
                                    <i className="ph ph-file-arrow-up mr-2"></i>
                                    Choose Files
                                </>
                            )}
                            <input
                                type="file"
                                className="hidden"
                                accept=".csv,.xlsx,.xls,.pdf"
                                multiple
                                onChange={handleFileUpload}
                                disabled={uploading}
                            />
                        </label>
                        <p className="text-xs text-gray-500 mt-2 text-center">Supported formats: CSV, Excel, PDF</p>
                        {error && <p className="mt-2 text-sm text-red-600 text-center">{error}</p>}
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsImportModalOpen(false)}
                        className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    };

    // Main render
    if (loading) {
        return (
            <div className="p-4 text-center">
                <div className="animate-spin inline-block w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-center text-red-600">{error}</div>
        );
    }

    if (!customerCardLoaded) {
        return (
            <div className="p-4 text-center">
                <div>Loading customer components...</div>
                <div className="animate-spin inline-block w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full mt-2" />
            </div>
        );
    }

    // Render the CustomerCard component for each filtered customer
    const renderCustomerCard = (customer) => {
        return CustomerCard ? (
            <CustomerCard key={customer.id} customer={customer} />
        ) : (
            <div key={customer.id} className="p-3 border border-gray-200 rounded-lg mb-2">
                Loading customer component...
            </div>
        );
    };

    // Tab Button Component (copied from Products.js)
    const TabButton = ({ isActive, onClick, children }) => (
        <button
            className={`px-3 md:px-6 py-1.5 md:py-2 rounded-full transition-colors text-sm ${isActive
                ? 'bg-red-100 text-red-700'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            onClick={onClick}
        >
            {children}
        </button>
    );

    return (
        <div className="bg-gray-50 min-h-screen">
            {/* Content */}
            <div className="p-2 md:p-4">
                {/* Top Tabs (Customer Database / Loyalty Program Rules) */}
                <div className="flex items-center gap-1 md:gap-2 mb-3 md:mb-6">
                    <TabButton
                        isActive={activeTab === 'database'}
                        onClick={() => setActiveTab('database')}
                    >
                        <i className="ph ph-users text-base mr-1 md:mr-2"></i>
                        <span>Customer Database</span>
                    </TabButton>
                    <TabButton
                        isActive={activeTab === 'loyalty'}
                        onClick={() => setActiveTab('loyalty')}
                    >
                        <i className="ph ph-star text-base mr-1 md:mr-2"></i>
                        <span>Loyalty Program Rules</span>
                    </TabButton>
                    <TabButton
                        isActive={activeTab === 'levels'}
                        onClick={() => setActiveTab('levels')}
                    >
                        <i className="ph ph-list text-base mr-1 md:mr-2"></i>
                        <span>Levels</span>
                    </TabButton>
                </div>

                {/* Show different content based on active tab */}
                {activeTab === 'database' ? (
                    <>
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex-1 mr-4">
                                <SearchBar
                                    searchQuery={searchQuery}
                                    setSearchQuery={setSearchQuery}
                                    filterType={filterType}
                                    setFilterType={setFilterType}
                                    startDate={startDate}
                                    endDate={endDate}
                                    setDateRange={setDateRange}
                                />
                            </div>
                            <ContextMenu />
                        </div>

                        {/* Customer List - Horizontal Table */}
                        {customers.length === 0 ? (
                            <NoCustomers />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full bg-white rounded-xl shadow-sm border border-gray-100">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-700 text-sm">
                                            <th className="px-4 py-3 text-left">Name</th>
                                            {/* <th className="px-4 py-3 text-left">Phone</th> */}
                                            <th className="px-4 py-3 text-right">Total Orders</th>
                                            <th className="px-4 py-3 text-right">
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' }}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setSpendDropdownOpen(s => !s); setAovDropdownOpen(false); }}
                                                        className="flex items-center space-x-2 text-sm font-semibold text-gray-800 hover:text-gray-900 focus:outline-none"
                                                        style={{ background: 'transparent', border: 'none', padding: 0 }}
                                                        title="Sort Total Spend"
                                                    >
                                                        <span>Total Spend</span>
                                                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M7 8l3 3 3-3" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                        </svg>
                                                    </button>

                                                    {spendDropdownOpen && (
                                                        <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 40 }}>
                                                            <div className="bg-white border border-gray-200 rounded-md shadow-lg text-sm" style={{ minWidth: 160 }}>
                                                                <button className="w-full text-left px-4 py-2 hover:bg-gray-50" onMouseDown={e => e.stopPropagation()} onClick={() => { setSpendSort('asc'); setSpendDropdownOpen(false); setAovSort('none'); }}>Ascending</button>
                                                                <button className="w-full text-left px-4 py-2 hover:bg-gray-50" onMouseDown={e => e.stopPropagation()} onClick={() => { setSpendSort('desc'); setSpendDropdownOpen(false); setAovSort('none'); }}>Descending</button>
                                                                <button className="w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50" onMouseDown={e => e.stopPropagation()} onClick={() => { setSpendSort('none'); setSpendDropdownOpen(false); }}>Clear</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </th>
                                            <th className="px-4 py-3 text-right">
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' }}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setAovDropdownOpen(s => !s); setSpendDropdownOpen(false); }}
                                                        className="flex items-center space-x-2 text-sm font-semibold text-gray-800 hover:text-gray-900 focus:outline-none"
                                                        style={{ background: 'transparent', border: 'none', padding: 0 }}
                                                        title="Sort AOV"
                                                    >
                                                        <span>AOV</span>
                                                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M7 8l3 3 3-3" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                        </svg>
                                                    </button>

                                                    {aovDropdownOpen && (
                                                        <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 40 }}>
                                                            <div className="bg-white border border-gray-200 rounded-md shadow-lg text-sm" style={{ minWidth: 160 }}>
                                                                <button className="w-full text-left px-4 py-2 hover:bg-gray-50" onMouseDown={e => e.stopPropagation()} onClick={() => { setAovSort('asc'); setAovDropdownOpen(false); setSpendSort('none'); }}>Ascending</button>
                                                                <button className="w-full text-left px-4 py-2 hover:bg-gray-50" onMouseDown={e => e.stopPropagation()} onClick={() => { setAovSort('desc'); setAovDropdownOpen(false); setSpendSort('none'); }}>Descending</button>
                                                                <button className="w-full text-left px-4 py-2 text-red-600 hover:bg-gray-50" onMouseDown={e => e.stopPropagation()} onClick={() => { setAovSort('none'); setAovDropdownOpen(false); }}>Clear</button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </th>
                                            <th className="px-4 py-3 text-center">Last Order</th>
                                            <th className="px-4 py-3 text-center">Visit Freq (days)</th>
                                            <th className="px-4 py-3 text-center" style={{ position: 'relative' }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ position: 'relative', display: 'inline-block' }}>
                                                        <select
                                                            value={tierFilter}
                                                            onChange={e => setTierFilter(e.target.value)}
                                                            className="appearance-none bg-transparent border-none p-0 m-0 text-center text-gray-800 font-semibold text-sm focus:outline-none cursor-pointer pr-5"
                                                            style={{ minWidth: '60px', fontWeight: 'inherit', boxShadow: 'none' }}
                                                        >
                                                            <option value="all">Tier</option>
                                                            <option value="VIP">VIP</option>
                                                            <option value="Gold">Gold</option>
                                                            <option value="Silver">Silver</option>
                                                            <option value="Bronze">Bronze</option>
                                                        </select>
                                                        <svg style={{ pointerEvents: 'none', position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }} width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                            <path d="M7 8l3 3 3-3" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                        </svg>
                                                    </span>
                                                </div>
                                            </th>
                                            <th className="px-4 py-3 text-left">Preferred Items</th>
                                            <th className="px-4 py-3 text-left">Contact</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCustomers.map(customer => {
                                            const m = getCustomerMetrics(customer);
                                            return (
                                                <tr key={customer.id}
                                                    className="border-t border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                                                    onClick={() => openCustomerDetailsModal(customer)}
                                                >
                                                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{customer.name}</td>
                                                    {/* <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{customer.phone}</td> */}
                                                    <td className="px-4 py-3 text-right">{m.totalOrders}</td>
                                                    <td className="px-4 py-3 text-right">{UserSession.getCurrency()}{m.totalSpend.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-right">{UserSession.getCurrency()}{m.aov.toFixed(0)}</td>
                                                    <td className="px-4 py-3 text-center">{m.lastOrder ? new Date(m.lastOrder).toLocaleDateString('en-GB') : 'N/A'}</td>
                                                    <td className="px-4 py-3 text-center">{m.visitFrequency ? m.visitFrequency.toFixed(1) : '-'}</td>
                                                    <td className="px-4 py-3 text-center font-semibold">{m.tier}</td>
                                                    <td className="px-4 py-3 text-gray-700">{m.preferredItems && m.preferredItems.length > 0 ? m.preferredItems.join(', ') : '-'}</td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {customer.phone ? (
                                                            <button
                                                                title="Message on WhatsApp"
                                                                className="inline-flex items-center px-2 py-1 rounded hover:bg-green-50 text-green-600 border border-green-100"
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}`, '_blank');
                                                                }}
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 mr-1"><path d="M16.7 14.6c-.3-.2-1.7-.8-2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.2-.4-2.2-1.3-.8-.7-1.3-1.6-1.5-1.9-.2-.3 0-.4.1-.6.1-.1.2-.2.3-.3.1-.1.1-.2.2-.3.1-.1.1-.2.2-.3.1-.2.1-.3 0-.5-.1-.2-.7-1.7-.9-2.3-.2-.6-.4-.5-.7-.5h-.6c-.2 0-.5.1-.7.3-.2.2-.8.8-.8 2 0 1.2.8 2.4 1.1 2.8.3.4 2.2 3.4 5.3 4.6.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.3 1.2 4.7L2 22l5.4-1.2C8.7 21.6 10.3 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-3-.3-4.3-.9l-.3-.1-3.2.7.7-3.1-.2-.3C4.3 15 4 13.5 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8z"/></svg>
                                                                WhatsApp
                                                            </button>
                                                        ) : (
                                                            <span className="text-gray-400">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); deleteCustomer(customer); }}
                                                                className="px-2 py-1 rounded hover:bg-red-50 text-sm text-red-600"
                                                                title="Delete"
                                                            >
                                                                <i className="ph ph-trash"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                ) : activeTab === 'loyalty' ? (
                    <LoyaltyRules />
                ) : (
                    <Levels />
                )}
            </div>

            {/* Modals */}
            <AddCustomerModal />
            <ImportCustomersModal />
        </div>
    );
}
