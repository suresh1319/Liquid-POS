import React, { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { showToast } from '../utils.js';
import { UserSession } from '../utils/UserSession.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function InventoryReportViewer({ isOpen, onClose }) {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchReportData();
        }
    }, [selectedDate, isOpen]);

    const fetchReportData = async () => {
        setLoading(true);
        try {
            const transactionsRef = sdk.db.collection("InventoryTransactions");
            
            console.log('[ReportViewer] Fetching transactions for date:', selectedDate);
            
            // Fetch all transactions for selected date (without ordering to avoid index requirement)
            const snapshot = await transactionsRef
                .where("date", "==", selectedDate)
                .get();
            
            console.log('[ReportViewer] Fetched', snapshot.size, 'transactions');
            
            const transactions = [];
            const itemTransactions = {}; // Group by item
            const itemSummary = {}; // Summary by item
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const trans = {
                    id: doc.id,
                    itemId: data.itemId,
                    itemName: data.itemName,
                    type: data.type,
                    quantity: data.quantity,
                    reference: data.reference || 'N/A',
                    referenceQuantity: data.referenceQuantity || 1,
                    timestamp: data.timestamp,
                    cost: data.cost || 0,
                    date: data.date
                };
                
                transactions.push(trans);
                
                // Group by item name
                if (!itemTransactions[data.itemName]) {
                    itemTransactions[data.itemName] = [];
                    itemSummary[data.itemName] = {
                        totalUsage: 0,
                        totalCost: 0,
                        transactions: 0
                    };
                }
                
                itemTransactions[data.itemName].push(trans);
                
                // Calculate summary (only count negative quantities as usage)
                if (trans.quantity < 0) {
                    itemSummary[data.itemName].totalUsage += Math.abs(trans.quantity);
                    itemSummary[data.itemName].totalCost += trans.cost;
                }
                itemSummary[data.itemName].transactions += 1;
            });
            
            // Sort transactions by timestamp (client-side sorting)
            transactions.sort((a, b) => {
                const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
                const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
                return timeB - timeA; // Descending order (newest first)
            });
            
            // Get inventory details for additional info
            const inventoryRef = sdk.db.collection("Inventory");
            const inventorySnapshot = await inventoryRef.get();
            const inventoryMap = {};
            
            inventorySnapshot.forEach(doc => {
                const data = doc.data();
                inventoryMap[data.name] = {
                    id: doc.id,
                    perKgCost: data.perKgCost || 0,
                    unit: data.unit || 'kg',
                    currentQuantity: data.quantity || 0,
                    minQuantity: data.minQuantity || 0
                };
            });
            
            // Calculate totals
            const totalCost = Object.values(itemSummary).reduce((sum, item) => sum + item.totalCost, 0);
            const totalItems = Object.keys(itemSummary).length;
            const totalTransactions = transactions.length;
            
            // Find low stock items
            const lowStockItems = Object.entries(inventoryMap)
                .filter(([name, info]) => info.currentQuantity <= info.minQuantity && info.minQuantity > 0)
                .map(([name, info]) => ({
                    name,
                    currentQuantity: info.currentQuantity,
                    minQuantity: info.minQuantity,
                    unit: info.unit
                }));
            
            setReportData({
                transactions,
                itemTransactions,
                itemSummary,
                inventoryMap,
                totalCost,
                totalItems,
                totalTransactions,
                lowStockItems
            });
            
            console.log('[ReportViewer] Successfully fetched all data');
            
        } catch (error) {
            console.error('[ReportViewer] Error fetching report data:', error);
            console.error('[ReportViewer] Error message:', error.message);
            console.error('[ReportViewer] Error code:', error.code);
            
            showToast('Failed to fetch report data. Please refresh the page.', 'error');
            setReportData(null);
        } finally {
            setLoading(false);
        }
    };

    const generatePDF = () => {
        if (!reportData) return;
        
        try {
            const currency = UserSession?.getCurrency() || '₹';
            const doc = new jsPDF();
            
            const callAutoTable = (tableConfig) => {
                if (typeof doc.autoTable === 'function') {
                    doc.autoTable(tableConfig);
                } else if (typeof autoTable === 'function') {
                    autoTable(doc, tableConfig);
                } else {
                    throw new Error('autoTable not available');
                }
            };
            
            // Title
            doc.setFontSize(20);
            doc.setFont(undefined, 'bold');
            doc.text('Daily Inventory Report', 14, 20);
            
            // Date
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(new Date(selectedDate).toLocaleDateString(), 14, 28);
            
            // Summary
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('Summary', 14, 40);
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Total Items: ${reportData.totalItems}`, 14, 48);
            doc.text(`Total Cost: ${currency}${reportData.totalCost.toFixed(2)}`, 14, 54);
            doc.text(`Total Transactions: ${reportData.totalTransactions}`, 14, 60);
            doc.text(`Low Stock Items: ${reportData.lowStockItems.length}`, 14, 66);
            
            let currentY = 78;
            
            // Item Summary Table
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('Item Usage Summary', 14, currentY);
            
            const summaryTableData = Object.entries(reportData.itemSummary).map(([itemName, summary]) => {
                const inventoryInfo = reportData.inventoryMap[itemName] || { unit: 'kg', perKgCost: 0 };
                return [
                    itemName,
                    `${summary.totalUsage.toFixed(2)} ${inventoryInfo.unit}`,
                    `${currency}${inventoryInfo.perKgCost.toFixed(2)}`,
                    `${currency}${summary.totalCost.toFixed(2)}`,
                    summary.transactions
                ];
            });
            
            summaryTableData.push([
                { content: 'Grand Total', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: `${currency}${reportData.totalCost.toFixed(2)}`, styles: { fontStyle: 'bold' } },
                { content: reportData.totalTransactions.toString(), styles: { fontStyle: 'bold' } }
            ]);
            
            callAutoTable({
                startY: currentY + 4,
                head: [['Item Name', 'Total Usage', 'Unit Cost', 'Total Cost', 'Transactions']],
                body: summaryTableData,
                theme: 'striped',
                headStyles: { fillColor: [239, 68, 68] },
                styles: { fontSize: 9 }
            });
            
            currentY = doc.lastAutoTable.finalY + 10;
            
            // Detailed Transactions
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0, 102, 204);
            doc.text('Detailed Transactions', 14, currentY);
            doc.setTextColor(0, 0, 0);
            
            const transactionTableData = [];
            
            Object.entries(reportData.itemTransactions).forEach(([itemName, transactions]) => {
                const inventoryInfo = reportData.inventoryMap[itemName] || { perKgCost: 0, unit: 'kg' };
                
                transactions.forEach((trans) => {
                    const transType = trans.type === 'deduction' ? 'Order' : 
                                     trans.type === 'preparation' ? 'Preparation' : 
                                     trans.type === 'daily_update' ? 'Daily Update' : 
                                     trans.type === 'reversal' ? 'Reversal' : 
                                     trans.type.charAt(0).toUpperCase() + trans.type.slice(1);
                    
                    const quantity = Math.abs(trans.quantity);
                    const cost = trans.cost || (quantity * inventoryInfo.perKgCost);
                    const sign = trans.quantity < 0 ? '-' : '+';
                    
                    transactionTableData.push([
                        itemName,
                        transType,
                        trans.reference,
                        `${trans.referenceQuantity || 1}`,
                        `${sign}${quantity.toFixed(2)} ${inventoryInfo.unit}`,
                        `${currency}${cost.toFixed(2)}`
                    ]);
                });
            });
            
            callAutoTable({
                startY: currentY + 4,
                head: [['Item', 'Type', 'Product/Reference', 'Qty', 'Usage', 'Cost']],
                body: transactionTableData,
                theme: 'striped',
                headStyles: { fillColor: [0, 102, 204] },
                styles: { fontSize: 8 },
                columnStyles: {
                    0: { cellWidth: 35 },
                    1: { cellWidth: 25 },
                    2: { cellWidth: 45 },
                    3: { cellWidth: 20 },
                    4: { cellWidth: 25 },
                    5: { cellWidth: 25 }
                }
            });
            
            currentY = doc.lastAutoTable.finalY + 10;
            
            // Low Stock Alert
            if (reportData.lowStockItems.length > 0) {
                if (currentY > 250) {
                    doc.addPage();
                    currentY = 20;
                }
                
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(220, 38, 38);
                doc.text('⚠ Low Stock Alert', 14, currentY);
                doc.setTextColor(0, 0, 0);
                
                const lowStockData = reportData.lowStockItems.map(item => [
                    item.name,
                    `${item.currentQuantity.toFixed(2)} ${item.unit}`,
                    `${item.minQuantity} ${item.unit}`
                ]);
                
                callAutoTable({
                    startY: currentY + 4,
                    head: [['Item Name', 'Current Stock', 'Minimum Required']],
                    body: lowStockData,
                    theme: 'striped',
                    headStyles: { fillColor: [220, 38, 38] },
                    styles: { fontSize: 9 }
                });
            }
            
            const filename = `Inventory_Report_${selectedDate}.pdf`;
            doc.save(filename);
            showToast('Report downloaded successfully', 'success');
            
        } catch (error) {
            console.error('Error generating PDF:', error);
            showToast('Failed to generate PDF: ' + error.message, 'error');
        }
    };

    if (!isOpen) return null;

    const currency = UserSession?.getCurrency() || '₹';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-800">Inventory Report Viewer</h2>
                        <p className="text-sm text-gray-600">View detailed inventory transactions and usage</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <i className="ph ph-x text-xl"></i>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                    {/* Date Selector */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Date
                        </label>
                        <div className="flex gap-3 items-center">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                className="px-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            />
                            <button
                                onClick={fetchReportData}
                                disabled={loading}
                                className="px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                            >
                                {loading ? 'Loading...' : 'Refresh'}
                            </button>
                            {reportData && (
                                <button
                                    onClick={generatePDF}
                                    className="px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
                                >
                                    <i className="ph ph-download"></i>
                                    Download PDF
                                </button>
                            )}
                        </div>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full"></div>
                        </div>
                    )}

                    {!loading && reportData && (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg">
                                    <div className="text-sm text-blue-700 mb-1">Total Items</div>
                                    <div className="text-2xl font-bold text-blue-900">{reportData.totalItems}</div>
                                </div>
                                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg">
                                    <div className="text-sm text-green-700 mb-1">Total Cost</div>
                                    <div className="text-2xl font-bold text-green-900">{currency}{reportData.totalCost.toFixed(2)}</div>
                                </div>
                                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg">
                                    <div className="text-sm text-purple-700 mb-1">Transactions</div>
                                    <div className="text-2xl font-bold text-purple-900">{reportData.totalTransactions}</div>
                                </div>
                                <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg">
                                    <div className="text-sm text-red-700 mb-1">Low Stock Items</div>
                                    <div className="text-2xl font-bold text-red-900">{reportData.lowStockItems.length}</div>
                                </div>
                            </div>

                            {/* Item Summary */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-800 mb-3">Item Usage Summary</h3>
                                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Item Name</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Total Usage</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Unit Cost</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Total Cost</th>
                                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Transactions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {Object.entries(reportData.itemSummary).map(([itemName, summary]) => {
                                                const inventoryInfo = reportData.inventoryMap[itemName] || { unit: 'kg', perKgCost: 0 };
                                                return (
                                                    <tr key={itemName} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{itemName}</td>
                                                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                                            {summary.totalUsage.toFixed(2)} {inventoryInfo.unit}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                                            {currency}{inventoryInfo.perKgCost.toFixed(2)}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                                            {currency}{summary.totalCost.toFixed(2)}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-gray-700 text-center">
                                                            {summary.transactions}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr className="bg-gray-50 font-bold">
                                                <td colSpan="3" className="px-4 py-3 text-sm text-gray-900 text-right">Grand Total:</td>
                                                <td className="px-4 py-3 text-sm text-gray-900 text-right">{currency}{reportData.totalCost.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-sm text-gray-900 text-center">{reportData.totalTransactions}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Detailed Transactions */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                    <i className="ph ph-list-bullets text-blue-600"></i>
                                    Detailed Inventory Transactions
                                </h3>
                                <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-blue-50 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Item</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Type</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Product/Reference</th>
                                                <th className="px-4 py-3 text-center text-xs font-medium text-blue-700 uppercase tracking-wider">Qty Sold</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-blue-700 uppercase tracking-wider">Usage</th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-blue-700 uppercase tracking-wider">Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {Object.entries(reportData.itemTransactions).map(([itemName, transactions]) => {
                                                const inventoryInfo = reportData.inventoryMap[itemName] || { perKgCost: 0, unit: 'kg' };
                                                
                                                return transactions.map((trans, index) => {
                                                    const transType = trans.type === 'deduction' ? 'Order' : 
                                                                     trans.type === 'preparation' ? 'Preparation' : 
                                                                     trans.type === 'daily_update' ? 'Daily Update' : 
                                                                     trans.type === 'reversal' ? 'Reversal' : 
                                                                     trans.type.charAt(0).toUpperCase() + trans.type.slice(1);
                                                    
                                                    const quantity = Math.abs(trans.quantity);
                                                    const cost = trans.cost || (quantity * inventoryInfo.perKgCost);
                                                    const sign = trans.quantity < 0 ? '-' : '+';
                                                    const badgeColor = trans.quantity < 0 ? 'red' : 'green';
                                                    const typeColor = trans.type === 'deduction' ? 'orange' : 
                                                                     trans.type === 'preparation' ? 'purple' : 
                                                                     trans.type === 'daily_update' ? 'blue' : 'gray';
                                                    
                                                    return (
                                                        <tr key={`${itemName}-${index}`} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{itemName}</td>
                                                            <td className="px-4 py-3 text-sm">
                                                                <span className={`px-2 py-1 bg-${typeColor}-100 text-${typeColor}-700 rounded-full text-xs font-medium`}>
                                                                    {transType}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-gray-700">{trans.reference}</td>
                                                            <td className="px-4 py-3 text-sm text-gray-700 text-center">{trans.referenceQuantity || 1}</td>
                                                            <td className="px-4 py-3 text-sm text-right">
                                                                <span className={`font-medium text-${badgeColor}-600`}>
                                                                    {sign}{quantity.toFixed(2)} {inventoryInfo.unit}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                                                                {currency}{cost.toFixed(2)}
                                                            </td>
                                                        </tr>
                                                    );
                                                });
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Low Stock Alert */}
                            {reportData.lowStockItems.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <h3 className="text-lg font-semibold text-red-800 mb-3 flex items-center gap-2">
                                        <i className="ph ph-warning"></i>
                                        Low Stock Alert
                                    </h3>
                                    <div className="space-y-2">
                                        {reportData.lowStockItems.map(item => (
                                            <div key={item.name} className="flex justify-between items-center text-sm">
                                                <span className="text-red-700">{item.name}</span>
                                                <span className="text-red-900 font-medium">
                                                    {item.currentQuantity.toFixed(2)} {item.unit} (Min: {item.minQuantity} {item.unit})
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {reportData.totalTransactions === 0 && (
                                <div className="text-center py-12">
                                    <i className="ph ph-clipboard text-gray-300 text-6xl mb-4"></i>
                                    <p className="text-gray-500 text-lg">No transactions found for this date</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end items-center p-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
