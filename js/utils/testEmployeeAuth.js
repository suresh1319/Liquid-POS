// Test utility for employee authentication
import { findEmployeeById } from './employeeAuth.js';

// Test function to debug employee authentication issues
export async function testEmployeeAuth(employeeId, accessToken) {
  console.log('=== Employee Auth Test ===');
  console.log('Employee ID:', employeeId);
  console.log('Access Token:', accessToken);
  
  try {
    // Try to find the employee
    console.log('Searching for employee...');
    const employee = await findEmployeeById(employeeId);
    
    if (!employee) {
      console.log('❌ Employee not found in database');
      return { success: false, error: 'Employee not found' };
    }
    
    console.log('✅ Employee found:', employee);
    
    // Check token
    if (employee.accessTokenToken !== accessToken) {
      console.log('❌ Token mismatch');
      console.log('Expected token:', employee.accessTokenToken);
      console.log('Provided token:', accessToken);
      return { success: false, error: 'Token mismatch' };
    }
    
    console.log('✅ Token matches');
    
    // Check expiration
    if (employee.accessTokenExpiry) {
      const expiryDate = new Date(employee.accessTokenExpiry);
      const now = new Date();
      if (now > expiryDate) {
        console.log('❌ Token expired');
        console.log('Expiry date:', expiryDate);
        console.log('Current date:', now);
        return { success: false, error: 'Token expired' };
      }
      console.log('✅ Token is valid (expires:', expiryDate, ')');
    } else {
      console.log('⚠️ No expiration date set');
    }
    
    console.log('✅ All checks passed!');
    return { success: true, employee: employee };
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return { success: false, error: error.message };
  }
}

// Function to parse auth token from URL
export function parseAuthToken(authToken) {
  console.log('=== Parsing Auth Token ===');
  console.log('Raw token:', authToken);
  
  const tokenParts = authToken.split('_');
  console.log('Token parts:', tokenParts);
  
  if (tokenParts.length < 2) {
    console.log('❌ Invalid token format');
    return null;
  }
  
  // Try to determine employee ID and token
  let employeeId, token;
  
  // Case 1: Simple format (empId_token)
  if (tokenParts.length === 2) {
    employeeId = tokenParts[0];
    token = tokenParts[1];
    console.log('Simple format detected');
  } 
  // Case 2: Complex format (emp_part2_token)
  else if (tokenParts.length >= 3) {
    // If first part is short, it might be a prefix
    if (tokenParts[0].length < 5) {
      employeeId = `${tokenParts[0]}_${tokenParts[1]}`;
      token = tokenParts.slice(2).join('_');
      console.log('Complex format detected (prefix + ID)');
    } else {
      // Otherwise, use first part as ID
      employeeId = tokenParts[0];
      token = tokenParts.slice(1).join('_');
      console.log('Complex format detected (ID + token)');
    }
  }
  
  console.log('Parsed employee ID:', employeeId);
  console.log('Parsed token:', token);
  
  return { employeeId, token };
}

// List all employees for debugging
export async function listAllEmployees() {
  try {
    console.log('=== Listing All Employees ===');
    const snapshot = await sdk.db.collection('Employees').get();
    const employees = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Found ${employees.length} employees:`);
    employees.forEach(emp => {
      console.log(`- ID: ${emp.id}`);
      console.log(`  Unique ID: ${emp.uniqueId || 'N/A'}`);
      console.log(`  Name: ${emp.name || 'N/A'}`);
      console.log(`  Has access token: ${!!emp.accessTokenToken}`);
      if (emp.accessTokenToken) {
        console.log(`  Token preview: ${emp.accessTokenToken.substring(0, 20)}...`);
      }
      console.log('---');
    });
    
    return employees;
  } catch (error) {
    console.error('Error listing employees:', error);
    return [];
  }
}