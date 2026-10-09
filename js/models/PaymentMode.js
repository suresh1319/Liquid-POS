// Payment Mode Enum for Shopto
export const PaymentMode = {
    CASH: "CASH",
    CARD: "CARD",
    UPI: "UPI",
    ONLINE: "ONLINE",
    WALLET: "WALLET",
    UNSETTLED: "UNSETTLED",

    // Get payment mode label for display
    getLabel(mode) {
        switch (mode) {
            case this.CASH: return "Cash";
            case this.CARD: return "Card";
            case this.UPI: return "UPI";
            case this.ONLINE: return "Online";
            case this.WALLET: return "Wallet";
            case this.UNSETTLED: return "Unsettled";
            default: return mode;
        }
    },

    // Get payment mode icon class
    getIcon(mode) {
        switch (mode) {
            case this.CASH: return "ph ph-money";
            case this.CARD: return "ph ph-credit-card";
            case this.UPI: return "ph ph-qr-code";
            case this.ONLINE: return "ph ph-bank";
            case this.WALLET: return "ph ph-wallet";
            case this.UNSETTLED: return "ph ph-clock-clockwise";
            default: return "ph ph-currency-inr";
        }
    }
};
