// Test file to verify currency conversion functionality
import { CurrencyData } from '../utils/CurrencyData.js';

// Test the currency conversion functionality
async function testCurrencyConversion() {
    console.log('=== Currency Conversion Tests ===');
    
    // Test 1: Basic conversion INR to USD
    try {
        const inrAmount = 100;
        const usdAmount = await CurrencyData.convertCurrency(inrAmount, 'INR', 'USD');
        console.log(`${inrAmount} INR = ${usdAmount.toFixed(2)} USD`);
        console.log('Formatted:', CurrencyData.formatAmount(usdAmount, 'USD'));
    } catch (error) {
        console.error('Test 1 failed:', error);
    }
    
    // Test 2: Conversion EUR to INR
    try {
        const eurAmount = 10;
        const inrAmount = await CurrencyData.convertCurrency(eurAmount, 'EUR', 'INR');
        console.log(`${eurAmount} EUR = ${inrAmount.toFixed(2)} INR`);
        console.log('Formatted:', CurrencyData.formatAmount(inrAmount, 'INR'));
    } catch (error) {
        console.error('Test 2 failed:', error);
    }
    
    // Test 3: Same currency (should return same value)
    try {
        const amount = 50;
        const result = await CurrencyData.convertCurrency(amount, 'USD', 'USD');
        console.log(`${amount} USD to USD = ${result} (should be same)`);
    } catch (error) {
        console.error('Test 3 failed:', error);
    }
    
    // Test 4: Test all available currencies
    console.log('\n=== Available Currencies ===');
    CurrencyData.currencies.forEach(currency => {
        console.log(`${currency.code}: ${currency.name} (${currency.symbol})`);
    });
}

// Run tests when imported
if (typeof window !== 'undefined') {
    // Browser environment
    window.testCurrencyConversion = testCurrencyConversion;
    console.log('Currency conversion tests available. Run: testCurrencyConversion()');
} else {
    // Node.js environment
    testCurrencyConversion();
}

export { testCurrencyConversion };