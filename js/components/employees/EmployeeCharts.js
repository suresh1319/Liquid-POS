import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default function EmployeeCharts({ employees }) {
    const statusCanvasRef = useRef(null);
    const rolesCanvasRef = useRef(null);
    const chartsRef = useRef({ status: null, roles: null });

    useEffect(() => {
        const onlineCount = employees.filter(e => e.isLoggedIn === true && e.status === 'ONLINE').length;
        const offlineCount = employees.length - onlineCount;

        if (statusCanvasRef.current) {
            if (chartsRef.current.status) chartsRef.current.status.destroy();
            chartsRef.current.status = new Chart(statusCanvasRef.current, {
                type: 'pie',
                data: {
                    labels: ['Online', 'Offline'],
                    datasets: [{ data: [onlineCount, offlineCount], backgroundColor: ['#22c55e33', '#9ca3af33'], borderColor: ['#22c55e', '#9ca3af'] }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { 
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true
                            }
                        } 
                    }
                }
            });
        }

        if (rolesCanvasRef.current) {
            const roleToCount = employees.reduce((acc, e) => {
                const r = (e.role || 'Staff');
                acc[r] = (acc[r] || 0) + 1;
                return acc;
            }, {});
            const labels = Object.keys(roleToCount);
            const values = labels.map(l => roleToCount[l]);
            if (chartsRef.current.roles) chartsRef.current.roles.destroy();
            chartsRef.current.roles = new Chart(rolesCanvasRef.current, {
                type: 'bar',
                data: { labels, datasets: [{ label: 'Employees', data: values, backgroundColor: '#ef444433', borderColor: '#ef4444' }] },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    scales: { 
                        y: { 
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            }
                        } 
                    }, 
                    plugins: { 
                        legend: { 
                            display: false 
                        } 
                    }
                }
            });
        }

        return () => {
            Object.values(chartsRef.current).forEach(c => c && c.destroy && c.destroy());
        };
    }, [employees]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-800">Status Distribution</h4>
                    <i className="ph ph-chart-pie text-red-500"></i>
                </div>
                <div className="h-64 relative">
                    <canvas ref={statusCanvasRef}></canvas>
                </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-800">Role Mix</h4>
                    <i className="ph ph-chart-bar text-red-500"></i>
                </div>
                <div className="h-64 relative">
                    <canvas ref={rolesCanvasRef}></canvas>
                </div>
            </div>
        </div>
    );
}