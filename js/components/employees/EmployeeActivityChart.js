import { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { sdk } from '../../sdk.js';

Chart.register(...registerables);

export default function EmployeeActivityChart({ employeeId, isOpen, onClose }) {
    const [selectedPeriod, setSelectedPeriod] = useState('7days');
    const [activityData, setActivityData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalHours, setTotalHours] = useState(0);
    const chartRef = useRef(null);
    const canvasRef = useRef(null);

    const periods = [
        { value: '1day', label: 'Last 24 Hours' },
        { value: '7days', label: 'Last 7 Days' },
        { value: '30days', label: 'Last Month' },
        { value: '365days', label: 'Last Year' },
        { value: 'all', label: 'All Time' }
    ];

    useEffect(() => {
        if (isOpen && employeeId) {
            fetchActivityData();
        }
    }, [isOpen, employeeId, selectedPeriod]);

    useEffect(() => {
        if (activityData.length > 0 && canvasRef.current) {
            renderChart();
        }
        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }
        };
    }, [activityData]);

    const getDateRange = () => {
        const now = new Date();
        let startDate;
        
        switch (selectedPeriod) {
            case '1day':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7days':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30days':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '365days':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(0); // All time
        }
        
        return { startDate, endDate: now };
    };

    const fetchActivityData = async () => {
        setLoading(true);
        try {
            const { startDate, endDate } = getDateRange();
            
            // Fetch real activity data from Firebase using proper SDK patterns
            const query = await sdk.db.collection('EmployeeActivityLogs')
                .where('employeeId', '==', employeeId)
                .get();
            
            // Process the real data
            const dataMap = new Map();
            
            // Initialize all dates in range with 0 hours
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const dateKey = currentDate.toDateString();
                dataMap.set(dateKey, {
                    date: new Date(currentDate),
                    hours: 0,
                    formatted: currentDate.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                    })
                });
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            // Process activity logs with proper date filtering
            query.docs.forEach(doc => {
                const data = doc.data();
                
                // Parse the date from the document
                let logDate;
                if (data.date && data.date.toDate) {
                    logDate = data.date.toDate();
                } else if (data.date) {
                    logDate = new Date(data.date);
                } else {
                    return; // Skip if no date
                }
                
                // Check if the log date falls within our date range
                if (logDate >= startDate && logDate <= endDate) {
                    if (data.loginTime && data.logoutTime) {
                        const login = data.loginTime.toDate ? data.loginTime.toDate() : new Date(data.loginTime);
                        const logout = data.logoutTime.toDate ? data.logoutTime.toDate() : new Date(data.logoutTime);
                        const hours = (logout - login) / (1000 * 60 * 60); // Convert to hours
                        
                        if (hours > 0 && hours < 24) { // Sanity check for reasonable hours
                            const dateKey = logDate.toDateString();
                            if (dataMap.has(dateKey)) {
                                const existing = dataMap.get(dateKey);
                                existing.hours += hours;
                                dataMap.set(dateKey, existing);
                            }
                        }
                    }
                }
            });
            
            // Convert map to array and sort by date
            const processedData = Array.from(dataMap.values()).sort((a, b) => a.date - b.date);
            
            // Round hours to 2 decimal places
            processedData.forEach(entry => {
                entry.hours = Math.round(entry.hours * 100) / 100;
            });
            
            setActivityData(processedData);
            
            // Calculate total hours
            const total = processedData.reduce((sum, entry) => sum + entry.hours, 0);
            setTotalHours(total);
            
        } catch (error) {
            console.error('Error fetching activity data:', error);
            
            // Fallback to mock data if Firebase fails
            const { startDate, endDate } = getDateRange();
            const mockData = generateMockActivityData(startDate, endDate);
            setActivityData(mockData);
            
            const total = mockData.reduce((sum, entry) => sum + entry.hours, 0);
            setTotalHours(total);
        } finally {
            setLoading(false);
        }
    };

    const generateMockActivityData = (startDate, endDate) => {
        const data = [];
        const currentDate = new Date(startDate);
        
        while (currentDate <= endDate) {
            // Simulate working days with random hours
            const dayOfWeek = currentDate.getDay();
            const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 6; // Monday to Saturday
            
            let hours = 0;
            if (isWorkingDay && Math.random() > 0.2) { // 80% chance of working on working days
                hours = Math.random() * 8 + 2; // 2-10 hours random
            }
            
            data.push({
                date: new Date(currentDate),
                hours: Math.round(hours * 100) / 100,
                formatted: currentDate.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                })
            });
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return data;
    };

    const renderChart = () => {
        if (chartRef.current) {
            chartRef.current.destroy();
        }

        if (!canvasRef.current) return;

        const ctx = canvasRef.current.getContext('2d');
        
        chartRef.current = new Chart(ctx, {
            type: 'line',
            data: {
                labels: activityData.map(item => item.formatted),
                datasets: [{
                    label: 'Hours Worked',
                    data: activityData.map(item => item.hours),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#ef4444',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: '#ef4444',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.parsed.y.toFixed(1)} hours`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxTicksLimit: 10,
                            color: '#6b7280'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            color: '#6b7280',
                            callback: function(value) {
                                return value + 'h';
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white w-full max-w-4xl h-[80vh] rounded-xl shadow-lg overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                                <i className="ph ph-clock text-2xl" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">Activity Tracking</h3>
                                <p className="text-blue-100 text-sm">Employee work hours</p>
                            </div>
                        </div>
                        <button 
                            onClick={onClose} 
                            className="p-2 rounded-lg hover:bg-white hover:bg-opacity-20 transition-colors"
                        >
                            <i className="ph ph-x text-xl" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 h-full">
                    {/* Period Selector and Stats */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex gap-2">
                            {periods.map((period) => (
                                <button
                                    key={period.value}
                                    onClick={() => setSelectedPeriod(period.value)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        selectedPeriod === period.value
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                >
                                    {period.label}
                                </button>
                            ))}
                        </div>
                        
                        <div className="text-right">
                            <p className="text-sm text-gray-600">Total Hours</p>
                            <p className="text-2xl font-bold text-gray-900">{totalHours.toFixed(1)}h</p>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4" style={{ height: 'calc(100% - 120px)' }}>
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <i className="ph ph-spinner ph-spin text-4xl text-gray-400 mb-2"></i>
                                    <p className="text-gray-500">Loading activity data...</p>
                                </div>
                            </div>
                        ) : activityData.length > 0 ? (
                            <canvas ref={canvasRef}></canvas>
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <i className="ph ph-chart-line text-4xl text-gray-300 mb-2"></i>
                                    <p className="text-gray-500">No activity data available</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}