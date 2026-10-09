// Employee Authentication Context

import { createContext, useContext, useEffect, useState } from 'react';
import { validateEmployeeSession, authenticateEmployeeWithDeviceLock } from '../utils/employeeAuth.js';

const EmployeeAuthContext = createContext();

export function EmployeeAuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [isEmployeeAuthenticated, setIsEmployeeAuthenticated] = useState(false);
  const [sessionType, setSessionType] = useState('unknown'); // 'admin', 'employee-link', or 'unknown'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check for auth token in URL parameters FIRST, before checking Firebase Auth
        const urlParams = new URLSearchParams(window.location.search);
        const authToken = urlParams.get('auth');
        
        if (authToken) {
          // Handle authentication via URL token for employee-link sessions
          console.log('Processing auth token:', authToken);
          
          // For the token format: employeeId_token
          // Based on your data, we know the correct format should be:
          // employeeId: everything except the last part (which is the token)
          // token: the last part
          
          const tokenParts = authToken.split('_');
          console.log('Token parts:', tokenParts);
          
          if (tokenParts.length >= 2) {
            // Try the most likely combination first:
            // Employee ID is all parts except the last one
            // Token is the last part
            const potentialEmployeeId = tokenParts.slice(0, -1).join('_');
            const potentialToken = tokenParts[tokenParts.length - 1];
            
            console.log(`Trying combination - Employee ID: ${potentialEmployeeId}, Token: ${potentialToken}`);
            
            // Try to authenticate with this combination
            const authResult = await authenticateEmployeeWithDeviceLock(potentialEmployeeId, potentialToken);
            if (authResult.success) {
              console.log('✅ Authentication successful with this combination');
              setEmployee(authResult.employee);
              setIsEmployeeAuthenticated(true);
              setSessionType('employee-link');
              
              // Store employee link session in localStorage
              const employeeLinkSession = {
                employee: authResult.employee,
                authToken: potentialToken,
                timestamp: new Date().getTime()
              };
              localStorage.setItem('employee_link_session', JSON.stringify(employeeLinkSession));
              
              setLoading(false);
              // Remove the auth parameter from URL to prevent re-authentication on refresh
              window.history.replaceState({}, document.title, window.location.pathname);
              return;
            } else {
              console.log('❌ Authentication failed with this combination:', authResult.error);
            }
            
            // If that didn't work, try other combinations
            for (let i = 1; i < tokenParts.length - 1; i++) {
              const potentialEmployeeId = tokenParts.slice(0, i).join('_');
              const potentialToken = tokenParts.slice(i).join('_');
              
              console.log(`Trying alternative combination - Employee ID: ${potentialEmployeeId}, Token: ${potentialToken}`);
              
              // Try to authenticate with this combination
              const authResult = await authenticateEmployeeWithDeviceLock(potentialEmployeeId, potentialToken);
              if (authResult.success) {
                console.log('✅ Authentication successful with this combination');
                setEmployee(authResult.employee);
                setIsEmployeeAuthenticated(true);
                setSessionType('employee-link');
                
                // Store employee link session in localStorage
                const employeeLinkSession = {
                  employee: authResult.employee,
                  authToken: potentialToken,
                  timestamp: new Date().getTime()
                };
                localStorage.setItem('employee_link_session', JSON.stringify(employeeLinkSession));
                
                setLoading(false);
                // Remove the auth parameter from URL to prevent re-authentication on refresh
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
              } else {
                console.log('❌ Authentication failed with this combination:', authResult.error);
              }
            }
          }
          
          // If we get here, authentication failed
          console.error('Unable to authenticate with any token combination');
        }
        
        // Check for existing employee link session in localStorage
        const storedEmployeeLinkSession = localStorage.getItem('employee_link_session');
        if (storedEmployeeLinkSession) {
          try {
            const sessionData = JSON.parse(storedEmployeeLinkSession);
            // Check if session is still valid (less than 24 hours old)
            const sessionAge = new Date().getTime() - sessionData.timestamp;
            const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
            
            if (sessionAge < maxSessionAge) {
              setEmployee(sessionData.employee);
              setIsEmployeeAuthenticated(true);
              setSessionType('employee-link');
              setLoading(false);
              return;
            } else {
              // Session expired, clear it
              localStorage.removeItem('employee_link_session');
              // Redirect to access link expired page
              if (typeof window !== 'undefined' && window.location) {
                window.location.href = '/#/access-link-expired';
              }
            }
          } catch (parseError) {
            console.error('Error parsing employee link session:', parseError);
            localStorage.removeItem('employee_link_session');
          }
        }
        
        // Only check Firebase Auth if we're not handling an employee-link session
        // First check if user is logged in via Firebase Auth (admin)
        const isFirebaseAuthenticated = typeof window !== 'undefined' && 
          window.firebase && 
          window.firebase.auth && 
          window.firebase.auth().currentUser;
        
        if (isFirebaseAuthenticated) {
          // User is logged in via Firebase Auth - this is an admin session
          setSessionType('admin');
          setEmployee(null);
          setIsEmployeeAuthenticated(false);
          setLoading(false);
          return;
        }
        
        // No authentication - this could be a public access or initial load
        setEmployee(null);
        setIsEmployeeAuthenticated(false);
        setSessionType('none');
      } catch (error) {
        console.error('Error checking session:', error);
        setEmployee(null);
        setIsEmployeeAuthenticated(false);
        setSessionType('unknown');
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const value = {
    employee,
    isEmployeeAuthenticated,
    sessionType,
    employeePermissions: employee?.permissions || [],
    loading
  };

  return (
    <EmployeeAuthContext.Provider value={value}>
      {children}
    </EmployeeAuthContext.Provider>
  );
}

export function useEmployeeAuth() {
  const context = useContext(EmployeeAuthContext);
  if (!context) {
    throw new Error('useEmployeeAuth must be used within an EmployeeAuthProvider');
  }
  return context;
}