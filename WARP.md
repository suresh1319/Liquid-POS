# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Liquid-POS is a modern restaurant management system built as a web application using React and the Shopto SDK. It's a Point of Sale (POS) system designed for restaurants with features for order management, inventory tracking, customer management, and analytics.

## Tech Stack

- **Frontend**: React 18 with vanilla JS (no TypeScript)
- **Build Tool**: Parcel 2.x for bundling and development
- **Styling**: TailwindCSS with custom theme configuration
- **Icons**: Phosphor Icons library (prefix: `ph ph-*`)
- **Backend Integration**: Shopto SDK for database operations, authentication, and business logic
- **Printing**: Custom Bluetooth printing integration for receipts and KOTs

## Common Development Commands

```bash
# Start development server (runs on http://localhost:1234 by default)
npm start

# Build for production
npm run build

# The build outputs to ./dist/ directory with relative paths
```

## Architecture Overview

### Entry Points
- **HTML**: `index.html` - Single page application entry point
- **JavaScript**: `js/main.js` - Main application bootstrap
- **Styles**: `styles.css` - Global styles with TailwindCSS imports

### Core Application Structure

```
js/
├── main.js              # App initialization and providers setup
├── App.js               # Main app component with navigation
├── sdk.js               # Shopto SDK integration and initialization
├── contexts/            # React context providers
│   ├── OrderContext.js  # Order management state
│   └── ProfileContext.js # User profile and store settings
├── pages/               # Main application pages
│   ├── Dashboard.js     # Restaurant dashboard with tables/orders
│   ├── POS.js          # Point of sale interface
│   ├── Products.js     # Product/inventory management
│   ├── Customers.js    # Customer management
│   ├── Passbook.js     # Financial transactions
│   ├── Analytics.js    # Sales analytics and reports
│   └── ReportsPage.js  # Detailed reporting
├── components/         # Reusable UI components
├── models/            # Data models and business logic
├── utils/             # Utility functions and helpers
└── ...
```

### State Management Architecture

The application uses React Context API for state management with two main contexts:

1. **ProfileContext** (`js/contexts/ProfileContext.js`):
   - Manages seller profile data, store settings, and user roles
   - Handles bill number generation and table management
   - Integrates with UserSession utility for persistence

2. **OrderContext** (`js/contexts/OrderContext.js`):
   - Manages active and completed orders with real-time updates
   - Provides order filtering by tables, channels, and status
   - Handles pagination for large order datasets

### Shopto SDK Integration

The application heavily relies on the Shopto SDK (`js/sdk.js`) which provides:
- Database operations via Firestore-like API
- User authentication and profile management
- Analytics event tracking
- Real-time data synchronization

Key SDK usage patterns:
```javascript
// Database operations
sdk.db.collection("Orders").where("status", "==", "KITCHEN").onSnapshot(callback)

// Profile management
sdk.profile.get() // Get current store profile
sdk.profile.onSnapshot(callback) // Listen to profile changes
```

### Data Models

The application uses JavaScript classes for data modeling:
- `Order.js` - Order structure and business logic
- `Product.js` - Product/inventory items
- `ProfileInfo.js` - Store profile and settings
- `OrderStatus.js` - Order status definitions
- `PaymentMode.js` - Payment method definitions
- `Role.js` - User role and permission management

### Printing System

Custom Bluetooth printing integration (`js/utils/BluetoothPrinting.js`):
- Supports bill receipts and Kitchen Order Tickets (KOT)
- Configurable print templates via `PrintTemplate.js`
- Fallback to screenshot-based printing using html2canvas

### Navigation & UI

- **Multi-platform Navigation**: Responsive design with sidebar (desktop) and bottom navigation (mobile)
- **Modal System**: Centralized modal management via `ModalManager.js`
- **Theme**: Custom TailwindCSS configuration with warm color palette and restaurant-focused design

### Real-time Features

- Live order updates using Firestore listeners
- Real-time table status updates
- Automatic UI refresh on data changes
- QR code order integration with live assignment

## Git Workflow (Important)

This project follows a strict Git workflow with branch protection:

- **main**: Production branch (protected - no direct commits)
- **development**: Integration branch (protected - no direct commits)  
- **feature-***: Working branches created from development

### Workflow Steps:
1. Always start with: `git checkout development && git pull origin development`
2. Create feature branch: `git checkout -b feature-your-feature-name development`
3. Make changes and commit with clear messages
4. Before pushing: `git pull origin development` (handle conflicts if any)
5. Push branch: `git push -u origin feature-your-feature-name`
6. Create pull request from feature branch to development

**Never** commit directly to main or development branches.

## Development Guidelines

### Icons
- Use Phosphor Icons exclusively with `ph ph-*` prefix
- For missing images, use semantic Phosphor icons (`ph ph-user`, `ph ph-storefront`, `ph ph-image`)

### Dependencies
- Avoid NPM package dependencies when possible
- Load JavaScript libraries directly from trusted CDNs using script tags
- Current CDN dependencies: Phosphor Icons, QRCode.js, html2canvas, modern-screenshot

### Code Style
- Use React functional components with hooks
- Maintain consistent error handling and loading states
- Follow existing naming conventions and file organization
- Use TailwindCSS classes following the existing design system

## Key Configuration Files

- `tailwind.config.js` - TailwindCSS configuration with custom theme
- `.parcelrc` - Parcel bundler configuration
- `posthtml.config.js` - HTML processing configuration
- `package.json` - Project dependencies and scripts

## Testing

The project includes several test files for core functionality:
- `test-product-model.js` - Product model testing
- `test-variations.js` - Product variation testing
- `test-daterange-utils.js` - Date utility testing
- `test-config.js` - Configuration testing

## Debugging Features

- Global `printTest()` function for testing Bluetooth printing
- Console logging throughout the application for debugging
- Error boundaries and fallback handling for SDK integration
- UserSession utility for debugging user state

## Performance Considerations

- Lazy loading of order data with pagination
- Real-time listeners with appropriate limits (50 active orders)
- Optimized TailwindCSS builds with safelist configuration
- Efficient re-rendering with React.memo and useCallback hooks
