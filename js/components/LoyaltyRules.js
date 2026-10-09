import { useState, useEffect } from 'react';
import { showToast } from '../utils.js';
import { setPointsPerCurrencyOverride, setPointsPerCurrencyMapping, recalcAllCustomers } from '../utils/LoyaltyEngine.js';
import { ModalManager } from './ModalManager.js';
import { sdk } from '../sdk.js';
import { UserSession } from '../utils/UserSession.js';

export default function LoyaltyRules() {
    // Hardcoded rules (editing disabled). Use the toggle button to activate/deactivate.
    // defaultRules: descriptions that include currency are rendered dynamically using reactive currencySymbol state
    const defaultRules = [
        {
            id: 'r_spend_1',
            name: 'Earn on Spend',
            description: '',
            // explicit numeric representation used by the engine when persisted
            // 1 point per (currencySymbol)50 -> 1/50
            pointsPerCurrency: (1/50),
            active: true,
            type: 'spend_ratio'
        },
        {
            id: 'r_birthday',
            name: 'Birthday Reward',
            description: 'On customer\'s birthday they are eligible for either a free dessert or a special discount.',
            active: true,
            type: 'birthday'
        },
        {
            id: 'r_redeem_threshold',
            name: 'Redemption Threshold',
            description: 'Rewards can only be redeemed after the customer has accumulated 50 points.',
            active: true,
            type: 'redeem_threshold'
        }
    ];

    const [rules, setRules] = useState(defaultRules);
    const [loading] = useState(false);
    // const [recalcBusy, setRecalcBusy] = useState(false); // Commented out as recalculate button is removed

    // Reactive currency symbol so UI updates when system currency changes.
    const [currencySymbol, setCurrencySymbol] = useState((typeof UserSession !== 'undefined' && UserSession?.getCurrency) ? UserSession.getCurrency() : '₹');

    useEffect(() => {
        const handler = (evt) => {
            try {
                const sym = (evt && evt.detail && evt.detail.symbol) ? evt.detail.symbol : ((typeof UserSession !== 'undefined' && UserSession?.getCurrency) ? UserSession.getCurrency() : '₹');
                setCurrencySymbol(sym);
            } catch (e) { /* ignore */ }
        };
        window.addEventListener('currencyChanged', handler);
        return () => window.removeEventListener('currencyChanged', handler);
    }, []);

    // Load persisted rules from Firestore when available. If none are present, keep defaults.
    useEffect(() => {
        let mounted = true;
        (async () => {
            // Try dynamic import of SDK to avoid import-time failures
            let dbSdk = null;
            try {
                const mod = await import('../sdk.js');
                dbSdk = mod && mod.sdk ? mod.sdk : null;
            } catch (e) {
                try { dbSdk = (typeof window !== 'undefined' && window.__sdkForDebug) ? window.__sdkForDebug : null; } catch (ee) { dbSdk = null; }
            }

            if (!dbSdk || !dbSdk.db) return;
            try {
                const snap = await dbSdk.db.collection('LoyaltyRules').get();
                const docs = [];
                snap.forEach(d => docs.push({ id: d.id, ...(d.data ? d.data() : d._data || {}) }));
                if (!mounted) return;
                if (docs && docs.length > 0) {
                    // Build a map of persisted rules by type for quick lookup
                    const persistedByType = (docs || []).reduce((m, d) => { if (d && d.type) m[d.type] = d; return m; }, {});

                    // Merge defaults with persisted: prefer persisted fields when available
                    const merged = defaultRules.map((def, idx) => {
                        const p = persistedByType[def.type];
                        if (p) {
                            return {
                                id: p.id || def.id || `r_${idx}`,
                                name: p.name || def.name,
                                description: p.description || def.description,
                                active: typeof p.active === 'undefined' ? (typeof def.active === 'undefined' ? true : def.active) : Boolean(p.active),
                                type: p.type || def.type,
                                pointsPerCurrency: (typeof p.pointsPerCurrency !== 'undefined') ? p.pointsPerCurrency : def.pointsPerCurrency
                            };
                        }
                        return { ...def };
                    });

                    // Append any persisted rules that don't match a default (custom rules)
                    const extras = (docs || []).filter(d => !defaultRules.find(dr => dr.type === d.type)).map((d, i) => ({ id: d.id || `p_${i}`, name: d.name || 'Custom Rule', description: d.description || '', active: typeof d.active === 'undefined' ? true : Boolean(d.active), type: d.type || '', pointsPerCurrency: d.pointsPerCurrency }));

                    // Deduplicate by id (prefer earlier entries which are merged defaults overwritten by persisted fields)
                    const combined = [...merged, ...extras];
                    const seen = new Set();
                    const deduped = [];
                    for (const r of combined) {
                        const rid = (r && r.id) ? String(r.id) : (r && r.type) ? `type_${r.type}` : null;
                        if (!rid) continue;
                        if (seen.has(rid)) continue;
                        seen.add(rid);
                        deduped.push({ ...r, id: rid });
                    }
                    setRules(deduped);
                }
            } catch (e) {
                console.warn('[LoyaltyRules] failed to load persisted rules', e);
            }
        })();
        return () => { mounted = false; };
    }, []);

    // Manual recalculation handler (user must click to run)
    // Commented out as recalculate button is removed
    /*
    const handleRecalc = async () => {
        try {
            // Use the configured spend rule's pointsPerCurrency if available, otherwise fallback to 1/50
            const spend = rules.find(r => r.type === 'spend_ratio');
            const rate = (spend && typeof spend.pointsPerCurrency === 'number') ? spend.pointsPerCurrency : (1 / 50);
            if (typeof setPointsPerCurrencyMapping === 'function') setPointsPerCurrencyMapping({ '*': rate });
            setRecalcBusy(true);
            showToast('Recalculating loyalty points — this may take a while...', 'success');
            const res = await recalcAllCustomers((done, total) => {
                try { console.debug('[LoyaltyRules] recalc progress', done, total); } catch (e) {}
            });
            showToast(`Recalculation completed for ${res.processed} customers (rate ${res.rate}).`, 'success');
        } catch (e) {
            console.warn('Recalculation failed', e);
            showToast('Recalculation failed (see console)', 'error');
        } finally {
            setRecalcBusy(false);
        }
    };
    */

    const toggleRuleActive = async (ruleId) => {
        // Read current rule from state (avoid stale setRules race)
        const current = rules.find(r => r.id === ruleId);
        if (!current) return;
        const willActivate = !current.active;
        // Toggle locally
        setRules(prev => prev.map(r => r.id === ruleId ? ({ ...r, active: willActivate }) : r));

        // Persist the toggle to Firestore using a deterministic doc id so reloads pick it up reliably
        (async () => {
            try {
                let dbSdk = null;
                try {
                    const mod = await import('../sdk.js');
                    dbSdk = mod && mod.sdk ? mod.sdk : null;
                } catch (ie) {
                    try { dbSdk = (typeof window !== 'undefined' && window.__sdkForDebug) ? window.__sdkForDebug : null; } catch (ee) { dbSdk = null; }
                }
                if (dbSdk && dbSdk.db) {
                    const docId = `rule_${current.type}`;
                    const payload = {
                        id: current.id || docId,
                        name: current.name,
                        description: current.description,
                        type: current.type,
                        active: willActivate
                    };
                    if (typeof current.pointsPerCurrency !== 'undefined') payload.pointsPerCurrency = current.pointsPerCurrency;
                    await dbSdk.db.collection('LoyaltyRules').doc(docId).set(payload, { merge: true });
                }
            } catch (e) {
                console.warn('[LoyaltyRules] failed to persist rule toggle (deterministic write)', e);
            }
        })();

    // If this is the spend rule, update override and recalc
    // Commented out recalculation logic as recalculate button is removed
    /*
    if (current.type === 'spend_ratio') {
            try {
                if (willActivate) {
                    const spend = rules.find(r => r.type === 'spend_ratio');
                    const rate = (spend && typeof spend.pointsPerCurrency === 'number') ? spend.pointsPerCurrency : (1 / 50);
                    if (typeof setPointsPerCurrencyMapping === 'function') setPointsPerCurrencyMapping({ '*': rate });
                } else {
                    if (typeof setPointsPerCurrencyMapping === 'function') setPointsPerCurrencyMapping(null);
                }
                showToast(`${current.name} ${willActivate ? 'activated' : 'deactivated'}. Recalculating points...`, 'success');
                setRecalcBusy(true);
                const res = await recalcAllCustomers();
                showToast(`Recalculated ${res.processed} customers (rate ${res.rate}).`, 'success');
            } catch (e) {
                console.warn('Failed to recalc after toggling rule', e);
                showToast('Failed to recalculate points (see console)', 'error');
            } finally {
                setRecalcBusy(false);
            }
        } else {
            showToast(`${current.name} ${willActivate ? 'activated' : 'deactivated'}.`, 'success');
        }
        */
        showToast(`${current.name} ${willActivate ? 'activated' : 'deactivated'}.`, 'success');
    };

    // Manage free items for birthday rule
    const handleManageFreeItems = async () => {
        try {
            // Load persisted free items list (if any)
            let persisted = [];
            if (sdk && sdk.db) {
                try {
                    const doc = await sdk.db.collection('LoyaltyRules').doc('rule_birthday').get();
                    if (doc && doc.exists) {
                        const d = doc.data ? doc.data() : (doc._data || {});
                        persisted = Array.isArray(d.freeItems) ? d.freeItems : [];
                    }
                } catch (e) { /* ignore */ }
            }

            // Fetch products to allow selection from canonical Product collection
            let products = [];
            try {
                if (sdk && sdk.db) {
                    const snap = await sdk.db.collection('Product').limit(500).get();
                    // Try dynamic import of Product model so bundlers/HMR don't fail if module resolution differs at runtime
                    let ProductModel = null;
                    try {
                        const mod = await import('../models/Product.js');
                        ProductModel = mod && mod.Product ? mod.Product : mod && mod.default ? mod.default : null;
                    } catch (ie) {
                        // dynamic import failed; we'll fallback to raw doc data
                        ProductModel = null;
                    }

                    // Use ProductModel.fromDoc when available for consistent shaping
                    snap.forEach(doc => {
                        try {
                            if (ProductModel && typeof ProductModel.fromDoc === 'function') {
                                const prod = ProductModel.fromDoc(doc);
                                if (prod) {
                                    products.push({ id: prod.id, title: prod.title || '', price: prod.price || 0, thumb: (prod.imgs && prod.imgs.length) ? prod.imgs[0] : (ProductModel.DUMMY_THUMB || ''), active: prod.active });
                                    return;
                                }
                            }
                        } catch (e) {
                            // continue to raw fallback
                        }
                        // fallback to raw data
                        const data = doc.data ? doc.data() : (doc._data || {});
                        products.push({ id: doc.id, title: data.title || data.name || data.displayTitle || '', price: data.price || data.basePrice || 0, thumb: '', active: (data.active !== false) });
                    });
                }
            } catch (e) { console.warn('[LoyaltyRules] failed to load products for free items', e); }

            // Ensure persisted free items appear in the product list even if the product record
            // is missing from the Product collection (deleted/archived). This preserves previously
            // saved selections and allows the user to remove them or re-add them.
            try {
                const persistedPids = (persisted || []).map(x => x && x.pid).filter(Boolean);
                for (const pid of persistedPids) {
                    if (!products.find(p => p.id === pid)) {
                        const pinfo = (persisted || []).find(x => x && x.pid === pid) || {};
                        products.unshift({ id: pid, title: pinfo.title || 'Unknown product', price: 0, thumb: '', active: false, _persistedFallback: true });
                    }
                }
            } catch (e) { /* ignore */ }

            // Build modal HTML with search and thumbnails.
            // Show previously persisted free items at the top (grouped) and then provide the
            // rest of the product list below so the user can add more.
            const persistedPids = (persisted || []).map(x => x && x.pid).filter(Boolean);
            const persistedProducts = [];
            const otherProducts = [];
            const seenPids = new Set();
            for (const p of products) {
                if (!p || !p.id) continue;
                if (persistedPids.indexOf(p.id) !== -1) {
                    persistedProducts.push(p);
                    seenPids.add(p.id);
                } else {
                    otherProducts.push(p);
                }
            }
            // If some persisted pids weren't in products, they were added earlier as fallbacks
            // (unshift). Ensure they end up in persistedProducts.
            for (const pid of persistedPids) {
                if (!seenPids.has(pid)) {
                    const fallback = products.find(p => p.id === pid) || (persisted || []).find(x => x && x.pid === pid) || { id: pid, title: 'Unknown product', price: 0, thumb: '', active: false };
                    persistedProducts.unshift(fallback);
                    seenPids.add(pid);
                }
            }

            // Helper to render one product row
            const renderRow = (p) => {
                const isSelected = Boolean((persisted || []).find(x => x && x.pid === p.id));
                const checked = isSelected ? 'checked' : '';
                const disabled = (!p.active && !isSelected) ? 'disabled' : '';
                const safeTitle = ((p.title || 'Untitled') + '').replace(/"/g,'&quot;').replace(/</g,'&lt;').toLowerCase();
                const thumb = (p.thumb || '').replace(/"/g,'&quot;');
                return `
                    <div class="flex items-center justify-between p-2 border-b free-item-row" data-pid="${p.id}" data-title="${safeTitle}">
                        <div class="flex items-center gap-3">
                            <input type="checkbox" class="free-item-checkbox" data-pid="${p.id}" ${checked} ${disabled} />
                            <img src="${thumb}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px" />
                            <div class="text-sm">${(p.title || 'Untitled').replace(/</g,'&lt;')}${p._persistedFallback ? ' <span style="color:#999;font-size:11px">(archived)</span>' : ''}</div>
                        </div>
                        <div class="text-xs text-gray-500">${Number(p.price || 0).toFixed(2)}</div>
                    </div>`;
            };

            const html = `
                <div class="space-y-3">
                    <p class="text-sm text-gray-600">Select products that should be available as birthday free items. These will be shown at checkout when a customer is eligible for the birthday benefit.</p>
                    <div class="pt-2">
                        <input id="free-items-search" placeholder="Search products..." class="w-full p-2 border rounded text-sm" />
                    </div>
                    <div style="max-height:340px; overflow:auto;" id="free-items-list">
                        ${persistedProducts.length ? `<div class="px-2 py-1 text-xs text-gray-500">Previously saved</div>` : ''}
                        ${persistedProducts.map(p => renderRow(p)).join('')}
                        ${otherProducts.length ? `<div class="px-2 py-1 text-xs text-gray-500">Add more from menu</div>` : ''}
                        ${otherProducts.map(p => renderRow(p)).join('')}
                    </div>
                </div>
            `;

            const modalId = 'manage-free-items-' + Date.now();
            const modal = ModalManager.createCenterModal({
                id: modalId,
                title: 'Manage Birthday Free Items',
                content: html,
                actions: `<div class="flex gap-2"><button id="free-items-save" class="py-2 px-3 bg-green-600 text-white rounded">Save</button><button id="free-items-cancel" class="py-2 px-3 bg-gray-200 rounded">Cancel</button></div>`,
                size: 'md',
                onShown: (mc) => {
                    try {
                        const container = mc && mc.container ? mc.container : document;
                        const saveBtn = container.querySelector('#free-items-save');
                        const cancelBtn = container.querySelector('#free-items-cancel');
                        if (cancelBtn) cancelBtn.addEventListener('click', () => mc.close());
                        if (saveBtn) {
                            saveBtn.addEventListener('click', async () => {
                                try {
                                    const checks = Array.from(container.querySelectorAll('.free-item-checkbox'));
                                    const selected = checks.filter(c => c.checked).map(c => ({ pid: c.getAttribute('data-pid') }));
                                    // Resolve titles for nicer persistence
                                    const resolved = selected.map(s => {
                                        const found = products.find(p => p.id === s.pid) || {};
                                        return { pid: s.pid, title: found.title || '' };
                                    });
                                    if (sdk && sdk.db) {
                                        await sdk.db.collection('LoyaltyRules').doc('rule_birthday').set({ freeItems: resolved }, { merge: true });
                                    }
                                    // Update local state for immediate feedback
                                    setRules(prev => prev.map(r => (r.type === 'birthday' ? ({ ...r, freeItems: resolved }) : r)));
                                    showToast('Saved free items for Birthday reward', 'success');
                                    mc.close();
                                } catch (e) {
                                    console.warn('[LoyaltyRules] failed to save free items', e);
                                    showToast('Failed to save free items (see console)', 'error');
                                }
                            });
                        }
                        // Simple client-side search/filter
                        try {
                            const search = container.querySelector('#free-items-search');
                            const list = container.querySelector('#free-items-list');
                            if (search && list) {
                                search.addEventListener('input', (ev) => {
                                    const q = (ev.target.value || '').toLowerCase().trim();
                                    const rows = Array.from(list.querySelectorAll('.free-item-row'));
                                    rows.forEach(r => {
                                        const title = r.getAttribute('data-title') || '';
                                        if (!q || title.indexOf(q) !== -1) r.style.display = '';
                                        else r.style.display = 'none';
                                    });
                                });
                            }
                        } catch (e) { console.warn('free items modal search init failed', e); }
                    } catch (e) { console.warn('free items modal onShown failed', e); }
                }
            });

        } catch (e) {
            console.warn('[LoyaltyRules] manage free items failed', e);
            showToast('Failed to open free items manager', 'error');
        }
    };


    return (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mt-6">
            <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-bold">Earning rules</h2>
                        {/* Commenting out the recalculate points button section
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleRecalc}
                                disabled={recalcBusy}
                                className={`px-3 py-1 rounded ${recalcBusy ? 'bg-gray-200 text-gray-700' : 'bg-primary text-white'}`}
                            >
                                {recalcBusy ? 'Recalculating...' : 'Recalculate points'}
                            </button>
                        </div>
                        */}
                        {/* No Add/Delete: editing only */}
                    </div>

            <div className="text-sm font-medium text-gray-700 mb-3">Configured rules</div>

            

            {loading ? <div className="text-sm text-gray-500">Loading...</div> : (
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead>
                            <tr className="text-left text-sm text-gray-600 border-b">
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Description</th>
                                <th className="px-4 py-3">Active</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map(r => (
                                <tr key={r.id} className="border-b hover:bg-gray-50">
                                    <td className="px-4 py-3">{r.name}</td>
                                    <td className="px-4 py-3 text-gray-600">
                                        {r.type === 'spend_ratio' ?
                                            (() => {
                                                // Compute currency symbol at render time so changes in settings reflect immediately
                                                const cs = currencySymbol || ((typeof UserSession !== 'undefined' && UserSession?.getCurrency) ? UserSession.getCurrency() : '₹');
                                                const ppc = (typeof r.pointsPerCurrency === 'number' && r.pointsPerCurrency > 0) ? r.pointsPerCurrency : (1/50);
                                                const per = Math.round(1 / ppc) || 50;
                                                return `Earn 1 point for every ${cs}${per} spent.`;
                                            })()
                                            : r.description}
                                    </td>
                                    <td className="px-4 py-3">{r.active ? 'Yes' : 'No'}</td>
                                    <td className="px-4 py-3">{r.type || '-'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col items-start gap-2">
                                            {r.type === 'birthday' && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleManageFreeItems();}}
                                                    className="px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600"
                                                    title="Add free item"
                                                >
                                                    Add free item
                                                </button>
                                            )}
                                            <div>
                                                <button onClick={() => toggleRuleActive(r.id)} className={`px-3 py-1 rounded ${r.active ? 'bg-gray-200 text-gray-800' : 'bg-primary text-white'}`}>
                                                    {r.active ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
