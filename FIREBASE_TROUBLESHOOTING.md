# Firebase Integration Troubleshooting Guide

## Common Issues and Solutions

### 1. "Error saving budgets to Firebase" Error

This error typically occurs when the Firebase SDK is not properly initialized or configured.

#### Diagnosis Steps:

1. **Check Browser Console**: Open the browser's developer tools (F12) and check the Console tab for detailed error messages.

2. **Verify Firebase Configuration**: Make sure your Firebase configuration is correctly set up in your application.

3. **Test SDK Availability**: Run the following code in your browser console:
   ```javascript
   // Check if SDK is available
   console.log('SDK available:', typeof sdk !== 'undefined');
   console.log('SDK DB available:', !!(sdk && sdk.db));
   console.log('Collection method available:', !!(sdk && sdk.db && typeof sdk.db.collection === 'function'));
   ```

#### Solutions:

1. **Ensure Firebase SDK is Loaded**: Make sure the Firebase JavaScript SDK is properly included in your project.

2. **Check Network Connectivity**: Verify that your application can connect to Firebase servers.

3. **Verify Authentication**: If your Firebase setup requires authentication, make sure the user is properly authenticated.

### 2. SDK Initialization Issues

#### Symptoms:
- "Shopto SDK is not available yet" errors
- "Firebase SDK not properly initialized" messages

#### Solutions:

1. **Check SDK Loading Order**: Ensure that the Firebase SDK is loaded before your application code tries to use it.

2. **Verify Configuration**: Make sure your Firebase configuration object is correctly set up with the proper API keys and project IDs.

3. **Check for Conflicts**: Ensure there are no conflicts with other versions of the Firebase SDK that might be loaded.

### 3. Firestore Permission Errors

#### Symptoms:
- PERMISSION_DENIED errors in the console
- Data not being saved or retrieved

#### Solutions:

1. **Check Firestore Rules**: Verify that your Firestore security rules allow read/write access for your application.

2. **Authentication**: If using authentication, make sure the user is properly signed in and has the required permissions.

### 4. Network Issues

#### Symptoms:
- Timeout errors
- Intermittent connection failures

#### Solutions:

1. **Check Internet Connection**: Ensure stable internet connectivity.

2. **Firewall/Proxy**: Verify that your network isn't blocking connections to Firebase servers.

3. **Retry Logic**: Implement retry logic for transient network failures.

## Debugging Steps

### Step 1: Run the Debug Script
Open your browser's developer console and run the debug script provided in `firebase-debug-script.js`.

### Step 2: Check Console Output
Look for any error messages or warnings that might indicate the specific issue.

### Step 3: Verify Data Structures
Ensure that the data being passed to the Firebase functions is in the correct format:
- Expenses should be an array of expense objects
- Budgets should be an array of budget objects
- Each object should have the required properties

### Step 4: Test with Simple Data
Try saving a simple array to isolate whether the issue is with the data or the connection:
```javascript
// Test with empty arrays
saveFirebaseExpenses([]);
saveFirebaseBudgets([]);
saveFirebaseCategories([]);
```

## Fallback Mechanism

The application includes a fallback mechanism that uses localStorage when Firebase is not available. This ensures that the application continues to function even when there are connectivity issues.

## Contact Support

If you continue to experience issues after following these steps, please contact support with:
1. Screenshots of the console errors
2. Information about your environment (browser, OS, etc.)
3. Steps to reproduce the issue