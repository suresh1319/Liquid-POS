import { useState, useMemo } from 'react';
import { ModalManager } from '../ModalManager.js';
import { useLanguage } from '../../contexts/LanguageContext.js';

export default function UpsellInsights({ orders }) {
  const { t } = useLanguage();
  const [view, setView] = useState('bestSellers'); // 'bestSellers' or 'topUpsells'
  const [sortBy, setSortBy] = useState('revenue');

  const processedData = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    if (view === 'bestSellers') {
      const productInsights = {};
      orders.forEach(order => {
        const regularItems = order.items.filter(item => !item.upsell);
        const upsoldItems = order.items.filter(item => item.upsell);
        if (upsoldItems.length === 0) return;

        regularItems.forEach(mainItem => {
          const mainProductKey = mainItem.pid || mainItem.title;
          if (!productInsights[mainProductKey]) {
            productInsights[mainProductKey] = { name: mainItem.title, image: mainItem.thumb, revenue: 0, units: 0, orderCount: 0, soldTogether: {} };
          }
          const insight = productInsights[mainProductKey];
          insight.revenue += mainItem.subTotal;
          insight.units += mainItem.qnt;
          insight.orderCount++;

          upsoldItems.forEach(upsoldItem => {
            const companionKey = upsoldItem.pid || upsoldItem.title;
            if (!insight.soldTogether[companionKey]) {
              insight.soldTogether[companionKey] = { name: upsoldItem.title, image: upsoldItem.thumb, quantity: 0, revenue: 0, inOrders: new Set() };
            }
            const companion = insight.soldTogether[companionKey];
            companion.quantity += upsoldItem.qnt;
            companion.revenue += upsoldItem.subTotal;
            companion.inOrders.add(order.id);
          });
        });
      });
      const finalInsights = Object.values(productInsights).map(insight => {
        const soldTogetherArray = Object.values(insight.soldTogether).map(companion => {
          const percentage = ((companion.inOrders.size / insight.orderCount) * 100).toFixed(1);
          return { ...companion, percentage };
        });
        return { ...insight, soldTogether: soldTogetherArray };
      });
      return finalInsights.sort((a, b) => sortBy === 'revenue' ? b.revenue - a.revenue : b.units - a.units);

    } else { // Top Upsells
      const upsellInsights = {};
      orders.forEach(order => {
        const regularItems = order.items.filter(item => !item.upsell);
        const upsoldItems = order.items.filter(item => item.upsell);
        if (upsoldItems.length === 0) return;

        upsoldItems.forEach(upsellItem => {
          const upsellKey = upsellItem.pid || upsellItem.title;
          if (!upsellInsights[upsellKey]) {
            upsellInsights[upsellKey] = { name: upsellItem.title, image: upsellItem.thumb, revenue: 0, units: 0, orderCount: 0, soldWith: {} };
          }
          const insight = upsellInsights[upsellKey];
          insight.revenue += upsellItem.subTotal;
          insight.units += upsellItem.qnt;
          insight.orderCount++;

          regularItems.forEach(regularItem => {
            const companionKey = regularItem.pid || regularItem.title;
            if (!insight.soldWith[companionKey]) {
              insight.soldWith[companionKey] = { name: regularItem.title, image: regularItem.thumb, quantity: 0, revenue: 0, inOrders: new Set() };
            }
            const companion = insight.soldWith[companionKey];
            companion.quantity += regularItem.qnt;
            companion.revenue += regularItem.subTotal;
            companion.inOrders.add(order.id);
          });
        });
      });
      const finalInsights = Object.values(upsellInsights).map(insight => {
        const soldWithArray = Object.values(insight.soldWith).map(companion => {
          const percentage = ((companion.inOrders.size / insight.orderCount) * 100).toFixed(1);
          return { ...companion, percentage };
        });
        return { ...insight, soldTogether: soldWithArray };
      });
      return finalInsights.sort((a, b) => sortBy === 'revenue' ? b.revenue - a.revenue : b.units - a.units);
    }
  }, [orders, sortBy, view]);

  const handleExport = () => {
    if (!processedData || processedData.length === 0) {
      alert("No data to export.");
      return;
    }

    const rows = [];
    const headers = [
      "Main Product", "Main Product Revenue", "Main Product Units",
      "Companion Product", "Companion Quantity", "Companion Revenue", "% Orders with Main Product"
    ];
    rows.push(headers);

    processedData.forEach(product => {
      if (product.soldTogether && product.soldTogether.length > 0) {
        product.soldTogether.forEach(companion => {
          const row = [
            `"${product.name}"`,
            product.revenue,
            product.units,
            `"${companion.name}"`,
            companion.quantity,
            companion.revenue,
            `${companion.percentage}%`
          ];
          rows.push(row);
        });
      } else {
        const row = [
          `"${product.name}"`,
          product.revenue,
          product.units,
          "N/A", "N/A", "N/A", "N/A"
        ];
        rows.push(row);
      }
    });

    let csvContent = "data:text/csv;charset=utf-8,";
    rows.forEach(rowArray => {
      let row = rowArray.join(",");
      csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${view}_insights.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{view === 'bestSellers' ? t('aiMenuBestSellers') : t('aiMenuTopUpsells')}</h2>
          <p className="text-sm text-gray-600">
            {view === 'bestSellers'
              ? t('aiMenuSeeWhichUpsells')
              : t('aiMenuDiscoverOrganic')}
          </p>
        </div>
        <button onClick={handleExport} className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
          <i className="ph ph-download-simple mr-2"></i>
          {t('aiMenuExportCSV')}
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex space-x-1 bg-gray-200 p-1 rounded-md">
          <button onClick={() => setView('bestSellers')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${view === 'bestSellers' ? 'bg-white text-primary shadow' : 'text-gray-700'}`}>
            <i className="ph ph-star mr-2"></i>
            {t('aiMenuBestSellers')}
          </button>
          <button onClick={() => setView('topUpsells')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${view === 'topUpsells' ? 'bg-white text-primary shadow' : 'text-gray-700'}`}>
            <i className="ph ph-arrow-up mr-2"></i>
            {t('aiMenuTopUpsells')}
          </button>
        </div>
        <div className="flex items-center">
          <span className="text-sm font-medium text-gray-700 mr-4">{t('aiMenuSortBy')}</span>
          <div className="flex space-x-2">
            <button onClick={() => setSortBy('revenue')} className={`px-4 py-2 border rounded-md text-sm font-medium ${sortBy === 'revenue' ? 'bg-primary-light border-primary text-primary' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
              {t('aiMenuRevenue')}
            </button>
            <button onClick={() => setSortBy('units')} className={`px-4 py-2 border rounded-md text-sm font-medium ${sortBy === 'units' ? 'bg-primary-light border-primary text-primary' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
              {t('aiMenuQuantity')}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
      {processedData.map((product) => (
          <ProductUpsellCard key={product.name} product={product} t={t} />
        ))}
      </div>
    </div>
  );
}

const ProductUpsellCard = ({ product, t }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCreateOffer = () => {
    const content = `
      <div class="text-center p-4">
        <div class="flex justify-center items-center w-12 h-12 mx-auto bg-primary-light rounded-full">
          <i class="ph ph-magic-wand text-primary text-2xl"></i>
        </div>
        <p class="text-lg font-medium text-gray-800 mt-4">${t('aiMenuComingSoon')}</p>
        <p class="mt-2 text-gray-600">${t('aiMenuAiPromotions')}</p>
      </div>
    `;
    const actions = `
      <div class="flex justify-center">
        <button id="register-interest-btn" class="flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">
          <i class="ph ph-bell mr-2"></i>
          ${t('aiMenuRegisterInterest')}
        </button>
      </div>
    `;

    ModalManager.createCenterModal({
      id: 'create-offer-modal',
      title: t('aiMenuAiPromotions'),
      content: content,
      actions: actions,
      onShown: (modalControl) => {
        document.getElementById('register-interest-btn').addEventListener('click', () => {
          ModalManager.showToast(t('aiMenuThankYouInterest'), { type: 'success' });
          modalControl.close();
        });
      }
    });
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <img src={product.image} alt={product.name} className="w-16 h-16 rounded-md mr-4" />
          <div>
            <h3 className="text-lg font-bold text-gray-900">{product.name}</h3>
            <p className="text-sm text-gray-600">
              ₹{product.revenue} • {product.units} units
            </p>
          </div>
        </div>
        <div className="flex items-center">
          {isExpanded ? (
            <>
              <span className="text-lg font-bold text-gray-900 mr-4">₹{product.revenue}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateOffer();
                }}
                className="flex items-center px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-dark"
              >
                <i className="ph ph-magic-wand mr-2"></i>
                {t('aiMenuCreateOffer')}
              </button>
            </>
          ) : (
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4">
          <h4 className="font-bold text-gray-800 mb-2">{t('aiMenuSoldTogether')}</h4>
          <table className="w-full text-sm text-left text-gray-600">
            <thead>
              <tr className="text-xs text-gray-700 uppercase bg-gray-50">
                <th scope="col" className="px-6 py-3">#</th>
                <th scope="col" className="px-6 py-3">{t('aiMenuProduct')}</th>
                <th scope="col" className="px-6 py-3">{t('aiMenuQuantity')}</th>
                <th scope="col" className="px-6 py-3">{t('aiMenuCompanionRevenue')}</th>
                <th scope="col" className="px-6 py-3">{t('aiMenuOrders')}</th>
              </tr>
            </thead>
            <tbody>
              {product.soldTogether?.map((item, itemIndex) => (
                <tr key={`${item.name}-${itemIndex}`} className="bg-white border-b">
                  <td className="px-6 py-4">{itemIndex + 1}</td>
                  <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap flex items-center">
                    <img src={item.image} alt={item.name} className="w-8 h-8 rounded-md mr-2" />
                    {item.name}
                  </td>
                  <td className="px-6 py-4">{item.quantity}</td>
                  <td className="px-6 py-4">₹{item.revenue}</td>
                  <td className="px-6 py-4">{item.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};