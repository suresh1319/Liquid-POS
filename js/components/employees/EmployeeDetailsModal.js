import { useMemo, useState, useEffect } from 'react';
import { CurrencyData } from '../../utils/CurrencyData.js';
import EmployeeActivityChart from './EmployeeActivityChart.js';
import { sdk, showToast } from '../../sdk.js';
import { EMPLOYEE_ROLES } from '../../models/EmployeeRoles.js';
// Import useProfile to access profile data
import { useProfile } from '../../contexts/ProfileContext.js';

// Update the component to receive profile currency or use default
export default function EmployeeDetailsModal({ emp, isOpen, onClose, displayCurrency, onUpdate }) {
    // Use profile context to get the current currency if not provided
    const { profile } = useProfile();
    
    // Use provided displayCurrency or fallback to profile currency, then to INR
    const effectiveDisplayCurrency = displayCurrency || profile?.currencyCode || 'INR';
    
    // Just display the hourly rate in the profile currency without conversion
    const displayHourlyRate = emp?.hourlyRate || null;
    
    const [showActivityChart, setShowActivityChart] = useState(false);
    const [actualStats, setActualStats] = useState({
        today: 0,
        thisWeek: 0,
        thisMonth: 0
    });
    const [loading, setLoading] = useState(false);
    
    // Editable fields state
    const [editingField, setEditingField] = useState(null);
    const [tempEmail, setTempEmail] = useState('');
    const [tempPhone, setTempPhone] = useState('');
    const [tempHourlyRate, setTempHourlyRate] = useState('');
    const [tempRole, setTempRole] = useState('');
    const [tempName, setTempName] = useState('');
    const [saving, setSaving] = useState(false);

    // Fetch real activity stats from Firebase
    useEffect(() => {
        if (isOpen && emp?.uniqueId) {
            fetchActivityStats();
        }
    }, [isOpen, emp?.uniqueId]);

    // Initialize temp values when employee data changes
    useEffect(() => {
        if (emp) {
            setTempEmail(emp.email || '');
            setTempPhone(emp.phone || '');
            setTempHourlyRate(emp.hourlyRate || '');
            setTempRole(emp.role || '');
            setTempName(emp.name || '');
        }
    }, [emp]);

    const fetchActivityStats = async () => {
        setLoading(true);
        try {
            const employeeId = emp.uniqueId || emp.id;
            const now = new Date();
            
            // Calculate date ranges
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

            // Fetch activity logs from EmployeeActivityLogs collection
            // Query for today's activities
            const todayQuery = await sdk.db.collection('EmployeeActivityLogs')
                .where('employeeId', '==', employeeId)
                .get();
            
            // Query for this week's activities  
            const weekQuery = await sdk.db.collection('EmployeeActivityLogs')
                .where('employeeId', '==', employeeId)
                .get();
            
            // Query for this month's activities
            const monthQuery = await sdk.db.collection('EmployeeActivityLogs')
                .where('employeeId', '==', employeeId)
                .get();
            
            // Calculate hours from activity logs with date filtering
            const calculateHours = (snapshot, startDate, endDate) => {
                let totalHours = 0;
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    
                    // Parse the date from the document
                    let logDate;
                    if (data.date && data.date.toDate) {
                        logDate = data.date.toDate();
                    } else if (data.date) {
                        logDate = new Date(data.date);
                    } else {
                        return; // Skip if no date
                    }
                    
                    // Check if the log date falls within our range
                    if (logDate >= startDate && logDate <= endDate) {
                        if (data.loginTime && data.logoutTime) {
                            const login = data.loginTime.toDate ? data.loginTime.toDate() : new Date(data.loginTime);
                            const logout = data.logoutTime.toDate ? data.logoutTime.toDate() : new Date(data.logoutTime);
                            const hours = (logout - login) / (1000 * 60 * 60); // Convert to hours
                            if (hours > 0 && hours < 24) { // Sanity check
                                totalHours += hours;
                            }
                        }
                    }
                });
                return totalHours;
            };
            
            setActualStats({
                today: calculateHours(todayQuery, todayStart, now),
                thisWeek: calculateHours(weekQuery, weekStart, now),
                thisMonth: calculateHours(monthQuery, monthStart, now)
            });
            
        } catch (error) {
            console.error('Error fetching activity stats:', error);
            // Set default values on error
            setActualStats({ today: 0, thisWeek: 0, thisMonth: 0 });
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (date) => {
        if (!date) return '—';
        try {
            const d = date.toDate ? date.toDate() : new Date(date);
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return '—';
        }
    };

    const formatDateTime = (date) => {
        if (!date) return '—';
        try {
            const d = date.toDate ? date.toDate() : new Date(date);
            return d.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return '—';
        }
    };

    const getOnlineStatusInfo = (employee) => {
        if (employee.isLoggedIn && employee.status === 'ONLINE') {
            return {
                text: 'Online',
                icon: 'ph-circle',
                class: 'text-green-600 bg-green-50 border-green-200',
                iconClass: 'text-green-500'
            };
        } else {
            return {
                text: 'Offline',
                icon: 'ph-circle',
                class: 'text-gray-600 bg-gray-50 border-gray-200',
                iconClass: 'text-gray-400'
            };
        }
    };

    const getRoleIcon = (role) => {
        const roleIcons = {
            'Owner': 'ph-crown',
            'Manager': 'ph-user-gear',
            'Cashier': 'ph-currency-dollar',
            'Waiter': 'ph-coffee',
            'Kitchen Staff': 'ph-chef-hat',
            'Delivery Staff': 'ph-motorcycle'
        };
        return roleIcons[role] || 'ph-user';
    };

    const grantedPermissions = useMemo(() => {
        if (!emp?.permissions || !Array.isArray(emp.permissions)) return [];
        
        // Filter permissions that have at least one action granted
        return emp.permissions.filter(permission => 
            permission.actions && 
            Array.isArray(permission.actions) && 
            permission.actions.length > 0
        );
    }, [emp?.permissions]);

    const permissionCount = grantedPermissions.length;

    // Save updated field to backend
    const saveField = async (field, value) => {
        if (!emp?.id) return;
        setSaving(true);
        try {
            const updateData = {};
            updateData[field] = value;
            await sdk.db.collection('Employees').doc(emp.id).update(updateData);
            onUpdate?.({ ...emp, ...updateData });
            setEditingField(null);
            showToast(`${field} updated successfully`, 'success');
        } catch (error) {
            console.error(`Error updating ${field}:`, error);
            showToast(`Failed to update ${field}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    const cancelEdit = () => {
        setEditingField(null);
        // Reset temp values to current values
        setTempEmail(emp.email || '');
        setTempPhone(emp.phone || '');
        setTempHourlyRate(emp.hourlyRate || '');
        setTempRole(emp.role || '');
        setTempName(emp.name || '');
    };

    if (!isOpen || !emp) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 overflow-y-auto">
                <div className="fixed inset-0 bg-black bg-opacity-40" onClick={onClose}></div>
                <div className="flex min-h-full items-center justify-center p-4">
                    <div className="relative bg-white rounded-xl shadow-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between rounded-t-xl">
                            <h2 className="text-xl font-bold text-gray-800">Employee Details</h2>
                            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
                                <i className="ph ph-x text-xl"></i>
                            </button>
                        </div>
                        
                        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column - Personal Info and Stats */}
                            <div className="space-y-6">
                                {/* Personal Information */}
                                <div className="bg-white rounded-xl shadow-sm border p-6">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                        <i className="ph ph-user-list text-red-500" />
                                        Personal Information
                                    </h3>
                                    <div className="space-y-4">
                                        {/* Name Field */}
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
                                                <i className="ph ph-user text-gray-400" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm text-gray-600">Name</p>
                                                {editingField === 'name' ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={tempName}
                                                            onChange={(e) => setTempName(e.target.value)}
                                                            className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                                                            placeholder="Enter name"
                                                            disabled={saving}
                                                        />
                                                        <button
                                                            onClick={() => saveField('name', tempName)}
                                                            className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                                                            disabled={saving}
                                                            title="Save"
                                                        >
                                                            <i className="ph ph-check-circle text-lg" />
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="p-1 text-gray-600 hover:text-gray-800"
                                                            title="Cancel"
                                                        >
                                                            <i className="ph ph-x-circle text-lg" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-medium text-gray-900">{emp.name || 'No name provided'}</p>
                                                        <button
                                                            onClick={() => {
                                                                setEditingField('name');
                                                                setTempName(emp.name || '');
                                                            }}
                                                            className="p-1 text-gray-500 hover:text-gray-700"
                                                            title="Edit name"
                                                        >
                                                            <i className="ph ph-pencil text-base" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Email Field */}
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
                                                <i className="ph ph-at text-gray-400" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm text-gray-600">Email</p>
                                                {editingField === 'email' ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="email"
                                                            value={tempEmail}
                                                            onChange={(e) => setTempEmail(e.target.value)}
                                                            className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                                                            placeholder="Enter email"
                                                            disabled={saving}
                                                        />
                                                        <button
                                                            onClick={() => saveField('email', tempEmail)}
                                                            className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                                                            disabled={saving}
                                                            title="Save"
                                                        >
                                                            <i className="ph ph-check-circle text-lg" />
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="p-1 text-gray-600 hover:text-gray-800"
                                                            title="Cancel"
                                                        >
                                                            <i className="ph ph-x-circle text-lg" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-medium text-gray-900">{emp.email || 'No email provided'}</p>
                                                        <button
                                                            onClick={() => {
                                                                setEditingField('email');
                                                                setTempEmail(emp.email || '');
                                                            }}
                                                            className="p-1 text-gray-500 hover:text-gray-700"
                                                            title="Edit email"
                                                        >
                                                            <i className="ph ph-pencil text-base" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Phone Field */}
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
                                                <i className="ph ph-phone text-gray-400" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm text-gray-600">Phone</p>
                                                {editingField === 'phone' ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="tel"
                                                            value={tempPhone}
                                                            onChange={(e) => setTempPhone(e.target.value)}
                                                            className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-sm"
                                                            placeholder="Enter phone number"
                                                            disabled={saving}
                                                        />
                                                        <button
                                                            onClick={() => saveField('phone', tempPhone)}
                                                            className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                                                            disabled={saving}
                                                            title="Save"
                                                        >
                                                            <i className="ph ph-check-circle text-lg" />
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="p-1 text-gray-600 hover:text-gray-800"
                                                            title="Cancel"
                                                        >
                                                            <i className="ph ph-x-circle text-lg" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-medium text-gray-900">{emp.phone || 'No phone provided'}</p>
                                                        <button
                                                            onClick={() => {
                                                                setEditingField('phone');
                                                                setTempPhone(emp.phone || '');
                                                            }}
                                                            className="p-1 text-gray-500 hover:text-gray-700"
                                                            title="Edit phone"
                                                        >
                                                            <i className="ph ph-pencil text-base" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Employment Details */}
                                <div className="bg-white rounded-xl shadow-sm border p-6">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                        <i className="ph ph-briefcase text-red-500" />
                                        Employment Details
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-600">Joined Date</span>
                                            <span className="font-medium text-gray-900">{formatDate(emp.joinedAt)}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-600">Employee ID</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs text-gray-700 max-w-[150px] truncate" title="{emp.uniqueId || emp.id}">
                                                    {emp.uniqueId || emp.id}
                                                </span>
                                                <button
                                                    onClick={() => {
                                                        const employeeId = emp.uniqueId || emp.id;
                                                        navigator.clipboard.writeText(employeeId).then(() => {
                                                            showToast('Employee ID copied to clipboard', 'success');
                                                        }).catch(err => {
                                                            console.error('Failed to copy: ', err);
                                                        });
                                                    }}
                                                    className="p-1 text-gray-500 hover:text-gray-700"
                                                    title="Copy Employee ID"
                                                >
                                                    <i className="ph ph-copy text-base" />
                                                </button>
                                            </div>
                                        </div>
                                        {/* Role Field */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-600">Role</span>
                                            <div className="flex items-center gap-2">
                                                {editingField === 'role' ? (
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={tempRole}
                                                            onChange={(e) => setTempRole(e.target.value)}
                                                            className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                                                            disabled={saving}
                                                        >
                                                            <option value="">Select Role</option>
                                                            {EMPLOYEE_ROLES.map(role => (
                                                                <option key={role} value={role}>{role}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            onClick={() => saveField('role', tempRole)}
                                                            className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                                                            disabled={saving}
                                                            title="Save"
                                                        >
                                                            <i className="ph ph-check-circle text-lg" />
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="p-1 text-gray-600 hover:text-gray-800"
                                                            title="Cancel"
                                                        >
                                                            <i className="ph ph-x-circle text-lg" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-gray-900 flex items-center gap-2">
                                                            <i className={`ph ${getRoleIcon(emp.role)} text-red-500`} />
                                                            {emp.role || 'Not set'}
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                setEditingField('role');
                                                                setTempRole(emp.role || '');
                                                            }}
                                                            className="p-1 text-gray-500 hover:text-gray-700"
                                                            title="Edit role"
                                                        >
                                                            <i className="ph ph-pencil text-base" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-600">Hourly Rate</span>
                                            <div className="flex items-center gap-2">
                                                {editingField === 'hourlyRate' ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={tempHourlyRate}
                                                            onChange={(e) => setTempHourlyRate(e.target.value)}
                                                            className="border border-gray-300 rounded-md px-2 py-1 text-sm w-24"
                                                            placeholder="Rate"
                                                            disabled={saving}
                                                        />
                                                        <button
                                                            onClick={() => saveField('hourlyRate', tempHourlyRate)}
                                                            className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                                                            disabled={saving}
                                                            title="Save"
                                                        >
                                                            <i className="ph ph-check-circle text-lg" />
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="p-1 text-gray-600 hover:text-gray-800"
                                                            title="Cancel"
                                                        >
                                                            <i className="ph ph-x-circle text-lg" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-gray-900">
                                                            {displayHourlyRate ? `${displayHourlyRate} ${effectiveDisplayCurrency}` : 'Not set'}
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                setEditingField('hourlyRate');
                                                                setTempHourlyRate(emp.hourlyRate || '');
                                                            }}
                                                            className="p-1 text-gray-500 hover:text-gray-700"
                                                            title="Edit hourly rate"
                                                        >
                                                            <i className="ph ph-pencil text-base" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {emp.isLoggedIn && emp.loginTime && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-600">Login Time</span>
                                                <span className="font-medium text-gray-900">{formatDateTime(emp.loginTime)}</span>
                                            </div>
                                        )}
                                        
                                        {!emp.isLoggedIn && emp.logoutTime && (
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-600">Last Logout</span>
                                                <span className="font-medium text-gray-900">{formatDateTime(emp.logoutTime)}</span>
                                            </div>
                                        )}
                                        
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-600">Last Activity</span>
                                            <span className="font-medium text-gray-900">{formatDateTime(emp.lastActivity)}</span>
                                        </div>
                                        
                                        {/* Access Link */}
                                        {emp.accessLink && (
                                            <div className="pt-4 border-t border-gray-100">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-600">Access Link</span>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(emp.accessLink);
                                                                showToast('Link copied to clipboard', 'success');
                                                            }}
                                                            className="px-3 py-1 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm flex items-center gap-1"
                                                            title="Copy Access Link"
                                                        >
                                                            <i className="ph ph-copy" />
                                                            Copy Link
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="mt-2 text-xs text-gray-500">
                                                    Share this link with the employee for secure access
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Quick Stats */}
                                <div className="bg-white rounded-xl shadow-sm border p-6">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                        <i className="ph ph-chart-bar text-red-500" />
                                        Quick Stats
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-blue-50 rounded-lg p-4 text-center">
                                            <p className="text-2xl font-bold text-blue-600">
                                                {loading ? (
                                                    <i className="ph ph-spinner ph-spin text-xl"></i>
                                                ) : (
                                                    `${actualStats.today.toFixed(1)}h`
                                                )}
                                            </p>
                                            <p className="text-sm text-blue-600">Today</p>
                                        </div>
                                        <div className="bg-green-50 rounded-lg p-4 text-center">
                                            <p className="text-2xl font-bold text-green-600">
                                                {loading ? (
                                                    <i className="ph ph-spinner ph-spin text-xl"></i>
                                                ) : (
                                                    `${actualStats.thisWeek.toFixed(1)}h`
                                                )}
                                            </p>
                                            <p className="text-sm text-green-600">This Week</p>
                                        </div>
                                        <div className="bg-amber-50 rounded-lg p-4 text-center">
                                            <p className="text-2xl font-bold text-amber-600">
                                                {loading ? (
                                                    <i className="ph ph-spinner ph-spin text-xl"></i>
                                                ) : (
                                                    `${actualStats.thisMonth.toFixed(1)}h`
                                                )}
                                            </p>
                                            <p className="text-sm text-amber-600">This Month</p>
                                        </div>
                                        <div className="bg-purple-50 rounded-lg p-4 text-center">
                                            <p className="text-2xl font-bold text-purple-600">{emp.shifts || 0}</p>
                                            <p className="text-sm text-purple-600">Total Shifts</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column - Permissions and Actions */}
                            <div className="space-y-6">
                                {/* Permissions */}
                                <div className="bg-white rounded-xl shadow-sm border p-6">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                        <i className="ph ph-shield-check text-red-500" />
                                        Access Permissions
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-600">Modules Access</span>
                                            <span className="font-medium text-gray-900">{permissionCount} modules</span>
                                        </div>
                                        
                                        {emp.role === 'Owner' && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                                <p className="text-sm text-amber-800 flex items-center gap-2">
                                                    <i className="ph ph-crown" />
                                                    Owner has full system access
                                                </p>
                                            </div>
                                        )}
                                        
                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                                            {grantedPermissions.length > 0 ? (
                                                grantedPermissions.map((permission, index) => (
                                                    <div key={index} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-lg">
                                                        <div className="flex items-center gap-2">
                                                            <i className="ph ph-check-circle text-green-500" />
                                                            <span className="text-gray-700 font-medium">{permission.module}</span>
                                                        </div>
                                                        <div className="flex gap-1 flex-wrap">
                                                            {permission.actions.map((action, actionIndex) => (
                                                                <span key={actionIndex} className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                                                                    {action}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-4">
                                                    <i className="ph ph-shield-slash text-4xl text-gray-300 mb-2"></i>
                                                    <p className="text-sm text-gray-500">No permissions granted</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="bg-white rounded-xl shadow-sm border p-6">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                        <i className="ph ph-gear text-red-500" />
                                        Actions
                                    </h3>
                                    <div className="space-y-3">
                                        <button 
                                            onClick={() => setShowActivityChart(true)}
                                            className="w-full flex items-center gap-3 p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group"
                                        >
                                            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                                                <i className="ph ph-chart-line text-white" />
                                            </div>
                                            <div className="text-left">
                                                <p className="font-medium text-gray-900">View Activity</p>
                                                <p className="text-sm text-gray-600">Track work hours and patterns</p>
                                            </div>
                                        </button>
                                        
                                        <button className="w-full flex items-center gap-3 p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group">
                                            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center group-hover:bg-green-600 transition-colors">
                                                <i className="ph ph-phone text-white" />
                                            </div>
                                            <div className="text-left">
                                                <p className="font-medium text-gray-900">Contact</p>
                                                <p className="text-sm text-gray-600">Call or message employee</p>
                                            </div>
                                        </button>
                                        
                                        <button className="w-full flex items-center gap-3 p-3 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors group">
                                            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center group-hover:bg-amber-600 transition-colors">
                                                <i className="ph ph-note text-white" />
                                            </div>
                                            <div className="text-left">
                                                <p className="font-medium text-gray-900">Add Note</p>
                                                <p className="text-sm text-gray-600">Record observations or feedback</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Activity Chart Modal */}
            <EmployeeActivityChart 
                employeeId={emp.uniqueId || emp.id}
                isOpen={showActivityChart}
                onClose={() => setShowActivityChart(false)}
            />
        </>
    );
}