import { useNavigate } from 'react-router-dom';

export default function AccessLinkExpired() {
    const navigate = useNavigate();

    const handleGoHome = () => {
        // Clear any employee link session data
        localStorage.removeItem('employee_link_session');
        localStorage.removeItem('employeeSession');
        // Navigate to the home page
        navigate('/');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-sm border p-8 text-center">
                <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
                    <i className="ph ph-prohibit text-3xl text-red-500"></i>
                </div>
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Link Expired</h1>
                <p className="text-gray-600 mb-6">
                    Your access link has expired or is no longer valid. Please contact your administrator to generate a new link.
                </p>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={handleGoHome}
                        className="w-full px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium"
                    >
                        Go to Home Page
                    </button>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                    >
                        Refresh Page
                    </button>
                </div>
            </div>
        </div>
    );
}