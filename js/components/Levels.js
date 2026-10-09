import { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { UserSession } from '../utils/UserSession.js';

export default function Levels() {
    // Hardcoded static levels — editing disabled per request
    const [levels, setLevels] = useState([
        { id: 'vip', name: 'VIP', description: 'Customers who spend more than', condition: 5000, rewardName: '20% off for every purchase and additional reward', rewardCode: '45678', minOrder: 'Not set', active: true },
        { id: 'gold', name: 'Gold', description: 'Customers who spend more than', condition: 1500, rewardName: '15% off for every purchase', rewardCode: '34567', minOrder: 'Not set', active: true },
        { id: 'silver', name: 'Silver', description: 'Customers who spend more than', condition: 400, rewardName: '10% off for every purchase', rewardCode: '23456', minOrder: 'Not set', active: true },
        { id: 'bronze', name: 'Bronze', description: 'Starting level', condition: 0, rewardName: '5% off for every purchase', rewardCode: '12345', minOrder: 100, active: true }
    ]);

    // Reactive currency code so UI updates when system currency changes.
    const [currencyCode, setCurrencyCode] = useState((typeof UserSession !== 'undefined' && UserSession?.getCurrencyCode) ? UserSession.getCurrencyCode() : 'INR');

    useEffect(() => {
        const handler = (evt) => {
            try {
                const code = (evt && evt.detail && evt.detail.code) ? evt.detail.code : ((typeof UserSession !== 'undefined' && UserSession?.getCurrencyCode) ? UserSession.getCurrencyCode() : 'INR');
                setCurrencyCode(code);
            } catch (e) { /* ignore */ }
        };
        window.addEventListener('currencyChanged', handler);
        return () => window.removeEventListener('currencyChanged', handler);
    }, []);

    // Summary state will be computed from Customers collection
    const [summary, setSummary] = useState({ totalMembers: 0, newMembers: 0, regular: 0, vip: 0 });

    // Compute customers per level and summary from Firestore (read-only)
    useEffect(() => {
        if (!sdk || !sdk.db || typeof sdk.db.collection !== 'function') return;

        let unsub = null;
        const compute = (customers) => {
            const counts = {};
            // ensure levels sorted descending by condition
            const sortedLevels = [...levels].sort((a, b) => (Number(b.condition || 0) - Number(a.condition || 0)));
            for (const lvl of sortedLevels) counts[lvl.id] = 0;

            customers.forEach(c => {
                const totalSpend = Number(c.totalPaid || c.totalSpent || c.total || 0) || 0;
                let matched = null;
                for (const lvl of sortedLevels) {
                    const cond = Number(lvl.condition || 0) || 0;
                    if (totalSpend >= cond) { matched = lvl; break; }
                }
                if (matched) counts[matched.id] = (counts[matched.id] || 0) + 1;
            });

            // update levels with customer counts
            const updated = levels.map(l => ({ ...l, customers: counts[l.id] || 0 }));
            setLevels(updated);

            // compute summary
            const now = Date.now();
            const newMembers = customers.filter(c => {
                const d = c.date && typeof c.date.toDate === 'function' ? c.date.toDate().getTime() : (c.date ? new Date(c.date).getTime() : 0);
                return d && (now - d) <= (1000 * 60 * 60 * 24 * 30);
            }).length;
            // vip detection
            let vipId = null;
            for (const lvl of sortedLevels) {
                if (lvl && ((lvl.id && String(lvl.id).toLowerCase() === 'vip') || (lvl.name && String(lvl.name).toLowerCase() === 'vip'))) { vipId = lvl.id; break; }
            }
            const totalMembers = customers.length;
            const vip = vipId ? (counts[vipId] || 0) : (counts['vip'] || 0);
            const regular = Math.max(0, totalMembers - vip - newMembers);
            setSummary({ totalMembers, newMembers, regular, vip });
        };

        try {
            const col = sdk.db.collection('Customers');
            if (col && typeof col.onSnapshot === 'function') {
                unsub = col.onSnapshot(snapshot => {
                    const customers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    compute(customers);
                }, err => {
                    console.warn('Customers onSnapshot failed:', err);
                });
            } else {
                // fallback single fetch
                (async () => {
                    try {
                        const snap = await sdk.db.collection('Customers').get();
                        const customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        compute(customers);
                    } catch (e) { console.warn('Customers fetch failed', e); }
                })();
            }
        } catch (e) { console.warn('Customers listener error', e); }

        return () => { if (typeof unsub === 'function') unsub(); };
    }, []);

    // Helper function to get currency symbol
    const getCurrencySymbol = () => {
        if (typeof UserSession !== 'undefined' && UserSession?.getCurrency) {
            return UserSession.getCurrency();
        }
        // Fallback to ₹ if UserSession is not available
        return '₹';
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mt-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Levels</h2>
            </div>
            {/* Levels are hardcoded and not editable in this build */}

            <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
                <div className="p-4 bg-white border border-gray-100 rounded-md">
                    <div className="text-xs text-gray-500">Total Members</div>
                    <div className="text-2xl font-bold">{summary.totalMembers}</div>
                </div>
                <div className="p-4 bg-white border border-gray-100 rounded-md">
                    <div className="text-xs text-gray-500">New</div>
                    <div className="text-2xl font-bold text-yellow-500">{summary.newMembers}</div>
                </div>
                <div className="p-4 bg-white border border-gray-100 rounded-md">
                    <div className="text-xs text-gray-500">Regular</div>
                    <div className="text-2xl font-bold text-gray-400">{summary.regular}</div>
                </div>
                <div className="p-4 bg-white border border-gray-100 rounded-md">
                    <div className="text-xs text-gray-500">VIP</div>
                    <div className="text-2xl font-bold text-purple-600">{summary.vip}</div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                    <thead>
                        <tr className="text-left text-sm text-gray-600 border-b">
                            <th className="px-4 py-3">Name</th>
<th className="px-4 py-3">Description</th>
                            <th className="px-4 py-3">Condition value</th>
                            <th className="px-4 py-3">Reward name</th>
                            <th className="px-4 py-3">Reward code</th>
                            <th className="px-4 py-3">Min order value</th>
                            <th className="px-4 py-3">Customers</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {levels.map(l => (
                            <tr key={l.id} className="border-b hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium">{l.name}</td>
                                <td className="px-4 py-3 text-gray-600">
                                    {l.description} {l.condition > 0 && `${getCurrencySymbol()}${l.condition}`}
                                </td>
                                <td className="px-4 py-3">{l.condition}</td>
                                <td className="px-4 py-3">{l.rewardName}</td>
                                <td className="px-4 py-3">{l.rewardCode}</td>
                                <td className="px-4 py-3">{l.minOrder}</td>
                                <td className="px-4 py-3">{l.customers || 0}</td>
                                <td className="px-4 py-3 align-middle">
                                    <div className="flex items-center justify-center gap-2 h-full">
                                        <button onClick={() => {
                                            const t = String(l.name || l.id || '');
                                            try { window.dispatchEvent(new CustomEvent('showLevelCustomers', { detail: { tier: t } })); } catch (e) { window.dispatchEvent({ type: 'showLevelCustomers', detail: { tier: t } }); }
                                        }} className="flex items-center justify-center h-8 px-2 rounded hover:bg-gray-100 text-sm text-gray-700" title="View customers in level">
                                            View
                                        </button>
                                        {/* Edit removed — levels are hardcoded */}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}