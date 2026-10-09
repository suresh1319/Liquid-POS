// Order Status Enum for Shopto
export const OrderStatus = {
    PLACED: "PLACED",
    ACCEPTED: "ACCEPTED",
    KITCHEN: "KITCHEN",
    READY: "READY",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    REJECTED: "REJECTED",

    // Get status label for display
    getLabel(status) {
        switch (status) {
            case this.PLACED: return "Order Placed";
            case this.ACCEPTED: return "Order Accepted";
            case this.KITCHEN: return "In Kitchen";
            case this.READY: return "Ready for Pickup";
            case this.COMPLETED: return "Completed";
            case this.CANCELLED: return "Cancelled";
            case this.REJECTED: return "Rejected";
            default: return status;
        }
    },

    // Get status icon class
    getIcon(status) {
        switch (status) {
            case this.PLACED: return "ph ph-check-circle";
            case this.ACCEPTED: return "ph ph-thumbs-up";
            case this.KITCHEN: return "ph ph-cooking-pot";
            case this.READY: return "ph ph-package";
            case this.COMPLETED: return "ph ph-check-circle";
            case this.CANCELLED: return "ph ph-x-circle";
            case this.REJECTED: return "ph ph-x-circle";
            default: return "ph ph-circle";
        }
    },

    // Get status color
    getColor(status) {
        switch (status) {
            case this.PLACED: return "blue";
            case this.ACCEPTED: return "green";
            case this.KITCHEN: return "orange";
            case this.READY: return "purple";
            case this.COMPLETED: return "green";
            case this.CANCELLED: return "red";
            case this.REJECTED: return "red";
            default: return "gray";
        }
    }
};
