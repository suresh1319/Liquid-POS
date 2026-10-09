import React, { useState, useEffect } from 'react';
import React, { useState, useEffect } from 'react';
import { sdk } from '../sdk.js';
import { showToast } from '../utils.js';
import { UserSession } from '../utils/UserSession.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function DailyInventoryUpdateModal({ isOpen, onClose, inventory }) {
    const [inventoryUpdates, setInventoryUpdates] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (isOpen && inventory) {
            // Initialize the inventory updates with current quantities
            const updates = inventory.map(item => ({
                id: item.id,
                name: item.name,
                unit: item.unit,
                currentQuantity: Number(item.quantity || 0),
                inventoryLeft: Number(item.quantity || 0), // Default to current quantity
                updatedStock: Number(item.quantity || 0), // Will be calculated as currentQuantity - usage
                usage: 0, // Calculated field
                perKgCost: Number(item.perKgCost || 0),
                totalCost: 0, // Will be calculated
                minQuantity: Number(item.minQuantity || 0)
            }));
            setInventoryUpdates(updates);
        }
    }, [isOpen, inventory]);

    const handleInventoryLeftChange = (itemId, value) => {
        setInventoryUpdates(prevUpdates => 
            prevUpdates.map(item => {
                if (item.id === itemId) {
                    const inventoryLeft = Number(value) || 0;
                    const usage = Math.max(0, item.currentQuantity - inventoryLeft);
                    const totalCost = usage * item.perKgCost;
                    
                    return {
                        ...item,
                        inventoryLeft,
                        updatedStock: inventoryLeft,
                        usage,
                        totalCost
                    };
                }
                return item;
            })
        );
    };

    const getFilteredItems = () => {
        if (!searchQuery.trim()) return inventoryUpdates;
        
        const search = searchQuery.toLowerCase();
        return inventoryUpdates.filter(item => 
            item.name.toLowerCase().includes(search)
        );
    };

    const calculateTotals = () => {
        const totalUsage = inventoryUpdates.reduce((sum, item) => sum + item.usage, 0);
        const totalCost = inventoryUpdates.reduce((sum, item) => sum + item.totalCost, 0);
        const lowStockItems = inventoryUpdates.filter(item => 
            item.inventoryLeft <= item.minQuantity && item.minQuantity > 0
        );
        
        return { totalUsage, totalCost, lowStockItems };
    };

    const handleUpdateInventory = async () => {
        setIsProcessing(true);
        try {
            const batch = sdk.db.firestore.batch();
            const inventoryRef = sdk.db.collection("Inventory");
            const transactionsRef = sdk.db.collection("InventoryTransactions");
            
            // Update each inventory item
            for (const item of inventoryUpdates) {
                if (item.usage > 0) {
                    // Update inventory quantity
                    const itemRef = inventoryRef.doc(item.id);
                    batch.update(itemRef, {
                        quantity: item.inventoryLeft,
                        updatedAt: new Date(),
                        lastUpdated: new Date().toISOString()
                    });
                    
                    // Log the transaction
                    const transactionRef = transactionsRef.doc();
                    batch.set(transactionRef, {
                        itemId: item.id,
                        itemName: item.name,
                        type: 'daily_update',
                        quantity: -item.usage,
                        reference: 'Daily Inventory Update',
                        referenceQuantity: 1,
                        timestamp: new Date(),
                        date: new Date().toISOString().split('T')[0],
                        cost: item.totalCost
                    });
                }
            }
            
            await batch.commit();
            showToast('Inventory updated successfully', 'success');
            onClose();
        } catch (error) {
            console.error('Error updating inventory:', error);
            showToast('Failed to update inventory', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUpdateAndGenerateReport = async () => {
        // First update the inventory
        setIsProcessing(true);
        try {
            const batch = sdk.db.firestore.batch();
            const inventoryRef = sdk.db.collection("Inventory");
            const transactionsRef = sdk.db.collection("InventoryTransactions");
            
            // Update each inventory item
            for (const item of inventoryUpdates) {
                if (item.usage > 0) {
                    // Update inventory quantity
                    const itemRef = inventoryRef.doc(item.id);
                    batch.update(itemRef, {
                        quantity: item.inventoryLeft,
                        updatedAt: new Date(),
                        lastUpdated: new Date().toISOString()
                    });
                    
                    // Log the transaction
                    const transactionRef = transactionsRef.doc();
                    batch.set(transactionRef, {
                        itemId: item.id,
                        itemName: item.name,
                        type: 'daily_update',
                        quantity: -item.usage,
                        reference: 'Daily Inventory Update',
                        referenceQuantity: 1,
                        timestamp: new Date(),
                        date: new Date().toISOString().split('T')[0],
                        cost: item.totalCost
                    });
                }
            }
            
            await batch.commit();
            showToast('Inventory updated successfully', 'success');
            
            // Fetch detailed transaction data for the day
            const detailedReport = await fetchDailyTransactionDetails();
            
            // Then generate and download the report
            const { totalUsage, totalCost, lowStockItems } = calculateTotals();
            const usedItems = inventoryUpdates.filter(item => item.usage > 0);
            
            console.log('Attempting to generate PDF with data:', { totalCost, lowStockItems: lowStockItems.length, usedItems: usedItems.length });
            
            // Generate PDF directly
            try {
                generatePDF(totalCost, lowStockItems, usedItems, detailedReport);
            } catch (pdfError) {
                console.error('PDF generation failed:', pdfError);
                showToast('Inventory updated but PDF generation failed', 'warning');
            }
            
            // Also show the report modal
            showReportModal(totalCost, lowStockItems, usedItems, detailedReport);
            
            // Close the update modal after a short delay
            setTimeout(() => {
                onClose();
            }, 1000);
            
        } catch (error) {
            console.error('Error updating inventory:', error);
            showToast('Failed to update inventory', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const fetchDailyTransactionDetails = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const transactionsRef = sdk.db.collection("InventoryTransactions");
            
            console.log('[DailyInventory] Fetching transactions for date:', today);
            
            // Fetch all transactions for today (without ordering to avoid index requirement)
            const snapshot = await transactionsRef
                .where("date", "==", today)
                .get();
            
            console.log('[DailyInventory] Fetched', snapshot.size, 'transactions');
            
            const transactions = [];
            const itemTransactions = {}; // Group by item
            
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
                }
                itemTransactions[data.itemName].push({
                    type: data.type,
                    quantity: data.quantity,
                    reference: data.reference || 'N/A',
                    referenceQuantity: data.referenceQuantity || 1,
                    timestamp: data.timestamp,
                    cost: data.cost || 0
                });
            });
            
            // Sort transactions by timestamp (client-side sorting)
            transactions.sort((a, b) => {
                const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
                const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
                return timeB - timeA; // Descending order (newest first)
            });
            
            console.log('[DailyInventory] Sorted transactions, fetching inventory...');
            
            // Get inventory details for cost calculation
            const inventoryRef = sdk.db.collection("Inventory");
            const inventorySnapshot = await inventoryRef.get();
            const inventoryMap = {};
            
            inventorySnapshot.forEach(doc => {
                const data = doc.data();
                inventoryMap[data.name] = {
                    id: doc.id,
                    perKgCost: data.perKgCost || 0,
                    unit: data.unit || 'kg'
                };
            });
            
            console.log('[DailyInventory] Successfully fetched all data');
            
            return {
                transactions,
                itemTransactions,
                inventoryMap,
                totalTransactions: transactions.length
            };
        } catch (error) {
            console.error('[DailyInventory] Error fetching transaction details:', error);
            console.error('[DailyInventory] Error message:', error.message);
            console.error('[DailyInventory] Error code:', error.code);
            
            // Show user-friendly error
            showToast('Unable to fetch transaction details. Please refresh the page.', 'error');
            
            return {
                transactions: [],
                itemTransactions: {},
                inventoryMap: {},
                totalTransactions: 0
            };
        }
    };

    const generatePDF = (totalCost, lowStockItems, usedItems, detailedReport = null) => {
        try {
            console.log('Generating PDF...', { totalCost, lowStockItems: lowStockItems.length, usedItems: usedItems.length });
            
            const today = new Date().toLocaleDateString();
            const currency = UserSession?.getCurrency() || '₹';
            
            // Create PDF
            const doc = new jsPDF();
            console.log('jsPDF initialized');
            console.log('autoTable function available:', typeof doc.autoTable);
            
            // If autoTable isn't available, manually call it with doc as context
            const callAutoTable = (tableConfig) => {
                if (typeof doc.autoTable === 'function') {
                    doc.autoTable(tableConfig);
                } else if (typeof autoTable === 'function') {
                    console.log('Using imported autoTable function');
                    autoTable(doc, tableConfig);
                } else {
                    throw new Error('autoTable not available');
                }
            };
        
        // Add title
        doc.setFontSize(20);
        doc.setFont(undefined, 'bold');
        doc.text('Daily Inventory Report', 14, 20);
        
        // Add date
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(today, 14, 28);
        
        // Summary section
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Summary', 14, 40);
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Total Items Used: ${usedItems.length}`, 14, 48);
        doc.text(`Total Cost: ${currency}${totalCost.toFixed(2)}`, 14, 54);
        doc.text(`Low Stock Items: ${lowStockItems.length}`, 14, 60);
        if (detailedReport) {
            doc.text(`Total Transactions: ${detailedReport.totalTransactions}`, 14, 66);
        }
        
        let currentY = detailedReport ? 78 : 72;
        
        // Inventory Usage Table
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('Inventory Usage', 14, currentY);
        
        const usageTableData = usedItems.map(item => [
            item.name,
            `${item.usage.toFixed(2)} ${item.unit}`,
            `${currency}${item.perKgCost.toFixed(2)}`,
            `${currency}${item.totalCost.toFixed(2)}`
        ]);
        
        // Add grand total row
        usageTableData.push([
            { content: 'Grand Total', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
            { content: `${currency}${totalCost.toFixed(2)}`, styles: { fontStyle: 'bold' } }
        ]);
        
        callAutoTable({
            startY: currentY + 4,
            head: [['Item Name', 'Usage', 'Unit Cost', 'Total Cost']],
            body: usageTableData,
            theme: 'striped',
            headStyles: { fillColor: [239, 68, 68] },
            styles: { fontSize: 9 }
        });
        
        currentY = doc.lastAutoTable.finalY + 10;
        
        // Detailed Transactions Section
        if (detailedReport && detailedReport.itemTransactions && Object.keys(detailedReport.itemTransactions).length > 0) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0, 102, 204);
            doc.text('Detailed Inventory Transactions', 14, currentY);
            doc.setTextColor(0, 0, 0);
            
            currentY += 4;
            
            // Create detailed transaction table
            const transactionTableData = [];
            
            Object.entries(detailedReport.itemTransactions).forEach(([itemName, transactions]) => {
                const inventoryInfo = detailedReport.inventoryMap[itemName] || { perKgCost: 0, unit: 'kg' };
                
                transactions.forEach((trans, index) => {
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
            
            if (transactionTableData.length > 0) {
                callAutoTable({
                    startY: currentY,
                    head: [['Item', 'Type', 'Product/Reference', 'Qty Sold', 'Usage', 'Cost']],
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
            }
        }
        
        // Add new page if needed for low stock alert
        if (currentY > 250) {
            doc.addPage();
            currentY = 20;
        }
        
        // Low Stock Alert
        if (lowStockItems.length > 0) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(220, 38, 38);
            doc.text('⚠ Low Stock Alert', 14, currentY);
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(0, 0, 0);
            
            const lowStockData = lowStockItems.map(item => [
                item.name,
                `${item.inventoryLeft.toFixed(2)} ${item.unit}`,
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
        
        // Save PDF
        const filename = `Daily_Inventory_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        console.log('Saving PDF as:', filename);
        doc.save(filename);
        
        console.log('PDF download initiated');
        showToast('Report downloaded successfully', 'success');
        } catch (error) {
            console.error('Error generating PDF:', error);
            showToast('Failed to generate PDF: ' + error.message, 'error');
        }
    };

    const showReportModal = (totalCost, lowStockItems, usedItems, detailedReport = null) => {
        const today = new Date().toLocaleDateString();
        const currency = UserSession?.getCurrency() || '₹';
        
        // Build detailed transactions HTML
        let detailedTransactionsHTML = '';
        if (detailedReport && detailedReport.itemTransactions && Object.keys(detailedReport.itemTransactions).length > 0) {
            const transactionRows = [];
            
            Object.entries(detailedReport.itemTransactions).forEach(([itemName, transactions]) => {
                const inventoryInfo = detailedReport.inventoryMap[itemName] || { perKgCost: 0, unit: 'kg' };
                
                transactions.forEach((trans, index) => {
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
                    
                    transactionRows.push(`
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3 text-sm font-medium text-gray-900">${itemName}</td>
                            <td class="px-4 py-3 text-sm">
                                <span class="px-2 py-1 bg-${typeColor}-100 text-${typeColor}-700 rounded-full text-xs font-medium">
                                    ${transType}
                                </span>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-700">${trans.reference}</td>
                            <td class="px-4 py-3 text-sm text-gray-700 text-center">${trans.referenceQuantity || 1}</td>
                            <td class="px-4 py-3 text-sm text-right">
                                <span class="font-medium text-${badgeColor}-600">
                                    ${sign}${quantity.toFixed(2)} ${inventoryInfo.unit}
                                </span>
                            </td>
                            <td class="px-4 py-3 text-sm text-gray-900 text-right font-medium">${currency}${cost.toFixed(2)}</td>
                        </tr>
                    `);
                });
            });
            
            if (transactionRows.length > 0) {
                detailedTransactionsHTML = `
                    <div class="mb-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <i class="ph ph-list-bullets text-blue-600"></i>
                            Detailed Inventory Transactions (${transactionRows.length})
                        </h3>
                        <div class="overflow-x-auto border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-blue-50 sticky top-0">
                                    <tr>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Item</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Type</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Product/Reference</th>
                                        <th class="px-4 py-3 text-center text-xs font-medium text-blue-700 uppercase tracking-wider">Qty Sold</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-blue-700 uppercase tracking-wider">Usage</th>
                                        <th class="px-4 py-3 text-right text-xs font-medium text-blue-700 uppercase tracking-wider">Cost</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    ${transactionRows.join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
        }
        
        const reportContent = `
            <div class="p-6 max-w-6xl">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-800">Daily Inventory Report</h2>
                        <p class="text-sm text-gray-600">${today}</p>
                    </div>
                    <div class="flex gap-2">
                        <button id="download-pdf-report" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2">
                            <i class="ph ph-download"></i>
                            Download PDF
                        </button>
                        <button id="print-report" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2">
                            <i class="ph ph-printer"></i>
                            Print Report
                        </button>
                    </div>
                </div>
                
                <!-- Summary Section -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg">
                        <div class="text-sm text-blue-700 mb-1">Total Items Used</div>
                        <div class="text-2xl font-bold text-blue-900">${usedItems.length}</div>
                    </div>
                    <div class="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg">
                        <div class="text-sm text-green-700 mb-1">Total Cost</div>
                        <div class="text-2xl font-bold text-green-900">${currency}${totalCost.toFixed(2)}</div>
                    </div>
                    <div class="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg">
                        <div class="text-sm text-red-700 mb-1">Low Stock Items</div>
                        <div class="text-2xl font-bold text-red-900">${lowStockItems.length}</div>
                    </div>
                    ${detailedReport ? `
                        <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg">
                            <div class="text-sm text-purple-700 mb-1">Total Transactions</div>
                            <div class="text-2xl font-bold text-purple-900">${detailedReport.totalTransactions}</div>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Inventory Usage Table -->
                <div class="mb-6">
                    <h3 class="text-lg font-semibold text-gray-800 mb-3">Inventory Usage Summary</h3>
                    <div class="overflow-x-auto border border-gray-200 rounded-lg">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Item Name</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Usage</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Unit Cost</th>
                                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Total Cost</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                ${usedItems.map(item => `
                                    <tr>
                                        <td class="px-4 py-3 text-sm text-gray-900">${item.name}</td>
                                        <td class="px-4 py-3 text-sm text-gray-900 text-right">${item.usage.toFixed(2)} ${item.unit}</td>
                                        <td class="px-4 py-3 text-sm text-gray-900 text-right">${currency}${item.perKgCost.toFixed(2)}</td>
                                        <td class="px-4 py-3 text-sm font-medium text-gray-900 text-right">${currency}${item.totalCost.toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                                <tr class="bg-gray-50 font-bold">
                                    <td colspan="3" class="px-4 py-3 text-sm text-gray-900 text-right">Grand Total:</td>
                                    <td class="px-4 py-3 text-sm text-gray-900 text-right">${currency}${totalCost.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Detailed Transactions -->
                ${detailedTransactionsHTML}
                
                <!-- Low Stock Alert -->
                ${lowStockItems.length > 0 ? `
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h3 class="text-lg font-semibold text-red-800 mb-3 flex items-center gap-2">
                            <i class="ph ph-warning"></i>
                            Low Stock Alert
                        </h3>
                        <div class="space-y-2">
                            ${lowStockItems.map(item => `
                                <div class="flex justify-between items-center text-sm">
                                    <span class="text-red-700">${item.name}</span>
                                    <span class="text-red-900 font-medium">${item.inventoryLeft.toFixed(2)} ${item.unit} (Min: ${item.minQuantity} ${item.unit})</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        const modal = window.ModalManager?.createCenterModal(reportContent, {
            showCloseButton: true,
            maxWidth: '1200px'
        });
        
        // Add print and download functionality
        setTimeout(() => {
            const printBtn = document.getElementById('print-report');
            const downloadBtn = document.getElementById('download-pdf-report');
            
            if (printBtn) {
                printBtn.addEventListener('click', () => {
                    window.print();
                });
            }
            
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => {
                    generatePDF(totalCost, lowStockItems, usedItems, detailedReport);
                });
            }
        }, 100);
    };

    if (!isOpen) return null;

    const filteredItems = getFilteredItems();
    const { totalUsage, totalCost, lowStockItems } = calculateTotals();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-800">Daily Inventory Update</h2>
                        <p className="text-sm text-gray-600">Update today's inventory levels and generate usage report</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <i className="ph ph-x text-xl"></i>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                    {/* Search Bar */}
                    <div className="mb-4">
                        <div className="relative">
                            <i className="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search items..."
                                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg">
                            <div className="text-sm text-blue-700 mb-1">Total Items</div>
                            <div className="text-2xl font-bold text-blue-900">{inventoryUpdates.length}</div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg">
                            <div className="text-sm text-purple-700 mb-1">Estimated Total Cost</div>
                            <div className="text-2xl font-bold text-purple-900">{UserSession?.getCurrency()}{totalCost.toFixed(2)}</div>
                        </div>
                        <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg">
                            <div className="text-sm text-red-700 mb-1">Low Stock Warnings</div>
                            <div className="text-2xl font-bold text-red-900">{lowStockItems.length}</div>
                        </div>
                    </div>

                    {/* Inventory Table */}
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Item Name</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Current Qty</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Inventory Left</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Updated Stock</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Usage</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Cost</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredItems.map(item => (
                                    <tr key={item.id} className={item.inventoryLeft <= item.minQuantity && item.minQuantity > 0 ? 'bg-red-50' : ''}>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                            {item.name}
                                            {item.inventoryLeft <= item.minQuantity && item.minQuantity > 0 && (
                                                <span className="ml-2 text-xs text-red-600">
                                                    <i className="ph ph-warning"></i> Low Stock
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 text-center">
                                            {item.currentQuantity.toFixed(2)} {item.unit}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <input
                                                type="number"
                                                value={item.inventoryLeft}
                                                onChange={(e) => handleInventoryLeftChange(item.id, e.target.value)}
                                                className="w-24 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
                                                step="0.01"
                                                min="0"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-sm font-medium text-green-700 text-center">
                                            {item.updatedStock.toFixed(2)} {item.unit}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 text-center">
                                            {item.usage > 0 ? (
                                                <span className="text-orange-600 font-medium">-{item.usage.toFixed(2)} {item.unit}</span>
                                            ) : (
                                                <span className="text-gray-400">0 {item.unit}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                            {UserSession?.getCurrency()}{item.totalCost.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
                    <div className="text-sm text-gray-600">
                        Total Usage Cost: <span className="font-bold text-gray-900">{UserSession?.getCurrency()}{totalCost.toFixed(2)}</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpdateInventory}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? 'Updating...' : 'Update Inventory'}
                        </button>
                        <button
                            onClick={handleUpdateAndGenerateReport}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? 'Processing...' : 'Update & Generate Report'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
