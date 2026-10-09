import { sdk } from '../sdk.js';
import { useProfile } from '../contexts/ProfileContext.js';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEmployeeAuth } from '../contexts/EmployeeAuthContext';

// Map tab IDs to permission modules
const TAB_PERMISSION_MAP = {
    'dashboard': 'home',
    'products': 'products',
    'kds': 'KDS',
    'ai-menu': 'ai-menu',
    'customers': 'customers',
    'employees': 'employees',
    'passbook': 'passbook',
    'reports': 'reports',
    'expenses': 'expenses',
    'analytics': 'analytics'
};

// Sidebar Navigation Component
export function SidebarNav({ tabs, isCollapsed, onToggle, employeePermissions = [] }) {
    const profileContext = useProfile();
    const navigate = useNavigate();
    const location = useLocation();
    const { sessionType } = useEmployeeAuth();

    // Determine active tab based on current route
    const getActiveTab = () => {
        const path = location.pathname;
        if (path === '/' || path === '/dashboard') return 'dashboard';
        if (path === '/products') return 'products';
        if (path === '/customers') return 'customers';
        if (path === '/passbook') return 'passbook';
        if (path === '/kds') return 'kds';
        if (path === '/ai-menu') return 'ai-menu';
        if (path === '/reports') return 'reports';
        if (path === '/expenses') return 'expenses';
        if (path === '/budget-management') return 'expenses'; // Budget management is part of expenses
        if (path === '/analytics') return 'analytics';
        if (path === '/employees') return 'employees';
        if (path === '/ai-chatbot') return 'ai-chatbot';
        return 'dashboard';
    };

    const activeTab = getActiveTab();

    // Toggle button component
    const ToggleButton = ({ showOnHover = false }) => (
        <button
            onClick={onToggle}
            className={`${showOnHover ? 'opacity-0 group-hover:opacity-100' : ''} absolute top-4 -right-3 bg-[#fff8f8] text-gray-600 rounded-full p-1.5 shadow-lg hover:bg-red-500 hover:text-white transition-all duration-200 z-10 flex items-center justify-center`}
        >
            <i className={`ph text-lg ${isCollapsed ? 'ph-caret-double-right' : 'ph-caret-double-left'}`}></i>
        </button>
    );

    // Filter tabs based on session type and permissions
    const filteredTabs = tabs.filter(tab => {
        // If admin session, show all tabs
        if (sessionType === 'admin') {
            return true;
        }
        
        // If no authentication, show all tabs (public access)
        if (sessionType === 'none') {
            return true;
        }
        
        // If not employee-link session, show no tabs
        if (sessionType !== 'employee-link') {
            return false;
        }
        
        // For employee-link sessions, filter based on permissions
        // If no employee permissions provided, show all tabs (admin mode)
        if (!employeePermissions || employeePermissions.length === 0) {
            return true;
        }
        
        // Get the required permission for this tab
        const requiredPermission = TAB_PERMISSION_MAP[tab.id];
        
        // If no specific permission required for this tab, show it
        if (!requiredPermission) {
            return true;
        }
        
        // Check if employee has the required permission
        return employeePermissions.some(
            perm => perm.module === requiredPermission && perm.actions.includes('view')
        );
    });

    if (isCollapsed) {
        return (
            <div className="hidden md:flex flex-col w-16 border-r h-full fixed left-0 top-0 pt-12 overflow-hidden" style={{ backgroundColor: "#fff8f8" }}>
                <div className="flex flex-col items-center px-2 py-6 w-full">
                    {/* Logo with hidden toggle button */}
                    <div className="relative w-full flex justify-center mb-8 group">
                        <div 
                            className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer"
                            onClick={onToggle}
                        >
                            {sdk?.profile?.avatar || profileContext?.avatar ? (
                                <img
                                    src={sdk?.profile?.avatar || profileContext?.avatar}
                                    alt="Store Logo"
                                    className="w-10 h-10 object-contain"
                                />
                            ) : (
                                <i className="ph ph-storefront text-red-500 text-lg"></i>
                            )}
                        </div>
                        <ToggleButton showOnHover={true} />
                    </div>
                    
                    {/* Navigation icons only */}
                    <div className="flex flex-col items-center space-y-1 w-full">
                        {filteredTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => navigate(tab.id === 'dashboard' ? '/' : `/${tab.id}`)}
                                className={`flex items-center justify-center w-12 h-12 rounded-xl transition-colors ${activeTab === tab.id
                                    ? 'bg-red-500 text-white shadow-sm'
                                    : 'hover:bg-pink-50 text-gray-600'
                                    }`}
                                title={tab.label}
                            >
                                <i className={`ph ph-${tab.icon} text-xl`} />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="hidden md:flex flex-col w-64 border-r h-full fixed left-0 top-0 pt-12 overflow-y-auto" style={{ backgroundColor: "#fff8f8" }}>
            <div className="px-3 py-6">
                {/* Collapse toggle button */}
                <div className="relative">
                    <ToggleButton />
                </div>
                
                <div className="flex items-center justify-center mb-6">
                    <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                        {sdk?.profile?.avatar || profileContext?.avatar ? (
                            <img
                                src={sdk?.profile?.avatar || profileContext?.avatar}
                                alt="Store Logo"
                                className="w-12 h-12 object-contain"
                            />
                        ) : (
                            <i className="ph ph-storefront text-red-500 text-2xl"></i>
                        )}
                    </div>
                    <div className="ml-3">
                        <h2 className="text-xl font-bold text-gray-800">{profileContext?.businessName || "Liquid POS"}</h2>
                        <p className="text-sm text-gray-500">{profileContext?.phone || "Restaurant Management"}</p>
                    </div>
                </div>
                <div className="flex flex-col space-y-1">
                    {filteredTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => navigate(tab.id === 'dashboard' ? '/' : `/${tab.id}`)}
                            className={`flex items-center space-x-3 p-3 rounded-xl transition-colors ${activeTab === tab.id
                                ? 'bg-red-500 text-white shadow-sm'
                                : 'hover:bg-pink-50 text-gray-600'
                                }`}
                        >
                            <i className={`ph ph-${tab.icon} text-xl`} />
                            <span className="font-medium">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Bottom Navigation Component
export function BottomNav({ tabs, employeePermissions = [] }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { sessionType } = useEmployeeAuth();

    // Filter tabs based on session type and permissions
    const filteredTabs = tabs.filter(tab => {
        // If admin session, show all tabs
        if (sessionType === 'admin') {
            return true;
        }
        
        // If no authentication, show all tabs (public access)
        if (sessionType === 'none') {
            return true;
        }
        
        // If not employee-link session, show no tabs
        if (sessionType !== 'employee-link') {
            return false;
        }
        
        // For employee-link sessions, filter based on permissions
        // If no employee permissions provided, show all tabs (admin mode)
        if (!employeePermissions || employeePermissions.length === 0) {
            return true;
        }
        
        // Get the required permission for this tab
        const requiredPermission = TAB_PERMISSION_MAP[tab.id];
        
        // If no specific permission required for this tab, show it
        if (!requiredPermission) {
            return true;
        }
        
        // Check if employee has the required permission
        return employeePermissions.some(
            perm => perm.module === requiredPermission && perm.actions.includes('view')
        );
    });

    // Determine active tab based on current route
    const getActiveTab = () => {
        const path = location.pathname;
        if (path === '/' || path === '/dashboard') return 'dashboard';
        if (path === '/products') return 'products';
        if (path === '/customers') return 'customers';
        if (path === '/passbook') return 'passbook';
        if (path === '/kds') return 'kds';
        if (path === '/ai-menu') return 'ai-menu';
        if (path === '/reports') return 'reports';
        if (path === '/expenses') return 'expenses';
        if (path === '/budget-management') return 'expenses'; // Budget management is part of expenses
        if (path === '/analytics') return 'analytics';
        if (path === '/employees') return 'employees';
        if (path === '/ai-chatbot') return 'ai-chatbot';
        return 'dashboard';
    };

    const activeTab = getActiveTab();

    return (
        <nav className="md:hidden fixed bottom-0 w-full bg-gradient-to-t from-white to-warm-bg border-t border-gray-200 shadow-section z-40">
            <div className="grid grid-cols-5 h-16">
                {filteredTabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => navigate(tab.id === 'dashboard' ? '/' : `/${tab.id}`)}
                        className={`flex flex-col items-center justify-center transition-all relative ${activeTab === tab.id
                            ? 'text-red-500'
                            : 'text-gray-600 hover:text-red-400'
                            }`}
                    >
                        {activeTab === tab.id && (
                            <div className="absolute top-0 w-10 h-1 bg-gradient-to-r from-red-600 to-red-500 rounded-b-lg animate-fadeIn"></div>
                        )}
                        <div className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${activeTab === tab.id ? 'bg-gradient-to-br from-red-50 to-white shadow-sm transform scale-110' : ''}`}>
                            <i className={`ph ph-${tab.icon} text-xl ${activeTab === tab.id ? 'animate-scaleIn' : ''}`} />
                        </div>
                        <span className="text-xs mt-0.5 font-medium">{tab.label}</span>
                    </button>
                ))}
            </div>
        </nav>
    );
}