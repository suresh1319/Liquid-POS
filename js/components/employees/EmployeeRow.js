import { memo, useState, useEffect } from 'react';
import { CurrencyData } from '../../utils/CurrencyData.js';
// Import useProfile to access profile data
import { useProfile } from '../../contexts/ProfileContext.js';
import { showToast } from '../../sdk.js';

// Update the component to receive profile currency or use default
export default memo(function EmployeeRow({ emp, onDelete, onDetails, displayCurrency, onCurrencyChange }) {
    // Use profile context to get the current currency if not provided
    const { profile } = useProfile();
    
    // Use provided displayCurrency or fallback to profile currency, then to INR
    const effectiveDisplayCurrency = displayCurrency || profile?.currencyCode || 'INR';
    
    // Just display the hourly rate in the profile currency without conversion
    const displayHourlyRate = emp?.hourlyRate || null;

    const getStatusInfo = (employee) => {
        if (employee.isLoggedIn && employee.status === 'ONLINE') {
            return {
                text: 'Online',
                class: 'border-green-200 text-green-700 bg-green-50'
            };
        } else {
            return {
                text: 'Offline',
                class: 'border-gray-200 text-gray-700 bg-gray-50'
            };
        }
    };
    
    const statusInfo = getStatusInfo(emp);
    
    return (
        <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
                    <i className="ph ph-user text-red-500" />
                </div>
                <div>
                    <div className="font-medium text-gray-800">{emp.name || 'Unnamed'}</div>
                    <div className="text-sm text-gray-500">
                        <span>{emp.email || '—'} • {emp.phone || '—'}</span>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-1 rounded-full border text-xs ${statusInfo.class}`}>{statusInfo.text}</span>
                    <span className="text-xs text-gray-500">{emp.role || 'Staff'}</span>
                </div>
                <div className="flex items-center gap-1">
                    {emp.accessLink && (
                        <button 
                            onClick={() => {
                                navigator.clipboard.writeText(emp.accessLink);
                                showToast('Link copied to clipboard', 'success');
                            }} 
                            className="px-3 py-2 rounded-lg hover:bg-green-50 text-green-600" 
                            title="Copy Access Link"
                        >
                            <i className="ph ph-link" />
                        </button>
                    )}
                    <button onClick={() => onDetails(emp)} className="px-3 py-2 rounded-lg hover:bg-blue-50 text-blue-600" title="View Details"><i className="ph ph-eye" /></button>
                    <button onClick={() => onDelete(emp)} className="px-3 py-2 rounded-lg hover:bg-red-50 text-red-600" title="Delete Employee"><i className="ph ph-trash" /></button>
                </div>
            </div>
        </div>
    );
});