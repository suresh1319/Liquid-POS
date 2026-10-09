import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { LanguageProvider, LanguageWindowBridge } from './contexts/LanguageContext.js';
import { sdk } from './sdk.js'; // Initialize Shopto SDK
import { ProfileProvider } from './contexts/ProfileContext.js';
import { OrderProvider } from './contexts/OrderContext.js';
import { BluetoothPrinting } from './utils/BluetoothPrinting.js';
// Import CurrencyProvider
import { CurrencyProvider } from './contexts/CurrencyContext.js';
// Import EmployeeAuthProvider
import { EmployeeAuthProvider } from './contexts/EmployeeAuthContext';

// Safety shim: some compiled/minified bundles have been observed to contain
// a typo referencing `sole.error` instead of `console.error`. That causes
// an immediate runtime ReferenceError when the code hits such a call.
// Provide a minimal compatibility shim so the app won't crash and errors
// still appear in the console. This is a temporary, low-risk safety measure
// while we locate and fix the bad bundle.
if (typeof window !== 'undefined' && typeof window.sole === 'undefined') {
    // Point `sole` to the real console so calls like `sole.error(...)`
    // behave as `console.error(...)`.
    try {
        window.sole = console;
    } catch (e) {
        // No-op; if this fails, we can't do much here.
    }
}

// Loading screen management
const updateLoadingProgress = (percentage) => {
    const progressBar = document.getElementById('loading-progress');
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
};

const removeLoadingScreen = () => {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('transition-opacity', 'duration-500', 'opacity-0');
        setTimeout(() => {
            loadingScreen.remove();
        }, 500);
    }
};

// Render the main App component

// Debug: Log all form submissions
window.addEventListener('submit', function(e) {
    console.warn('[GLOBAL DEBUG] Form submitted:', e.target);
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <BrowserRouter>
        <LanguageProvider>
            <LanguageWindowBridge />
            <ProfileProvider>
                <OrderProvider>
                    <CurrencyProvider>
                        <EmployeeAuthProvider>
                            <App />
                        </EmployeeAuthProvider>
                    </CurrencyProvider>
                </OrderProvider>
            </ProfileProvider>
        </LanguageProvider>
    </BrowserRouter>
);

// Set loading to complete and remove loading screen after app is rendered
updateLoadingProgress(100);
setTimeout(removeLoadingScreen, 300);

// Initialize BluetoothPrinting service
BluetoothPrinting.initialize();

// Check if BluetoothPrinting initialized properly
document.addEventListener('DOMContentLoaded', function () {
    console.log('Checking BluetoothPrinting initialization');
    // Will be loaded below with version parameter

    // Add a convenience function for printing test
    async function printTest(orderId) {
        orderId = orderId || "testOrder123"; // Default test order ID
        console.log("Starting print test with orderId:", orderId);

        // Create a test order if needed
        if (orderId === "testOrder123") {
            const testOrder = {
                id: "testOrder123",
                billNo: "T123",
                date: new Date(),
                customer: { name: "Test Customer", phone: "1234567890" },
                items: [
                    { title: "Test Item 1", price: 100, quantity: 2 },
                    { title: "Test Item 2", price: 150, quantity: 1 }
                ],
                payMode: "CASH",
                total: 350,
                subTotal: 350,
                discount: 0
            };

            // Store test order in window for debugging
            _testOrder = testOrder;

            // Use the SDK to save the test order if possible
            try {
                if (sdk && sdk.db) {
                    await sdk.db.collection("Orders").doc("testOrder123").set(testOrder);
                    console.log("Test order saved to database");
                }
            } catch (e) {
                console.warn("Could not save test order to database:", e);
            }
        }

        try {
            if (BluetoothPrinting) {
                console.log("BluetoothPrinting found, attempting to print...");
                await BluetoothPrinting.printBill(orderId);
                console.log("Print test completed successfully!");
                return true;
            } else {
                console.error("BluetoothPrinting not available for test");
                return false;
            }
        } catch (e) {
            console.error("Print test failed:", e);
            return false;
        }
    };

    console.log("Print test function available. Run printTest() to test printing.");
});


// Initialize loading progress tracking
const loadingProgress = {
    totalScripts: 0,
    loadedScripts: 0,
    updateProgress: function () {
        const percentage = Math.min(90, Math.floor((this.loadedScripts / this.totalScripts) * 80) + 10);
        const progressBar = document.getElementById('loading-progress');
        if (progressBar) {
            progressBar.style.width = percentage + '%';
        }
    }
};

// Count total scripts
addEventListener('DOMContentLoaded', function () {
    const scripts = document.querySelectorAll('script[src]');
    loadingProgress.totalScripts = scripts.length;

    // Add load event listeners to all scripts
    scripts.forEach(script => {
        if (script.getAttribute('src')) {
            const originalSrc = script.getAttribute('src');

            // For scripts already loaded
            if (script.readyState === 'complete' || script.readyState === 'loaded') {
                loadingProgress.loadedScripts++;
                loadingProgress.updateProgress();
            }

            // For scripts still loading
            script.addEventListener('load', function () {
                loadingProgress.loadedScripts++;
                loadingProgress.updateProgress();
            });
        }
    });
});

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (!localStorage.shopto_current_profileId) {
        localStorage.shopto_current_profileId = "AtBtXdOK6p1KwswKhEA6";
    }
}

// Enforce dd/mm/yyyy by default when no locale/options are provided.
// This is conservative: if code passes a locale or options we respect them.
(function enforceDefaultDateFormat() {
    try {
        if (typeof Date === 'undefined' || !Date.prototype) return;
        const orig = Date.prototype.toLocaleDateString;
        Date.prototype.toLocaleDateString = function (locale, options) {
            if (locale || options) return orig.call(this, locale, options);
            try {
                return orig.call(this, 'en-GB');
            } catch (e) {
                const d = new Date(this.valueOf());
                const dd = ('0' + d.getDate()).slice(-2);
                const mm = ('0' + (d.getMonth() + 1)).slice(-2);
                const yyyy = d.getFullYear();
                return `${dd}/${mm}/${yyyy}`;
            }
        };
    } catch (e) {
        console.warn('[main] enforceDefaultDateFormat failed', e);
    }
})();
