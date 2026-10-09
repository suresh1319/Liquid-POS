// Initialize SDK with required permissions
const permissions = [
    {
        id: "products_view",
        name: "View Products",
        description: "View products in the inventory"
    },
    {
        id: "products_edit",
        name: "Edit Products",
        description: "Add, edit, or delete products"
    },
    {
        id: "orders_view",
        name: "View Orders",
        description: "View and manage orders"
    },
    {
        id: "orders_edit",
        name: "Edit Orders",
        description: "Create, edit, or delete orders"
    },
    {
        id: "customers_view",
        name: "View Customers",
        description: "View customer information"
    },
    {
        id: "customers_edit",
        name: "Edit Customers",
        description: "Add, edit, or delete customers"
    },
    {
        id: "profile_edit",
        name: "Edit Profile",
        description: "Edit store profile settings"
    },
    {
        id: "analytics_view",
        name: "View Analytics",
        description: "View sales analytics and reports"
    }
];

// Create SDK instance with permission schema (robust to different global shapes)
let _sdkInstance = null;

function tryInitSdk() {
    if (_sdkInstance) {
        console.log('tryInitSdk: Using cached SDK instance');
        return _sdkInstance;
    }

    console.log('tryInitSdk: Attempting to initialize SDK');

    try {
        const g = window;
        const candidates = [
            g.ShoptoSDK,
            g.Shopto?.SDK,
            g.Shopto?.default,
            g.Shopto,
            g.shopto,
            g.SHOPTO_SDK,
            g.ShoptoSDK?.default
        ].filter(Boolean);

        console.log('tryInitSdk: Found candidates:', candidates.length);

        for (const cand of candidates) {
            console.log('tryInitSdk: Testing candidate:', typeof cand);

            // If it's already an instance (has db/profile), use it directly
            if (typeof cand === 'object' && (cand.db || cand.profile || cand.analytics)) {
                console.log('tryInitSdk: Found valid SDK instance object');
                _sdkInstance = cand;
                break;
            }
            // If it's a constructor/function, try to construct
            if (typeof cand === 'function') {
                console.log('tryInitSdk: Found constructor function, attempting to instantiate');
                try {
                    _sdkInstance = new cand(permissions);
                    console.log('tryInitSdk: Successfully instantiated SDK');
                    break;
                } catch (constructorError) {
                    console.log('tryInitSdk: Constructor failed, trying alternative methods');
                    // Some SDKs expose .init or .create instead of constructor
                    if (typeof cand.init === 'function') {
                        console.log('tryInitSdk: Found init method, calling it');
                        _sdkInstance = cand.init({ permissions });
                        console.log('tryInitSdk: Successfully initialized SDK via init method');
                        break;
                    }
                    if (typeof cand.create === 'function') {
                        console.log('tryInitSdk: Found create method, calling it');
                        _sdkInstance = cand.create({ permissions });
                        console.log('tryInitSdk: Successfully initialized SDK via create method');
                        break;
                    }
                }
            }
            // If it has .init/.create as object methods
            if (typeof cand === 'object') {
                console.log('tryInitSdk: Found object with potential init/create methods');
                if (typeof cand.init === 'function') {
                    console.log('tryInitSdk: Found init method on object, calling it');
                    _sdkInstance = cand.init({ permissions });
                    console.log('tryInitSdk: Successfully initialized SDK via object init method');
                    break;
                }
                if (typeof cand.create === 'function') {
                    console.log('tryInitSdk: Found create method on object, calling it');
                    _sdkInstance = cand.create({ permissions });
                    console.log('tryInitSdk: Successfully initialized SDK via object create method');
                    break;
                }
            }
        }

        if (_sdkInstance) {
            console.log('tryInitSdk: SDK initialization successful');
        } else {
            console.log('tryInitSdk: No valid SDK found among candidates');
        }
    } catch (e) {
        console.warn('Shopto SDK initialization failed, will retry on next access:', e);
    }

    return _sdkInstance;
}

// Export a proxy so early imports don't crash if SDK shape differs
export const sdk = new Proxy({}, {
    get: function (_target, prop) {
        console.log('SDK Proxy: Accessing property:', prop);

        const inst = tryInitSdk();
        if (!inst) {
            console.log('SDK Proxy: SDK instance not available');

            // Gracefully return no-op functions for analytics and throw for mandatory services
            if (prop === 'analytics') {
                console.log('SDK Proxy: Returning noop analytics');
                return { logEvent: () => { } };
            }
            // For db operations, return a mock object with helpful error messages
            if (prop === 'db') {
                console.log('SDK Proxy: Returning mock DB object');
                return {
                    collection: () => {
                        const error = new Error('Firebase SDK not properly initialized. Please check your Firebase configuration.');
                        console.error('Mock collection method called:', error.message);
                        throw error;
                    },
                    batch: () => {
                        const error = new Error('Firebase SDK not properly initialized. Please check your Firebase configuration.');
                        console.error('Mock batch method called:', error.message);
                        throw error;
                    }
                };
            }

            const error = new Error('Shopto SDK is not available yet. Firebase may not be properly configured.');
            console.error('SDK Proxy: Throwing error for property:', prop, error.message);
            throw error;
        }

        console.log('SDK Proxy: SDK instance available, accessing property:', prop);
        const val = inst[prop];
        console.log('SDK Proxy: Property value type:', typeof val);

        return (typeof val === 'function') ? val.bind(inst) : val;
    }
});

// Helper function to show toast messages
export function showToast(message, type = 'success') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white`;
    toast.textContent = message;

    // Add to document
    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity', 'duration-500');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 500);
    }, 3000);
}

// Log analytics event for app initialization
try {
    console.log('Initializing analytics...');
    const inst = tryInitSdk();
    if (inst && inst.analytics && typeof inst.analytics.logEvent === 'function') {
        console.log('Logging app initialization event');
        inst.analytics.logEvent('app_initialized', {
            timestamp: new Date().toISOString()
        });
    } else {
        console.log('Analytics not available, setting up retry');
        // Retry once after load
        window.addEventListener('load', () => {
            const inst2 = tryInitSdk();
            if (inst2 && inst2.analytics && typeof inst2.analytics.logEvent === 'function') {
                console.log('Logging app initialization event on retry');
                inst2.analytics.logEvent('app_initialized', { timestamp: new Date().toISOString() });
            }
        });
    }
} catch (analyticsError) {
    console.error('Error during analytics initialization:', analyticsError);
}

// Export FieldValue if available through firebase or sdk
export const FieldValue = (function () {
    try {
        if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
            console.log('FieldValue: Using direct Firebase FieldValue');
            return firebase.firestore.FieldValue;
        }
        const inst = tryInitSdk();
        if (inst && inst.FieldValue) {
            console.log('FieldValue: Using SDK FieldValue');
            return inst.FieldValue;
        }
        if (inst && inst.db && inst.db.FieldValue) {
            console.log('FieldValue: Using SDK db FieldValue');
            return inst.db.FieldValue;
        }
    } catch (e) {
        console.error('FieldValue: Error during initialization:', e);
    }
    console.log('FieldValue: Returning null');
    return null;
})();

// Ensure sdk.FieldValue is available if using the fallback
if (typeof sdk !== 'undefined' && !sdk.FieldValue && FieldValue) {
    console.log('Setting sdk.FieldValue');
    sdk.FieldValue = FieldValue;
}

// Expose a debug handle to the SDK so administrators can run console queries during development.
// This is intentionally non-fatal and guarded so it won't break environments where window is restricted.
try {
    if (typeof window !== 'undefined' && !window.__sdkForDebug) {
        try {
            window.__sdkForDebug = sdk;
            console.log('Exposed SDK for debugging');
        } catch (e) {
            console.log('Could not expose SDK for debugging:', e);
        }
    }
} catch (e) {
    console.log('Error exposing SDK for debugging:', e);
}