import { useState, useEffect } from 'react';
import { CurrencyData } from '../../utils/CurrencyData.js';
// Import useProfile to access profile data
import { useProfile } from '../../contexts/ProfileContext.js';

// Update the component to receive profile currency or use default
export default function EmployeeStats({ total, active, avgRate, employees = [], displayCurrency, onCurrencyChange }) {
    // Use profile context to get the current currency if not provided
    const { profile } = useProfile();
    
    // Use provided displayCurrency or fallback to profile currency, then to INR
    const effectiveDisplayCurrency = displayCurrency || profile?.currencyCode || 'INR';
    
    // Calculate average rate without currency conversion
    const filteredEmployees = employees.filter(e => e.role !== 'Owner' && e.isLoggedIn === true && e.hourlyRate > 0);
    const calculatedAvgRate = filteredEmployees.length > 0 
        ? Math.round(
            (filteredEmployees.reduce((sum, e) => sum + (Number(e.hourlyRate) || 0), 0) / 
            filteredEmployees.length) * 100
        ) / 100
        : 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between">
                <div>
                    <div className="text-sm text-gray-600">Total Employees</div>
                    <div className="text-2xl font-bold text-gray-900">{total}</div>
                </div>
                <i className="ph ph-users text-2xl text-red-500" />
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between">
                <div>
                    <div className="text-sm text-gray-600">Online Now</div>
                    <div className="text-2xl font-bold text-gray-900">{active}</div>
                </div>
                <i className="ph ph-wifi text-2xl text-green-500" />
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between">
                <div>
                    <div className="text-sm text-gray-600 mb-1">Avg Hourly Rate</div>
                    <div className="text-2xl font-bold text-gray-900">
                        {CurrencyData.formatAmount(calculatedAvgRate, effectiveDisplayCurrency)}
                    </div>
                </div>
            </div>
        </div>
    );
}