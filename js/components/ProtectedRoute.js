// ProtectedRoute component for permission-based routing

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmployeeAuth } from '../contexts/EmployeeAuthContext';
import { validateEmployeeSession } from '../utils/employeeAuth.js';

// Map route paths to permission modules
const ROUTE_PERMISSION_MAP = {
  '/': 'home',
  '/dashboard': 'home',
  '/products': 'products',
  '/customers': 'customers',
  '/passbook': 'passbook',
  '/kds': 'KDS',
  '/ai-menu': 'ai-menu', // AI Menu now has its own permission
  '/reports': 'reports',
  '/expenses': 'expenses', // Expenses now has its own permission
  '/budget-management': 'expenses', // Budget management is part of expenses
  '/analytics': 'analytics',
  '/employees': 'employees'
};

export default function ProtectedRoute({ children, allowedPermissions = [], currentPath }) {
  const { sessionType, employeePermissions, employee } = useEmployeeAuth();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthorization = async () => {
      try {
        // If session type is unknown, we're still loading
        if (sessionType === 'unknown') {
          return;
        }
        
        // If admin session, allow all routes
        if (sessionType === 'admin') {
          setIsAuthorized(true);
          setIsLoading(false);
          return;
        }
        
        // If no authentication at all, allow access (public access)
        if (sessionType === 'none') {
          setIsAuthorized(true);
          setIsLoading(false);
          return;
        }
        
        // If employee-link session, bypass Firebase Auth completely
        if (sessionType === 'employee-link') {
          // For employee-link sessions, validate the session
          const sessionResult = await validateEmployeeSession();
          
          if (!sessionResult.isValid) {
            // Clear the employee link session
            localStorage.removeItem('employee_link_session');
            // Redirect to access link expired page if token expired, otherwise access denied
            if (sessionResult.reason === 'Access token expired') {
              navigate('/access-link-expired');
            } else {
              navigate('/access-denied');
            }
            return;
          }

          // If no specific permissions required for this route, allow access
          const requiredPermission = ROUTE_PERMISSION_MAP[currentPath] || 'home';
          if (!requiredPermission) {
            setIsAuthorized(true);
            setIsLoading(false);
            return;
          }

          // Check if employee has the required permission
          const hasPermission = employeePermissions.some(
            perm => perm.module === requiredPermission && perm.actions.includes('view')
          );

          if (hasPermission) {
            setIsAuthorized(true);
          } else {
            // Redirect to access denied page
            navigate('/access-denied');
          }
          setIsLoading(false);
          return;
        }
        
        // If we reach here, it means we have an unknown session type
        navigate('/access-denied');
      } catch (error) {
        console.error('Error checking authorization:', error);
        // For employee-link sessions, redirect to access denied on error
        if (sessionType === 'employee-link') {
          navigate('/access-denied');
        } else {
          // For admin or no-auth sessions, allow access despite the error
          setIsAuthorized(true);
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthorization();
  }, [currentPath, allowedPermissions, navigate, sessionType, employeePermissions, employee]);

  if (isLoading || sessionType === 'unknown') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-sm border max-w-md">
          <i className="ph ph-prohibit text-6xl text-red-500 mb-4"></i>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            You don't have permission to access this page.
          </p>
          <button 
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return children;
}