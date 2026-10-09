/**
 * Export inventory data to Excel with proper formatting and formulas
 * Uses SheetJS (xlsx) library if available, otherwise falls back to CSV
 * @param {Array} inventoryItems - Array of inventory items to export
 * @param {string} locationName - Name of the location for the filename
 */
export function exportInventoryToExcel(inventoryItems, locationName = 'All') {
    // Check if SheetJS is available
    if (typeof XLSX !== 'undefined') {
        return exportWithSheetJS(inventoryItems, locationName);
    } else {
        // Fallback to CSV if SheetJS is not available
        console.warn('SheetJS library not found, falling back to CSV export');
        return exportInventoryToCSV(inventoryItems, locationName);
    }
}

/**
 * Export using SheetJS library (if available)
 */
function exportWithSheetJS(inventoryItems, locationName) {
    // Create a new workbook
    const wb = XLSX.utils.book_new();
    
    // Create data for the worksheet
    const wsData = [
        // Header row
        ['ID', 'Product Name', 'Current Stock', 'Stock to Add', 'Updated Stock']
    ];
    
    // Add data rows
    inventoryItems.forEach((item, index) => {
        const currentStock = Number(item.quantity || 0);
        wsData.push([
            item.id || `ITEM-${index + 1}`,
            item.name || 'Unknown Item',
            currentStock,
            0, // Default stock to add is 0
            '' // Will be replaced with formula
        ]);
    });
    
    // Create worksheet from data
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Add formulas to Updated Stock column (column E)
    // Starting from row 2 (after header, 0-indexed is row 1)
    for (let i = 1; i < wsData.length; i++) {
        const rowNum = i + 1; // Excel rows are 1-indexed
        const cellRef = `E${rowNum}`;
        ws[cellRef] = { 
            f: `C${rowNum}+D${rowNum}`, // Formula: Current Stock + Stock to Add
            t: 'n' // Number type
        };
    }
    
    // Set column widths
    ws['!cols'] = [
        { wch: 20 }, // ID
        { wch: 35 }, // Product Name
        { wch: 15 }, // Current Stock
        { wch: 15 }, // Stock to Add
        { wch: 15 }  // Updated Stock
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    
    // Generate filename with date and location
    const date = new Date().toISOString().split('T')[0];
    const filename = `Inventory_${locationName.replace(/[^a-zA-Z0-9]/g, '_')}_${date}.xlsx`;
    
    // Download the file
    XLSX.writeFile(wb, filename);
}

/**
 * Fallback: Export as CSV (simpler, but no formulas)
 */
export function exportInventoryToCSV(inventoryItems, locationName = 'All') {
    // Create CSV content
    const headers = ['ID', 'Product Name', 'Current Stock', 'Stock to Add', 'Updated Stock'];
    const rows = inventoryItems.map((item, index) => {
        const currentStock = Number(item.quantity || 0);
        return [
            item.id || `ITEM-${index + 1}`,
            `"${(item.name || 'Unknown Item').replace(/"/g, '""')}"`, // Escape quotes
            currentStock,
            0,
            currentStock // For CSV, we can't use formulas, so Updated Stock = Current Stock
        ];
    });
    
    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    const filename = `Inventory_${locationName.replace(/[^a-zA-Z0-9]/g, '_')}_${date}.csv`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

/**
 * Import inventory updates from Excel file
 * @param {File} file - The Excel file uploaded by user
 * @param {Function} onSuccess - Callback function on successful parsing
 * @param {Function} onError - Callback function on error
 */
export function importInventoryFromExcel(file, onSuccess, onError) {
    // Check if SheetJS is available
    if (typeof XLSX === 'undefined') {
        onError('Excel library not loaded. Please refresh the page and try again.');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            console.log('Excel file loaded, parsing...');
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            console.log('Workbook sheets:', workbook.SheetNames);
            
            // Get the first sheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            console.log('Reading sheet:', firstSheetName);
            console.log('Worksheet:', worksheet);
            
            // Convert to JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            console.log('Converted to JSON, rows:', jsonData.length);
            console.log('JSON data:', jsonData);
            
            // Validate and parse the data
            const updates = parseInventoryUpdates(jsonData);
            
            console.log('Parse result:', updates);
            
            if (updates.length === 0) {
                console.error('No valid updates found. This could mean:');
                console.error('1. All "Stock to Add" values are 0');
                console.error('2. The Excel file format doesn\'t match the expected structure');
                console.error('3. Column D (Stock to Add) is empty or has invalid values');
                onError('No valid updates found in the Excel file. Make sure "Stock to Add" column (Column D) has non-zero values.');
                return;
            }
            
            // Call success callback with parsed updates
            onSuccess(updates);
            
        } catch (error) {
            console.error('Error parsing Excel file:', error);
            onError(`Failed to parse Excel file: ${error.message}`);
        }
    };
    
    reader.onerror = () => {
        onError('Failed to read the file. Please try again.');
    };
    
    reader.readAsArrayBuffer(file);
}

/**
 * Parse inventory updates from Excel data
 * @param {Array} data - 2D array from Excel sheet
 * @returns {Array} Array of update objects
 */
function parseInventoryUpdates(data) {
    console.log('Parsing Excel data, total rows:', data.length);
    console.log('Raw Excel data:', data);
    
    const updates = [];
    
    if (!data || data.length < 2) {
        console.warn('Excel file has insufficient data (need at least header + 1 data row)');
        return updates;
    }
    
    // Log header row
    console.log('Header row:', data[0]);
    
    // Skip header row (index 0)
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        
        console.log(`Processing row ${i}:`, row);
        
        // Skip empty rows
        if (!row || row.length === 0) {
            console.log(`  Skipping row ${i}: empty`);
            continue;
        }
        
        // Handle both array and object format from XLSX
        let id, productName, currentStock, stockToAdd, updatedStock;
        
        if (Array.isArray(row)) {
            // Array format: [ID, Product Name, Current Stock, Stock to Add, Updated Stock]
            [id, productName, currentStock, stockToAdd, updatedStock] = row;
        } else {
            // Object format: {ID: ..., 'Product Name': ..., etc}
            id = row.ID || row.id;
            productName = row['Product Name'] || row.productName || row['product name'];
            currentStock = row['Current Stock'] || row.currentStock || row['current stock'];
            stockToAdd = row['Stock to Add'] || row.stockToAdd || row['stock to add'];
            updatedStock = row['Updated Stock'] || row.updatedStock || row['updated stock'];
        }
        
        console.log(`  Parsed values - ID: ${id}, Name: ${productName}, Stock to Add: ${stockToAdd}`);
        
        // Skip if no ID or product name
        if (!id || !productName) {
            console.log(`  Skipping row ${i}: missing ID or product name`);
            continue;
        }
        
        // Parse stock to add - be more flexible with parsing
        let stockToAddValue = 0;
        
        if (stockToAdd !== undefined && stockToAdd !== null && stockToAdd !== '') {
            // Try to parse as number
            const parsed = Number(stockToAdd);
            if (!isNaN(parsed)) {
                stockToAddValue = parsed;
            } else {
                console.warn(`  Row ${i}: Could not parse Stock to Add value: '${stockToAdd}'`);
            }
        }
        
        console.log(`  Stock to Add value: ${stockToAddValue}`);
        
        // Only include rows where stock to add is not zero
        if (stockToAddValue !== 0) {
            const update = {
                id: String(id).trim(),
                productName: String(productName).trim(),
                currentStock: Number(currentStock) || 0,
                stockToAdd: stockToAddValue,
                updatedStock: Number(updatedStock) || (Number(currentStock) || 0) + stockToAddValue
            };
            
            console.log(`  ✅ Adding update:`, update);
            updates.push(update);
        } else {
            console.log(`  Skipping row ${i}: Stock to Add is zero`);
        }
    }
    
    console.log(`Total updates found: ${updates.length}`);
    console.log('Updates:', updates);
    
    return updates;
}
