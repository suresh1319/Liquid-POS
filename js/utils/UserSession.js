import { CurrencyData } from './CurrencyData.js';

// UserSession utility for managing user session and profile data
export class UserSession {
    static session = null; // Equivalent to SharedPreferences in Dart
    static seller = null; // ProfileInfo object
    static initialized = false;
    static permissions = null; // Cache for user permissions

    // Initialize the session
    static async init() {
        // Check if SDK is available
        if (typeof sdk === 'undefined') {
            console.warn("SDK not available yet, UserSession initialization delayed");
            // Wait for the page to fully load before trying again
            window.addEventListener('load', () => {
                setTimeout(() => this.init(), 100);
            });
            return;
        }

        // Prevent multiple initializations
        if (this.initialized) return;
        this.initialized = true;

        console.log("Initializing UserSession...");

        // Load session data from localStorage
        this.session = localStorage;

        try {
            // Fetch user data if we have a seller ID
            await this.fetchUser();

            // Fetch IP info for country/currency
            await this.fetchIP();

            // Initialize permissions
            await this.initPermissions();

            console.log("UserSession initialized successfully");
        } catch (err) {
            console.error("Error during UserSession initialization:", err);
        }
    }

    // Initialize user permissions
    static async initPermissions() {
        try {
            if (sdk?.permissions) {
                // Get all permissions for the current user
                this.permissions = await sdk.permissions.getUserPermissions();
                console.log("User permissions loaded:", this.permissions);
            }
        } catch (err) {
            console.error("Error loading user permissions:", err);
            this.permissions = [];
        }
    }

    // Check if the user has a specific permission
    static async hasPermission(permissionId) {
        try {
            // If we haven't cached permissions yet, get them now
            if (!this.permissions) {
                await this.initPermissions();
            }

            // Check if it's in our cached permissions
            if (this.permissions && this.permissions.includes(permissionId)) {
                return true;
            }

            // If not in cache or we're not sure, check directly with SDK
            if (sdk?.permissions) {
                return await sdk.permissions.hasPermission(permissionId);
            }

            return false;
        } catch (err) {
            console.error(`Error checking permission '${permissionId}':`, err);
            return false;
        }
    }

    // Map module/action format to permission ID format
    static getPermissionId(module, action) {
        return `${module.toLowerCase()}_${action.toLowerCase()}`;
    }

    // Check permission by module and action
    static async checkPermission(module, action, silent = true) {
        const permissionId = this.getPermissionId(module, action);
        const hasPermission = await this.hasPermission(permissionId);

        if (!hasPermission && !silent && showToast) {
            showToast(`You don't have permission for this action`);
        }

        return hasPermission;
    }

    // Fetch user profile data
    static async fetchUser() {
        try {
            const sid = this.session.getItem("SELLER_ID");
            if (!sid) {
                console.log("No seller ID found in session");
                return;
            }

            console.log(`Fetching user profile for seller ID: ${sid}`);

            // Fetch seller profile from Firestore
            const doc = await sdk.profile.get();
            if (doc.exists) {
                // We need to wait until ProfileInfo is defined
                if (typeof ProfileInfo === 'undefined') {
                    console.warn("ProfileInfo not available yet, using raw data");
                    this.seller = {
                        id: doc.id,
                        ...doc.data()
                    };
                } else {
                    this.seller = ProfileInfo.fromDoc(doc);
                }
                console.log("User profile fetched successfully");
            } else {
                console.log("No seller document found for ID:", sid);
            }
        } catch (err) {
            console.error("Error fetching user:", err);
        }
    }

    // Fetch IP information for country and currency
    static async fetchIP() {
        try {
            // Skip if we already have country and currency
            if (this.session.getItem("COUNTRY") &&
                this.session.getItem("CURRENCY_CODE")) {
                return;
            }

            // Fetch IP info
            const response = await fetch("https://ipapi.co/json/");
            const locationData = await response.json();

            // Set country and currency
            this.session.setItem("COUNTRY", locationData.country || "IN");
            this.session.setItem("CURRENCY_CODE", locationData.currency || "INR");
        } catch (e) {
            console.error("Error fetching IP info:", e);
            // Default to India and INR
            this.session.setItem("COUNTRY", "IN");
            this.session.setItem("CURRENCY_CODE", "INR");
        }
    }

    // Get country code
    static getCountry() {
        return this.session?.getItem("COUNTRY") || "IN";
    }

    // Check if user is in India
    static inIndia() {
        return this.getCountry() === "IN";
    }

    // Get currency code
    static getCurrencyCode() {
        // Prioritize profile currency over localStorage
        if (this.seller?.currencyCode) {
            return this.seller.currencyCode;
        }
        const currencyCode = this.session?.getItem("CURRENCY_CODE");
        return currencyCode || "INR";
    }

    // Get currency symbol
    static getCurrency() {
        const currencyCode = this.getCurrencyCode();
        const currency = CurrencyData?.getCurrencyByCode(currencyCode);
        return currency?.symbol || "₹";
    }

    // Set currency code
    static setCurrencyCode(code) {
        this.session?.setItem("CURRENCY_CODE", code);
    }

    // Run a function only once (based on a flag in session)
    static runOnce(check) {
        if (this.session.getItem(check) === null) {
            this.session.setItem(check, "true");
            return true;
        }
        return false;
    }

    // Run after a certain count
    static runAfter(check, count) {
        let c = parseInt(this.session.getItem(check) || "0");

        if (c < count) {
            this.session.setItem(check, (c + 1).toString());
            return false;
        }

        return true;
    }

    // Run every nth time
    static runEvery(check, count) {
        let c = parseInt(this.session.getItem(check) || "0");

        if (c < count) {
            this.session.setItem(check, (c + 1).toString());
            return false;
        }

        this.session.setItem(check, "1");
        return true;
    }

    // Check if seller is logged in
    static isSellerLoggedIn() {
        return this.seller?.id != null;
    }

    // Get bill number with support for store opening/closing
    static getBillNo(options = {}) {
        try {
            // Get the current bill number from localStorage
            let billNo = parseInt(localStorage.getItem('BILL_NO') || '0');
            
            // Increment it for the next bill
            billNo = billNo + 1;
            
            // Store the new bill number in localStorage
            localStorage.setItem('BILL_NO', billNo.toString());
            
            // Log for debugging
            console.log(`Generated bill number: ${billNo} (options: ${JSON.stringify(options)})`);
            
            return billNo;
        } catch (err) {
            console.error('Error generating bill number:', err);
            // Fallback to a timestamp-based number
            return Math.floor(Date.now() / 1000) % 10000;
        }
    }
}
