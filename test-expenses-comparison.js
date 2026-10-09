// Test for Expenses Monthly Comparison Feature

// Sample expense data
const sampleExpenses = [
    { id: 1, description: 'Vegetables', amount: 1200, category: 'food', date: '2025-10-25', vendor: 'Local Market' },
    { id: 2, description: 'Staff Salary', amount: 25000, category: 'staff', date: '2025-10-25', vendor: 'Payroll' },
    { id: 3, description: 'Electricity Bill', amount: 3500, category: 'utilities', date: '2025-10-24', vendor: 'Electric Company' },
    { id: 4, description: 'Spices', amount: 800, category: 'food', date: '2025-09-24', vendor: 'Spice Vendor' },
    { id: 5, description: 'Marketing', amount: 5000, category: 'marketing', date: '2025-09-23', vendor: 'Google Ads' },
    { id: 6, description: 'Maintenance', amount: 2000, category: 'maintenance', date: '2025-08-22', vendor: 'Plumber' },
    { id: 7, description: 'Rent', amount: 15000, category: 'rent', date: '2025-08-20', vendor: 'Landlord' },
    { id: 8, description: 'Gas Cylinder', amount: 1200, category: 'utilities', date: '2025-07-20', vendor: 'Gas Supplier' },
    { id: 9, description: 'Chicken', amount: 2500, category: 'food', date: '2025-07-18', vendor: 'Meat Supplier' },
    { id: 10, description: 'Internet Bill', amount: 1500, category: 'utilities', date: '2025-06-15', vendor: 'ISP' }
];

// Function to process monthly data (similar to what we implemented in Expenses.js)
function processMonthlyData(expenses) {
    const monthlyExpenses = {};
    
    // Group expenses by month
    expenses.forEach(expense => {
        const date = new Date(expense.date);
        const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM format
        
        if (!monthlyExpenses[monthYear]) {
            monthlyExpenses[monthYear] = {
                total: 0,
                categories: {},
                monthLabel: date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
            };
        }
        
        // Add to total
        monthlyExpenses[monthYear].total += expense.amount;
        
        // Add to category breakdown
        const categoryId = expense.category;
        if (!monthlyExpenses[monthYear].categories[categoryId]) {
            monthlyExpenses[monthYear].categories[categoryId] = 0;
        }
        monthlyExpenses[monthYear].categories[categoryId] += expense.amount;
    });
    
    return monthlyExpenses;
}

// Test the function
const monthlyData = processMonthlyData(sampleExpenses);
console.log('Monthly Expenses Data:', monthlyData);

// Test selecting months for comparison
const allMonths = Object.keys(monthlyData).sort();
console.log('All Months:', allMonths);

// Select last 3 months for comparison
const selectedMonths = allMonths.slice(-3);
console.log('Selected Months for Comparison:', selectedMonths);

// Create chart data
const selectedData = selectedMonths
    .filter(month => monthlyData[month])
    .map(month => monthlyData[month]);

const labels = selectedData.map(item => item.monthLabel);
const data = selectedData.map(item => item.total);

console.log('Chart Labels:', labels);
console.log('Chart Data:', data);

console.log('Test completed successfully!');