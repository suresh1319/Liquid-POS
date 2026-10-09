// Centralized pricing logic for Liquid-POS

function getEffectiveBasePriceForItem(item) {
  // Placeholder: evolve logic here as needed
  // Example: use item.overridePrice if present, else item.price
  return typeof item.overridePrice === 'number' ? item.overridePrice : item.price;
}

function getLineTotal(item) {
  const basePriceRaw = getEffectiveBasePriceForItem(item);
  const basePrice = Number.isFinite(basePriceRaw) ? basePriceRaw : 0;
  const addonsTotal = Array.isArray(item.addons)
      ? item.addons.reduce((sum, addon) => sum + (Number.isFinite(addon.price) ? addon.price : 0), 0)
      : 0;
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 1;
  const total = (basePrice + addonsTotal) * quantity;
  return Number.isFinite(total) ? total : 0;
}

function getCartTotal(cart) {
  return cart.reduce((sum, item) => sum + getLineTotal(item), 0);
}
module.exports = {
  getEffectiveBasePriceForItem,
  getLineTotal,
  getCartTotal
};
