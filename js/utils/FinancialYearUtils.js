/**
 * Financial Year Utility Functions
 * Handles Indian financial year calculations (April 1 - March 31)
 */

export class FinancialYearUtils {
    /**
     * Get the financial year for a given date
     * Indian FY starts April 1st and ends March 31st
     * @param {Date} date - The date to get financial year for
     * @returns {string} Financial year string (e.g., "2024-25")
     */
    static getFinancialYear(date = new Date()) {
        const year = date.getFullYear();
        const month = date.getMonth(); // 0-based (0 = January)
        
        if (month >= 3) { // April (3) onwards belongs to current FY
            return `${year}-${(year + 1).toString().slice(-2)}`;
        } else { // January to March belongs to previous FY
            return `${year - 1}-${year.toString().slice(-2)}`;
        }
    }

    /**
     * Get date range for a specific financial year
     * @param {string} financialYear - Financial year string (e.g., "2024-25")
     * @returns {Object} Object with start and end dates
     */
    static getFinancialYearDateRange(financialYear) {
        const [startYear] = financialYear.split('-');
        const startYearNum = parseInt(startYear);
        
        const start = new Date(startYearNum, 3, 1); // April 1st
        const end = new Date(startYearNum + 1, 2, 31, 23, 59, 59, 999); // March 31st end of day
        
        return { start, end };
    }

    /**
     * Get current financial year
     * @returns {string} Current financial year string
     */
    static getCurrentFinancialYear() {
        return this.getFinancialYear(new Date());
    }

    /**
     * Get list of financial years (current and previous N years)
     * @param {number} previousYears - Number of previous years to include (default: 2)
     * @returns {Array} Array of financial year strings
     */
    static getFinancialYearsList(previousYears = 2) {
        const currentFY = this.getCurrentFinancialYear();
        const currentStartYear = parseInt(currentFY.split('-')[0]);
        
        const years = [];
        for (let i = 0; i <= previousYears; i++) {
            const year = currentStartYear - i;
            years.push(`${year}-${(year + 1).toString().slice(-2)}`);
        }
        
        return years;
    }

    /**
     * Get financial year label for display
     * @param {string} financialYear - Financial year string (e.g., "2024-25")
     * @returns {string} Display label (e.g., "FY 2024-25")
     */
    static getFinancialYearLabel(financialYear) {
        return `FY ${financialYear}`;
    }

    /**
     * Check if a date falls within a specific financial year
     * @param {Date} date - Date to check
     * @param {string} financialYear - Financial year to check against
     * @returns {boolean} True if date is within the financial year
     */
    static isDateInFinancialYear(date, financialYear) {
        const { start, end } = this.getFinancialYearDateRange(financialYear);
        return date >= start && date <= end;
    }

    /**
     * Get date ranges for multiple financial years
     * @param {Array} financialYears - Array of financial year strings
     * @returns {Array} Array of objects with financialYear, start, and end dates
     */
    static getMultipleFinancialYearRanges(financialYears) {
        return financialYears.map(fy => ({
            financialYear: fy,
            ...this.getFinancialYearDateRange(fy)
        }));
    }

    /**
     * Get comparison periods (current FY vs previous 2 FYs)
     * @returns {Object} Object with current and previous financial year data
     */
    static getComparisonPeriods() {
        const fyList = this.getFinancialYearsList(2);
        const ranges = this.getMultipleFinancialYearRanges(fyList);
        
        return {
            current: ranges[0],
            previous: ranges.slice(1),
            all: ranges
        };
    }
}