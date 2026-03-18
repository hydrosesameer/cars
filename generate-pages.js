// Script to generate all separate HTML page files from the existing index.html
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

// Common sidebar HTML (shared across all pages)
function getSidebar(activePage) {
  const items = [
    { href: 'index.html', icon: 'fa-th-large', label: 'Dashboard', page: 'dashboard' },
    { label: 'Transactions', type: 'label' },
    { href: 'inward.html', icon: 'fa-arrow-down', label: 'Inward Billing', page: 'inward' },
    { href: 'outward.html', icon: 'fa-arrow-up', label: 'Outward Billing', page: 'outward' },
    { href: 'stock.html', icon: 'fa-boxes', label: 'Current Stock', page: 'stock' },
    { label: 'Reports (A3)', type: 'label' },
    { href: 'form-a.html', icon: 'fa-file-invoice', label: 'Form-A Ledger', page: 'form-a' },
    { href: 'form-b.html', icon: 'fa-file-contract', label: 'Form-B Monthly', page: 'form-b' },
    { label: 'Inventory Reports', type: 'label' },
    { href: 'consignment-stock.html', icon: 'fa-chart-pie', label: 'Consignment Stock', page: 'consignment-stock' },
    { href: 'detailed-stock.html', icon: 'fa-list-ul', label: 'Detailed Stock', page: 'detailed-stock' },
    { href: 'shipping-bill.html', icon: 'fa-file-export', label: 'Shipping Bill', page: 'shipping-bill' },
    { label: 'Master Data', type: 'label' },
    { href: 'items.html', icon: 'fa-wine-bottle', label: 'Items / Products', page: 'items' },
    { href: 'consignments.html', icon: 'fa-building', label: 'Consignments', page: 'consignments' },
    { href: 'airline-masters.html', icon: 'fa-plane', label: 'Airline Masters', page: 'airline-masters' },
  ];

  let nav = '';
  for (const item of items) {
    if (item.type === 'label') {
      nav += `          <div class="nav-label">${item.label}</div>\n`;
    } else {
      const active = item.page === activePage ? ' active' : '';
      nav += `          <a href="${item.href}" class="nav-item${active}"><i class="fas ${item.icon}"></i> <span>${item.label}</span></a>\n`;
    }
  }
  return nav;
}

function getHeader() {
  return `        <header class="top-bar">
          <div class="search-box">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search bond no, BE no, flight..." id="global-search" />
          </div>
          <div class="top-actions">
            <button class="btn btn-primary" onclick="window.location.href='inward-entry.html'">
              <i class="fas fa-plus"></i> New Inward
            </button>
            <button class="btn btn-secondary" onclick="window.location.href='outward-entry.html'">
              <i class="fas fa-plus"></i> New Outward
            </button>
            <div class="divider"></div>
            <button class="icon-btn" title="Refresh" onclick="window.location.reload()">
              <i class="fas fa-sync-alt"></i>
            </button>
            <button class="icon-btn" title="Settings">
              <i class="fas fa-cog"></i>
            </button>
          </div>
        </header>`;
}

function buildPage(title, activePage, content, initScript, extras = '') {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} - CAFS Inventory</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="css/index.css" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css">
    <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
  </head>
  <body>
    <div class="app-container">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo-box"><i class="fas fa-plane-arrival"></i></div>
          <div class="logo-text">CAFS <span>Inventory</span></div>
        </div>
        <nav class="sidebar-nav">
${getSidebar(activePage)}        </nav>
        <div class="sidebar-footer">
          <div class="user-profile">
            <div class="user-avatar">CA</div>
            <div class="user-info">
              <div class="user-name">Warehouse Mgr</div>
              <div class="user-role">Cok15003</div>
            </div>
          </div>
        </div>
      </aside>

      <main class="main-content">
${getHeader()}
        <div class="content-body">
${content}
        </div>
      </main>
    </div>
${extras}
    <div id="toast-container" class="toast-container"></div>
    <script src="js/app.js"></script>
    ${initScript}
  </body>
</html>
`;
}

// Define all pages
const pages = {
  'outward.html': {
    title: 'Outward Register',
    activePage: 'outward',
    content: `          <div class="page-header">
            <h1 class="page-title">Outward Register</h1>
            <button class="btn btn-primary" onclick="window.location.href='outward-entry.html'">
              <i class="fas fa-plus"></i> New Entry
            </button>
          </div>
          <div class="card">
            <div class="card-body" style="padding: 0">
              <table class="table" id="outward-table">
                <thead>
                  <tr>
                    <th>Dispatch Date</th>
                    <th>Flight No</th>
                    <th>Consignment</th>
                    <th>Inward Bond</th>
                    <th>Items Dispatched</th>
                    <th>Total Qty</th>
                    <th>Bag Returns</th>
                    <th>Net Out</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await loadOutwardPage(); });</script>`,
  },

  'inward-entry.html': {
    title: 'New Inward Billing',
    activePage: 'inward',
    content: `          <div class="page-header">
              <h1 class="page-title" id="inward-form-title">New Inward Billing</h1>
              <div class="page-actions">
                <button class="btn btn-secondary" onclick="window.location.href='inward.html'">Cancel</button>
                <button class="btn btn-primary" onclick="saveInwardPage()">
                  <i class="fas fa-save"></i> Save Inward Entry
                </button>
              </div>
            </div>
            <div class="billing-form-grid" id="inward-billing-form">
              <div class="card form-section">
                <div class="card-header"><h3 class="card-title">Bill of Entry Details</h3></div>
                <div class="card-body">
                  <div class="form-grid-3">
                    <div class="form-group">
                      <label class="form-label">BE No *</label>
                      <input type="text" class="form-control" id="inw-be-no" placeholder="e.g. 7848211" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">BE Date *</label>
                      <input type="date" class="form-control" id="inw-be-date" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Customs Station</label>
                      <input type="text" class="form-control" id="inw-customs-station" value="COK" />
                    </div>
                  </div>
                  <div class="form-grid-3">
                    <div class="form-group">
                      <label class="form-label">Bond No *</label>
                      <input type="text" class="form-control" id="inw-bond-no" placeholder="e.g. 20240224" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Bond Date</label>
                      <input type="date" class="form-control" id="inw-bond-date" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Order Sec 60(1) Date</label>
                      <input type="date" class="form-control" id="inw-sec60-date" />
                    </div>
                  </div>
                  <div class="form-grid-2">
                    <div class="form-group">
                      <label class="form-label">Shipping Bill No (Import)</label>
                      <input type="text" class="form-control" id="inw-import-sb-no" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Import Invoice Sl No</label>
                      <input type="text" class="form-control" id="inw-import-inv-sl" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="card form-section">
                <div class="card-header"><h3 class="card-title">Receipt & Storage</h3></div>
                <div class="card-body">
                  <div class="form-grid-3">
                    <div class="form-group">
                      <label class="form-label">Date of Receipt *</label>
                      <input type="date" class="form-control" id="inw-receipt-date" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Warehouse Code</label>
                      <input type="text" class="form-control" id="inw-wh-code" value="Cok15003" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Duty Rate %</label>
                      <input type="text" class="form-control" id="inw-duty-rate" placeholder="e.g., 18.5" />
                    </div>
                  </div>

                  <div class="form-group" style="margin-top: 1rem">
                    <label class="form-label">Transport Mode *</label>
                    <div style="display: flex; gap: 2rem; margin-top: 0.5rem">
                      <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="radio" name="transport-mode" value="AIRLINE" checked onchange="updateTransportMode('AIRLINE')" />
                        <span style="margin-left: 0.5rem">Airline</span>
                      </label>
                      <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="radio" name="transport-mode" value="SHIP" onchange="updateTransportMode('SHIP')" />
                        <span style="margin-left: 0.5rem">Ship</span>
                      </label>
                      <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="radio" name="transport-mode" value="ROAD" onchange="updateTransportMode('ROAD')" />
                        <span style="margin-left: 0.5rem">Road</span>
                      </label>
                    </div>
                  </div>

                  <div class="form-grid-3" style="margin-top: 1rem">
                    <div class="form-group" id="airline-selection">
                      <label class="form-label">Airline Code</label>
                      <select class="form-control" id="inw-airline-code" onchange="updateAirlineName()">
                        <option value="">Select Airline</option>
                      </select>
                    </div>
                    <div class="form-group" id="airline-name-display" style="display: none">
                      <label class="form-label">Airline Name</label>
                      <input type="text" class="form-control" id="inw-airline-name" readonly style="background-color: #f5f5f5" />
                    </div>
                    <div class="form-group" id="ship-selection" style="display: none">
                      <label class="form-label">Ship / Consignment</label>
                      <select class="form-control" id="inw-ship">
                        <option value="">Select Ship</option>
                      </select>
                    </div>
                    <div class="form-group" id="road-selection" style="display: none">
                      <label class="form-label">Transport Registration No *</label>
                      <input type="text" class="form-control" id="inw-transport-reg" placeholder="KL-01-AB-1234" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="card form-section">
                <div class="card-header"><h3 class="card-title">Bonding & Expiry</h3></div>
                <div class="card-body">
                  <div class="form-grid-4">
                    <div class="form-group">
                      <label class="form-label">Initial Bond Date</label>
                      <input type="date" class="form-control" id="inw-bond-start" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Initial Bond Expiry *</label>
                      <input type="date" class="form-control" id="inw-bond-expiry" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Bank Guarantee</label>
                      <input type="text" class="form-control" id="inw-bank-guarantee" placeholder="NA" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Duty Rate</label>
                      <input type="number" class="form-control" id="inw-duty-rate" step="0.0001" />
                    </div>
                  </div>
                  <div class="form-grid-4">
                    <div class="form-group">
                      <label class="form-label">Ext Expiry 1</label>
                      <input type="date" class="form-control" id="inw-ext-exp1" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Ext Expiry 2</label>
                      <input type="date" class="form-control" id="inw-ext-exp2" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Ext Expiry 3</label>
                      <input type="date" class="form-control" id="inw-ext-exp3" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Value Rate</label>
                      <input type="number" class="form-control" id="inw-value-rate" step="0.0001" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="card form-section">
                <div class="card-header">
                  <h3 class="card-title">Items Information</h3>
                  <button class="btn btn-sm btn-primary" onclick="addInwardItemPage()">
                    <i class="fas fa-plus"></i> Add Item Row
                  </button>
                </div>
                <div class="card-body" style="padding: 0">
                  <table class="table billing-table" id="inward-items-billing-table">
                    <thead>
                      <tr>
                        <th>Item / Description</th>
                        <th>Pkg Marks</th>
                        <th>Unit</th>
                        <th>HSN</th>
                        <th>Duty %</th>
                        <th>Qty Adviced</th>
                        <th>Qty Received *</th>
                        <th>Value *</th>
                        <th>Duty *</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="inward-billing-table-tbody"></tbody>
                  </table>
                </div>
              </div>

              <div class="form-actions-bottom">
                <button class="btn btn-lg btn-secondary" onclick="window.location.href='inward.html'">Cancel</button>
                <button class="btn btn-lg btn-primary" onclick="saveInwardPage()">
                  <i class="fas fa-save"></i> Save Complete Entry
                </button>
              </div>
            </div>`,
    initScript: `<datalist id="items-list"></datalist>
    <script>document.addEventListener('DOMContentLoaded', async () => { await initInwardEntry(); });</script>`,
  },

  'outward-entry.html': {
    title: 'New Outward Dispatch',
    activePage: 'outward',
    content: `          <div class="page-header">
              <h1 class="page-title">New Outward Dispatch</h1>
              <div class="page-actions">
                <button class="btn btn-secondary" onclick="window.location.href='outward.html'">Cancel</button>
                <button class="btn btn-primary" onclick="saveOutwardPage()">
                  <i class="fas fa-save"></i> Create Dispatch
                </button>
              </div>
            </div>

            <div class="billing-form-grid" id="outward-dispatch-form">
              <div class="card form-section">
                <div class="card-header"><h3 class="card-title">Dispatch Details</h3></div>
                <div class="card-body">
                  <div class="form-grid-3">
                    <div class="form-group">
                      <label class="form-label">Dispatch Date *</label>
                      <input type="date" class="form-control" id="out-date" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Flight No *</label>
                      <input type="text" class="form-control" id="out-flight" placeholder="e.g. EK531" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Nature of Removal</label>
                      <select class="form-control" id="out-removal-nature">
                        <option value="Re-export">Re-export</option>
                        <option value="Ex-bond Clearance">Ex-bond Clearance</option>
                        <option value="Transfer">Transfer</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-grid-3">
                    <div class="form-group">
                      <label class="form-label">Shipping Bill No</label>
                      <input type="text" class="form-control" id="out-sb-no" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Shipping Bill Date</label>
                      <input type="date" class="form-control" id="out-sb-date" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Means of Transport Reg</label>
                      <input type="text" class="form-control" id="out-transport-reg" />
                    </div>
                  </div>
                  <div class="form-grid-2">
                    <div class="form-group">
                      <label class="form-label">Consignment / Airline</label>
                      <select class="form-control" id="out-consignment" onchange="fetchAvailableForConsignmentPage(this.value)">
                        <option value="">Select Airline</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label class="form-label">Remarks</label>
                      <input type="text" class="form-control" id="out-remarks" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="card form-section">
                <div class="card-header">
                  <h3 class="card-title">Dispatch Items (Stock Lookup)</h3>
                  <button class="btn btn-sm btn-primary" id="btn-add-outward-item-page" onclick="addOutwardItemPage()" disabled>
                    <i class="fas fa-plus"></i> Select from Stock
                  </button>
                </div>
                <div class="card-body" style="padding: 0">
                  <table class="table billing-table" id="outward-items-billing-table">
                    <thead>
                      <tr>
                        <th>Source (Bond - Item)</th>
                        <th>HSN</th>
                        <th>Available Stock</th>
                        <th>Qty to Dispatch *</th>
                        <th>Value (Part)</th>
                        <th>Duty (Part)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="outward-dispatch-table-tbody"></tbody>
                  </table>
                </div>
              </div>
            </div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await initOutwardEntry(); });</script>`,
  },

  'stock.html': {
    title: 'Current Stock',
    activePage: 'stock',
    content: `          <h1 class="page-title">Current Warehouse Stock</h1>
          <div class="card">
            <div class="card-body" style="padding: 0">
              <table class="table" id="stock-table">
                <thead>
                  <tr>
                    <th>Bond No</th>
                    <th>Items List</th>
                    <th>Consignment</th>
                    <th>Total Recv</th>
                    <th>Total Dispatched</th>
                    <th>Bag Returns</th>
                    <th>Available Stock</th>
                    <th>Bond Expiry</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await loadStockPage(); });</script>`,
  },

  'form-a.html': {
    title: 'Form-A Ledger',
    activePage: 'form-a',
    content: `          <div class="report-controls no-print">
              <h1 class="page-title">Form-A Report (A3 Landscape)</h1>
              <div class="form-grid-4">
                <div class="form-group">
                  <select class="form-control" id="forma-item">
                    <option value="">Select Item</option>
                  </select>
                </div>
                <div class="form-group">
                  <input type="text" class="form-control" id="forma-bond" placeholder="Bond No" />
                </div>
                <div class="form-group" style="display: flex; gap: 0.5rem">
                  <input type="date" class="form-control" id="forma-from" />
                  <input type="date" class="form-control" id="forma-to" />
                </div>
                <div class="form-group">
                  <button class="btn btn-primary" onclick="generateFormA()">Generate</button>
                  <button class="btn btn-secondary" onclick="window.print()">
                    <i class="fas fa-print"></i> Print
                  </button>
                </div>
              </div>
            </div>
            <div id="forma-report-container" class="report-print-container landscape-a3"></div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await loadFormAPage(); });</script>`,
  },

  'form-b.html': {
    title: 'Form-B Monthly',
    activePage: 'form-b',
    content: `          <div class="report-controls no-print">
              <h1 class="page-title">Form-B Report (A3 Landscape)</h1>
              <div class="form-grid-4">
                <div class="form-group">
                  <select class="form-control" id="formb-month">
                    <option value="1">January</option>
                    <option value="2">February</option>
                    <option value="3">March</option>
                    <option value="4">April</option>
                    <option value="5">May</option>
                    <option value="6">June</option>
                    <option value="7">July</option>
                    <option value="8">August</option>
                    <option value="9">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                    <option value="12">December</option>
                  </select>
                </div>
                <div class="form-group">
                  <input type="number" class="form-control" id="formb-year" value="2025" />
                </div>
                <div class="form-group">
                  <button class="btn btn-primary" onclick="generateFormB()">Generate</button>
                  <button class="btn btn-secondary" onclick="window.print()">
                    <i class="fas fa-print"></i> Print
                  </button>
                </div>
              </div>
            </div>
            <div id="formb-report-container" class="report-print-container landscape-a3"></div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await loadFormBPage(); });</script>`,
  },

  'shipping-bill.html': {
    title: 'Shipping Bills',
    activePage: 'shipping-bill',
    content: `          <div class="page-header">
              <h1 class="page-title">Shipping Bills</h1>
              <button class="btn btn-primary" onclick="window.location.href='shipping-bill-entry.html'">
                <i class="fas fa-plus"></i> New Shipping Bill
              </button>
            </div>
            <div class="card">
              <div class="card-body" style="padding: 0">
                <table class="table" id="shipping-bills-table">
                  <thead>
                    <tr>
                      <th>SB No</th>
                      <th>Date</th>
                      <th>Flight No</th>
                      <th>Airline</th>
                      <th>Items</th>
                      <th>Total Qty</th>
                      <th>Total Value</th>
                      <th>Total Duty</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await loadShippingBillsListPage(); });</script>`,
  },

  'shipping-bill-entry.html': {
    title: 'New Shipping Bill',
    activePage: 'shipping-bill',
    content: `          <div class="page-header">
              <h1 class="page-title" id="sb-form-title">New Shipping Bill</h1>
              <div class="page-actions">
                <button class="btn btn-secondary" onclick="window.location.href='shipping-bill.html'">Cancel</button>
                <button class="btn btn-primary" onclick="saveShippingBill()">
                  <i class="fas fa-save"></i> Save Shipping Bill
                </button>
              </div>
            </div>

            <div class="billing-form-grid" id="shipping-bill-form">
              <div class="card form-section">
                <div class="card-header"><h3 class="card-title">Shipping Bill Header</h3></div>
                <div class="card-body">
                  <div class="form-grid-3">
                    <div class="form-group">
                      <label class="form-label">Shipping Bill No *</label>
                      <input type="text" class="form-control" id="sb-no" placeholder="e.g. 6E 1237/1238" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Date *</label>
                      <input type="date" class="form-control" id="sb-date" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Airline / Consignment *</label>
                      <select class="form-control" id="sb-consignment"></select>
                    </div>
                  </div>
                  <div class="form-grid-4">
                    <div class="form-group">
                      <label class="form-label">Flight No</label>
                      <input type="text" class="form-control" id="sb-flight" placeholder="e.g. 6E 1237/1238" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">ETD</label>
                      <input type="text" class="form-control" id="sb-etd" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">VT</label>
                      <input type="text" class="form-control" id="sb-vt" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Station</label>
                      <input type="text" class="form-control" id="sb-station" value="COCHIN" />
                    </div>
                  </div>
                  <div class="form-grid-3">
                    <div class="form-group">
                      <label class="form-label">Port of Discharge</label>
                      <input type="text" class="form-control" id="sb-port" value="COK/KWI/COK" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Country of Destination</label>
                      <input type="text" class="form-control" id="sb-country" value="KWI" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Entered No</label>
                      <input type="text" class="form-control" id="sb-entered-no" placeholder="e.g. 1579/2025" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="card form-section">
                <div class="card-header">
                  <h3 class="card-title">Items (Select from Available Stock)</h3>
                  <h3 class="card-title">Items (Select from Available Stock)</h3>
                  <!-- Add Item Button Removed for Continuous Entry -->
                </div>
                <div class="card-body" style="padding: 0">
                  <table class="table billing-table" id="sb-items-table">
                    <thead>
                      <tr>
                        <th>S.No</th>
                        <th>Bond No</th>
                        <th>Expiry Date</th>
                        <th>Description (Size, Brand etc.)</th>
                        <th>Balance Stock</th>
                        <th>QTY</th>
                        <th>Unit Value</th>
                        <th>Value Amount</th>
                        <th>Unit Duty</th>
                        <th>Duty Amount</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="sb-items-tbody"></tbody>
                    <tfoot>
                      <tr style="font-weight: bold; background: var(--bg-hover);">
                        <td colspan="5">TOTAL</td>
                        <td id="sb-total-qty">0</td>
                        <td></td>
                        <td id="sb-total-value">0.00</td>
                        <td></td>
                        <td id="sb-total-duty">0.00</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div class="form-actions-bottom">
                <button class="btn btn-lg btn-secondary" onclick="window.location.href='shipping-bill.html'">Cancel</button>
                <button class="btn btn-lg btn-primary" onclick="saveShippingBill()">
                  <i class="fas fa-save"></i> Save Shipping Bill
                </button>
              </div>
            </div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await initShippingBillEntry(); });</script>`,
  },

  'consignment-stock.html': {
    title: 'Consignment Stock',
    activePage: 'consignment-stock',
    content: `          <div class="report-controls no-print">
              <h1 class="page-title">Consignment-wise Stock Summary</h1>
              <div class="form-actions">
                <button class="btn btn-secondary" onclick="window.print()">
                  <i class="fas fa-print"></i> Print Report
                </button>
              </div>
            </div>
            <div class="card">
              <div class="card-body" style="padding: 0">
                <table class="table" id="consignment-stock-table">
                  <thead>
                    <tr>
                      <th>Consignment</th>
                      <th>Total Inwards</th>
                      <th>Total Received</th>
                      <th>Total Dispatched</th>
                      <th>Current Stock</th>
                      <th>Total Value</th>
                      <th>Total Duty</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await loadConsignmentStockPage(); });</script>`,
  },

  'detailed-stock.html': {
    title: 'Detailed Stock',
    activePage: 'detailed-stock',
    content: `          <div class="report-controls no-print">
              <h1 class="page-title">Detailed Stock Inventory</h1>
              <div class="form-grid-3">
                <div class="form-group">
                  <select class="form-control" id="stock-filter-consignment">
                    <option value="">All Consignments</option>
                  </select>
                </div>
                <div class="form-group">
                  <button class="btn btn-primary" onclick="loadDetailedStockReport()">Filter</button>
                  <button class="btn btn-secondary" onclick="window.print()">
                    <i class="fas fa-print"></i> Print
                  </button>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="card-body" style="padding: 0">
                <table class="table" id="detailed-stock-table">
                  <thead>
                    <tr>
                      <th>BE No / Date</th>
                      <th>Bond No</th>
                      <th>Description</th>
                      <th>Original Qty</th>
                      <th>Available Qty</th>
                      <th>Expiry Date</th>
                      <th>Consignment</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await loadDetailedStockPage(); });</script>`,
  },

  'items.html': {
    title: 'Items / Products',
    activePage: 'items',
    content: `          <div class="page-header">
              <h1 class="page-title">Product Master</h1>
              <button class="btn btn-primary" onclick="openItemModal()">
                <i class="fas fa-plus"></i> Add Product
              </button>
            </div>
            <div class="card">
              <div class="card-body" style="padding: 0">
                <table class="table" id="items-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Description</th>
                      <th>Unit</th>
                      <th>HSN Code</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await loadItemsPage(); });</script>`,
    extras: `    <!-- Modal Overlay (Generic) -->
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">Modal Title</h3>
          <button class="btn-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body" id="modal-body"></div>
        <div class="modal-footer" id="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
          <button class="btn btn-primary" id="modal-submit">Save</button>
        </div>
      </div>
    </div>`,
  },

  'consignments.html': {
    title: 'Consignments',
    activePage: 'consignments',
    content: `          <div class="page-header">
              <h1 class="page-title">Consignments / Airlines</h1>
              <button class="btn btn-primary" onclick="openConsignmentModal()">
                <i class="fas fa-plus"></i> Add Consignment
              </button>
            </div>
            <div class="card">
              <div class="card-body" style="padding: 0">
                <table class="table" id="consignments-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Code</th>
                      <th>Type</th>
                      <th>Address</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await loadConsignmentsPage(); });</script>`,
    extras: `    <!-- Modal Overlay (Generic) -->
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">Modal Title</h3>
          <button class="btn-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body" id="modal-body"></div>
        <div class="modal-footer" id="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
          <button class="btn btn-primary" id="modal-submit">Save</button>
        </div>
      </div>
    </div>`,
  },

  'airline-masters.html': {
    title: 'Airline Masters',
    activePage: 'airline-masters',
    content: `          <div class="page-header">
              <h1 class="page-title">Airline Masters</h1>
              <button class="btn btn-primary" onclick="openAirlineModal()">
                <i class="fas fa-plus"></i> Add Airline
              </button>
            </div>
            <div class="card">
              <div class="card-body" style="padding: 0">
                <table class="table" id="airline-masters-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Airline Name</th>
                      <th>Airline Code</th>
                      <th>IATA Code</th>
                      <th>Address</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            </div>`,
    initScript: `<script>document.addEventListener('DOMContentLoaded', async () => { await loadAirlineMastersPage(); });</script>`,
    extras: `    <!-- Modal Overlay (Generic) -->
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">Modal Title</h3>
          <button class="btn-close" onclick="closeModal()">&times;</button>
        </div>
        <div class="modal-body" id="modal-body"></div>
        <div class="modal-footer" id="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
          <button class="btn btn-primary" id="modal-submit">Save</button>
        </div>
      </div>
    </div>`,
  },
};

// Generate all pages
for (const [filename, config] of Object.entries(pages)) {
  const html = buildPage(config.title, config.activePage, config.content, config.initScript, config.extras || '');
  const filepath = path.join(publicDir, filename);
  fs.writeFileSync(filepath, html, 'utf8');
  console.log(`✅ Created ${filename}`);
}

console.log('\\n🎉 All pages created successfully!');
