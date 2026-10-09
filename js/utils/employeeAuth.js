// Employee authentication utilities with device locking functionality

import { sdk } from '../sdk.js';

// Generate a unique device identifier
export function generateDeviceId() {
  // Try to get a persistent device ID from localStorage
  let deviceId = localStorage.getItem('employeeDeviceId');
  
  if (!deviceId) {
    // Generate a new device ID
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    deviceId = `dev_${timestamp}_${randomPart}`;
    localStorage.setItem('employeeDeviceId', deviceId);
  }
  
  return deviceId;
}

// Authenticate employee with device locking
export async function authenticateEmployeeWithDeviceLock(employeeId, accessToken) {
  try {
    console.log('Attempting to authenticate employee:', employeeId);
    console.log('Access token:', accessToken);
    
    // Find the employee document
    const employee = await findEmployeeById(employeeId);
    if (!employee) {
      console.error('Employee not found for ID:', employeeId);
      return { success: false, error: `Employee not found for ID: ${employeeId}` };
    }
    
    console.log('Found employee:', employee);
    
    // Check if the access token matches
    if (employee.accessTokenToken !== accessToken) {
      console.error('Token mismatch. Expected:', employee.accessTokenToken, 'Got:', accessToken);
      return { success: false, error: 'Invalid access token - token mismatch' };
    }
    
    // Check if token has expired (tokens expire after 24 hours)
    if (employee.accessTokenExpiry) {
      const expiryDate = new Date(employee.accessTokenExpiry);
      if (new Date() > expiryDate) {
        return { success: false, error: 'Access token expired' };
      }
    }
    
    // Generate current device ID
    const currentDeviceId = generateDeviceId();
    
    // Update employee with current device ID
    await sdk.db.collection('Employees').doc(employee.id).update({
      currentDeviceId: currentDeviceId,
      lastLoginAt: new Date()
    });
    
    // Store employee data in localStorage for session management
    localStorage.setItem('employeeSession', JSON.stringify({
      employeeId: employee.uniqueId || employee.id,
      accessToken: accessToken,
      deviceId: currentDeviceId
    }));
    
    return {
      success: true,
      employee: employee
    };
  } catch (error) {
    console.error('Employee authentication failed:', error);
    return {
      success: false,
      error: `Authentication error: ${error.message}`
    };
  }
}

// Check if employee session is still valid
export async function validateEmployeeSession() {
  try {
    const sessionStr = localStorage.getItem('employeeSession');
    if (!sessionStr) {
      return { isValid: false, reason: 'No session found' };
    }
    
    const session = JSON.parse(sessionStr);
    const { employeeId, accessToken, deviceId } = session;
    
    // Find the employee document
    const employee = await findEmployeeById(employeeId);
    if (!employee) {
      return { isValid: false, reason: 'Employee not found' };
    }
    
    // Check if access token is still valid
    if (employee.accessTokenToken !== accessToken) {
      return { isValid: false, reason: 'Access token invalidated' };
    }
    
    // Check if token has expired (tokens expire after 24 hours)
    if (employee.accessTokenExpiry) {
      const expiryDate = new Date(employee.accessTokenExpiry);
      if (new Date() > expiryDate) {
        return { isValid: false, reason: 'Access token expired' };
      }
    }
    
    // Check if device ID matches (another device hasn't taken over)
    if (employee.currentDeviceId && employee.currentDeviceId !== deviceId) {
      return { isValid: false, reason: 'Device lock taken by another device' };
    }
    
    return { 
      isValid: true, 
      employee: employee,
      deviceId: deviceId
    };
  } catch (error) {
    console.error('Session validation failed:', error);
    return { isValid: false, reason: error.message };
  }
}

// Logout employee and clear device lock
export async function logoutEmployee() {
  try {
    const sessionStr = localStorage.getItem('employeeSession');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      const { employeeId } = session;
      
      // Clear device ID from employee document
      const employee = await findEmployeeById(employeeId);
      if (employee) {
        await sdk.db.collection('Employees').doc(employee.id).update({
          currentDeviceId: null
        });
      }
    }
    
    // Clear session from localStorage
    localStorage.removeItem('employeeSession');
    localStorage.removeItem('employee_link_session');
    
    return { success: true };
  } catch (error) {
    console.error('Logout failed:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to find employee by unique ID (handles both old and new formats)
async function findEmployeeById(employeeId) {
  try {
    console.log('Searching for employee with ID:', employeeId);
    
    // First try to find by document ID
    const docRef = await sdk.db.collection('Employees').doc(employeeId).get();
    if (docRef.exists) {
      console.log('Found employee by document ID:', employeeId);
      return { id: employeeId, ...docRef.data() };
    }
    
    // If not found by document ID, try to find by uniqueId field
    const querySnapshot = await sdk.db.collection('Employees').where('uniqueId', '==', employeeId).get();
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      console.log('Found employee by uniqueId field:', employeeId);
      return { id: doc.id, ...doc.data() };
    }
    
    // If still not found, try to find by migratedFrom field (for old IDs)
    const migratedQuery = await sdk.db.collection('Employees').where('migratedFrom', '==', employeeId).get();
    if (!migratedQuery.empty) {
      const doc = migratedQuery.docs[0];
      console.log('Found employee by migratedFrom field:', employeeId);
      return { id: doc.id, ...doc.data() };
    }
    
    // Try a more flexible search - look for employees whose uniqueId starts with the given ID
    // This handles cases where the token might have extra parts
    const partialQuery = await sdk.db.collection('Employees').where('uniqueId', '>=', employeeId).where('uniqueId', '<=', employeeId + '\uf8ff').get();
    if (!partialQuery.empty) {
      const doc = partialQuery.docs[0];
      console.log('Found employee by partial match on uniqueId:', employeeId);
      console.log('Matched employee:', doc.data());
      return { id: doc.id, ...doc.data() };
    }
    
    console.log('Employee not found with any method for ID:', employeeId);
    return null;
  } catch (error) {
    console.error('Error finding employee by ID:', error);
    return null;
  }
}