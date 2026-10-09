// Custom hook to listen for employee authentication changes and handle auto-logout

import { useEffect, useState } from 'react';
import { sdk } from '../sdk.js';
import { validateEmployeeSession, logoutEmployee } from '../utils/employeeAuth.js';

let unsubscribeListener = null;

export function useEmployeeAuthListener() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [employee, setEmployee] = useState(null);

  useEffect(() => {
    // Check initial session validity
    const checkInitialSession = async () => {
      const validationResult = await validateEmployeeSession();
      if (validationResult.isValid) {
        setIsAuthenticated(true);
        setEmployee(validationResult.employee);
        
        // Set up real-time listener for employee document
        setupEmployeeListener(validationResult.employee);
      } else {
        setIsAuthenticated(false);
        setEmployee(null);
      }
    };

    checkInitialSession();

    // Cleanup function
    return () => {
      if (unsubscribeListener) {
        unsubscribeListener();
        unsubscribeListener = null;
      }
    };
  }, []);

  const setupEmployeeListener = (employee) => {
    // Clean up any existing listener
    if (unsubscribeListener) {
      unsubscribeListener();
      unsubscribeListener = null;
    }

    // Set up listener for employee document changes
    const employeeId = employee.uniqueId || employee.id;
    unsubscribeListener = sdk.db.collection('Employees').doc(employeeId).onSnapshot(
      (doc) => {
        if (doc.exists) {
          const updatedEmployee = { id: doc.id, ...doc.data() };
          
          // Check if accessTokenToken has changed
          if (updatedEmployee.accessTokenToken !== employee.accessTokenToken) {
            // Token has been invalidated, logout immediately
            handleForcedLogout();
          } else {
            // Update employee state
            setEmployee(updatedEmployee);
          }
        } else {
          // Employee document deleted, logout
          handleForcedLogout();
        }
      },
      (error) => {
        console.error('Error listening to employee changes:', error);
      }
    );
  };

  const handleForcedLogout = async () => {
    await logoutEmployee();
    setIsAuthenticated(false);
    setEmployee(null);
    
    // Redirect to login page or show logout message
    // We'll dispatch a custom event that the app can listen to
    window.dispatchEvent(new CustomEvent('employeeForcedLogout'));
  };

  return { isAuthenticated, employee };
}