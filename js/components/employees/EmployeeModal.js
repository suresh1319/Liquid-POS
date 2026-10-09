import { useEffect, useState } from 'react';
import { EMPLOYEE_ROLES } from '../../models/EmployeeRoles.js';
import { CurrencyData } from '../../utils/CurrencyData.js';
// Import useProfile to access profile data
import { useProfile } from '../../contexts/ProfileContext.js';

// Update the component to receive profile currency or use default
export default function EmployeeModal({ open, mode, data, onClose, onSubmit, displayCurrency }) {
    // Use profile context to get the current currency if not provided
    const { profile } = useProfile();
    
    // Use provided displayCurrency or fallback to profile currency, then to INR
    const effectiveDisplayCurrency = displayCurrency || profile?.currencyCode || 'INR';
    
    const [formState, setFormState] = useState({ name: '', email: '', phone: '', role: '', hourlyRate: '', hourlyCurrency: effectiveDisplayCurrency });
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (open) {
            // Determine the appropriate currency to use
            const initialCurrency = data?.hourlyCurrency || effectiveDisplayCurrency;
            
            setFormState({
                name: data?.name || '',
                email: data?.email || '',
                phone: data?.phone || '',
                role: data?.role || '',
                hourlyRate: data?.hourlyRate ?? '',
                // Use employee's currency or fallback to effective display currency
                hourlyCurrency: initialCurrency
            });
            setErrors({});
        }
    }, [open, effectiveDisplayCurrency, profile?.currencyCode, mode, data?.hourlyCurrency]);

    // Update form state when effective display currency changes
    useEffect(() => {
        // Only update if this is an add operation and no currency has been set yet,
        // or if the current currency is the default INR and we have a better currency option
        if (mode === 'add' && (!formState.hourlyCurrency || formState.hourlyCurrency === 'INR')) {
            setFormState(prevState => ({
                ...prevState,
                hourlyCurrency: effectiveDisplayCurrency
            }));
        }
    }, [effectiveDisplayCurrency, mode]);

    const validateForm = () => {
        const newErrors = {};
        
        if (!formState.name.trim()) {
            newErrors.name = 'Name is required';
        }
        
        if (!formState.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.email)) {
            newErrors.email = 'Please enter a valid email address';
        }
        
        if (!formState.phone.trim()) {
            newErrors.phone = 'Phone number is required';
        }
        
        if (!formState.role) {
            newErrors.role = 'Please select a role';
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) {
            return;
        }
        
        // If role is Owner, set hourly rate to 0
        const submitData = { ...formState };
        if (submitData.role === 'Owner') {
            submitData.hourlyRate = 0;
            submitData.hourlyCurrency = 'INR';
        }
        await onSubmit(submitData);
    };

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? '' : 'hidden'}`}>
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
            <div className="bg-white w-full max-w-lg rounded-xl shadow-lg overflow-hidden relative z-10 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-medium text-gray-800">{mode === 'add' ? 'Add Employee' : 'Edit Employee'}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <i className="ph ph-x text-xl" />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-gray-700 mb-2 text-sm font-medium">Name <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i className="ph ph-user text-gray-400"></i>
                                </div>
                                <input 
                                    name="name" 
                                    value={formState.name} 
                                    onChange={(e) => setFormState({ ...formState, name: e.target.value })} 
                                    type="text" 
                                    className={`w-full py-2.5 pl-10 pr-3 border rounded-md focus:outline-none focus:ring-1 ${
                                        errors.name 
                                            ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                                            : 'border-gray-300 focus:ring-red-500 focus:border-red-500'
                                    }`} 
                                    placeholder="Full name" 
                                />
                            </div>
                            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                        </div>
                        <div>
                            <label className="block text-gray-700 mb-2 text-sm font-medium">Email <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i className="ph ph-at text-gray-400"></i>
                                </div>
                                <input 
                                    name="email" 
                                    value={formState.email} 
                                    onChange={(e) => setFormState({ ...formState, email: e.target.value })} 
                                    type="email" 
                                    className={`w-full py-2.5 pl-10 pr-3 border rounded-md focus:outline-none focus:ring-1 ${
                                        errors.email 
                                            ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                                            : 'border-gray-300 focus:ring-red-500 focus:border-red-500'
                                    }`} 
                                    placeholder="email@example.com" 
                                />
                            </div>
                            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                        </div>
                        <div>
                            <label className="block text-gray-700 mb-2 text-sm font-medium">Phone <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i className="ph ph-phone text-gray-400"></i>
                                </div>
                                <input 
                                    name="phone" 
                                    value={formState.phone} 
                                    onChange={(e) => setFormState({ ...formState, phone: e.target.value })} 
                                    type="tel" 
                                    className={`w-full py-2.5 pl-10 pr-3 border rounded-md focus:outline-none focus:ring-1 ${
                                        errors.phone 
                                            ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                                            : 'border-gray-300 focus:ring-red-500 focus:border-red-500'
                                    }`} 
                                    placeholder="Phone number" 
                                />
                            </div>
                            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                        </div>
                        <div>
                            <label className="block text-gray-700 mb-2 text-sm font-medium">Role <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i className="ph ph-identification-card text-gray-400"></i>
                                </div>
                                <select 
                                    name="role" 
                                    value={formState.role} 
                                    onChange={(e) => {
                                        const newRole = e.target.value;
                                        setFormState({ 
                                            ...formState, 
                                            role: newRole,
                                            hourlyRate: newRole === 'Owner' ? 0 : formState.hourlyRate,
                                            hourlyCurrency: newRole === 'Owner' ? 'INR' : formState.hourlyCurrency
                                        });
                                    }} 
                                    className={`w-full py-2.5 pl-10 pr-3 border rounded-md focus:outline-none focus:ring-1 ${
                                        errors.role 
                                            ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                                            : 'border-gray-300 focus:ring-red-500 focus:border-red-500'
                                    }`}
                                >
                                    <option value="">Select Role</option>
                                    {EMPLOYEE_ROLES.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>
                            {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role}</p>}
                        </div>
                        <div>
                            <label className="block text-gray-700 mb-2 text-sm font-medium">Hourly Rate</label>
                            
                            {/* Currency Display Selector */}
                            {formState.role !== 'Owner' && (
                                <div className="mb-2">
                                </div>
                            )}
                            
                            <div className="grid grid-cols-2 gap-2">
                                <div className="relative">
                                    <input 
                                        name="hourlyRate" 
                                        value={formState.role === 'Owner' ? '0' : formState.hourlyRate} 
                                        onChange={(e) => setFormState({ ...formState, hourlyRate: e.target.value })} 
                                        type="number" 
                                        step="0.01" 
                                        disabled={formState.role === 'Owner'}
                                        className={`w-full py-2.5 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 ${
                                            formState.role === 'Owner' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                                        }`} 
                                        placeholder={formState.role === 'Owner' ? 'N/A' : '0.00'} 
                                    />
                                </div>
                                <div className="flex items-center">
                                    <span className="text-gray-700 text-lg font-medium">
                                        {CurrencyData?.getCurrencyByCode(effectiveDisplayCurrency)?.symbol || '₹'}
                                    </span>
                                </div>
                            </div>
                            
                            {formState.role === 'Owner' && (
                                <p className="text-xs text-gray-500 mt-1">
                                    <i className="ph ph-info mr-1"></i>
                                    Hourly rate is not applicable for owners
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex space-x-3">
                        <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium rounded-md">Cancel</button>
                        <button type="submit" className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md">{mode === 'add' ? 'Add' : 'Save'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}