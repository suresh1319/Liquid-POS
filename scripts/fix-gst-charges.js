#!/usr/bin/env node
/**
 * fix-gst-charges.js
 *
 * Safe audit (and optional fix) for Products/Orders that have GST/CGST/SGST charges with value == 0.
 * Usage (dry-run):
 *   node scripts/fix-gst-charges.js --collections=products,orders --percent=2.5
 * To apply changes (BE CAREFUL):
 *   SET-Item -Path Env:GOOGLE_APPLICATION_CREDENTIALS -Value 'C:\path\to\service-account.json'
 *   node scripts/fix-gst-charges.js --collections=products,orders --percent=2.5 --apply
 *
 * The script writes a report to ./fix-gst-report.json (dry-run or after apply).
 */

import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage() {
  console.log('\nfix-gst-charges.js - audit and optionally fix GST charges with value 0');
  console.log('\nOptions:');
  console.log('  --collections=products,orders   which collections to scan (comma-separated). Default: products,orders');
  console.log('  --percent=2.5                  tax percentage to set when applying fixes (default: 2.5)');
  console.log('  --apply                        actually perform writes (without this, script runs in dry-run mode)');
  console.log('  --inferPercent                 when scanning, treat numeric values <=100 as percentages (default: true)');
  console.log('  --help                         show this help');
  console.log('\nExamples:');
  console.log("  node scripts/fix-gst-charges.js --collections=products --percent=2.5");
  console.log("  node scripts/fix-gst-charges.js --collections=orders --apply --percent=2.5");
  console.log('\nIMPORTANT: When running with --apply, ensure your service account key is set via GOOGLE_APPLICATION_CREDENTIALS.');
}

const argv = process.argv.slice(2).reduce((acc, cur) => {
  const [k, v] = cur.split('=');
  if (k && k.startsWith('--')) {
    const key = k.replace(/^--/, '');
    acc[key] = typeof v === 'undefined' ? true : v;
  }
  return acc;
}, {});

if (argv.help) {
  usage();
  process.exit(0);
}

const collectionsArg = (argv.collections || 'products,orders').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const applyChanges = Boolean(argv.apply);
const targetPercent = Number(argv.percent || 2.5);
const inferPercent = argv.inferPercent !== 'false';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.warn('WARNING: GOOGLE_APPLICATION_CREDENTIALS not set. The script requires a service account key to run against Firestore.');
  console.warn('Set it in PowerShell like:');
  console.warn("  SET-Item -Path Env:GOOGLE_APPLICATION_CREDENTIALS -Value 'C:\\\\path\\\\to\\\\service-account.json'");
  console.warn('Continuing in dry-run mode (no writes) unless --apply is provided and credentials are present.');
}

// Initialize Firebase Admin
try {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
} catch (e) {
  // If already initialized (during repeated runs), ignore
}

const db = admin.firestore();

function looksLikeGstName(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return n.includes('gst') || n.includes('cgst') || n.includes('sgst') || n.includes('central') || n.includes('state') || n.includes('vat');
}

async function scanProducts() {
  console.log('Scanning Products collection for GST charges with value == 0...');
  const q = db.collection('Products');
  const snapshot = await q.get();
  const report = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const charges = Array.isArray(data.charges) ? data.charges : [];
    const matches = [];
    charges.forEach((c, idx) => {
      try {
        const val = ((c && (c.value !== undefined)) ? c.value : null);
        const numeric = Number(val);
        const isZero = numeric === 0;
        if (looksLikeGstName(c && (c.name || c.displayName || c.label)) && (isZero || val === 0 || val === '0' || val === '0.00')) {
          matches.push({ index: idx, entry: c });
        }
      } catch (e) { /* ignore individual parse errors */ }
    });

    if (matches.length > 0) {
      report.push({ docId: doc.id, path: `Products/${doc.id}`, matches, docRef: doc.ref.path });
    }
  }
  return report;
}

async function scanOrders() {
  console.log('Scanning Orders collection for GST charges with value == 0...');
  const q = db.collection('Orders');
  // This could be large in real systems; consider adding filters or running on a smaller dataset
  const snapshot = await q.get();
  const report = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const charges = Array.isArray(data.charges) ? data.charges : [];
    const matches = [];
    charges.forEach((c, idx) => {
      try {
        const val = ((c && (c.value !== undefined)) ? c.value : null);
        const numeric = Number(val);
        const isZero = numeric === 0;
        if (looksLikeGstName(c && (c.name || c.displayName || c.label)) && (isZero || val === 0 || val === '0' || val === '0.00')) {
          matches.push({ index: idx, entry: c });
        }
      } catch (e) { /* ignore */ }
    });

    if (matches.length > 0) {
      report.push({ docId: doc.id, path: `Orders/${doc.id}`, matches, docRef: doc.ref.path });
    }
  }
  return report;
}

async function applyFixesOnProducts(report, percent) {
  console.log('\nApplying fixes to Products (only executed if --apply provided)');
  const changes = [];
  for (const r of report) {
    const ref = db.doc(r.docRef);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() || {};
    const charges = Array.isArray(data.charges) ? data.charges : [];
    let changed = false;
    const newCharges = charges.map(c => {
      try {
        if (looksLikeGstName(c && (c.name || c.displayName || c.label))) {
          const numeric = Number(c.value || 0);
          if (numeric === 0) {
            changed = true;
            const updated = { ...c, value: percent };
            return updated;
          }
        }
      } catch (e) {}
      return c;
    });

    if (changed) {
      if (applyChanges && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          await ref.update({ charges: newCharges });
          changes.push({ path: r.path, updatedChargesCount: newCharges.length });
          console.log(`Updated ${r.path}`);
        } catch (e) {
          console.error(`Failed to update ${r.path}:`, e.message || e);
        }
      } else {
        changes.push({ path: r.path, wouldUpdate: true });
      }
    }
  }
  return changes;
}

async function applyFixesOnOrders(report, percent) {
  console.log('\nApplying fixes to Orders (only executed if --apply provided)');
  const changes = [];
  for (const r of report) {
    const ref = db.doc(r.docRef);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() || {};
    const charges = Array.isArray(data.charges) ? data.charges : [];
    let changed = false;
    const newCharges = charges.map(c => {
      try {
        if (looksLikeGstName(c && (c.name || c.displayName || c.label))) {
          const numeric = Number(c.value || 0);
          if (numeric === 0) {
            changed = true;
            const updated = { ...c, value: percent };
            return updated;
          }
        }
      } catch (e) {}
      return c;
    });

    // Optionally recompute calculatedCharges and totalTaxAmount (best-effort)
    let calculatedCharges = Array.isArray(data.calculatedCharges) ? data.calculatedCharges : [];
    try {
      // Compute subtotal from items
      const items = Array.isArray(data.items) ? data.items : [];
      const subtotal = items.reduce((s, it) => s + (Number(it.price || it.basePrice || 0) * (Number(it.qnt || it.quantity || 1) || 1)), 0);
      let computed = [];
      let totalTaxAmount = 0;
      for (const c of newCharges) {
        try {
          const name = (c.name || c.displayName || c.label || '').toString();
          const type = c.type || (String(c.value || '').includes('%') ? 'percentage' : 'fixed');
          let amt = 0;
          if (type === 'percentage' || (c.value && String(c.value).includes('%'))) {
            const pct = typeof c.value === 'string' ? parseFloat(String(c.value).replace('%','').trim()) : Number(c.value);
            if (!isNaN(pct)) {
              amt = (subtotal * pct) / 100;
            }
          } else {
            amt = Number(c.value || 0);
          }
          // consider only tax-like entries
          if (looksLikeGstName(name) && amt > 0) {
            computed.push({ name, calculatedAmount: amt, displayName: `${name} (${c.value})` });
            totalTaxAmount += amt;
          }
        } catch (e) {}
      }
      if (computed.length > 0) {
        calculatedCharges = computed;
        data.totalTaxAmount = totalTaxAmount;
      }
    } catch (e) { /* ignore compute errors */ }

    if (changed) {
      if (applyChanges && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          const updatePayload = { charges: newCharges };
          if (calculatedCharges && calculatedCharges.length > 0) {
            updatePayload.calculatedCharges = calculatedCharges;
            updatePayload.totalTaxAmount = Number(data.totalTaxAmount || 0);
          }
          await ref.update(updatePayload);
          changes.push({ path: r.path, updatedChargesCount: newCharges.length, updatedCalculated: calculatedCharges.length });
          console.log(`Updated ${r.path}`);
        } catch (e) {
          console.error(`Failed to update ${r.path}:`, e.message || e);
        }
      } else {
        changes.push({ path: r.path, wouldUpdate: true, updatedCalculated: calculatedCharges.length });
      }
    }
  }
  return changes;
}

(async () => {
  try {
    const report = { generatedAt: new Date().toISOString(), collections: {}, summary: {} };

    if (collectionsArg.includes('products')) {
      const p = await scanProducts();
      report.collections.products = p;
      report.summary.productsFound = p.length;
    }

    if (collectionsArg.includes('orders')) {
      const o = await scanOrders();
      report.collections.orders = o;
      report.summary.ordersFound = o.length;
    }

    // Write dry-run report
    const outFile = path.join(__dirname, '..', 'fix-gst-report.json');
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nReport written to ${outFile}`);

    if (applyChanges) {
      console.log('\n--apply specified: performing updates (READ CAREFULLY)');
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.error('GOOGLE_APPLICATION_CREDENTIALS not set — refusing to apply changes without credentials. Aborting apply.');
        process.exit(1);
      }

      if (collectionsArg.includes('products')) {
        const changes = await applyFixesOnProducts(report.collections.products || [], targetPercent);
        console.log('Product changes:', changes.length);
      }
      if (collectionsArg.includes('orders')) {
        const changes = await applyFixesOnOrders(report.collections.orders || [], targetPercent);
        console.log('Order changes:', changes.length);
      }

      console.log('\nApply complete. A new report (pre-apply) is available at fix-gst-report.json.');
    } else {
      console.log('\nDry-run complete. To apply changes, run again with --apply and ensure GOOGLE_APPLICATION_CREDENTIALS is set.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Script error:', err);
    process.exit(2);
  }
})();
