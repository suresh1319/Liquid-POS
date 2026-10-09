// Debug utility for employee authentication
import { findEmployeeById } from './employeeAuth.js';

// Debug function to test employee authentication
export async function debugAuth(authToken) {
  console.log('=== Debug Auth Started ===');
  console.log('Auth token:', authToken);
  
  // Split the token
  const tokenParts = authToken.split('_');
  console.log('Token parts:', tokenParts);
  
  if (tokenParts.length < 2) {
    console.log('❌ Invalid token format');
    return;
  }
  
  // Try the most likely combination first
  const potentialEmployeeId = tokenParts.slice(0, -1).join('_');
  const potentialToken = tokenParts[tokenParts.length - 1];
  
  console.log(`Trying primary combination:`);
  console.log(`  Employee ID: ${potentialEmployeeId}`);
  console.log(`  Token: ${potentialToken}`);
  
  // Try to find the employee
  console.log('Searching for employee...');
  const employee = await findEmployeeById(potentialEmployeeId);
  
  if (!employee) {
    console.log('❌ Employee not found with primary combination');
    
    // Try alternative combinations
    for (let i = 1; i < tokenParts.length - 1; i++) {
      const altEmployeeId = tokenParts.slice(0, i).join('_');
      const altToken = tokenParts.slice(i).join('_');
      
      console.log(`Trying alternative combination ${i}:`);
      console.log(`  Employee ID: ${altEmployeeId}`);
      console.log(`  Token: ${altToken}`);
      
      const altEmployee = await findEmployeeById(altEmployeeId);
      if (altEmployee) {
        console.log('✅ Employee found with alternative combination!');
        console.log('Employee data:', altEmployee);
        
        // Check token match
        if (altEmployee.accessTokenToken === altToken) {
          console.log('✅ Token matches!');
          return { employee: altEmployee, token: altToken };
        } else {
          console.log('❌ Token mismatch');
          console.log('Expected:', altEmployee.accessTokenToken);
          console.log('Got:', altToken);
        }
      } else {
        console.log('❌ Employee not found with this combination');
      }
    }
  } else {
    console.log('✅ Employee found with primary combination!');
    console.log('Employee data:', employee);
    
    // Check token match
    if (employee.accessTokenToken === potentialToken) {
      console.log('✅ Token matches!');
      return { employee: employee, token: potentialToken };
    } else {
      console.log('❌ Token mismatch');
      console.log('Expected:', employee.accessTokenToken);
      console.log('Got:', potentialToken);
    }
  }
  
  console.log('=== Debug Auth Completed ===');
  return null;
}

// List all employees with their auth info
export async function listEmployeesWithAuthInfo() {
  try {
    console.log('=== Listing Employees with Auth Info ===');
    const snapshot = await sdk.db.collection('Employees').get();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`Employee ID: ${doc.id}`);
      console.log(`  Name: ${data.name || 'N/A'}`);
      console.log(`  Unique ID: ${data.uniqueId || 'N/A'}`);
      console.log(`  Has access token: ${!!data.accessTokenToken}`);
      if (data.accessTokenToken) {
        console.log(`  Token preview: ${data.accessTokenToken.substring(0, 20)}...`);
      }
      console.log('---');
    });
  } catch (error) {
    console.error('Error listing employees:', error);
  }
}