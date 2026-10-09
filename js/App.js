import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.js';
import Products from './pages/Products.js';
import Customers from './pages/Customers.js';
import Passbook from './pages/Passbook.js';
import ReportsPage from './pages/ReportsPage.js';
import AiMenuPage from './pages/AiMenu.js';
import Analytics from './pages/Analytics.js';
import AIChatbot from './pages/AIChatbot.js';
import Expenses from './pages/Expenses.js';
import BudgetManagement from './pages/BudgetManagement.js';
import KDS from './pages/KDS.js';
import { SidebarNav, BottomNav } from './components/Navigation.js';
import Employees from './pages/Employees.js';
import AccessDenied from './pages/AccessDenied.js';
import AccessLinkExpired from './pages/AccessLinkExpired.js';
import ProtectedRoute from './components/ProtectedRoute.js';

import { useLanguage } from './contexts/LanguageContext.js';
import { useEmployeeAuth } from './contexts/EmployeeAuthContext';

export default function App() {
    const { t, language } = useLanguage();
    const { employeePermissions, sessionType, loading } = useEmployeeAuth();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const location = useLocation();

    // Listen for external requests to show level customers
    useEffect(() => {
        const handler = (e) => {
            try {
                const tier = e?.detail?.tier || (e && e.detail && e.detail.tier) || (e && e.tier) || null;
                if (tier) {
                    setActiveTab('customers');
                    // also dispatch a message so Customers can set its filter
                    try { window.dispatchEvent(new CustomEvent('activateTierFilter', { detail: { tier } })); } catch (err) { window.dispatchEvent({ type: 'activateTierFilter', detail: { tier } }); }
                }
            } catch (err) { /* ignore */ }
        };
        window.addEventListener('showLevelCustomers', handler);
        return () => window.removeEventListener('showLevelCustomers', handler);
    }, []);

    // If still loading, show loading spinner
    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500"></div>
            </div>
        );
    }

    const tabs = [
        { id: 'dashboard', icon: 'house', label: t('home') },
        { id: 'products', icon: 'package', label: t('products') },
        { id: 'kds', icon: 'monitor', label: 'KDS' },
        { id: 'ai-menu', icon: 'sparkle', label: t('aiMenu') },
        { id: 'customers', icon: 'users', label: t('customers') },
        { id: 'employees', icon: 'identification-card', label: 'Employees' },
        { id: 'passbook', icon: 'wallet', label: t('passbook') },
        { id: 'reports', icon: 'chart-line', label: t('reports') },
        { id: 'expenses', icon: 'receipt', label: t('Expenses') },
        { id: 'analytics', icon: 'chart-bar', label: t('analytics') },
        { id: 'ai-chatbot', icon: 'chat-circle-dots', label: t('aiChatbot') }
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard />;
            case 'products': return <Products />;
            case 'customers': return <Customers />;
            case 'passbook': return <Passbook />;
            case 'kds': return <KDS />;
            case 'ai-menu': return <AiMenuPage />;
            case 'reports': return <ReportsPage />;
            case 'analytics': return <Analytics />;
            case 'employees': return <Employees />;
            case 'ai-chatbot': return <AIChatbot />;
            default: return null;
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            <SidebarNav 
                tabs={tabs} 
                isCollapsed={isSidebarCollapsed}
                onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                employeePermissions={employeePermissions}
            />
            <main className={`flex-1 bg-gray-50 pb-16 md:pb-0 ${isSidebarCollapsed ? 'md:pl-20' : 'md:pl-64'} transition-all duration-300`}>
                <Routes>
                    <Route path="/" element={<ProtectedRoute currentPath={location.pathname}><Dashboard /></ProtectedRoute>} />
                    <Route path="/dashboard" element={<ProtectedRoute currentPath={location.pathname}><Dashboard /></ProtectedRoute>} />
                    <Route path="/products" element={<ProtectedRoute currentPath={location.pathname}><Products /></ProtectedRoute>} />
                    <Route path="/customers" element={<ProtectedRoute currentPath={location.pathname}><Customers /></ProtectedRoute>} />
                    <Route path="/employees" element={<ProtectedRoute currentPath={location.pathname}><Employees /></ProtectedRoute>} />
                    <Route path="/passbook" element={<ProtectedRoute currentPath={location.pathname}><Passbook /></ProtectedRoute>} />
                    <Route path="/kds" element={<ProtectedRoute currentPath={location.pathname}><KDS /></ProtectedRoute>} />
                    <Route path="/ai-menu" element={<ProtectedRoute currentPath={location.pathname}><AiMenuPage /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute currentPath={location.pathname}><ReportsPage /></ProtectedRoute>} />
                    <Route path="/expenses" element={<ProtectedRoute currentPath={location.pathname}><Expenses /></ProtectedRoute>} />
                    <Route path="/budget-management" element={<ProtectedRoute currentPath={location.pathname}><BudgetManagement /></ProtectedRoute>} />
                    <Route path="/analytics" element={<ProtectedRoute currentPath={location.pathname}><Analytics /></ProtectedRoute>} />
                    <Route path="/access-denied" element={<AccessDenied />} />
                    <Route path="/access-link-expired" element={<AccessLinkExpired />} />
                    <Route path="/ai-chatbot" element={<AIChatbot />} />
                    {/* Redirect any unknown routes to dashboard */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            <BottomNav tabs={tabs} employeePermissions={employeePermissions} />
        </div>
    );
}