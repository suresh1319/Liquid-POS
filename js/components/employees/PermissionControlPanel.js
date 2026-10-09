import { useEffect, useMemo, useState } from 'react';
import { sdk, showToast } from '../../sdk.js';
import { Role, Permission } from '../../models/Role.js';

const FEATURES = ['home','products','KDS','ai-menu','customers','employees','passbook','reports','expenses','analytics','settings'];

// Generate a secure random token
function generateSecureToken(length = 32) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Generate a device binding ID
function generateDeviceBindingId() {
    return generateSecureToken(16);
}

// Create an access link with token
function createAccessLink(employeeId, token) {
    return `https://shopto.app/apps/restaurant-pos?auth=${employeeId}_${token}`;
}

function permsArrayToMap(permsArr = []) {
    // Changed: No permissions enabled by default, not even home
    const map = Object.fromEntries(FEATURES.map(f => [f, false]));
    (permsArr || []).forEach(p => {
        if (p?.actions?.includes('view')) map[p.module] = true;
    });
    return map;
}

function permsMapToArray(permsMap) {
    // Only include permissions that are explicitly enabled
    return FEATURES
        .filter(m => permsMap[m]) // Only include modules that are enabled
        .map(m => new Permission({ module: m, actions: ['view'] }))
        .map(p => p.toJson());
}

export default function PermissionControlPanel({ isOpen, onClose }) {
    const [roles, setRoles] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [selected, setSelected] = useState({ type: 'role', id: null });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // Changed: Initialize with all permissions disabled by default
    const [perms, setPerms] = useState(Object.fromEntries(FEATURES.map(f => [f, false])));
    const [rolePerms, setRolePerms] = useState({});
    const [employeePerms, setEmployeePerms] = useState({});
    const [searchLeft, setSearchLeft] = useState('');
    const [applyToAllRole, setApplyToAllRole] = useState(false);

    // Load roles and employees
    useEffect(() => {
        if (!isOpen) return;
        let unsubEmployees = null;
        const load = async () => {
            setLoading(true);
            try {
                // Roles: assume SDK collection "Roles" documents mirror Role model
                const rolesSnap = await sdk.db.collection('Roles').get();
                const loadedRoles = rolesSnap.docs.map(d => new Role({ id: d.id, ...(d.data()||{}) }));
                setRoles(loadedRoles);

                // Employees: live list
                unsubEmployees = sdk.db.collection('Employees').onSnapshot(snap => {
                    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setEmployees(list);
                });

                // Preselect first role if exists
                if (loadedRoles.length > 0) {
                    setSelected({ type: 'role', id: loadedRoles[0].id });
                } else if (employees.length > 0) {
                    setSelected({ type: 'employee', id: employees[0].id });
                }
            } finally {
                setLoading(false);
            }
        };
        load();
        return () => { if (unsubEmployees) unsubEmployees(); };
    }, [isOpen]);

    // Load permissions for selected item
    useEffect(() => {
        if (!isOpen || !selected.id) return;
        const loadPerms = async () => {
            // Changed: No permissions enabled by default
            const base = Object.fromEntries(FEATURES.map(f => [f, false]));
            try {
                if (selected.type === 'role') {
                    const doc = await sdk.db.collection('Roles').doc(selected.id).get();
                    const data = doc.exists ? doc.data() : {};
                    const rMap = permsArrayToMap(data?.permissions || []);
                    setRolePerms(rMap);
                    setEmployeePerms({});
                    setPerms(rMap);
                } else {
                    const edoc = await sdk.db.collection('Employees').doc(selected.id).get();
                    const eData = edoc.exists ? edoc.data() : {};
                    
                    // Special handling for Owner role - show all permissions as enabled
                    if (eData?.role === 'Owner') {
                        // For Owner, show all permissions as enabled
                        const ownerPerms = Object.fromEntries(FEATURES.map(f => [f, true]));
                        setRolePerms(ownerPerms);
                        setEmployeePerms({});
                        setPerms(ownerPerms);
                    } else {
                        const empMap = permsArrayToMap(eData?.permissions || []);

                        // Merge role permissions of this employee
                        const roleName = (eData?.role || '').toLowerCase();
                        const matchingRole = roles.find(r => (r.name || '').toLowerCase() === roleName);
                        let rMap = base;
                        if (matchingRole) {
                            rMap = permsArrayToMap(matchingRole.permissions || []);
                        }
                        setRolePerms(rMap);
                        setEmployeePerms(empMap);
                        const merged = { ...rMap, ...empMap };
                        setPerms(merged);
                    }
                }
            } catch (error) {
                console.error('Error loading permissions:', error);
                showToast('Error loading permissions', 'error');
            }
        };
        loadPerms();
    }, [isOpen, selected, roles]);

    const filteredLeft = useMemo(() => {
        const q = searchLeft.trim().toLowerCase();
        const roleItems = roles
            .filter(r => !q || (r.name || '').toLowerCase().includes(q))
            .map(r => ({ type: 'role', id: r.id, label: r.name || 'Role' }));
        const employeeItems = employees
            .filter(e => {
                if (!q) return true;
                const name = (e.name || '').toLowerCase();
                const email = (e.email || '').toLowerCase();
                const phone = (e.phone || '').toLowerCase();
                const role = (e.role || '').toLowerCase();
                return name.includes(q) || email.includes(q) || phone.includes(q) || role.includes(q);
            })
            .map(e => ({ type: 'employee', id: e.id, label: e.name || e.email || e.phone || 'Employee', role: e.role || '' }));
        return { roleItems, employeeItems };
    }, [roles, employees, searchLeft]);

    const toggle = async (feature) => {
        if (!selected.id) { showToast('Select a role or employee first', 'error'); return; }
        
        // Prevent changes to Owner permissions
        if (selected.type === 'employee') {
            const currentEmployee = employees.find(emp => emp.id === selected.id);
            if (currentEmployee?.role === 'Owner') {
                showToast('Owner has all permissions by default', 'info');
                return;
            }
        }
        
        const nextVal = !perms[feature];
        
        if (selected.type === 'role') {
            const nextRole = { ...rolePerms, [feature]: nextVal };
            setRolePerms(nextRole);
            setPerms(nextRole);
            // persist immediately and apply to members by union
            try {
                const permissions = permsMapToArray(nextRole);
                if (!selected.id) throw new Error('Missing role id');
                await sdk.db.collection('Roles').doc(selected.id).update({ permissions });
                // propagate union to employees of this role
                const roleName = roles.find(r => r.id === selected.id)?.name || '';
                if (roleName) {
                    const snap = await sdk.db.collection('Employees').where('role', '==', roleName).get();
                    const updates = snap.docs.map(d => {
                        const curEmp = d.data() || {};
                        const empMap = permsArrayToMap(curEmp.permissions || []);
                        const unionMap = { ...nextRole, ...empMap };
                        if (!d.id) return Promise.resolve();
                        return sdk.db.collection('Employees').doc(d.id).update({ permissions: permsMapToArray(unionMap) });
                    });
                    await Promise.all(updates);
                }
                showToast('Role permission updated');
            } catch (e) {
                console.error('Failed to update role permission:', e);
                showToast('Failed to update role permission', 'error');
                // Revert UI state on error
                setPerms({ ...rolePerms });
            }
        } else {
            // employee override only
            const nextEmp = { ...employeePerms, [feature]: nextVal };
            setEmployeePerms(nextEmp);
            const merged = { ...rolePerms, ...nextEmp };
            setPerms(merged);
            
            try {
                if (!selected.id) throw new Error('Missing employee id');
                await sdk.db.collection('Employees').doc(selected.id).update({ permissions: permsMapToArray(nextEmp) });
                
                // If applyToAllRole is checked, sync with all employees of the same role
                if (applyToAllRole) {
                    const currentEmployee = employees.find(emp => emp.id === selected.id);
                    const roleName = currentEmployee?.role;
                    
                    if (roleName) {
                        const snap = await sdk.db.collection('Employees').where('role', '==', roleName).get();
                        const updates = snap.docs
                            .filter(d => d.id !== selected.id) // Don't update current employee again
                            .map(d => {
                                if (!d.id) return Promise.resolve();
                                return sdk.db.collection('Employees').doc(d.id).update({ permissions: permsMapToArray(nextEmp) });
                            });
                        await Promise.all(updates);
                        showToast(`Employee permission updated and synced with ${updates.length} other employees with role: ${roleName}`);
                    } else {
                        showToast('Employee permission updated');
                    }
                } else {
                    showToast('Employee permission updated');
                }
            } catch (e) {
                console.error('Failed to update employee permission:', e);
                showToast('Failed to update employee permission', 'error');
                // Revert UI state on error
                const merged = { ...rolePerms, ...employeePerms };
                setPerms(merged);
            }
        }
    };

    const handleSave = async () => {
        if (!selected.id) return;
        
        // Prevent saving changes for Owners
        if (selected.type === 'employee') {
            const currentEmployee = employees.find(emp => emp.id === selected.id);
            if (currentEmployee?.role === 'Owner') {
                showToast('Owner permissions are managed automatically', 'info');
                setSaving(false);
                return;
            }
        }
        
        setSaving(true);
        try {
            if (selected.type === 'role') {
                const permissions = permsMapToArray(rolePerms);
                await sdk.db.collection('Roles').doc(selected.id).update({ permissions });
                // also union-apply to members
                let roleName = roles.find(r => r.id === selected.id)?.name;
                if (!roleName) {
                    const rdoc = await sdk.db.collection('Roles').doc(selected.id).get();
                    roleName = rdoc.exists ? (rdoc.data()?.name) : '';
                }
                if (roleName) {
                    const snap = await sdk.db.collection('Employees').where('role', '==', roleName).get();
                    const updates = snap.docs.map(d => {
                        const curEmp = d.data() || {};
                        const empMap = permsArrayToMap(curEmp.permissions || []);
                        const unionMap = { ...rolePerms, ...empMap };
                        return sdk.db.collection('Employees').doc(d.id).update({ permissions: permsMapToArray(unionMap) });
                    });
                    await Promise.all(updates);
                }
            } else {
                const permissions = permsMapToArray(employeePerms);
                
                // Generate new access token and link when permissions change
                const accessTokenToken = generateSecureToken();
                const deviceBindingId = generateDeviceBindingId();
                const accessLink = createAccessLink(selected.id, accessTokenToken);
                
                // Set token expiry to 24 hours from now
                const accessTokenExpiry = new Date();
                accessTokenExpiry.setDate(accessTokenExpiry.getDate() + 1);
                
                // Update employee with new permissions and access token
                await sdk.db.collection('Employees').doc(selected.id).update({ 
                    permissions,
                    accessTokenToken,
                    accessLink,
                    deviceBindingId,
                    accessTokenExpiry
                });
                
                // If applyToAllRole is checked, sync with all employees of the same role
                if (applyToAllRole) {
                    const currentEmployee = employees.find(emp => emp.id === selected.id);
                    const roleName = currentEmployee?.role;
                    
                    if (roleName) {
                        const snap = await sdk.db.collection('Employees').where('role', '==', roleName).get();
                        const updates = snap.docs
                            .filter(d => d.id !== selected.id) // Don't update current employee again
                            .map(d => {
                                if (!d.id) return Promise.resolve();
                                // FIX: Use the correct permissions variable
                                return sdk.db.collection('Employees').doc(d.id).update({ 
                                    permissions: permsMapToArray(employeePerms),
                                    accessTokenToken: generateSecureToken(), // Generate new token for each employee
                                    accessLink: createAccessLink(d.id, generateSecureToken()),
                                    deviceBindingId: generateDeviceBindingId(),
                                    accessTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
                                });
                            });
                        await Promise.all(updates);
                        showToast(`Permissions saved and synced with ${updates.length} other employees with role: ${roleName}`);
                    } else {
                        showToast('Permissions saved');
                    }
                } else {
                    showToast('Permissions saved');
                }
                return; // Early return to avoid the general toast below
            }
            showToast('Permissions saved');
        } catch (e) {
            console.error('Failed saving permissions:', e);
            showToast('Failed to save permissions', 'error');
        } finally {
            setSaving(false);
            // Close the panel after saving
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black bg-opacity-40" onClick={onClose}></div>
            <div className="absolute inset-8 bg-white rounded-xl shadow-lg overflow-hidden grid grid-cols-1 md:grid-cols-3">
                {/* Left Pane */}
                <div className="border-r bg-gray-50 p-4 overflow-y-auto">
                    <div className="mb-2 text-sm text-gray-500">Select Role or Employee</div>
                    <div className="mb-3 relative">
                        <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={searchLeft} onChange={(e)=>setSearchLeft(e.target.value)} placeholder="Search by name or role" className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none" />
                    </div>
                    {roles.length > 0 && (
                        <div className="mb-3">
                            <label className="block text-xs text-gray-500 mb-1">Quick select role</label>
                            <div className="flex items-center gap-2">
                                <select
                                    value={selected.type==='role' ? (selected.id || '') : ''}
                                    onChange={(e)=>{ const id = e.target.value; if (id) setSelected({ type:'role', id }); }}
                                    className="flex-1 py-2 px-2 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none"
                                >
                                    <option value="">Choose role…</option>
                                    {roles.map(r => (
                                        <option key={r.id} value={r.id}>{r.name || 'Role'}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={()=>{ /* ensure mode is role if dropdown has value */ if (selected.type!=='role' && roles[0]) setSelected({ type:'role', id: roles[0].id }); }}
                                    className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-700"
                                    title="Edit selected role"
                                >
                                    <i className="ph ph-identification-card"></i>
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="space-y-2">
                        {filteredLeft.roleItems.length > 0 && (
                            <div className="mt-1 mb-1 text-xs uppercase tracking-wider text-gray-400">Roles</div>
                        )}
                        {filteredLeft.roleItems.map(item => (
                            <button
                                key={`${item.type}-${item.id}`}
                                className={`w-full text-left px-3 py-2 rounded-lg ${selected.type===item.type && selected.id===item.id ? 'bg-red-50 text-red-700' : 'hover:bg-gray-100 text-gray-700'}`}
                                onClick={() => { setSelected({ type: item.type, id: item.id }); }}
                            >
                                <i className="ph ph-identification-card mr-2 text-gray-500"></i>
                                {item.label}
                            </button>
                        ))}
                        {filteredLeft.employeeItems.length > 0 && (
                            <div className="mt-3 mb-1 text-xs uppercase tracking-wider text-gray-400">Employees</div>
                        )}
                        {filteredLeft.employeeItems.map(item => (
                            <button
                                key={`${item.type}-${item.id}`}
                                className={`w-full text-left px-3 py-2 rounded-lg ${selected.type===item.type && selected.id===item.id ? 'bg-red-50 text-red-700' : 'hover:bg-gray-100 text-gray-700'}`}
                                onClick={() => { setSelected({ type: 'employee', id: item.id }); }}
                            >
                                <i className="ph ph-user mr-2 text-gray-500"></i>
                                {item.label}
                                {item.role ? <span className="ml-2 text-xs text-gray-500">— {item.role}</span> : null}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Pane */}
                <div className="md:col-span-2 p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-800">Permission Control Panel</h3>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100"><i className="ph ph-x"></i></button>
                    </div>
                    
                    {/* Apply to All Role Members Checkbox */}
                    <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={applyToAllRole}
                                onChange={(e) => setApplyToAllRole(e.target.checked)}
                                className="w-4 h-4 text-green-600 bg-white border-green-300 rounded focus:ring-green-500 focus:ring-2"
                            />
                            <div className="flex items-center gap-2 text-green-800">
                                <i className="ph ph-users"></i>
                                <span className="text-sm font-medium">Give permission to all employees having role</span>
                            </div>
                        </label>
                        {applyToAllRole && (
                            <div className="mt-2 text-xs text-green-700">
                                <i className="ph ph-info mr-1"></i>
                                Changes will be applied to all employees with the same role as the selected employee/role
                            </div>
                        )}
                    </div>
                    {selected.type === 'role' && (
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                            <div className="flex items-center gap-2 text-blue-800">
                                <i className="ph ph-info"></i>
                                <span className="text-sm font-medium">Role permissions apply to all employees with this role</span>
                            </div>
                        </div>
                    )}
                    {selected.type === 'employee' && (
                        (() => {
                            const currentEmployee = employees.find(emp => emp.id === selected.id);
                            if (currentEmployee?.role === 'Owner') {
                                return (
                                    <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                                        <div className="flex items-center gap-2 text-purple-800">
                                            <i className="ph ph-crown"></i>
                                            <span className="text-sm font-medium">Owner has all permissions by default</span>
                                        </div>
                                        <div className="mt-1 text-xs text-purple-700">
                                            All permissions are automatically granted to Owners and cannot be modified
                                        </div>
                                    </div>
                                );
                            } else {
                                return (
                                    <div className="mb-4 p-3 bg-amber-50 rounded-lg">
                                        <div className="flex items-center gap-2 text-amber-800">
                                            <i className="ph ph-warning"></i>
                                            <span className="text-sm font-medium">Employee permissions override role permissions</span>
                                        </div>
                                    </div>
                                );
                            }
                        })()
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 overflow-y-auto">
                        {FEATURES.map(feature => (
                            <div key={feature} className="border rounded-lg p-3 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-gray-800 capitalize">
                                    <i className="ph ph-gear"></i>
                                    {feature}
                                </div>
                                <label className="inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={!!perms[feature]} onChange={() => toggle(feature)} />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-red-500 relative transition-colors">
                                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${perms[feature] ? 'translate-x-5' : ''}`}></div>
                                    </div>
                                </label>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 flex justify-end gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200">Close</button>
                        <button onClick={handleSave} disabled={saving || !selected.id} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}