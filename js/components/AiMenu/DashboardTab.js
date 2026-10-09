import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { sdk } from '../../sdk.js';
import UpsellInsights from './UpsellInsights';
import { MOrder } from '../../models/Order.js';
import SalesPieChart from './SalesPieChart';
import { useLanguage } from '../../contexts/LanguageContext.js';

Chart.register(...registerables);

export default function DashboardTab() {
    const { t } = useLanguage();
    const [period, setPeriod] = useState('today');
    const canvasRef = useRef(null);
    const chartRef = useRef(null);
    const [salesData, setSalesData] = useState({
        organicTotal: 0,
        upsellTotal: 0,
        totalSales: 0,
        shoptoFees: 0,
        chartLabels: [],
        chartOrganicData: [],
        chartUpsellData: [],
    });
    const [orders, setOrders] = useState([]);

    const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

    const fetchOrders = async (period) => {
        try {
            let startDate = new Date();
            const endDate = new Date();

            switch (period) {
                case 'today':
                    startDate.setHours(0, 0, 0, 0);
                    break;
                case 'yesterday':
                    startDate.setDate(startDate.getDate() - 1);
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setDate(endDate.getDate() - 1);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'last7':
                    startDate.setDate(startDate.getDate() - 7);
                    break;
                case 'last30':
                    startDate.setDate(startDate.getDate() - 30);
                    break;
                default:
                    break;
            }

            const ordersSnapshot = await sdk.db.collection("Orders")
                .where("orderSource", "==", "ONLINE")
                .where("date", ">=", startDate)
                .where("date", "<=", endDate)
                .get();

            const fetchedOrders = ordersSnapshot.docs.map(doc => new MOrder(doc.data()));
            setOrders(fetchedOrders);

            let organicTotal = 0;
            let upsellTotal = 0;
            
            fetchedOrders.forEach(order => {
                order.items.forEach(item => {
                    if (item.upsell) {
                        upsellTotal += item.subTotal;
                    } else {
                        organicTotal += item.subTotal;
                    }
                });
            });

            const shoptoFees = fetchedOrders.reduce((acc, order) => acc + (order.menuFee), 0);

            const totalSales = organicTotal + upsellTotal;

            const now = new Date();
            let chartLabels = [];
            let chartOrganicData = [];
            let chartUpsellData = [];

            if (period === 'today' || period === 'yesterday') {
                chartLabels = [t('aiMenuAm124'), t('aiMenuAm48'), t('aiMenuPm812'), t('aiMenuPm124'), t('aiMenuPm48'), t('aiMenuPm812')];
                const hourlyOrganic = Array(6).fill(0);
                const hourlyUpsell = Array(6).fill(0);

                fetchedOrders.forEach(order => {
                    const hour = order.placeDate.getHours();
                    const intervalIndex = Math.floor(hour / 4);
                    
                    order.items.forEach(item => {
                        if (item.upsell) {
                            hourlyUpsell[intervalIndex] += item.subTotal;
                        } else {
                            hourlyOrganic[intervalIndex] += item.subTotal;
                        }
                    });
                });
                chartOrganicData = hourlyOrganic;
                chartUpsellData = hourlyUpsell;

            } else if (period === 'last7') {
                const weekdayLabels = [
                    t('aiMenuSun'),
                    t('aiMenuMon'),
                    t('aiMenuTue'),
                    t('aiMenuWed'),
                    t('aiMenuThu'),
                    t('aiMenuFri'),
                    t('aiMenuSat')
                ];
                const labelsAndDates = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(now);
                    d.setDate(now.getDate() - (6 - i));
                    return {
                        label: weekdayLabels[d.getDay()],
                        dateStr: d.toLocaleDateString('en-IN')
                    };
                });

                chartLabels = labelsAndDates.map(ld => ld.label);
                const dailyOrganic = Array(7).fill(0);
                const dailyUpsell = Array(7).fill(0);

                const dateMap = {};
                labelsAndDates.forEach((ld, index) => {
                    dateMap[ld.dateStr] = index;
                });

                fetchedOrders.forEach(order => {
                    const orderDateStr = order.placeDate.toLocaleDateString('en-IN');
                    const dayIndex = dateMap[orderDateStr];
                    if (dayIndex !== undefined) {
                        order.items.forEach(item => {
                            if (item.upsell) {
                                dailyUpsell[dayIndex] += item.subTotal;
                            } else {
                                dailyOrganic[dayIndex] += item.subTotal;
                            }
                        });
                    }
                });

                chartOrganicData = dailyOrganic;
                chartUpsellData = dailyUpsell;

            } else if (period === 'last30') {
                chartLabels = [t('aiMenuWeek1'), t('aiMenuWeek2'), t('aiMenuWeek3'), t('aiMenuWeek4')];
                const weeklyOrganic = Array(4).fill(0);
                const weeklyUpsell = Array(4).fill(0);
                
                fetchedOrders.forEach(order => {
                    const orderDate = order.placeDate;
                    const diffTime = orderDate.getTime() - startDate.getTime();
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    
                    let weekIndex = Math.floor(diffDays / 7);
                    if (weekIndex > 3) weekIndex = 3;

                    if (weekIndex >= 0) {
                        order.items.forEach(item => {
                            if (item.upsell) {
                                weeklyUpsell[weekIndex] += item.subTotal;
                            } else {
                                weeklyOrganic[weekIndex] += item.subTotal;
                            }
                        });
                    }
                });
                chartOrganicData = weeklyOrganic;
                chartUpsellData = weeklyUpsell;
            } else { // Default for 'custom' or other cases
                const weekdayLabels = [
                    t('aiMenuSun'),
                    t('aiMenuMon'),
                    t('aiMenuTue'),
                    t('aiMenuWed'),
                    t('aiMenuThu'),
                    t('aiMenuFri'),
                    t('aiMenuSat')
                ];
                const labelsAndDates = Array.from({ length: 5 }, (_, i) => {
                    const d = new Date(now);
                    d.setDate(now.getDate() - (4 - i));
                    return {
                        label: weekdayLabels[d.getDay()],
                        dateStr: d.toLocaleDateString('en-IN')
                    };
                });

                chartLabels = labelsAndDates.map(ld => ld.label);
                const dailyOrganic = Array(5).fill(0);
                const dailyUpsell = Array(5).fill(0);

                const dateMap = {};
                labelsAndDates.forEach((ld, index) => {
                    dateMap[ld.dateStr] = index;
                });

                fetchedOrders.forEach(order => {
                    const orderDateStr = order.placeDate.toLocaleDateString('en-IN');
                    const dayIndex = dateMap[orderDateStr];
                    if (dayIndex !== undefined) {
                        order.items.forEach(item => {
                            if (item.upsell) {
                                dailyUpsell[dayIndex] += item.subTotal;
                            } else {
                                dailyOrganic[dayIndex] += item.subTotal;
                            }
                        });
                    }
                });
                chartOrganicData = dailyOrganic;
                chartUpsellData = dailyUpsell;
            }

            setSalesData({
                organicTotal,
                upsellTotal,
                totalSales,
                shoptoFees,
                chartLabels,
                chartOrganicData,
                chartUpsellData,
            });

        } catch (err) {
            console.log('Error fetching orders:', err);
        }
    };


    useEffect(() => {
        fetchOrders(period);
    }, [period, t]);



    useEffect(() => {
        if (!canvasRef.current) return;
        if (chartRef.current) chartRef.current.destroy();

        const ctx = canvasRef.current.getContext('2d');

        chartRef.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: salesData.chartLabels,
                datasets: [
                    {
                        label: t('aiMenuOrganicSales'),
                        data: salesData.chartOrganicData,
                        backgroundColor: 'rgba(255, 90, 95, 0.9)', // primary
                        borderColor: '#FF5A5F',
                        borderWidth: 1,
                        stack: 'sales'
                    },
                    {
                        label: t('aiMenuUpsellSales'),
                        data: salesData.chartUpsellData,
                        backgroundColor: 'rgba(255, 239, 239, 0.9)', // warm-accent
                        borderColor: '#ffefef',
                        borderWidth: 1,
                        stack: 'sales'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const val = ctx.parsed.y || 0;
                                return `${ctx.dataset.label}: ${formatCurrency(val)}`;
                            },
                            footer: function (items) {
                                const total = items.reduce((sum, it) => sum + (it.parsed.y || 0), 0);
                                return `${t('aiMenuTotal')}: ${formatCurrency(total)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: '#6b7280' }
                    },
                    y: {
                        stacked: true,
                        ticks: {
                            callback: (val) => `₹${Number(val).toLocaleString('en-IN')}`
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    }
                }
            }
        });

        return () => {
            if (chartRef.current) chartRef.current.destroy();
        };
    }, [salesData]);

    return (
        <div className="space-y-6">
            {/* Header actions for AI Reporting (compact period selector) */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{t('aiMenuSalesReporting')}</h1>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                    >
                        <option value="today">{t('aiMenuToday')}</option>
                        <option value="yesterday">{t('aiMenuYesterday')}</option>
                        <option value="last7">{t('aiMenuLast7Days')}</option>
                        <option value="last30">{t('aiMenuLast30Days')}</option>
                        <option value="custom">{t('aiMenuCustom')}</option>
                    </select>
                </div>
            </div>

            {/* Sales Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">{t('aiMenuOrganicSales')}</p>
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.organicTotal)}</p>
                        </div>
                        <div className="p-3 bg-warm-accent rounded-full">
                            <i className="ph ph-trend-up text-primary text-xl"></i>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">{t('aiMenuUpsellSales')}</p>
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.upsellTotal)}</p>
                        </div>
                        <div className="p-3 bg-warm-accent rounded-full">
                            <i className="ph ph-arrows-left-right text-primary text-xl"></i>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">{t('aiMenuTotalSales')}</p>
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.totalSales)}</p>
                        </div>
                        <div className="p-3 bg-warm-accent rounded-full">
                            <i className="ph ph-currency-circle-dollar text-primary text-xl"></i>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">{t('aiMenuShoptoFees')}</p>
                            <p className="text-2xl font-bold text-gray-900">{formatCurrency(salesData.shoptoFees)}</p>
                            <p className="text-xs text-gray-500 mt-1">{t('aiMenuViaSlabs')}</p>
                        </div>
                        <div className="p-3 bg-warm-accent rounded-full">
                            <i className="ph ph-percent text-primary text-xl"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sales Graph + Right Column */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('aiMenuSalesGraph')}</h3>
                    <div className="h-64">
                        <canvas ref={canvasRef} className="w-full h-full"></canvas>
                    </div>
                </div>

                <div className="space-y-6">
                    <SalesPieChart organicTotal={salesData.organicTotal} upsellTotal={salesData.upsellTotal} />
                </div>
            </div>

            <UpsellInsights orders={orders} />
        </div>
    );
}