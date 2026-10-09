import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { useLanguage } from '../../contexts/LanguageContext.js';

Chart.register(...registerables);

export default function SalesPieChart({ organicTotal, upsellTotal }) {
    const { t } = useLanguage();
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        if (chartRef.current) chartRef.current.destroy();

        const ctx = canvasRef.current.getContext('2d');

        chartRef.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [t('aiMenuOrganicSales'), t('aiMenuUpsellSales')],
                datasets: [{
                    data: [organicTotal, upsellTotal],
                    backgroundColor: [
                        'rgba(255, 90, 95, 0.9)',
                        'rgba(255, 239, 239, 0.9)'
                    ],
                    borderColor: [
                        '#FF5A5F',
                        '#ffefef'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(2) : 0;
                                    label += `₹${context.parsed.toLocaleString('en-IN')} (${percentage}%)`;
                                }
                                return label;
                            },
                            footer: function (items) {
                                const total = items.reduce((sum, it) => sum + (it.parsed || 0), 0);
                                return `${t('aiMenuTotal')}: ${formatCurrency(total)}`;
                            }
                        }
                    }
                }
            }
        });

        return () => {
            if (chartRef.current) chartRef.current.destroy();
        };
    }, [organicTotal, upsellTotal]);

    const formatCurrency = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;
    const totalSales = organicTotal + upsellTotal;
    const organicPercentage = totalSales > 0 ? ((organicTotal / totalSales) * 100).toFixed(1) : 0;
    const upsellPercentage = totalSales > 0 ? ((upsellTotal / totalSales) * 100).toFixed(1) : 0;

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('aiMenuSalesBreakdown')}</h3>
            <div className="h-48">
                <canvas ref={canvasRef} className="w-full h-full"></canvas>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center py-2">
                    <div className="flex items-center">
                        <span className="w-3 h-3 rounded-full bg-primary mr-2"></span>
                        <span className="text-sm text-gray-600">{t('aiMenuOrganicSales')}</span>
                    </div>
                    <div className="text-right">
                        <span className="text-sm font-semibold text-gray-800">{formatCurrency(organicTotal)}</span>
                        <span className="text-xs text-gray-500 ml-2">({organicPercentage}%)</span>
                    </div>
                </div>
                <div className="flex justify-between items-center py-2">
                    <div className="flex items-center">
                        <span className="w-3 h-3 rounded-full bg-warm-accent mr-2"></span>
                        <span className="text-sm text-gray-600">{t('aiMenuUpsellSales')}</span>
                    </div>
                    <div className="text-right">
                        <span className="text-sm font-semibold text-gray-800">{formatCurrency(upsellTotal)}</span>
                        <span className="text-xs text-gray-500 ml-2">({upsellPercentage}%)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}