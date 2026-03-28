// CAFS Flight Kitchen Inventory System - Main Application

const API_BASE = "/api";

// ============================================
// Auth — Session Check
// ============================================

function authCheck() {
  const auth = localStorage.getItem('cafs_auth');
  if (!auth) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem('cafs_auth');
  window.location.href = 'login.html';
}

function getAuthUser() {
  try {
    const auth = JSON.parse(localStorage.getItem('cafs_auth'));
    return auth?.user || { id: 0, username: 'guest', name: 'Guest User', role: 'STAFF', branch_id: null };
  } catch { return { id: 0, username: 'guest', name: 'Guest User', role: 'STAFF', branch_id: null }; }
}

// Global State
let items = [];
let consignments = [];
let inwardEntries = [];
let outwardEntries = [];
let inwardItemsTemp = []; // Temp storage for multi-item form
let outwardItemsTemp = []; // Temp storage for multi-item form

// ============================================
// Pagination Utility
// ============================================

const PAGE_SIZE = 15;
const _paginationState = {}; // { tableId: { data: [], page: 1, rowRenderer: fn, colCount: 0 } }

function paginateTable(tableId, dataArray, rowRendererFn, colCount = 8) {
  _paginationState[tableId] = {
    data: dataArray,
    page: 1,
    rowRenderer: rowRendererFn,
    colCount: colCount
  };
  renderTablePage(tableId);
}

function renderTablePage(tableId) {
  const state = _paginationState[tableId];
  if (!state) return;

  const { data, page, rowRenderer, colCount } = state;
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageData = data.slice(start, start + PAGE_SIZE);

  // Render rows
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.innerHTML = pageData.length > 0
    ? pageData.map(rowRenderer).join("")
    : `<tr><td colspan="${colCount}" class="empty-state">No entries found</td></tr>`;

  // Render pagination controls
  let paginationEl = document.getElementById(`${tableId}-pagination`);
  if (!paginationEl) {
    paginationEl = document.createElement('div');
    paginationEl.id = `${tableId}-pagination`;
    paginationEl.className = 'table-pagination';
    // Insert after the table's parent card or table itself
    const table = document.getElementById(tableId);
    const insertTarget = table.closest('.card') || table.parentElement;
    insertTarget.parentElement.insertBefore(paginationEl, insertTarget.nextSibling);
  }

  if (data.length <= PAGE_SIZE) {
    paginationEl.innerHTML = `<span class="pagination-info">Showing ${data.length} entries</span>`;
    return;
  }

  let pageButtons = '';
  const maxBtns = 5;
  let startPage = Math.max(1, page - Math.floor(maxBtns / 2));
  let endPage = Math.min(totalPages, startPage + maxBtns - 1);
  if (endPage - startPage < maxBtns - 1) startPage = Math.max(1, endPage - maxBtns + 1);

  for (let i = startPage; i <= endPage; i++) {
    pageButtons += `<button class="pg-btn ${i === page ? 'pg-active' : ''}" onclick="goToPage('${tableId}', ${i})">${i}</button>`;
  }

  paginationEl.innerHTML = `
    <span class="pagination-info">Page ${page} of ${totalPages} — ${data.length} total</span>
    <div class="pg-controls">
      <button class="pg-btn" onclick="goToPage('${tableId}', ${page - 1})" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
      ${pageButtons}
      <button class="pg-btn" onclick="goToPage('${tableId}', ${page + 1})" ${page >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
    </div>
  `;
}

function goToPage(tableId, page) {
  const state = _paginationState[tableId];
  if (!state) return;
  const totalPages = Math.max(1, Math.ceil(state.data.length / PAGE_SIZE));
  if (page < 1 || page > totalPages) return;
  state.page = page;
  renderTablePage(tableId);
}
window.goToPage = goToPage;

// ============================================
// Utility Functions
// ============================================

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-GB"); // DD/MM/YYYY
}

function formatDateForInput(dateStr) {
  if (!dateStr) return "";
  // Check if DD-MM-YYYY or DD.MM.YYYY
  const parts = dateStr.split(/[-/.]/);
  if (parts.length === 3) {
    // Determine format somewhat heuristic - if year is last
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    // If year is first (YLE)
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  // Try JS date parse
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}
  return "";
}

function formatCurrency(value) {
  if (!value) return "₹0.00";
  return (
    "₹" +
    parseFloat(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
        <i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"}"></i>
        <span>${message}</span>
    `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

async function apiCall(endpoint, method = "GET", data = null) {
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (data) options.body = JSON.stringify(data);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "API Error");
    return result;
  } catch (error) {
    showToast(error.message, "error");
    throw error;
  }
}

function updateItemsDatalist() {
  const datalist = document.getElementById("items-list");
  if (!datalist) return;
  datalist.innerHTML = items
    .map(
      (i) =>
        `<option value="${i.description}" data-id="${i.id}">${i.code || ""}</option>`,
    )
    .join("");
}

// ============================================
// Navigation (Multi-page)
// ============================================

const pageMap = {
  'dashboard': 'index.html',
  'inward': 'inward.html',
  'inward-entry': 'inward-entry.html',
  'outward': 'outward.html',
  'outward-entry': 'outward-entry.html',
  'stock': 'stock.html',
  'form-a': 'form-a.html',
  'form-b': 'form-b.html',
  'consignment-stock': 'consignment-stock.html',
  'detailed-stock': 'detailed-stock.html',
  'shipping-bill': 'shipping-bill.html',
  'items': 'items.html',
  'consignments': 'consignments.html',
  'airline-masters': 'airline-masters.html',
};

function navigateTo(page) {
  const url = pageMap[page] || 'index.html';
  window.location.href = url;
}

// Page init wrappers for multi-page architecture
async function loadInwardPage() { await loadInwardEntries(); }
async function loadOutwardPage() { await loadOutwardEntries(); }
async function loadItemsPage() { await loadItems(); }
async function loadConsignmentsPage() { await loadConsignments(); }
async function loadConsignmentStockPage() { await loadConsignmentStockReport(); }
async function loadDetailedStockPage() { await loadDetailedStockReport(); }

// ============================================
// Modal Functions
// ============================================

function openModal(title, body, footer) {
  let titleEl = document.getElementById("modal-title");
  let bodyEl = document.getElementById("modal-body");
  let footerEl = document.getElementById("modal-footer");
  let overlayEl = document.getElementById("modal-overlay");

  if (!overlayEl) {
    // Dynamically create modal if missing
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="modal-overlay" style="display: none;">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title" id="modal-title"></h3>
            <button class="btn-close" onclick="closeModal()">&times;</button>
          </div>
          <div class="modal-body" id="modal-body"></div>
          <div class="modal-footer" id="modal-footer"></div>
        </div>
      </div>
    `);
    titleEl = document.getElementById("modal-title");
    bodyEl = document.getElementById("modal-body");
    footerEl = document.getElementById("modal-footer");
    overlayEl = document.getElementById("modal-overlay");
  }

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = body;
  if (footerEl) footerEl.innerHTML = footer;
  
  overlayEl.style.display = 'flex';
  overlayEl.classList.add("active");
  setTimeout(initSearchableSelects, 100);
}

function closeModal() {
  const overlayEl = document.getElementById("modal-overlay");
  if (overlayEl) {
    overlayEl.classList.remove("active");
    overlayEl.style.display = 'none';
  }
  inwardItemsTemp = [];
  outwardItemsTemp = [];
}

const modalOverlayEl = document.getElementById("modal-overlay");
if (modalOverlayEl) {
  modalOverlayEl.addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });
}

// ============================================
// Searchable Dropdowns (TomSelect)
// ============================================

function initSearchableSelects() {
  if (typeof TomSelect === 'undefined') return;
  // Apply only to selects explicitly marked as searchable that aren't already initialized
  document.querySelectorAll('select.searchable:not(.ts-hidden-accessible)').forEach(select => {
    // Only apply to selects with options
    if (select.options.length > 0) {
      new TomSelect(select, {
        create: select.hasAttribute('data-create'),
        maxOptions: null,
        dropdownParent: 'body',
        sortField: { field: "text", direction: "asc" },
        onChange: function(value) {
            select.dispatchEvent(new Event('change'));
        }
      });
    }
  });
}

function initDatePickers() {
  try {
    if (typeof flatpickr !== 'undefined') {
      const inputs = document.querySelectorAll('input[data-datepicker="true"]');
      inputs.forEach(el => {
        if (el._flatpickr) el._flatpickr.destroy();
        flatpickr(el, {
          disableMobile: true,
          altInput: true,
          altFormat: "d-m-Y",
          dateFormat: "Y-m-d",
          allowInput: true
        });
      });
    }
  } catch (e) {
    console.error("Flatpickr initialization error:", e);
  }
}

function loadFlatpickrAndInit() {
  if (typeof flatpickr !== 'undefined') {
    initDatePickers();
  } else {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
    script.onload = initDatePickers;
    document.head.appendChild(script);
    
    if (!document.querySelector('link[href*="flatpickr"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
      document.head.appendChild(link);
    }
  }
}

function setFormDate(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el._flatpickr) {
    el._flatpickr.setDate(val);
  } else {
    el.value = val;
  }
}

const selectObserver = new MutationObserver((mutations) => {
  let needsInit = false;
  for (let m of mutations) {
    if (m.type === 'childList' && m.addedNodes.length > 0) {
      m.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          // If a select was added or a container with selects was added
          if (node.tagName === 'SELECT' && node.classList.contains('form-control') && !node.tomselect) {
            needsInit = true;
          } else if (node.querySelectorAll) {
            const selects = node.querySelectorAll('select.form-control:not(.tomselected)');
            if (selects.length > 0) needsInit = true;
            
            const dates = node.querySelectorAll('input[type="date"]');
            if (dates.length > 0) needsInit = true;
          }
        }
      });
    }
  }
  if (needsInit) {
    // Small delay to allow DOM to settle
    setTimeout(() => {
        initSearchableSelects();
        loadFlatpickrAndInit();
    }, 50);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  selectObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => {
      initSearchableSelects();
      loadFlatpickrAndInit();
  }, 100);
});

// ============================================
// Dashboard
// ============================================

async function loadDashboard() {
  const user = getAuthUser();
  const branchId = user.role === 'SUPER_ADMIN' ? '' : (user.branch_id || '');
  try {
    const data = await apiCall(`/reports/dashboard${branchId ? `?branch_id=${branchId}` : ''}`);

    const statsContainer = document.getElementById("stats-container");
    if (!statsContainer) return; // Not on dashboard page

    // Set date and info
    const dateEl = document.getElementById("dash-date");
    const subtitleEl = document.getElementById("dash-subtitle");
    
    if (dateEl) {
      const now = new Date();
      dateEl.innerHTML = `<div>${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>`;
    }

    if (subtitleEl) {
      const branchName = user.branch_name || 'Global View';
      const branchCode = user.branch_code || '';
      subtitleEl.innerHTML = `CAFS Customs Bonded Warehouse — ${branchCode ? branchCode : branchName}`;
    }

    statsContainer.innerHTML = `
            <div class="dash-stat grad-blue">
                <div class="stat-icon-bg"><i class="fas fa-boxes"></i></div>
                <div class="stat-value">${data.stats.current_stock.toLocaleString()}</div>
                <div class="stat-label">Balance Stock</div>
            </div>
            <div class="dash-stat grad-green">
                <div class="stat-icon-bg"><i class="fas fa-arrow-down"></i></div>
                <div class="stat-value">${data.stats.total_qty_received.toLocaleString()}</div>
                <div class="stat-label">Total Received</div>
            </div>
            <div class="dash-stat grad-purple">
                <div class="stat-icon-bg"><i class="fas fa-arrow-up"></i></div>
                <div class="stat-value">${data.stats.total_qty_dispatched.toLocaleString()}</div>
                <div class="stat-label">Total Dispatched</div>
            </div>
            <div class="dash-stat grad-orange">
                <div class="stat-icon-bg"><i class="fas fa-undo"></i></div>
                <div class="stat-value">${(data.stats.total_qty_returned_origin || 0).toLocaleString()}</div>
                <div class="stat-label">Returned (Origin)</div>
            </div>
            <div class="dash-stat grad-red">
                <div class="stat-icon-bg"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="stat-value">${data.stats.expiring_soon}</div>
                <div class="stat-label">Expiring Soon</div>
            </div>
            <div class="dash-stat grad-teal">
                <div class="stat-icon-bg"><i class="fas fa-wine-bottle"></i></div>
                <div class="stat-value">${data.stats.total_items}</div>
                <div class="stat-label">Total Items</div>
            </div>
        `;

    const quickAccess = document.querySelector(".dash-quick-access");
    if (quickAccess) {
      quickAccess.style.display = user.role === 'SUPER_ADMIN' ? 'none' : 'grid';
    }

    if (user.role === 'SUPER_ADMIN') {
        renderSuperAdminTools();
    }

    const inwardTbody = document.querySelector("#recent-inward-table tbody");
    inwardTbody.innerHTML =
      data.recent_inward
        .map(
          (e) => `
            <tr>
                <td>${formatDate(e.date_of_receipt)}</td>
                <td>${e.bond_no}</td>
                <td>${e.description || "-"}</td>
                <td><strong>${e.qty_received}</strong></td>
            </tr>
        `,
        )
        .join("") ||
      '<tr><td colspan="4" class="empty-state">No recent entries</td></tr>';

    const outwardTbody = document.querySelector("#recent-outward-table tbody");
    outwardTbody.innerHTML =
      data.recent_outward
        .map(
          (e) => `
            <tr>
                <td>${formatDate(e.dispatch_date)}</td>
                <td>${e.items_list || "-"}</td>
                <td><strong>${e.total_dispatched}</strong></td>
                <td class="${e.total_returned > 0 ? "stock-medium" : ""}">${e.total_returned || 0}</td>
            </tr>
        `,
        )
        .join("") ||
      '<tr><td colspan="4" class="empty-state">No recent entries</td></tr>';
  } catch (error) {
    console.error("Dashboard load error:", error);
  }
}

// ============================================
// Damaged Stock
// ============================================

let currentStockData = [];

async function loadDamagedItems() {
  const user = getAuthUser();
  const branchId = user.role === 'SUPER_ADMIN' ? '' : (user.branch_id || '');
  try {
    const data = await apiCall(`/damaged${branchId ? `?branch_id=${branchId}` : ''}`);
    
    // Update Stats
    const totalQty = data.reduce((sum, item) => sum + (item.qty_damaged || 0), 0);
    const latestDate = data.length > 0 ? formatDate(data[0].reported_date) : "-";
    
    const statReports = document.getElementById("stat-total-reports");
    const statQty = document.getElementById("stat-total-qty");
    const statDate = document.getElementById("stat-latest-date");
    
    if (statReports) statReports.textContent = data.length;
    if (statQty) statQty.textContent = totalQty;
    if (statDate) statDate.textContent = latestDate;

    paginateTable('damaged-table', data, (e) => `
      <tr>
        <td>${formatDate(e.reported_date)}</td>
        <td><strong>${e.bond_no || '-'}</strong></td>
        <td>${e.be_no || '-'}</td>
        <td>${e.consignment_name || '-'}</td>
        <td>${e.item_description || '-'}</td>
        <td class="stock-low">${e.qty_damaged}</td>
        <td>${e.reason || '-'}</td>
        <td>
          <div class="action-btns">
            <button class="action-btn danger" onclick="deleteDamageReport(${e.id})" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `);

    // Pre-load available stock for the modal
    const stock = await apiCall(`/inward${branchId ? `?branch_id=${branchId}` : ''}`);
    
    // Populate bond dropdown for modal (only entries with available stock)
    const bondSelect = document.getElementById("dmg-bond-select");
    if (bondSelect) {
      const entriesWithStock = stock.filter(e => e.available_stock > 0);
      bondSelect.innerHTML = '<option value="">Select Bond...</option>' + 
        entriesWithStock.map(e => `<option value="${e.id}">${e.bond_no} (Bal: ${e.available_stock})</option>`).join("");
    }

  } catch (error) {
    console.error("Damaged stock load error:", error);
  }
}

async function fetchDamageBondItems(inwardId) {
    const container = document.getElementById('dmg-items-container');
    const tbody = document.getElementById('dmg-items-tbody');
    
    if (!inwardId) {
        if (container) container.style.display = 'none';
        if (tbody) tbody.innerHTML = '';
        return;
    }
    
    try {
        const items = await apiCall(`/inward/${inwardId}/stock`);
        const itemsWithStock = items.filter(i => i.available > 0);
        
        if (itemsWithStock.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="text-center">No available stock for this bond</td></tr>';
        } else {
            if (tbody) tbody.innerHTML = itemsWithStock.map(item => `
                <tr>
                    <td>${item.description}</td>
                    <td>${item.available}</td>
                    <td>
                        <input type="number" class="form-control dmg-item-qty" 
                               data-id="${item.id}" 
                               max="${item.available}" min="0" 
                               placeholder="0" value="">
                    </td>
                </tr>
            `).join('');
        }
        if (container) container.style.display = 'block';
    } catch (error) {
        showToast("Failed to load items for bond", "error");
    }
}

function openDamageModal() {
  const modal = document.getElementById("damage-modal");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("active");
  }
}

function closeDamageModal() {
  const modal = document.getElementById("damage-modal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
  }
  const form = document.getElementById("damage-form");
  if (form) form.reset();
  const itemsContainer = document.getElementById("dmg-items-container");
  if (itemsContainer) itemsContainer.style.display = "none";
}

async function saveDamage() {
  const user = getAuthUser();
  const date = document.getElementById("dmg-date").value;
  const reason = document.getElementById("dmg-reason").value;
  const remarks = document.getElementById("dmg-remarks").value;
  
  const items = [];
  document.querySelectorAll(".dmg-item-qty").forEach(input => {
    const qty = parseInt(input.value);
    if (qty > 0) {
      items.push({
        inward_item_id: input.dataset.id,
        qty_damaged: qty
      });
    }
  });

  if (items.length === 0) {
    showToast("Please enter quantity for at least one item", "error");
    return;
  }

  const data = {
    items,
    reported_date: date,
    reason,
    remarks,
    reported_by: user.id || 1, // Fallback to 1 if no user.id
    branch_id: user.branch_id
  };

  try {
    await apiCall("/damaged", "POST", data);
    showToast("Damage report saved successfully");
    closeDamageModal();
    loadDamagedItems();
  } catch (error) {
    console.error("Save damage error:", error);
  }
}

async function deleteDamageReport(id) {
  if (!confirm("Are you sure you want to delete this damage report? This will revert the stock.")) return;
  try {
    await apiCall(`/damaged/${id}`, "DELETE");
    showToast("Report deleted");
    loadDamagedItems();
  } catch (error) {
    console.error("Delete damage error:", error);
  }
}

// ============================================
// Items CRUD
// ============================================

async function loadItems() {
  try {
    items = await apiCall("/items");
    paginateTable('items-table', items, (item) => `
            <tr>
                <td>${item.id}</td>
                <td>${item.description}</td>
                <td>${item.unit}</td>
                <td>${item.hsn_code || "-"}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="editItem(${item.id})" title="Edit"><i class="fas fa-edit"></i></button>
                        <button class="action-btn danger" onclick="deleteItem(${item.id})" title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `, 5);
  } catch (error) {
    console.error("Items load error:", error);
  }
}

function openItemModal(item = null) {
  const isEdit = item !== null;
  const body = `
        <div class="form-grid-2">
            <div class="form-group">
                <label class="form-label">Description *</label>
                <input type="text" class="form-control" id="item-description" value="${item?.description || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Unit</label>
                <select class="form-control searchable" id="item-unit" data-create="true">
                    <option value="PCS" ${item?.unit === "PCS" ? "selected" : ""}>PCS</option>
                    <option value="BTL" ${item?.unit === "BTL" ? "selected" : ""}>BTL</option>
                    <option value="CASE" ${item?.unit === "CASE" ? "selected" : ""}>CASE</option>
                    <option value="KG" ${item?.unit === "KG" ? "selected" : ""}>KG</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Code</label>
                <input type="text" class="form-control" id="item-hsn" value="${item?.hsn_code || ""}">
            </div>
        </div>
    `;
  openModal(
    isEdit ? "Edit Item" : "Add New Item",
    body,
    `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveItem(${item?.id || "null"})">${isEdit ? "Update" : "Add"} Item</button>
    `,
  );
}

async function saveItem(id) {
  const data = {
    description: document.getElementById("item-description").value,
    unit: document.getElementById("item-unit").value,
    hsn_code: document.getElementById("item-hsn").value,
  };
  if (!data.description) {
    showToast("Description is required", "error");
    return;
  }
  try {
    if (id) {
      await apiCall(`/items/${id}`, "PUT", data);
      showToast("Item updated");
    } else {
      await apiCall("/items", "POST", data);
      showToast("Item added");
    }
    closeModal();
    loadItems();
  } catch (error) {
    console.error("Save item error:", error);
  }
}

function editItem(id) {
  const item = items.find((i) => i.id === id);
  if (item) openItemModal(item);
}
async function deleteItem(id) {
  if (!confirm("Delete this item?")) return;
  try {
    await apiCall(`/items/${id}`, "DELETE");
    showToast("Item deleted");
    loadItems();
  } catch (error) {
    console.error("Delete item error:", error);
  }
}

// ============================================
// Consignments CRUD
// ============================================

async function loadConsignments() {
  try {
    consignments = await apiCall("/consignments");
    paginateTable('consignments-table', consignments, (c) => `
            <tr>
                <td>${c.id}</td>
                <td>${c.name}</td>
                <td>${c.code || "-"}</td>
                <td><span class="badge ${c.type === "AIRLINE" ? "badge-info" : "badge-success"}">${c.type}</span></td>
                <td>${c.address || "-"}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="editConsignment(${c.id})"><i class="fas fa-edit"></i></button>
                        <button class="action-btn danger" onclick="deleteConsignment(${c.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `, 6);
  } catch (error) {
    console.error("Consignments load error:", error);
  }
}

function openConsignmentModal(consignment = null) {
  const isEdit = consignment !== null;
  const body = `
        <div class="form-grid-2">
            <div class="form-group">
                <label class="form-label">Name *</label>
                <input type="text" class="form-control" id="cons-name" value="${consignment?.name || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Code</label>
                <input type="text" class="form-control" id="cons-code" value="${consignment?.code || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Type</label>
                <select class="form-control searchable" id="cons-type">
                    <option value="AIRLINE" ${consignment?.type === "AIRLINE" ? "selected" : ""}>Airline</option>
                    <option value="LOCATION" ${consignment?.type === "LOCATION" ? "selected" : ""}>Location</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Address</label>
                <input type="text" class="form-control" id="cons-address" value="${consignment?.address || ""}">
            </div>
        </div>
    `;
  openModal(
    isEdit ? "Edit Consignment" : "Add New Consignment",
    body,
    `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveConsignment(${consignment?.id || "null"})">${isEdit ? "Update" : "Add"}</button>
    `,
  );
}

async function saveConsignment(id) {
  const data = {
    name: document.getElementById("cons-name").value,
    code: document.getElementById("cons-code").value,
    type: document.getElementById("cons-type").value,
    address: document.getElementById("cons-address").value,
  };
  if (!data.name) {
    showToast("Name is required", "error");
    return;
  }
  try {
    if (id) {
      await apiCall(`/consignments/${id}`, "PUT", data);
      showToast("Consignment updated");
    } else {
      await apiCall("/consignments", "POST", data);
      showToast("Consignment added");
    }
    closeModal();
    loadConsignments();
  } catch (error) {
    console.error("Save consignment error:", error);
  }
}

function editConsignment(id) {
  const c = consignments.find((x) => x.id === id);
  if (c) openConsignmentModal(c);
}
async function deleteConsignment(id) {
  if (!confirm("Delete this consignment?")) return;
  try {
    await apiCall(`/consignments/${id}`, "DELETE");
    showToast("Consignment deleted");
    loadConsignments();
  } catch (error) {
    console.error("Delete consignment error:", error);
  }
}

// ============================================
// Inward Register - Multi-Item Support
// ============================================

async function loadInwardEntries() {
  try {
    const bondNo = document.getElementById("inward-search")?.value || "";
    const user = getAuthUser();
    const branchId = user.role !== 'SUPER_ADMIN' ? user.branch_id : null;
    inwardEntries = await apiCall(
      `/inward?${bondNo ? `bond_no=${bondNo}&` : ""}${branchId ? `branch_id=${branchId}` : ""}`,
    );

    paginateTable('inward-table', inwardEntries, (e) => `
            <tr>
                <td>${formatDate(e.date_of_receipt)}</td>
                <td>${e.be_no}</td>
                <td><strong>${e.bond_no}</strong></td>
                <td>${e.items_list || e.description || "-"}</td>
                <td>${e.consignment_name || "-"}</td>
                <td>${e.total_qty || e.qty_received}</td>
                <td class="${e.available_stock <= 0 ? "stock-low" : e.available_stock < 10 ? "stock-medium" : "stock-high"}">
                    <strong>${e.available_stock || 0}</strong>
                </td>
                <td>${formatCurrency(e.value)}</td>
                <td>${formatCurrency(e.duty)}</td>
                <td>${formatCurrency((parseFloat(e.value) || 0) + (parseFloat(e.duty) || 0))}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="viewInwardDetails(${e.id})" title="View"><i class="fas fa-eye"></i></button>
                        <button class="action-btn success" onclick="quickOutward(${e.id})" title="Outward"><i class="fas fa-arrow-up"></i></button>
                        <button class="action-btn" onclick="editInward(${e.id})" title="Edit"><i class="fas fa-edit"></i></button>
                    </div>
                </td>
            </tr>
        `, 9);
  } catch (error) {
    console.error("Inward load error:", error);
  }
}

async function openInwardModal(entry = null) {
  const isEdit = entry !== null;
  if (items.length === 0) items = await apiCall("/items");
  if (consignments.length === 0) consignments = await apiCall("/consignments");

  // Initialize temp items
  inwardItemsTemp = entry?.items || [];

  const body = `
        <div class="form-grid-4">
            <div class="form-group">
                <label class="form-label">BE No *</label>
                <input type="text" class="form-control" id="inw-be-no" value="${entry?.be_no || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">BE Date *</label>
                <input type="date" class="form-control" id="inw-be-date" value="${entry?.be_date || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Bond No *</label>
                <input type="text" class="form-control" id="inw-bond-no" value="${entry?.bond_no || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Bond Date</label>
                <input type="date" class="form-control" id="inw-bond-date" value="${entry?.bond_date || ""}">
            </div>
        </div>
        <div class="form-grid-4">
            <div class="form-group">
                <label class="form-label">Date of Receipt *</label>
                <input type="date" class="form-control" id="inw-receipt-date" value="${entry?.date_of_receipt || new Date().toISOString().split("T")[0]}">
            </div>
            <div class="form-group">
                <label class="form-label">Mode</label>
                <select class="form-control" id="inw-mode">
                    <option value="By Road" ${entry?.mode_of_receipt === "By Road" ? "selected" : ""}>By Road</option>
                    <option value="By Air" ${entry?.mode_of_receipt === "By Air" ? "selected" : ""}>By Air</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Consignment</label>
                <select class="form-control" id="inw-consignment">
                    <option value="">Select</option>
                    ${consignments.map((c) => `<option value="${c.id}" ${entry?.consignment_id === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">OTL No</label>
                <input type="text" class="form-control" id="inw-otl" value="${entry?.otl_no || ""}">
            </div>
        </div>
        <div class="form-grid-4">
            <div class="form-group">
                <label class="form-label">Initial Bonding Date</label>
                <input type="date" class="form-control" id="inw-bond-start" value="${entry?.initial_bonding_date || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Initial Bonding Expiry</label>
                <input type="date" class="form-control" id="inw-bond-expiry" value="${entry?.initial_bonding_expiry || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Extended Expiry 1</label>
                <input type="date" class="form-control" id="inw-ext-expiry1" value="${entry?.extended_bonding_expiry1 || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Extended Expiry 2</label>
                <input type="date" class="form-control" id="inw-ext-expiry2" value="${entry?.extended_bonding_expiry2 || ""}">
            </div>
        </div>
        <div class="form-group">
            <label class="form-label">Remarks</label>
            <input type="text" class="form-control" id="inw-remarks" value="${entry?.remarks || ""}">
        </div>
        <hr style="border-color: var(--border); margin: 1rem 0;">
        <h4 style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <span><i class="fas fa-list"></i> Items</span>
            <button type="button" class="btn btn-sm btn-primary" onclick="addInwardItem()"><i class="fas fa-plus"></i> Add Item</button>
        </h4>
        <div id="inward-items-list"></div>
    `;

  openModal(
    isEdit ? "Edit Inward Entry" : "New Inward Entry (Multi-Item)",
    body,
    `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveInward(${entry?.id || "null"})">${isEdit ? "Update" : "Save"} Entry</button>
    `,
  );

  renderInwardItems();
}

function renderInwardItems() {
  const container = document.getElementById("inward-items-list");
  if (inwardItemsTemp.length === 0) {
    container.innerHTML =
      '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No items added. Click "Add Item" to add items.</p>';
    return;
  }

  container.innerHTML = `
        <table class="table">
            <thead>
                <tr>
                    <th>Item / Description</th>
                    <th>Qty</th>
                    <th>Value</th>
                    <th>Duty</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${inwardItemsTemp
                  .map(
                    (item, idx) => `
                    <tr>
                        <td>
                            <select class="form-control" onchange="updateInwardItem(${idx}, 'item_id', this.value)" style="width: 150px; display: inline-block; margin-right: 5px;">
                                <option value="">Custom</option>
                                ${items.map((i) => `<option value="${i.id}" ${item.item_id == i.id ? "selected" : ""}>${i.description}</option>`).join("")}
                            </select>
                            <input type="text" class="form-control" placeholder="Description" value="${item.description || ""}" 
                                   onchange="updateInwardItem(${idx}, 'description', this.value)" style="width: 150px; display: inline-block;">
                        </td>
                        <td><input type="number" class="form-control" value="${item.qty || ""}" min="1" style="width: 80px;" 
                                   onchange="updateInwardItem(${idx}, 'qty', this.value)"></td>
                        <td><input type="number" class="form-control" value="${item.value || ""}" step="0.01" style="width: 100px;" 
                                   onchange="updateInwardItem(${idx}, 'value', this.value)"></td>
                        <td><input type="number" class="form-control" value="${item.duty || ""}" step="0.01" style="width: 100px;" 
                                   onchange="updateInwardItem(${idx}, 'duty', this.value)"></td>
                        <td><button class="action-btn danger" onclick="removeInwardItem(${idx})"><i class="fas fa-trash"></i></button></td>
                    </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>
    `;
}

function addInwardItem() {
  inwardItemsTemp.push({
    item_id: null,
    description: "",
    qty: 1,
    value: 0,
    duty: 0,
    unit: "PCS",
  });
  renderInwardItems();
}

function updateInwardItem(idx, field, value) {
  inwardItemsTemp[idx][field] = value;
}

function removeInwardItem(idx) {
  inwardItemsTemp.splice(idx, 1);
  renderInwardItems();
}

async function saveInward(id) {
  const data = {
    be_no: document.getElementById("inw-be-no").value,
    be_date: document.getElementById("inw-be-date").value,
    bond_no: document.getElementById("inw-bond-no").value,
    bond_date: document.getElementById("inw-bond-date").value,
    date_of_receipt: document.getElementById("inw-receipt-date").value,
    mode_of_receipt: document.getElementById("inw-mode").value,
    consignment_id: document.getElementById("inw-consignment").value || null,
    otl_no: document.getElementById("inw-otl").value,
    initial_bonding_date: document.getElementById("inw-bond-start").value,
    initial_bonding_expiry: document.getElementById("inw-bond-expiry").value,
    extended_bonding_expiry1: document.getElementById("inw-ext-expiry1").value,
    extended_bonding_expiry2: document.getElementById("inw-ext-expiry2").value,
    remarks: document.getElementById("inw-remarks").value,
    items: inwardItemsTemp,
    branch_id: getAuthUser().branch_id
  };

  if (!data.be_no || !data.be_date || !data.bond_no || !data.date_of_receipt) {
    showToast("Please fill required fields", "error");
    return;
  }
  if (data.items.length === 0) {
    showToast("Please add at least one item", "error");
    return;
  }

  try {
    if (id) {
      await apiCall(`/inward/${id}`, "PUT", data);
      showToast("Entry updated");
    } else {
      await apiCall("/inward", "POST", data);
  showToast("Inward entry created with " + data.items.length + " items");
    }
    closeModal();
    loadInwardEntries();
  } catch (error) {
    console.error("Save inward error:", error);
  }
}

async function editInward(id) {
  const user = getAuthUser();
  const branchId = user.role !== 'SUPER_ADMIN' ? user.branch_id : null;
  const entry = await apiCall(`/inward/${id}${branchId ? `?branch_id=${branchId}` : ''}`);
  if (entry) openInwardModal(entry);
}

async function viewInwardDetails(id) {
  const user = getAuthUser();
  const branchId = user.role !== 'SUPER_ADMIN' ? user.branch_id : null;
  const entry = await apiCall(`/inward/${id}${branchId ? `?branch_id=${branchId}` : ''}`);
  const body = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div><strong>BE No:</strong> ${entry.be_no}</div>
            <div><strong>BE Date:</strong> ${formatDate(entry.be_date)}</div>
            <div><strong>Bond No:</strong> ${entry.bond_no}</div>
            <div><strong>Receipt Date:</strong> ${formatDate(entry.date_of_receipt)}</div>
            <div><strong>Consignment:</strong> ${entry.consignment_name || "-"}</div>
            <div><strong>Total Qty:</strong> ${entry.total_qty}</div>
            <div><strong>Available Stock:</strong> <span class="${entry.available_stock <= 0 ? "stock-low" : "stock-high"}">${entry.available_stock}</span></div>
        </div>
        <h4 style="margin: 1rem 0;"><i class="fas fa-list"></i> Items</h4>
        <table class="table">
            <thead><tr><th>Description</th><th>Qty</th><th>Available</th><th>Duty %</th><th>Value</th><th>Duty</th><th>Total</th></tr></thead>
            <tbody>
                ${
                  (entry.items || [])
                    .map(
                      (i) => `
                    <tr>
                        <td>${i.description || i.item_description || "-"}</td>
                        <td>${i.qty}</td>
                        <td class="${i.available_qty <= 0 ? "stock-low" : "stock-high"}"><strong>${i.available_qty}</strong></td>
                        <td>${i.duty_percent || "0"}</td>
                        <td>${formatCurrency(i.value)}</td>
                        <td>${formatCurrency(i.duty)}</td>
                        <td>${formatCurrency((parseFloat(i.value) || 0) + (parseFloat(i.duty) || 0))}</td>
                    </tr>
                `,
                    )
                    .join("") || '<tr><td colspan="5">No items</td></tr>'
                }
            </tbody>
        </table>
        <h4 style="margin: 1rem 0;"><i class="fas fa-history"></i> Outward History</h4>
        ${
          entry.outward_history?.length > 0
            ? `
            <table class="table">
                <thead><tr><th>Date</th><th>Items</th><th>Flight</th></tr></thead>
                <tbody>
                    ${entry.outward_history
                      .map(
                        (o) => `
                        <tr>
                            <td>${formatDate(o.dispatch_date)}</td>
                            <td>${o.items_list || "-"}</td>
                            <td>${o.flight_no || "-"}</td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        `
            : '<p style="color: var(--text-muted);">No outward entries yet</p>'
        }
    `;
  openModal(
    `Inward Entry - ${entry.bond_no}`,
    body,
    '<button class="btn btn-secondary" onclick="closeModal()">Close</button>',
  );
}

// ============================================
// Outward Register - Multi-Item Support
// ============================================

async function loadOutwardEntries() {
  const user = getAuthUser();
  const branchId = user.role === 'SUPER_ADMIN' ? '' : (user.branch_id || '');
  try {
    const data = await apiCall(`/outward${branchId ? `?branch_id=${branchId}` : ''}`);
    outwardEntries = data; // Sync global state
    paginateTable('outward-table', outwardEntries, (e) => `
            <tr>
                <td>${formatDate(e.dispatch_date)}</td>
                <td>${e.bond_no || "-"}</td>
                <td>${e.items_list || "-"}</td>
                <td>${e.flight_no || "-"}</td>
                <td>${e.total_dispatched || e.qty_dispatched}</td>
                <td class="${(e.total_returned || e.qty_returned_bag) > 0 ? "stock-medium" : ""}">${e.total_returned || e.qty_returned_bag || 0}</td>
                <td><strong>${(e.total_dispatched || e.qty_dispatched) - (e.total_returned || e.qty_returned_bag || 0)}</strong></td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn success" onclick="returnAsBag(${e.id})" title="Return"><i class="fas fa-undo"></i></button>
                        <button class="action-btn" onclick="viewOutward(${e.id})" title="View"><i class="fas fa-eye"></i></button>
                    </div>
                </td>
            </tr>
        `, 8);
  } catch (error) {
    console.error("Outward load error:", error);
  }
}

let availableInwardItems = [];

async function openOutwardModal() {
  if (consignments.length === 0) consignments = await apiCall("/consignments");

  availableInwardItems = [];
  outwardItemsTemp = [];

  const body = `
        <div class="form-grid-3">
            <div class="form-group">
                <label class="form-label">Dispatch Date *</label>
                <input type="date" class="form-control" id="out-date" value="${new Date().toISOString().split("T")[0]}">
            </div>
            <div class="form-group">
                <label class="form-label">Flight No</label>
                <input type="text" class="form-control" id="out-flight" placeholder="e.g. EK531">
            </div>
            <div class="form-group">
                <label class="form-label">Consignment *</label>
                <select class="form-control" id="out-consignment" onchange="fetchAvailableForConsignment(this.value)">
                    <option value="">Select Airline</option>
                    ${consignments
                      .filter((c) => c.type === "AIRLINE")
                      .map((c) => `<option value="${c.id}">${c.name}</option>`)
                      .join("")}
                </select>
            </div>
        </div>
        <div class="form-grid-3">
            <div class="form-group">
                <label class="form-label">Shipping Bill No</label>
                <input type="text" class="form-control" id="out-sb-no">
            </div>
            <div class="form-group">
                <label class="form-label">Shipping Bill Date</label>
                <input type="date" class="form-control" id="out-sb-date">
            </div>
            <div class="form-group">
                <label class="form-label">Means of Transport Reg</label>
                <input type="text" class="form-control" id="out-transport-reg">
            </div>
        </div>
        <div class="form-grid-2">
            <div class="form-group">
                <label class="form-label">Purpose</label>
                <select class="form-control" id="out-purpose">
                    <option value="Re-export">Re-export</option>
                    <option value="Stock">Stock</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Remarks</label>
                <input type="text" class="form-control" id="out-remarks">
            </div>
        </div>
        <hr style="border-color: var(--border); margin: 1rem 0;">
        <h4 style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <span><i class="fas fa-list"></i> Items to Dispatch</span>
            <button type="button" class="btn btn-sm btn-primary" id="btn-add-outward-item" onclick="addOutwardItem()" disabled><i class="fas fa-plus"></i> Add Item</button>
        </h4>
        <div id="outward-items-list"></div>
    `;

  openModal(
    "New Outward Entry (Consignment-Wise Only)",
    body,
    `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveOutward()">Create Dispatch</button>
    `,
  );

  renderOutwardItems();
}

async function fetchAvailableForConsignment(consignmentId) {
  if (!consignmentId) {
    availableInwardItems = [];
    document.getElementById("btn-add-outward-item").disabled = true;
    outwardItemsTemp = [];
    renderOutwardItems();
    return;
  }

  try {
    const user = getAuthUser();
    const branchId = user.role !== 'SUPER_ADMIN' ? user.branch_id : null;
    availableInwardItems = await apiCall(
      `/outward/available/items?consignment_id=${consignmentId}${branchId ? `&branch_id=${branchId}` : ''}`,
    );
    document.getElementById("btn-add-outward-item").disabled = false;
    outwardItemsTemp = [];
    renderOutwardItems();
    if (availableInwardItems.length === 0) {
      showToast("No stock available for this consignment", "info");
    }
  } catch (e) {
    console.error("Fetch available items error:", e);
  }
}

function renderOutwardItems() {
  const container = document.getElementById("outward-items-list");
  if (outwardItemsTemp.length === 0) {
    container.innerHTML =
      '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No items added. Click "Add Item" to select items from inward stock.</p>';
    return;
  }

  container.innerHTML = `
        <table class="table">
            <thead><tr><th>Source (Bond No / Item)</th><th>Available</th><th>Qty to Dispatch</th><th></th></tr></thead>
            <tbody>
                ${outwardItemsTemp
                  .map(
                    (item, idx) => `
                    <tr>
                        <td>
                            <select class="form-control" onchange="updateOutwardItemSource(${idx}, this.value)">
                                <option value="">Select Item</option>
                                ${availableInwardItems
                                  .map(
                                    (ai) => `
                                    <option value="${ai.inward_item_id}" data-available="${ai.available_qty}" data-inward="${ai.inward_id}" data-item="${ai.item_id}" data-desc="${ai.description}" data-value="${ai.value}" data-duty="${ai.duty}" 
                                            ${item.inward_item_id == ai.inward_item_id ? "selected" : ""}>
                                        ${ai.bond_no} - ${ai.description} (Avail: ${ai.available_qty})
                                    </option>
                                `,
                                  )
                                  .join("")}
                            </select>
                        </td>
                        <td>${item.available_qty || "-"}</td>
                        <td><input type="number" class="form-control" value="${item.qty_dispatched || ""}" min="1" max="${item.available_qty}" style="width: 80px;" 
                                   onchange="updateOutwardItem(${idx}, 'qty_dispatched', this.value)"></td>
                        <td><button class="action-btn danger" onclick="removeOutwardItem(${idx})"><i class="fas fa-trash"></i></button></td>
                    </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>
    `;
}

function addOutwardItem() {
  outwardItemsTemp.push({
    inward_item_id: null,
    inward_id: null,
    item_id: null,
    description: "",
    qty_dispatched: 1,
    available_qty: 0,
  });
  renderOutwardItems();
}

function updateOutwardItemSource(idx, value) {
  const select = document.querySelectorAll("#outward-items-list select")[idx];
  const option = select.options[select.selectedIndex];
  outwardItemsTemp[idx] = {
    inward_item_id: parseInt(value) || null,
    inward_id: parseInt(option.dataset.inward) || null,
    item_id: parseInt(option.dataset.item) || null,
    description: option.dataset.desc || "",
    available_qty: parseInt(option.dataset.available) || 0,
    value: parseFloat(option.dataset.value) || 0,
    duty: parseFloat(option.dataset.duty) || 0,
    qty_dispatched: 1,
  };
  renderOutwardItems();
}

function updateOutwardItem(idx, field, value) {
  outwardItemsTemp[idx][field] = parseInt(value) || 0;
}

function removeOutwardItem(idx) {
  outwardItemsTemp.splice(idx, 1);
  renderOutwardItems();
}

async function saveOutward() {
  const data = {
    dispatch_date: document.getElementById("out-date").value,
    flight_no: document.getElementById("out-flight").value,
    consignment_id: document.getElementById("out-consignment").value || null,
    shipping_bill_no: document.getElementById("out-sb-no").value,
    shipping_bill_date: document.getElementById("out-sb-date").value,
    purpose: document.getElementById("out-purpose").value,
    remarks: document.getElementById("out-remarks").value,
    authorised_by: getAuthUser().username,
    items: outwardItemsTemp,
    branch_id: getAuthUser().branch_id
  };

  if (!data.dispatch_date) {
    showToast("Dispatch date required", "error");
    return;
  }
  if (data.items.length === 0) {
    showToast("Please add at least one item", "error");
    return;
  }

  // Validate quantities
  for (const item of data.items) {
    if (!item.inward_item_id) {
      showToast("Please select source for all items", "error");
      return;
    }
    if (item.qty_dispatched > item.available_qty) {
      showToast(`Quantity exceeds available (${item.available_qty})`, "error");
      return;
    }
  }

  try {
    await apiCall("/outward", "POST", data);
    showToast("Dispatch created with " + data.items.length + " items");
    closeModal();
    loadOutwardEntries();
    loadInwardEntries();
  } catch (error) {
    console.error("Save outward error:", error);
  }
}

async function quickOutward(inwardId) {
  // Get stock for this inward entry
  const stock = await apiCall(`/inward/${inwardId}/stock`);
  const entry = inwardEntries.find((e) => e.id === inwardId);

  if (!stock || stock.length === 0) {
    showToast("No items with available stock", "error");
    return;
  }

  outwardItemsTemp = stock
    .filter((s) => s.available > 0)
    .map((s) => ({
      inward_item_id: s.id,
      inward_id: inwardId,
      item_id: s.item_id,
      description: s.description,
      available_qty: s.available,
      qty_dispatched: 1,
    }));

  const body = `
        <p><strong>Bond No:</strong> ${entry?.bond_no}</p>
        <div class="form-grid-2" style="margin: 1rem 0;">
            <div class="form-group">
                <label class="form-label">Dispatch Date *</label>
                <input type="date" class="form-control" id="quick-date" value="${new Date().toISOString().split("T")[0]}">
            </div>
            <div class="form-group">
                <label class="form-label">Flight No</label>
                <input type="text" class="form-control" id="quick-flight">
        </div>
        <div class="form-grid-2" style="margin: 1rem 0;">
            <div class="form-group">
                <label class="form-label">Nature of Removal</label>
                <select class="form-control" id="quick-removal-nature">
                    <option value="Re-export">Re-export</option>
                    <option value="Ex-bond Clearance">Ex-bond Clearance</option>
                    <option value="Transfer">Transfer</option>
                    <option value="Return to Bond / Origin">Return to Bond / Origin</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Shipping Bill No</label>
                <input type="text" class="form-control" id="quick-sb-no">
            </div>
        </div>
        <h4 style="margin: 1rem 0;">Items</h4>
        <table class="table">
            <thead><tr><th>Item</th><th>Available</th><th>Qty to Dispatch</th></tr></thead>
            <tbody>
                ${outwardItemsTemp
                  .map(
                    (item, idx) => `
                    <tr>
                        <td>${item.description}</td>
                        <td>${item.available_qty}</td>
                        <td><input type="number" class="form-control" id="quick-qty-${idx}" value="1" min="0" max="${item.available_qty}" style="width: 80px;"></td>
                    </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>
    `;

  openModal(
    "Quick Outward",
    body,
    `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveQuickOutward(${inwardId})">Dispatch</button>
    `,
  );
}

async function saveQuickOutward(inwardId) {
  // Update quantities from form
  outwardItemsTemp.forEach((item, idx) => {
    const input = document.getElementById(`quick-qty-${idx}`);
    item.qty_dispatched = parseInt(input?.value) || 0;
  });

  // Filter out zero quantities
  const itemsToDispatch = outwardItemsTemp.filter((i) => i.qty_dispatched > 0);
  if (itemsToDispatch.length === 0) {
    showToast("Enter at least one quantity", "error");
    return;
  }

  const data = {
    dispatch_date: document.getElementById("quick-date").value,
    flight_no: document.getElementById("quick-flight").value,
    items: itemsToDispatch,
  };

  try {
    await apiCall("/outward", "POST", data);
    showToast("Dispatch created");
    closeModal();
    loadInwardEntries();
    loadOutwardEntries();
  } catch (error) {
    console.error("Quick outward error:", error);
  }
}

async function returnAsBag(outwardId) {
  const entry = await apiCall(`/outward/${outwardId}`);
  const items = entry.items || [];

  const body = `
        <table class="table">
            <thead><tr><th>Item</th><th>Dispatched</th><th>Current Return</th><th>New Return Qty</th></tr></thead>
            <tbody>
                ${items
                  .map(
                    (i) => `
                    <tr>
                        <td>${i.item_description || i.description || "-"}</td>
                        <td>${i.qty_dispatched}</td>
                        <td>${i.qty_returned_bag || 0}</td>
                        <td><input type="number" class="form-control return-qty" data-id="${i.id}" value="${i.qty_returned_bag || 0}" min="0" max="${i.qty_dispatched}" style="width: 80px;"></td>
                    </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>
    `;

  openModal(
    "Return as Bag",
    body,
    `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-success" onclick="saveReturns(${outwardId})">Update Returns</button>
    `,
  );
}

async function saveReturns(outwardId) {
  const inputs = document.querySelectorAll(".return-qty");
  try {
    for (const input of inputs) {
      await apiCall(`/outward/${outwardId}/return`, "PUT", {
        item_id: parseInt(input.dataset.id),
        qty_returned_bag: parseInt(input.value) || 0,
      });
    }
    showToast("Returns updated");
    closeModal();
    loadOutwardEntries();
    loadInwardEntries();
  } catch (error) {
    console.error("Save returns error:", error);
  }
}

async function viewOutward(id) {
  const entry = await apiCall(`/outward/${id}`);
  const body = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div><strong>Dispatch Date:</strong> ${formatDate(entry.dispatch_date)}</div>
            <div><strong>Flight No:</strong> ${entry.flight_no || "-"}</div>
            <div><strong>Shipping Bill:</strong> ${entry.shipping_bill_no || "-"}</div>
            <div><strong>Purpose:</strong> ${entry.purpose || "-"}</div>
        </div>
        <h4 style="margin: 1rem 0;">Items</h4>
        <table class="table">
            <thead><tr><th>Bond No</th><th>Item</th><th>Dispatched</th><th>Returned</th><th>Net</th></tr></thead>
            <tbody>
                ${(entry.items || [])
                  .map(
                    (i) => `
                    <tr>
                        <td>${i.bond_no || "-"}</td>
                        <td>${i.item_description || i.description || "-"}</td>
                        <td>${i.qty_dispatched}</td>
                        <td class="${i.qty_returned_bag > 0 ? "stock-medium" : ""}">${i.qty_returned_bag || 0}</td>
                        <td><strong>${i.qty_dispatched - (i.qty_returned_bag || 0)}</strong></td>
                    </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>
    `;
  openModal(
    "Outward Entry Details",
    body,
    '<button class="btn btn-secondary" onclick="closeModal()">Close</button>',
  );
}

// ============================================
// Current Stock Page
// ============================================

async function loadStockPage() {
  const user = getAuthUser();
  const branchId = user.role === 'SUPER_ADMIN' ? '' : (user.branch_id || '');
  try {
    const entries = await apiCall(`/inward${branchId ? `?branch_id=${branchId}` : ''}`);
    const stockEntries = entries.filter((e) => e.available_stock > 0);
    paginateTable('stock-table', stockEntries, (e) => `
            <tr>
                <td><strong>${e.bond_no}</strong></td>
                <td>${e.items_list || e.description || "-"}</td>
                <td>${e.consignment_name || "-"}</td>
                <td>${e.total_qty || e.qty_received}</td>
                <td>${e.total_dispatched || 0}</td>
                <td class="${e.total_returned > 0 ? "stock-medium" : ""}">${e.total_returned || "-"}</td>
                <td class="${e.available_stock < 10 ? "stock-medium" : "stock-high"}"><strong>${e.available_stock}</strong></td>
                <td>${formatDate(e.initial_bonding_expiry)}</td>
            </tr>
        `, 8);
  } catch (error) {
    console.error("Stock load error:", error);
  }
}

// ============================================
// Reports
// ============================================

async function loadFormAPage() {
  try {
    items = await apiCall("/items");
    const itemSelect = document.getElementById("forma-item");
    const bondSelect = document.getElementById("forma-bond");
    if (!itemSelect || !bondSelect) return;
    const itemOptions = items.map(i => ({ value: i.id, text: i.description }));
    if (itemSelect.tomselect) {
      itemSelect.tomselect.clearOptions();
      itemSelect.tomselect.addOptions(itemOptions);
    } else {
      itemSelect.innerHTML = `<option value="">All Items</option>` + items.map(i => `<option value="${i.id}">${i.description}</option>`).join("");
    }
    const inwardEntries = await apiCall("/inward");
    const distinctBonds = [...new Set(inwardEntries.map(e => e.bond_no).filter(b => b))].sort();
    const bondOptions = distinctBonds.map(b => ({ value: b, text: b }));
    if (bondSelect.tomselect) {
      bondSelect.tomselect.clearOptions();
      bondSelect.tomselect.addOptions(bondOptions);
      bondSelect.tomselect.refreshOptions(false);
    } else {
      bondSelect.innerHTML = `<option value="">Search Bond No</option>` + distinctBonds.map(bond => `<option value="${bond}">${bond}</option>`).join("");
    }
    setTimeout(initSearchableSelects, 100);
  } catch (err) { console.error("loadFormAPage error:", err); }
}

async function generateFormA() {
  const params = new URLSearchParams();
  const itemId = document.getElementById("forma-item").value;
  const bondNo = document.getElementById("forma-bond").value;
  const fromDate = document.getElementById("forma-from").value;
  const toDate = document.getElementById("forma-to").value;

  if (itemId) params.append("item_id", itemId);
  if (bondNo) params.append("bond_no", bondNo);
  if (fromDate) params.append("from_date", fromDate);
  if (toDate) params.append("to_date", toDate);
  const user = getAuthUser();
  if (user.role !== 'SUPER_ADMIN' && user.branch_id) params.append("branch_id", user.branch_id);


  try {
    console.log(`Generating Form A with params: item_id=${itemId}, bond_no=${bondNo}, from=${fromDate}, to=${toDate}`);
    const data = await apiCall(`/reports/form-a?${params.toString()}`);
    
    // Debug info
    if (data.entries.length === 0) {
        // console.log("No entries found matching filter.");
    }
    
    const reportContainer = document.getElementById("forma-report-container");
    if (!reportContainer) return;

    const itemSearch = document.getElementById("forma-item");
    const itemText = itemSearch && itemSearch.selectedIndex > 0 ? itemSearch.options[itemSearch.selectedIndex].text : '';
    const reportTitle = itemText ? `Form A / Bond Ledger - ${itemText}` : 'Form A';

    reportContainer.innerHTML = `
            <style>
                .report-table th {
                    text-transform: none !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                }
                @media print {
                    @page { size: A3 landscape; margin: 5mm; }
                    html, body { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; }
                    body * { visibility: hidden; }
                    #forma-report-container, #forma-report-container * { visibility: visible; }
                    #forma-report-container { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 100% !important; 
                        margin: 0 !important; 
                        padding: 0 !important; 
                        display: block !important;
                    }
                    .card { border: none !important; box-shadow: none !important; width: 100% !important; }
                    .report-table { 
                        width: 100% !important; 
                        table-layout: auto !important; 
                        border-collapse: collapse !important;
                    }
                    .report-table th, .report-table td {
                        font-size: 5pt !important;
                        padding: 1px !important;
                        white-space: normal !important;
                        word-wrap: break-word !important;
                        border: 1px solid #000 !important;
                    }
                }
            </style>
            <div class="card">
                <div class="card-header text-center" style="display: block !important; text-align: center !important; font-family: 'Arial Narrow', sans-serif; border-bottom: none; padding-bottom: 5px;">
                    <h5 style="font-weight: bold; margin-bottom: 0; text-align: center;">${reportTitle}</h5>
                    <p style="margin-bottom: 0; font-size: 12px; text-align: center;">Form to be maintained by the warehouse licensee of the receipt, handling, storing and removal of the warehoused goods</p>
                    <p style="margin-bottom: 0; font-size: 12px; text-align: center;">(in terms of Circular No. 25/2016-Customs dated 08.06.2016)</p>
                    <p style="margin-bottom: 0; font-size: 14px; font-weight: bold; text-align: center;">Warehouse code:WHC NO:${data.warehouse_code}</p>
                    <p style="margin-bottom: 0; font-size: 14px; text-align: center;">${data.warehouse_address || 'M/s. Casino Air Caterers & Flight Services(Unit Of Anjali Hotels) Nayathode P.O Angamali Kerala 683572'}</p>
                </div>
                <div class="card-body" style="padding: 0; overflow: visible;">
                    <table class="table table-bordered table-sm report-table text-center" style="font-size: 6px; width: 100%; table-layout: auto;">
                        <thead style="font-stretch: condensed; font-family: 'Arial Narrow', sans-serif;">
                            <tr>
                                <th colspan="11" class="text-center" style="font-weight: bold; text-transform: uppercase;">RECEIPTS</th>
                                <th colspan="11" class="text-center" style="font-weight: bold; text-transform: uppercase;">HANDLING AND STORAGE</th>
                                <th colspan="10" class="text-center" style="font-weight: bold; text-transform: uppercase;">REMOVAL</th>
                            </tr>
                            <tr class="text-center align-middle" style="text-transform: none !important;">
                                <!-- Receipts (11 cols) -->
                                <th>Bill of Entry<br>No. & Date</th>
                                <th>Customs Station<br>of Import</th>
                                <th>Bond No.<br>& Date</th>
                                <th>Description of<br>Goods</th>
                                <th>Description<br>& no. of<br>Packages</th>
                                <th>Marks & No.<br>on Packages</th>
                                <th>Unit,<br>Weight &<br>Qty</th>
                                <th>Value</th>
                                <th>Duty<br>Assessed</th>
                                <th>Date of Order<br>under Sec.<br>60(1)</th>
                                <th>Warehouse Code<br>& Address (in case<br>of Bond to Bond<br>Transfer)</th>

                                <!-- Handling (11 cols) -->
                                <th>Registration<br>No. of means<br>of Transport</th>
                                <th>OTL No.</th>
                                <th>Qty.<br>adviced</th>
                                <th>Qty<br>Reced.</th>
                                <th>Breakage/<br>Damage</th>
                                <th>Shortage</th>
                                <th>Sample drawn by<br>Government<br>Agencies</th>
                                <th>Activities<br>Undertaken under<br>section 64</th>
                                <th>Date of Expiry<br>of Initial<br>Bonding period</th>
                                <th>Period<br>extended<br>upto</th>
                                <th>Details of<br>Bank<br>Guarantee</th>

                                <!-- Removal (10 cols) -->
                                <th>Ref No /<br>SB No</th>
                                <th>Date &<br>Time of<br>Removal</th>
                                <th>Purpose of<br>Removal</th>
                                <th>Qty<br>Cleared</th>
                                <th>Value</th>
                                <th>Duty</th>
                                <th>Interest</th>
                                <th>Balance Qty</th>
                                <th>Value Rate</th>
                                <th>Duty Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.entries.map(entry => {
                                let rows = '';
                                let balance = entry.qty_received; // Item level initial balance
                                const removals = entry.outward_entries || [];
                                // Calculate per-unit rates: value/qty and duty/qty
                                const unitValueRate = entry.qty_received ? (Number(entry.value) / Number(entry.qty_received)).toFixed(3) : '-';
                                const unitDutyRate = entry.qty_received ? (Number(entry.duty) / Number(entry.qty_received)).toFixed(3) : '-';
                                
                                // Helper for Receipt + Handling Columns
                                const receiptCols = (isFirst) => isFirst ? `
                                    <td>${entry.be_no}<br>${formatDate(entry.be_date)}</td>
                                    <td>${entry.customs_station || 'COK'}</td>
                                    <td>${entry.bond_no}<br>${formatDate(entry.bond_date || entry.initial_bonding_expiry)}</td>
                                    <td>${entry.description}</td>
                                    <td>${entry.pkg_description || '-'}</td>
                                    <td>${entry.pkg_marks || '-'}</td>
                                    <td>${entry.unit || 'PCS'}</td>
                                    <td>${formatCurrency(entry.value)}</td>
                                    <td>${formatCurrency(entry.duty)}</td>
                                    <td>${formatDate(entry.date_of_order_section_60)}</td>
                                    <td>${entry.warehouse_code}</td>

                                    <!-- Handling -->
                                    <td>${entry.transport_reg_no || '-'}</td>
                                    <td>${entry.otl_no || '-'}</td>
                                    <td>${entry.qty_advised || '-'}</td>
                                    <td>${entry.qty_received}</td>
                                    <td>${entry.breakage_shortage || '-'}</td>
                                    <td>-</td>
                                    <td>-</td>
                                    <td>-</td>
                                    <td>${formatDate(entry.initial_bonding_expiry)}</td>
                                    <td>${formatDate(entry.extended_bonding_expiry1)}</td>
                                    <td>${entry.bank_guarantee || '-'}</td>
                                ` : `
                                    <td colspan="11" style="border: none;"></td>
                                    <td colspan="11" style="border: none;"></td>
                                `;

                                // 1. Always show Opening Balance Row
                                rows += `<tr>
                                    ${receiptCols(true)}
                                    <td>${entry.relinquishment || '0'}</td>
                                    <td>${formatDate(entry.be_date || entry.date_of_receipt)}</td>
                                    <td>0</td>
                                    <td>0</td>
                                    <td>${formatCurrency(entry.value)}</td>
                                    <td>${formatCurrency(entry.duty)}</td>
                                    <td>0</td>
                                    <td><strong>${balance}</strong></td>
                                    <td>${unitValueRate}</td>
                                    <td>${unitDutyRate}</td>
                                </tr>`;

                                // 2. Iterate all transactions (outward, damaged, return)
                                removals.forEach((out) => {
                                    balance -= (out.qty || 0);
                                    rows += `<tr>
                                        ${receiptCols(false)}
                                        <td>${out.ref || '-'}</td>
                                        <td>${formatDate(out.date)}</td>
                                        <td>${out.purpose}</td>
                                        <td>${Math.abs(out.qty)}</td>
                                        <td>${out.value ? formatCurrency(out.value) : '0.00'}</td>
                                        <td>${out.duty ? formatCurrency(out.duty) : '0.00'}</td>
                                        <td>-</td>
                                        <td><strong>${balance}</strong></td>
                                        <td>${unitValueRate}</td>
                                        <td>${unitDutyRate}</td>
                                    </tr>`;
                                });
                                return rows;
                            }).join("")}
                        </tbody>


                    </table>
                </div>
            </div>
        `;
  } catch (error) {
    console.error("Form-A error:", error);
  }
}

async function loadFormBPage() {
  const now = new Date();
  document.getElementById("formb-month").value = now.getMonth() + 1;
  document.getElementById("formb-year").value = now.getFullYear();
  
  try {
    if (consignments.length === 0) consignments = await apiCall("/consignments");
    const airlineSelect = document.getElementById("formb-airline");
    airlineSelect.innerHTML = '<option value="">All Airlines</option>' + 
      consignments.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
      
    // Make the select searchable
    initSearchableSelects();
  } catch (error) {
    console.error("Failed to load airlines for Form B", error);
  }
}

async function generateFormB() {
  const month = document.getElementById("formb-month").value;
  const year = document.getElementById("formb-year").value;
  const airlineId = document.getElementById("formb-airline").value;

  const params = new URLSearchParams();
  if (month) params.append("month", month);
  if (year) params.append("year", year);
  if (airlineId) params.append("consignment_id", airlineId);
  const user = getAuthUser();
  const branchId = user.role !== 'SUPER_ADMIN' ? user.branch_id : null;
  if (branchId) params.append("branch_id", branchId);

  try {
    const url = `/reports/form-b?${params.toString()}`;
    const data = await apiCall(url);
    
    // Defensive month name
    const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthLabel = (data.month_name || monthNames[data.month] || "Unknown").toUpperCase();

    // Calculate last day of month for Qty column header
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const qtyDateStr = `${lastDay}.${String(data.month).padStart(2, '0')}.${data.year}`;

    let tableRows = "";
    for (const [consignment, entries] of Object.entries(data.grouped_entries)) {
      tableRows += `<tr><td colspan="13" style="text-align: center; font-weight: bold;">${consignment}</td></tr>`;
      entries.forEach((e) => {
        const valRate = e.value_rate ? Number(e.value_rate).toFixed(2) : (e.total_value && e.total_qty_received ? (e.total_value / e.total_qty_received).toFixed(2) : "");
        tableRows += `<tr style="text-align: center; vertical-align: middle;">
          <td>${e.be_no || "Multiple"}/${formatDate(e.be_date)}</td>
          <td>${e.bond_no || "Multiple"}</td>
          <td>${formatDate(e.date_of_order_section_60)}</td>
          <td>${e.sl_no_import_invoice || "Multiple"}</td>
          <td>${e.description || "Consolidated Stocks"}</td>
          <td>${e.qty_in_stock}</td>
          <td>${e.total_value ? Number(e.total_value).toFixed(2) : "0.00"}</td>
          <td>${formatDate(e.initial_bonding_expiry)}</td>
          <td>${formatDate(e.extended_bonding_expiry1)}</td>
          <td>${formatDate(e.extended_bonding_expiry2)}</td>
          <td>${formatDate(e.extended_bonding_expiry3)}</td>
          <td>${valRate}</td>
          <td>${e.remarks || ""}</td>
        </tr>`;
      });
    }

    document.getElementById("formb-report-container").innerHTML = `
            <style>
                .form-b-table th {
                    text-transform: none !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    font-size: 10px;
                    border: 1px solid #777;
                    padding: 4px;
                }
                .form-b-table td {
                    font-size: 10px;
                    border: 1px solid #777;
                    padding: 4px;
                }
                .form-b-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-family: "Times New Roman", Times, serif;
                }
            </style>
            <div style="width: 100%; font-family: 'Times New Roman', Times, serif; color: black; background: white; padding: 10px;">
                <div style="text-align: center; margin-bottom: 5px;">
                    <h4 style="font-weight: bold; margin-bottom: 5px;">FORM-B FOR THE MONTH OF ${monthLabel} ${data.year}</h4>
                </div>
                <div style="font-size: 11px; margin-bottom: 15px; text-align: center;">
                    Details of goods stored in the warehouse where the period for which they may remain warehoused under section 61 is expiring in the following month.
                    <br>
                    (para 3 of Circular No 25/2016 -Customs dated 08.06.2016 )
                    <br>
                    <div style="font-weight: bold; text-align: center;">Warehouse Code and Address : ${data.warehouse_code} and ${data.warehouse_address || 'M/s. Casino Air Caterers & Flight Services(Unit Of Anjali Hotels) Nayathode P.O Angamali Kerala 683572'}</div>
                </div>
                <table class="form-b-table">
                    <thead>
                        <tr style="font-weight: bold;">
                            <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th><th>14</th>
                        </tr>
                        <tr style="font-weight: bold;">
                            <th style="min-width: 80px;">B.E No. Date</th>
                            <th style="min-width: 80px;">Bond No.</th>
                            <th style="min-width: 70px;">Date of Order<br>under section 60(1)</th>
                            <th style="min-width: 60px;">Sl No.of the<br>Import invoice</th>
                            <th>Description of goods</th>
                            <th style="min-width: 60px;">Qty.AS ON<br>${qtyDateStr}</th>
                            <th>Value</th>
                            <th style="min-width: 70px;">Date of Exp. of<br>Initial bonding<br>period</th>
                            <th style="min-width: 70px;">Date of Exp. of<br>extended<br>Bonding period</th>
                            <th style="min-width: 70px;">Date of Exp. of<br>extended<br>Bonding period</th>
                            <th style="min-width: 70px;">Date of Exp. of<br>extended Bonding<br>period</th>
                            <th>Remarks</th>
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows || '<tr><td colspan="13" style="text-align:center; padding: 20px;">No items expiring</td></tr>'}</tbody>
                    <tfoot style="font-weight: bold; background-color: #f8f9fa;">
                        <tr style="text-align: center;">
                            <td colspan="5">GRAND TOTAL</td>
                            <td>${Object.values(data.grouped_entries).flat().reduce((sum, e) => sum + Number(e.qty_in_stock || 0), 0)}</td>
                            <td>${Object.values(data.grouped_entries).flat().reduce((sum, e) => sum + Number(e.total_value || 0), 0).toFixed(2)}</td>
                            <td colspan="6"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
  } catch (error) {
    console.error("Form-B error:", error);
  }
}

// ==================== SHIPPING BILL FUNCTIONS ====================

var sbAvailableItems = [];
var sbSelectedItems = [];
var currentShippingBillId = null;

async function loadShippingBillsListPage() {
  const user = getAuthUser();
  const branchId = user.role === 'SUPER_ADMIN' ? '' : (user.branch_id || '');
  try {
    const bills = await apiCall(`/shipping-bills${branchId ? `?branch_id=${branchId}` : ''}`);
    const canApprove = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'APPROVER'].includes(user.role);
    const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role);

    paginateTable('shipping-bills-table', bills, (e) => {
      const isUnapproved = e.status === 'DRAFT' && e.unapproved_remarks;
      const statusText = isUnapproved ? 'UNAPPROVED' : e.status;
      const statusClass = isUnapproved ? 'badge-danger' : getStatusBadge(e.status);

      return `
      <tr>
        <td><strong>${e.sb_no}</strong></td>
        <td>${formatDate(e.sb_date)}</td>
        <td>${e.flight_no || '-'}</td>
        <td>${e.consignment_name || '-'}</td>
        <td>${e.item_count || 0}</td>
        <td class="stock-medium">${(e.total_qty || 0).toLocaleString()}</td>
        <td>₹${(e.total_value || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td>₹${(e.total_duty || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td>
          <span class="badge ${statusClass}">${statusText}</span>
        </td>
        <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${e.unapproved_remarks || e.remarks || ''}">
          ${e.unapproved_remarks || e.remarks || '-'}
        </td>
        <td>
          <div class="action-btns">
            ${(e.status === 'DRAFT' && canApprove) ? `<button class="action-btn success" onclick="approveShippingBill(${e.id})" title="Approve"><i class="fas fa-check"></i></button>` : ''}
            ${(e.status === 'DRAFT' && isAdmin) ? `<button class="action-btn warning" onclick="rejectShippingBill(${e.id})" title="Not Approved"><i class="fas fa-times-circle"></i></button>` : ''}
            ${(e.status === 'APPROVED' && isAdmin) ? `<button class="action-btn warning" onclick="unapproveShippingBill(${e.id})" title="Unapprove"><i class="fas fa-undo"></i></button>` : ''}
            ${(e.status === 'DRAFT') ? `<button class="action-btn primary" onclick="window.location.href='shipping-bill-entry.html?id=${e.id}'" title="Edit"><i class="fas fa-edit"></i></button>` : ''}
            <button class="action-btn info" onclick="viewShippingBill(${e.id})" title="View Details"><i class="fas fa-eye"></i></button>
            <button class="action-btn secondary" onclick="printShippingBill(${e.id})" title="Print"><i class="fas fa-print"></i></button>
            ${(() => {
                if (e.status !== 'DRAFT' || !isAdmin) return '';
                const createdDate = new Date(e.created_at);
                const now = new Date();
                const diffDays = (now - createdDate) / (1000 * 60 * 60 * 24);
                if (diffDays <= 3) {
                    return `<button class="action-btn danger" onclick="deleteShippingBill(${e.id})" title="Delete"><i class="fas fa-trash"></i></button>`;
                }
                return '';
            })()}
          </div>
        </td>
      </tr>
    `;
    }, 10);
  } catch (error) {
    console.error("Error loading shipping bills:", error);
  }
}

function getStatusBadge(status) {
  const classes = {
    DRAFT: 'badge-warning',
    APPROVED: 'badge-success',
    DISPATCHED: 'badge-info',
  };
  return classes[status] || '';
}

async function initShippingBillEntry() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');

  if (consignments.length === 0) consignments = await apiCall("/consignments");

  document.getElementById("sb-consignment").innerHTML =
    `<option value="">Select Airline</option>` +
    consignments
      .filter((c) => c.type === "AIRLINE")
      .map((c) => `<option value="${c.id}">${c.name} (${c.code || c.airline_code || ""})</option>`)
      .join("");

  // Populate Country dropdown from countries master
  let countriesList = [];
  try {
    countriesList = await apiCall('/countries');
    const countrySelect = document.getElementById('sb-country');
    if (countrySelect) {
      countrySelect.innerHTML = `<option value="">Select Country</option>` +
        countriesList.map(c => `<option value="${c.code}" data-port="${c.port_of_discharge || ''}">${c.name} (${c.code})</option>`).join('');
      
      // Auto-fill port of discharge on country selection
      countrySelect.addEventListener('change', (e) => {
        const selected = e.target.options[e.target.selectedIndex];
        const countryCode = e.target.value;
        const defaultPort = selected ? selected.getAttribute('data-port') : '';
        
        const user = getAuthUser();
        const airportCode = user.airport_code;

        if (airportCode && countryCode) {
          // Format as COK-SA-COK
          document.getElementById('sb-port').value = `${airportCode}-${countryCode}-${airportCode}`;
        } else if (defaultPort) {
          document.getElementById('sb-port').value = defaultPort;
        }
      });
    }
  } catch (err) { console.log('Countries load:', err.message); }

  // Helper to populate flight dropdown for a given airline
  async function populateFlights(consignment_id, selectedFlight) {
    const flightSelect = document.getElementById('sb-flight');
    if (!flightSelect) return;
    flightSelect.innerHTML = '<option value="">Select Flight</option>';
    if (!consignment_id) return;
    try {
      const flights = await apiCall(`/consignments/flights/list?consignment_id=${consignment_id}`);
      flightSelect.innerHTML = '<option value="">Select Flight</option>' +
        flights.map(f => `<option value="${f.flight_no}" ${f.flight_no === selectedFlight ? 'selected' : ''}>${f.flight_no}</option>`).join('');
    } catch (err) { console.log('Flights load:', err.message); }
  }

  // Listen to Consignment Change to dynamically fetch stock + flights
  const consignmentSelect = document.getElementById("sb-consignment");
  if (consignmentSelect) {
    consignmentSelect.addEventListener('change', async (e) => {
      const consignment_id = e.target.value;
      const user = getAuthUser();
      const branchId = user.role !== 'SUPER_ADMIN' ? user.branch_id : null;
      if (consignment_id) {
          sbAvailableItems = await apiCall(`/outward/available/items?consignment_id=${consignment_id}${branchId ? `&branch_id=${branchId}` : ''}`);
          await populateFlights(consignment_id, null);
      } else {
          sbAvailableItems = [];
          document.getElementById('sb-flight').innerHTML = '<option value="">Select Flight</option>';
      }
      // Reset selected items when airline changes
      if (!currentShippingBillId) {
          sbSelectedItems = [{ inward_item_id: null, description: "", qty: "", available_qty: "", bond_expiry: "", bond_no: "", unit_value: "", value_amount: 0, unit_duty: "", duty_amount: 0 }];
          renderSBItems();
      }
    });
  }

  if (editId) {
    currentShippingBillId = editId;
    document.getElementById("sb-form-title").textContent = "Edit Shipping Bill";
    const saveBtn = document.querySelector('button[onclick="saveShippingBill()"]');
    if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Update Shipping Bill';

    try {
      const bill = await apiCall(`/shipping-bills/${editId}`);
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || "";
      };

      setVal("sb-no", bill.sb_no);
      setVal("sb-date", bill.sb_date ? bill.sb_date.split('T')[0] : "");
      setVal("sb-consignment", bill.consignment_id);
      // Populate flight dropdown for this airline before setting flight value
      if (bill.consignment_id) {
        await populateFlights(bill.consignment_id, bill.flight_no);
      }
      setVal("sb-station", bill.station);
      setVal("sb-etd", bill.etd);
      setVal("sb-vt", bill.vt);
      setVal("sb-remarks", bill.remarks);
      setVal("sb-port", bill.port_of_discharge);
      setVal("sb-country", bill.country_of_destination);

      // Fetch available items for this airline to populate dropdowns
      const user = getAuthUser();
      const branchId = user.role !== 'SUPER_ADMIN' ? user.branch_id : null;
      sbAvailableItems = await apiCall(`/outward/available/items?consignment_id=${bill.consignment_id}${branchId ? `&branch_id=${branchId}` : ''}`);

      // Map existing items
      sbSelectedItems = bill.items.map(item => ({
        id: item.id, // Primary key of shipping_bill_items
        inward_item_id: item.inward_item_id,
        inward_id: item.inward_id,
        item_id: item.item_id,
        description: item.description,
        qty: item.qty,
        available_qty: item.available_qty || item.qty, 
        bond_expiry: item.bond_expiry ? item.bond_expiry.split('T')[0] : "",
        initial_bonding_expiry: item.bond_expiry, // For helper compatibility
        bond_no: item.bond_no || "",
        unit_value: (parseFloat(item.value_amount) / (parseInt(item.qty) || 1)).toFixed(4),
        value_amount: parseFloat(item.value_amount || 0),
        unit_duty: (parseFloat(item.duty_amount) / (parseInt(item.qty) || 1)).toFixed(4),
        duty_amount: parseFloat(item.duty_amount || 0)
      }));

    } catch (err) {
      showToast("Error loading shipping bill: " + err.message, "error");
    }
  } else {
    // New Mode
    currentShippingBillId = null;
    document.getElementById("sb-date").value = new Date().toISOString().split("T")[0];
    sbAvailableItems = [];
    sbSelectedItems = [{ inward_item_id: null, description: "", qty: "", available_qty: "", bond_expiry: "", bond_no: "", unit_value: "", value_amount: 0, unit_duty: "", duty_amount: 0 }];
  }

  renderSBItems();
}

function addShippingBillItem() {
  if (sbAvailableItems.length === 0) {
    showToast("No items available in stock", "error");
    return;
  }

  // Determine items not yet added
  const addedIds = new Set(sbSelectedItems.map((i) => i.inward_item_id));
  const available = sbAvailableItems.filter(
    (i) => !addedIds.has(i.inward_item_id)
  );

  if (available.length === 0) {
    showToast("All available items already added", "warning");
    return;
  }

  const item = available[0];
  const originalQty = parseInt(item.original_qty) || 1;
  const unitValue = (parseFloat(item.value) || 0) / originalQty;
  const unitDuty = (parseFloat(item.duty) || 0) / originalQty;
  const qty = item.available_qty;

  sbSelectedItems.push({
    inward_item_id: item.inward_item_id,
    inward_id: item.inward_id,
    item_id: item.item_id,
    description: item.description,
    bond_no: item.bond_no,
    bond_expiry: formatDateForInput(item.bond_expiry),
    available_qty: item.available_qty,
    qty: qty,
    unit_value: unitValue,
    value_amount: unitValue * qty,
    unit_duty: unitDuty,
    duty_amount: unitDuty * qty,
  });

  renderSBItems();
}

// ============================================
// Return Stock to Origin
// ============================================
let returnInwardEntries = [];
let returnInwardItems = [];

async function loadReturnStockPage() {
  const user = getAuthUser();
  const branchId = user.role === 'SUPER_ADMIN' ? '' : (user.branch_id || '');
  try {
    const data = await apiCall(`/return-stock${branchId ? `?branch_id=${branchId}` : ''}`);
    paginateTable('return-stock-table', data, (e) => `
      <tr>
        <td>${formatDate(e.return_date)}</td>
        <td><strong>${e.bond_no || '-'}</strong></td>
        <td>${e.item_description || '-'}</td>
        <td class="stock-medium">${e.qty_returned}</td>
        <td>${e.remarks || '-'}</td>
        <td>${e.authorised_by || '-'}</td>
      </tr>
    `);
  } catch (error) {
    console.error("Return stock load error:", error);
  }
}

async function openReturnStockModal() {
  try {
    const user = getAuthUser();
    const branchId = user.role !== 'SUPER_ADMIN' ? user.branch_id : null;
    const records = await apiCall(`/inward${branchId ? `?branch_id=${branchId}` : ''}`);
    returnInwardEntries = records.filter(e => e.available_stock > 0);
    
    const bondOptions = '<option value="">Select Bond...</option>' + 
      returnInwardEntries.map(e => `<option value="${e.id}">${e.bond_no} (Bal: ${e.available_stock})</option>`).join('');
    
    const modalHtml = `
      <form id="form-return-stock" onsubmit="event.preventDefault(); saveReturnStock();">
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Return Date *</label>
          <input type="date" class="form-control" id="return-date" required value="${new Date().toISOString().split('T')[0]}" />
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Select Inward Bond *</label>
          <select class="form-control searchable" id="return-bond" required onchange="fetchReturnItems(this.value)">
            ${bondOptions}
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Select Item to Return *</label>
          <select class="form-control searchable" id="return-item" required onchange="updateReturnQtyMax(this)">
            <option value="">Select Item (Choose Bond First)</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Quantity to Return *</label>
          <input type="number" class="form-control" id="return-qty" required min="1" />
          <small class="text-muted" id="return-qty-help">Select an item to see available stock.</small>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Reason / Remarks</label>
          <textarea class="form-control" id="return-remarks" rows="3"></textarea>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label">Authorised By</label>
          <input type="text" class="form-control" id="return-auth" />
        </div>
        <div class="form-actions" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 2rem;">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Process Return</button>
        </div>
      </form>
    `;
    
    openModal('Return Stock to Origin', modalHtml, '');
  } catch (error) {
    showToast("Failed to load bonds", "error");
  }
}

async function fetchReturnItems(inwardId) {
  const itemSelect = document.getElementById('return-item');
  if (itemSelect.tomselect) itemSelect.tomselect.destroy();
  if (!inwardId) {
    itemSelect.innerHTML = '<option value="">Select Item (Choose Bond First)</option>';
    initSearchableSelects();
    return;
  }
  
  try {
    const items = await apiCall(`/inward/${inwardId}/stock`);
    returnInwardItems = items.filter(i => i.available > 0);
    itemSelect.innerHTML = '<option value="">Select Item...</option>' + 
      returnInwardItems.map(i => `<option value="${i.id}">${i.description} (Bal: ${i.available})</option>`).join('');
    initSearchableSelects();
  } catch (error) {
    showToast("Failed to load items", "error");
  }
}

function updateReturnQtyMax(selectElem) {
  const itemId = selectElem.value;
  const qtyInput = document.getElementById('return-qty');
  const helpText = document.getElementById('return-qty-help');
  
  if (!itemId) {
    qtyInput.max = "";
    helpText.innerText = "Select an item to see available stock.";
    return;
  }
  
  const item = returnInwardItems.find(i => i.id == itemId);
  if (item) {
    qtyInput.max = item.available;
    helpText.innerText = `Max available to return: ${item.available}`;
  }
}

async function saveReturnStock() {
  const data = {
    return_date: document.getElementById('return-date').value,
    inward_id: document.getElementById('return-bond').value,
    inward_item_id: document.getElementById('return-item').value,
    qty_returned: parseInt(document.getElementById('return-qty').value),
    remarks: document.getElementById('return-remarks').value,
    authorised_by: document.getElementById('return-auth').value
  };

  if (!data.inward_id || !data.inward_item_id || !data.qty_returned) {
    showToast("Please fill all required fields", "error");
    return;
  }

  try {
    await apiCall('/return-stock', 'POST', data);
    showToast("Return stock processed successfully");
    closeModal();
    loadReturnStockPage();
  } catch (error) {
    console.error("Save return stock error:", error);
  }
}

// Helper to get the latest expiry date from initial and extended dates
function getLastExpiry(item) {
  if (item.bond_expiry && !item.initial_bonding_expiry) return item.bond_expiry; // Existing selected item with computed expiry
  const dates = [
    item.initial_bonding_expiry,
    item.extended_bonding_expiry1,
    item.extended_bonding_expiry2,
    item.extended_bonding_expiry3
  ].filter(d => d); 
  if (dates.length === 0) return "";
  return dates.sort().pop();
}

function formatSBOption(item) {
  if (!item || !item.inward_item_id) return "";
  const expiry = getLastExpiry(item); // Calculate latest expiry
  return `(Bal: ${item.available_qty}) ${item.bond_no} - ${item.description} (Exp: ${formatDate(expiry)})`;
}

function renderSBItems() {
  const tbody = document.getElementById("sb-items-tbody");
  // Determine items not yet added for future "add" dropdown
  // Note: For the current row, we need its own item to be available in lookup
  // But for the dropdown list, we filter out *other* added items.
  const addedIds = new Set(sbSelectedItems.map((i) => i.inward_item_id));

  tbody.innerHTML = sbSelectedItems
    .map(
      (item, idx) => {
        // Filter available items for THIS row (all available except those used in OTHER rows)
        // Actually simplest is just filter out ones used in OTHER rows. 
        // But `addedIds` has ALL used IDs.
        // So we filter `!addedIds.has(i.inward_item_id)`. 
        // BUT we must include the current item itself in the list.
        // For blank rows, show all available items (except those used in other rows)
        // AND exclude items with 0 available qty
        // AND exclude expired items (expiry < today)
        const today = new Date().toISOString().split('T')[0];
        const rowAvailable = sbAvailableItems.filter(
            (i) => (!addedIds.has(i.inward_item_id) || (item.inward_item_id && i.inward_item_id === item.inward_item_id)) 
                   && i.available_qty > 0
        );

        return `
    <tr>
      <td>${idx + 1}</td>
      <td>
        <input class="form-control form-control-sm" list="sb-items-list-${idx}" 
          value="${formatSBOption(item)}"
          readonly
          onclick="openItemSelectionModal('STOCK', (item) => updateSBItemSource(${idx}, formatSBOption(item)))"
          placeholder="Click to search..."
          style="min-width: 250px; width: 100%; cursor: pointer;"
        />
        <datalist id="sb-items-list-${idx}">
          ${rowAvailable.filter(i => !item.inward_item_id || i.inward_item_id !== item.inward_item_id).map((a) => `<option value="${formatSBOption(a)}"></option>`).join("")}
        </datalist>
      </td>
      <td><input type="date" class="form-control form-control-sm" value="${formatDateForInput(item.bond_expiry)}" onchange="updateSBItemField(${idx}, 'bond_expiry', this.value)" /></td>
      <td>${item.description}</td>
      <td>${item.available_qty}</td>
      <td><input type="number" id="sb-qty-${idx}" class="form-control form-control-sm" value="${item.qty}" min="1" max="${item.available_qty}" onchange="updateSBItemQty(${idx}, this.value)" style="width:70px" /></td>
      <td><input type="number" class="form-control form-control-sm" value="${item.unit_value}" step="0.01" onchange="updateSBItemUnitValue(${idx}, this.value)" style="width:90px" /></td>
      <td>${(parseFloat(item.value_amount) || 0).toFixed(2)}</td>
      <td><input type="number" class="form-control form-control-sm" value="${item.unit_duty}" step="0.01" onchange="updateSBItemUnitDuty(${idx}, this.value)" style="width:90px" /></td>
      <td>${(parseFloat(item.duty_amount) || 0).toFixed(2)}</td>
      <td class="text-end"><button class="btn btn-sm btn-danger" onclick="removeSBItem(${idx})"><i class="fas fa-times"></i></button></td>
    </tr>`;
      }
    )
    .join("");


  // Update totals
  const totalQty = sbSelectedItems.reduce((s, i) => s + (parseInt(i.qty) || 0), 0);
  const totalValue = sbSelectedItems.reduce((s, i) => s + (parseFloat(i.value_amount) || 0), 0);
  const totalDuty = sbSelectedItems.reduce((s, i) => s + (parseFloat(i.duty_amount) || 0), 0);

  document.getElementById("sb-total-qty").textContent = totalQty;
  document.getElementById("sb-total-value").textContent = totalValue.toFixed(2);
  document.getElementById("sb-total-duty").textContent = totalDuty.toFixed(2);
  // Re-initialize date pickers
  initFlatpickr();
}

function updateSBItemSource(idx, valueStr) {
  // Find item by matching the formatted string
  // We search in sbAvailableItems. 
  // If multiple items match the string (duplicate data), we pick the first one 
  // that is NOT already used in another row.
  
  const addedIds = new Set(sbSelectedItems.map((i, iIdx) => iIdx === idx ? -1 : i.inward_item_id));
  
  const item = sbAvailableItems.find(
    (i) => formatSBOption(i) === valueStr && !addedIds.has(i.inward_item_id)
  );
  
  if (!item) return;
  const originalQty = parseInt(item.original_qty) || 1;
  const unitValue = (parseFloat(item.value) || 0) / originalQty;
  const unitDuty = (parseFloat(item.duty) || 0) / originalQty;
  sbSelectedItems[idx] = {
    ...sbSelectedItems[idx],
    inward_item_id: item.inward_item_id,
    inward_id: item.inward_id,
    item_id: item.item_id,
    description: item.description,
    bond_no: item.bond_no,
    bond_no: item.bond_no,
    bond_expiry: formatDateForInput(getLastExpiry(item)), // Use calculated latest expiry
    available_qty: item.available_qty,
    available_qty: item.available_qty,
    qty: item.available_qty,
    unit_value: unitValue,
    value_amount: unitValue * item.available_qty,
    unit_duty: unitDuty,
    duty_amount: unitDuty * item.available_qty,
  };

  // If this was the last item (empty row), add a new empty row
  if (idx === sbSelectedItems.length - 1) {
    sbSelectedItems.push({ inward_item_id: null, description: "", qty: "", available_qty: "", bond_expiry: "", bond_no: "", unit_value: "", value_amount: 0, unit_duty: "", duty_amount: 0 });
  }

  renderSBItems();
  // Re-initialize date pickers for new rows
  initFlatpickr(); 
  
  // Focus logic: set timeout to allow DOM update
  setTimeout(() => {
    const qtyInput = document.getElementById(`sb-qty-${idx}`);
    if (qtyInput) qtyInput.focus();
  }, 50);
}

function updateSBItemQty(idx, val) {
  const qty = parseInt(val) || 0;
  sbSelectedItems[idx].qty = Math.min(qty, sbSelectedItems[idx].available_qty);
  sbSelectedItems[idx].value_amount = sbSelectedItems[idx].unit_value * sbSelectedItems[idx].qty;
  sbSelectedItems[idx].duty_amount = sbSelectedItems[idx].unit_duty * sbSelectedItems[idx].qty;
  renderSBItems();
}

function updateSBItemUnitValue(idx, val) {
  sbSelectedItems[idx].unit_value = parseFloat(val) || 0;
  sbSelectedItems[idx].value_amount = sbSelectedItems[idx].unit_value * sbSelectedItems[idx].qty;
  renderSBItems();
}

function updateSBItemUnitDuty(idx, val) {
  sbSelectedItems[idx].unit_duty = parseFloat(val) || 0;
  sbSelectedItems[idx].duty_amount = sbSelectedItems[idx].unit_duty * sbSelectedItems[idx].qty;
  renderSBItems();
}

function updateSBItemField(idx, field, val) {
  sbSelectedItems[idx][field] = val;
}

function removeSBItem(idx) {
  sbSelectedItems.splice(idx, 1);
  renderSBItems();
}

async function saveShippingBill() {
  const sbNo = document.getElementById("sb-no").value.trim();
  // Ensure sbDate is correctly captured even if flatpickr hasn't synced to the hidden input yet.
  // Accessing the flatpickr instance directly is the most reliable way.
  const sbDateInput = document.getElementById("sb-date");
  const sbDate = sbDateInput._flatpickr ? sbDateInput._flatpickr.selectedDates[0] ? sbDateInput._flatpickr.formatDate(sbDateInput._flatpickr.selectedDates[0], "Y-m-d") : "" : sbDateInput.value;
  const consignmentId = document.getElementById("sb-consignment").value;

  if (!sbNo) { showToast("Shipping Bill No is required", "error"); return; }
  if (!sbDate) { showToast("Shipping Bill Date is required", "error"); return; }
  if (!consignmentId) { showToast("Airline selection is required", "error"); return; }

  const items = sbSelectedItems
    .filter((i) => i.inward_item_id && i.qty > 0)
    .map((i) => ({
      id: i.id || null, // Include item ID for updates
      inward_item_id: i.inward_item_id,
      inward_id: i.inward_id,
      item_id: i.item_id,
      description: i.description,
      qty: i.qty,
      value_amount: i.value_amount,
      duty_amount: i.duty_amount,
      unit_value: i.unit_value,
      unit_duty: i.unit_duty,
      bond_no: i.bond_no,
      bond_date: i.bond_date,
      bond_expiry: i.bond_expiry
    }));

  if (items.length === 0) {
    showToast("At least one item with quantity > 0 is required", "error");
    return;
  }

  const user = getAuthUser();
  const payload = {
    sb_no: sbNo,
    sb_date: sbDate,
    consignment_id: consignmentId,
    flight_no: document.getElementById("sb-flight").value,
    station: document.getElementById("sb-station").value,
    etd: document.getElementById("sb-etd").value,
    vt: document.getElementById("sb-vt").value,
    remarks: document.getElementById("sb-remarks") ? document.getElementById("sb-remarks").value : "",
    port_of_discharge: document.getElementById("sb-port") ? document.getElementById("sb-port").value : "",
    country_of_destination: document.getElementById("sb-country") ? document.getElementById("sb-country").value : "",
    items: items,
    branch_id: user.branch_id,
    user_role: user.role,
    user_branch_id: user.branch_id
  };

  try {
    const url = currentShippingBillId ? `/shipping-bills/${currentShippingBillId}` : "/shipping-bills";
    const method = currentShippingBillId ? "PUT" : "POST";
    
    await apiCall(url, method, payload);
    showToast(`Shipping Bill ${currentShippingBillId ? 'updated' : 'saved'} successfully`, "success");
    setTimeout(() => (window.location.href = "shipping-bill.html"), 800);
  } catch (error) {
    showToast(error.message || "Error saving shipping bill", "error");
  }
}

async function approveShippingBill(id) {
  if (!confirm("Approve this shipping bill? This will also release stock and create an outward entry.")) return;
  try {
    const user = getAuthUser();
    const result = await apiCall(`/shipping-bills/${id}/approve`, "PUT", { 
        approved_by: user.name,
        user_role: user.role,
        user_branch_id: user.branch_id
    });
    showToast(result.message || "Approved!", "success");
    await loadShippingBillsListPage();
  } catch (error) {
    showToast(error.message || "Error approving", "error");
  }
}



async function unapproveShippingBill(id) {
  // Create a styled modal for remarks
  const modalHtml = `
    <div class="modal-overlay" id="unapprove-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
      <div class="card" style="width:500px;max-width:90%;padding:2rem;">
        <h3 style="margin-bottom:1rem;color:var(--danger-color,#e74c3c);">
          <i class="fas fa-exclamation-triangle"></i> Unapprove Shipping Bill
        </h3>
        <p style="margin-bottom:1rem;color:var(--text-secondary);">Please provide a reason for unapproving this shipping bill. This will delete associated outward entries and revert the bill to DRAFT status.</p>
        <div class="form-group" style="margin-bottom:1.5rem;">
          <label class="form-label">Reason for Unapproval *</label>
          <textarea id="unapprove-remarks" class="form-control" rows="3" placeholder="Enter reason..." style="resize:vertical;"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.75rem;">
          <button class="btn" onclick="document.getElementById('unapprove-modal').remove()" style="background:var(--bg-tertiary);color:var(--text-primary);">Cancel</button>
          <button class="btn btn-danger" id="btn-confirm-unapprove">Confirm Unapproval</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  setTimeout(() => {
    const m = document.getElementById('unapprove-modal');
    if (m) m.classList.add('active');
  }, 10);

  document.getElementById('btn-confirm-unapprove').addEventListener('click', async () => {
    const remarks = document.getElementById('unapprove-remarks').value.trim();
    if (!remarks) {
      showToast("Remarks are mandatory for unapproval.", "error");
      return;
    }
    document.getElementById('unapprove-modal').remove();
    try {
      const user = getAuthUser();
      await apiCall(`/shipping-bills/${id}/unapprove`, "POST", {
        unapproved_by: user.name || user.username,
        remarks,
        user_role: user.role,
        user_branch_id: user.branch_id
      });
      showToast("Shipping bill unapproved successfully.", "success");
      loadShippingBillsListPage();
    } catch (error) {
      showToast(error.message || "Error unapproving shipping bill", "error");
    }
  });
}

async function rejectShippingBill(id) {
  const modalHtml = `
    <div class="modal-overlay" id="reject-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
      <div class="card" style="width:500px;max-width:90%;padding:2rem;">
        <h3 style="margin-bottom:1rem;color:var(--warning-color,#f39c12);">
          <i class="fas fa-times-circle"></i> Not Approved - Shipping Bill
        </h3>
        <p style="margin-bottom:1rem;color:var(--text-secondary);">Please provide a reason for not approving this shipping bill. The staff will be able to edit and resubmit.</p>
        <div class="form-group" style="margin-bottom:1.5rem;">
          <label class="form-label">Reason *</label>
          <textarea id="reject-remarks" class="form-control" rows="3" placeholder="Enter reason for not approving..." style="resize:vertical;"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.75rem;">
          <button class="btn" onclick="document.getElementById('reject-modal').remove()" style="background:var(--bg-tertiary);color:var(--text-primary);">Cancel</button>
          <button class="btn btn-warning" id="btn-confirm-reject">Submit</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  setTimeout(() => {
    const m = document.getElementById('reject-modal');
    if (m) m.classList.add('active');
  }, 10);

  document.getElementById('btn-confirm-reject').addEventListener('click', async () => {
    const remarks = document.getElementById('reject-remarks').value.trim();
    if (!remarks) {
      showToast("Remarks are mandatory.", "error");
      return;
    }
    document.getElementById('reject-modal').remove();
    try {
      const user = getAuthUser();
      await apiCall(`/shipping-bills/${id}/reject`, "POST", {
        rejected_by: user.name || user.username,
        remarks,
        user_role: user.role,
        user_branch_id: user.branch_id
      });
      showToast("Shipping bill marked as Not Approved.", "success");
      loadShippingBillsListPage();
    } catch (error) {
      showToast(error.message || "Error rejecting shipping bill", "error");
    }
  });
}

function deleteShippingBill(id) {
    const body = `
        <div style="text-align: center; padding: 20px;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--danger-color); margin-bottom: 20px;"></i>
            <h3 style="margin-bottom: 10px;">Confirm Deletion</h3>
            <p>Are you sure you want to delete this draft shipping bill?</p>
            <p style="color: #666; font-size: 0.9rem; margin-top: 5px;">This action cannot be undone.</p>
        </div>
    `;
    openModal("Delete Shipping Bill", body, `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="confirmDeleteShippingBill(${id})">Delete Now</button>
    `, "active");
}

async function confirmDeleteShippingBill(id) {
  try {
    const user = getAuthUser();
    await apiCall(`/shipping-bills/${id}`, "DELETE", { user_role: user.role });
    showToast("Shipping bill deleted", "success");
    closeModal();
    await loadShippingBillsListPage();
  } catch (error) {
    showToast(error.message || "Error deleting", "error");
  }
}

async function viewShippingBill(id) {
  try {
    const bill = await apiCall(`/shipping-bills/${id}`);
    const user = getAuthUser();
    const items = bill.items || [];
    const totalQty = items.reduce((s, i) => s + (parseInt(i.qty) || 0), 0);
    const totalValue = items.reduce((s, i) => s + (parseFloat(i.value_amount) || 0), 0);
    const totalDuty = items.reduce((s, i) => s + (parseFloat(i.duty_amount) || 0), 0);

    const modal = document.createElement("div");
    modal.className = "modal-overlay active";
    modal.innerHTML = `
      <div class="modal" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <h2>Shipping Bill: ${bill.sb_no}</h2>
          <span>${getStatusBadge(bill.status)}</span>
          <button class="icon-btn" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-grid-3" style="margin-bottom: 16px;">
            <div><strong>Date:</strong> ${bill.sb_date}</div>
            <div><strong>Flight:</strong> ${bill.flight_no || "-"}</div>
            <div><strong>Airline:</strong> ${bill.consignment_name || "-"}</div>
            <div><strong>Station:</strong> ${bill.station || "-"}</div>
            <div><strong>ETD:</strong> ${bill.etd || "-"}</div>
            <div><strong>VT:</strong> ${bill.vt || "-"}</div>
          </div>
          <table class="table">
            <thead><tr><th>S.No</th><th>Bond No</th><th>Description</th><th>QTY</th><th>Value</th><th>Duty</th></tr></thead>
            <tbody>
              ${items.map((item, i) => `<tr><td>${i + 1}</td><td>${item.bond_no || "-"}</td><td>${item.description}</td><td>${item.qty}</td><td>₹${parseFloat(item.value_amount || 0).toFixed(2)}</td><td>₹${parseFloat(item.duty_amount || 0).toFixed(2)}</td></tr>`).join("")}
              <tr style="font-weight: bold; background: var(--bg-hover);"><td colspan="3">TOTAL</td><td>${totalQty}</td><td>₹${totalValue.toFixed(2)}</td><td>₹${totalDuty.toFixed(2)}</td></tr>
            </tbody>
          </table>
          ${bill.approved_by ? `<p style="margin-top:12px"><strong>Approved by:</strong> ${bill.approved_by} at ${bill.approved_at || ""}</p>` : ""}
        </div>
        <div class="modal-footer">
          ${(bill.status === "DRAFT" && ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'APPROVER'].includes(user.role)) ? `<button class="btn btn-success" onclick="this.closest('.modal-overlay').remove(); approveShippingBill(${bill.id})"><i class="fas fa-check"></i> Approve</button>` : ""}
          ${(bill.status === "APPROVED" && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) ? `<button class="btn btn-warning" onclick="this.closest('.modal-overlay').remove(); unapproveShippingBill(${bill.id})"><i class="fas fa-undo"></i> Unapprove</button>` : ""}
          <button class="btn btn-secondary" onclick="printShippingBill(${bill.id})"><i class="fas fa-print"></i> Print</button>
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  } catch (error) {
    showToast(error.message || "Error loading shipping bill", "error");
  }
}

async function printShippingBill(id) {
  try {
    const bill = await apiCall(`/shipping-bills/${id}`);
    const items = bill.items || [];
    const totalQty = items.reduce((s, i) => s + (parseInt(i.qty) || 0), 0);
    const totalValue = items.reduce((s, i) => s + (parseFloat(i.value_amount) || 0), 0);
    const totalDuty = items.reduce((s, i) => s + (parseFloat(i.duty_amount) || 0), 0);

    // Format date as DD.MM.YYYY
    const fmtDate = (d) => {
      if (!d) return '';
      // Ensure we have a string
      const str = String(d);
      // Try to extract YYYY-MM-DD using regex
      const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return `${match[3]}.${match[2]}.${match[1]}`;
      }
      return str;
    };

    // Build 25 item rows (empty rows for unused slots)
    let itemRows = '';
    for (let i = 0; i < 25; i++) {
      if (i < items.length) {
        const it = items[i];
        itemRows += `<tr>
          <td class="c">${i + 1}</td>
          <td>${it.bond_no || ''}</td>
          <td>${fmtDate(it.bond_expiry) || ''}</td>
          <td>${it.description || ''}</td>
          <td class="r">${it.qty}</td>
          <td class="r">${parseFloat(it.unit_value || 0).toFixed(2)}</td>
          <td class="r">${parseFloat(it.value_amount || 0).toFixed(2)}</td>
          <td class="r">${parseFloat(it.unit_duty || 0).toFixed(2)}</td>
          <td class="r">${parseFloat(it.duty_amount || 0).toFixed(2)}</td>
        </tr>`;
      } else {
        itemRows += `<tr>
          <td class="c">${i + 1}</td>
          <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
        </tr>`;
      }
    }

    const airlineName = bill.consignment_name || '';
    const printWin = window.open("", "_blank");
    printWin.document.write(`<!DOCTYPE html><html><head>
    <title>Shipping Bill - ${bill.sb_no}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Times New Roman', serif; font-size: 11px; padding: 15px; line-height: 1.3; color: #000; }

      /* --- Top 3-column header --- */
      .top-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
      .top-left { font-size: 10px; }
      .top-left .bold { font-weight: bold; font-size: 11px; }
      .top-center { text-align: center; font-size: 13px; font-weight: bold; }
      .top-right { text-align: right; font-size: 11px; }
      .top-right .title-right { font-weight: bold; font-size: 13px; margin-bottom: 2px; }
      .top-right table { margin-left: auto; }
      .top-right table td { border: none; padding: 1px 4px; font-size: 11px; text-align: left; }
      .top-right table td:first-child { font-weight: bold; }

      /* --- Exporter block --- */
      .exporter { margin: 6px 0; font-size: 11px; }
      .exporter table td { border: none; padding: 1px 4px; vertical-align: top; font-size: 11px; }
      .exporter-name { font-weight: bold; }

      /* --- Station + Aircraft header --- */
      .station-line { font-weight: bold; font-size: 11px; margin: 6px 0 4px 0; }
      .aircraft-header { width: 100%; border-collapse: collapse; margin-bottom: 0; }
      .aircraft-header td { border: 1px solid #000; padding: 3px 5px; font-size: 10px; font-weight: bold; }

      /* --- Particulars note --- */
      .particulars-note { text-align: center; font-size: 9px; font-style: italic; border-left: 1px solid #000; border-right: 1px solid #000; padding: 2px; }

      /* --- Items table --- */
      .items-table { width: 100%; border-collapse: collapse; }
      .items-table th {
        border: 1px solid #000; padding: 3px 4px; font-size: 8px; font-weight: bold;
        text-align: center; background: none; vertical-align: bottom;
      }
      .items-table td { border: 1px solid #000; padding: 2px 4px; font-size: 9px; height: 18px; }
      .items-table .c { text-align: center; }
      .items-table .r { text-align: right; }
      .total-row td { font-weight: bold; }

      /* --- Footer --- */
      .entered-section { display: flex; justify-content: space-between; margin-top: 8px; font-size: 10px; }
      .entered-left { }
      .entered-right { text-align: right; font-size: 9px; }

      /* --- Declarations --- */
      .declarations { margin-top: 10px; font-size: 9.5px; }
      .decl-block { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 12px; }
      .decl-left, .decl-right { flex: 1; }
      .decl-right { text-align: left; }
      .officer-name { font-weight: bold; text-transform: uppercase; }
      .officer-title { font-size: 9px; }

      /* --- Bottom signatures --- */
      .bottom-sigs { display: flex; justify-content: space-between; gap: 20px; margin-top: 15px; font-size: 9px; }
      .sig-col { flex: 1; }
      .sig-col .sig-line { border-top: none; padding-top: 25px; }

      @media print {
        body { padding: 8mm; }
        @page { size: A4 portrait; margin: 8mm; }
      }
    </style></head><body>

    <!-- ===== TOP HEADER ===== -->
    <div class="top-header">
      <div class="top-left">
        <div class="bold">FOR EXPORT FROM BOND</div>
        <div>Shipping Bill for Foreign Goods Re-exported</div>
      </div>
      <div class="top-center">FOR AIRCRAFT USE</div>
      <div class="top-right">
        <div class="title-right">DUTY FREE GOODS</div>
        <table>
          <tr><td>FLT. NO.</td><td>: ${bill.flight_no || ''}</td></tr>
          <tr><td>DATE</td><td>: ${fmtDate(bill.sb_date)}</td></tr>
          <tr><td>ETD</td><td>: ${bill.etd || ''}</td></tr>
          <tr><td>VT</td><td>: ${bill.vt || ''}</td></tr>
        </table>
      </div>
    </div>

    <!-- ===== EXPORTER ===== -->
    <div class="exporter">
      <table>
        <tr>
          <td><b>Exporters Name :</b></td>
          <td class="exporter-name">CASINO AIR CATERERS & FLIGHT SERVICES</td>
        </tr>
        <tr>
          <td><b>ADDRESS :</b></td>
          <td>(Unit of Anjali Hotels Pvt.Ltd)</td>
        </tr>
      </table>
    </div>

    <!-- ===== STATION ===== -->
    <div class="station-line">STATION: ${bill.station || 'COCHIN'}</div>

    <!-- ===== AIRCRAFT / ROUTE HEADER ===== -->
    <table class="aircraft-header">
      <tr>
        <td style="width:18%">Name Of Aircraft<br><span style="font-weight:normal">${bill.flight_no || ''}</span></td>
        <td style="width:18%">Master/Agents</td>
        <td style="width:12%">Colours</td>
        <td style="width:22%">Port Of Discharge<br><span style="font-weight:normal">${bill.port_of_discharge || 'COK/KWI/COK'}</span></td>
        <td style="width:30%">Country of Final Destination<br><span style="font-weight:normal">${bill.country_of_destination || 'KWI'}</span></td>
      </tr>
    </table>

    <!-- ===== PARTICULARS NOTE ===== -->
    <div class="particulars-note">Particulars declared in this shipping bill are checked and found correct</div>

    <!-- ===== ITEMS TABLE ===== -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:4%">S.No.</th>
          <th style="width:12%">Bond No.</th>
          <th style="width:10%">Expiry date</th>
          <th style="width:30%">Detailed Description of Goods&ensp;Distinguishing<br>Size, brand etc.</th>
          <th style="width:6%">QTY.</th>
          <th style="width:10%">Unit<br>Value</th>
          <th style="width:10%">Value<br>Amount</th>
          <th style="width:9%">Unit<br>Duty</th>
          <th style="width:10%">Duty<br>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <!-- ===== ENTERED NO ===== -->
    <div class="entered-section">
      <div class="entered-left">
        <b>Entered No:</b>&emsp;${bill.entered_no || '___________'}&emsp;&emsp;${fmtDate(bill.entered_date) || fmtDate(bill.sb_date)}
      </div>
      <div class="entered-right">
        Permitted free of duty under Section 87 of the New<br>
        Customs Act under Preventive Supervision.
      </div>
    </div>

    <!-- ===== DECLARATIONS ===== -->
    <div class="declarations">
      <div class="decl-block">
        <div class="decl-left">
          <p>Particulars declared in this shipping bill are checked and found
          Correct</p>
          <div style="margin-top: 30px;">
           
            <div class="officer-title">Inspector of Customs</div>
          </div>
        </div>
        <div class="decl-right">
          <div style="margin-top: 40px;">
           
            <div class="officer-title">For ASSISTANT COMMISSIONER OF CUSTOMS</div>
          </div>
        </div>
      </div>

      <div class="decl-block">
        <div class="decl-left">
          <p>The goods covered by this shipping bill are shipped direct from the
          private bond of M/S. CASINO AIR CATERERS & FLIGHT SERVICES
          situated at NAVATHOSE per VT ............ under my escort and
          Supervision.</p>
          <div style="margin-top: 49px;">
        
            <div class="officer-title"><b>Inspector of Customs</b></div>
          </div>
        </div>
        <div class="decl-right">
          <p>We hereby declare that the particulars given above to be true. We also apply
          for permission to clear the shipment, the goods mentioned herein from the
          CASINO AIR CATERERS AND FLIGHT SERVICES, being a Special Warehouse
          Licensee appointed under New Customs Act, 1962.</p>
          <div style="margin-top: 36px;">
           
            <div class="officer-title">For CASINO AIR CATERERS & FLIGHT SERVICES</div>
          </div>
        </div>
      </div>

      <!-- Contents received on board -->
      <div style="margin-left: 25%; text-align: center; margin-top: 40px; font-size: 9px;">
        <div>Contents Received on Board</div>
        <div><b>Aircraft Commander</b></div>
      </div>
    </div>

    </body></html>`);
    printWin.document.close();
    setTimeout(() => printWin.print(), 500);
  } catch (error) {
    showToast("Error generating print view", "error");
  }
}



async function loadConsignmentStockReport() {
  try {
    const data = await apiCall("/reports/consignment-wise");
    const tbody = document.querySelector("#consignment-stock-table tbody");
    tbody.innerHTML =
      data.entries
        .map(
          (e) => `
            <tr>
                <td><strong>${e.consignment_name}</strong> (${e.consignment_code || ""})</td>
                <td>${e.total_inwards}</td>
                <td>${e.total_received}</td>
                <td>${e.total_dispatched}</td>
                <td class="${e.stock_balance < 10 ? "stock-medium" : "stock-high"}"><strong>${e.stock_balance}</strong></td>
                <td>${formatCurrency(e.total_value)}</td>
                <td>${formatCurrency(e.total_duty)}</td>
            </tr>
        `,
        )
        .join("") ||
      '<tr><td colspan="7" class="empty-state">No active stock found</td></tr>';
  } catch (error) {
    console.error("Consignment report error:", error);
  }
}

async function loadDetailedStockReport() {
  const params = new URLSearchParams();
  const bondNo = document.getElementById("stock-filter-bond")?.value;
  const consignmentId = document.getElementById("stock-filter-consignment")?.value;
  if (bondNo) params.append("bond_no", bondNo);
  if (consignmentId) params.append("consignment_id", consignmentId);
  const user = getAuthUser();
  if (user.role !== 'SUPER_ADMIN' && user.branch_id) params.append("branch_id", user.branch_id);
  
  const fromDate = document.getElementById("stock-filter-from")?.value;
  const toDate = document.getElementById("stock-filter-to")?.value;
  const expiryDate = document.getElementById("stock-filter-expiry")?.value;

  if (fromDate) params.append('from_date', fromDate);
  if (toDate) params.append('to_date', toDate);
  if (expiryDate) params.append('expiry_date', expiryDate);

  const consignmentEl = document.getElementById("stock-filter-consignment");
  // Load consignments for filter if not yet done
  if (consignments.length === 0) {
    const res = await apiCall("/consignments?type=AIRLINE");
    consignments = Array.isArray(res) ? res : [];
    if (consignmentEl) {
      consignmentEl.innerHTML =
        '<option value="">All Consignments</option>' +
        consignments
          .map(
            (c) =>
              `<option value="${c.id}" ${consignmentId == c.id ? "selected" : ""}>${c.name}</option>`,
          )
          .join("");
      
      if (consignmentEl.tomselect) {
        consignmentEl.tomselect.sync();
      }
    }
  }

  // Load unique bond numbers for filter
  const bondEl = document.getElementById("stock-filter-bond");
  if (bondEl && bondEl.options.length <= 1) {
    try {
      const user = getAuthUser();
      const branchId = user.role !== 'SUPER_ADMIN' ? user.branch_id : null;
      console.log(`Fetching unique bond numbers for branch: ${branchId}`);
      const bondNumbers = await apiCall(`/reports/unique-bond-numbers${branchId ? `?branch_id=${branchId}` : ''}`);
      console.log("Bond Numbers received:", bondNumbers);
      bondEl.innerHTML = '<option value="">All Bond Numbers</option>' + 
        bondNumbers.map(b => `<option value="${b}" ${bondNo == b ? "selected" : ""}>${b}</option>`).join("");
      
      // Sync TomSelect if it exists
      if (bondEl.tomselect) {
        bondEl.tomselect.sync();
      }
    } catch (err) {
      console.error("Failed to load unique bond numbers", err);
    }
  }

  // Initialize/refresh searchable selects (TomSelect)
  initSearchableSelects();

  try {
    const query = params.toString() ? `?${params.toString()}` : "";
    console.log(`Fetching stock report with query: ${query}`);
    const data = await apiCall(`/reports/stock-report${query}`);
    const entries = Array.isArray(data) ? data : (data.entries || []);
    console.log(`Stock report data received: ${entries.length} items`);
    const tbody = document.querySelector("#detailed-stock-table tbody");
    if (!tbody) {
      console.error("Could not find tbody for #detailed-stock-table");
      return;
    }
    paginateTable("detailed-stock-table", entries, (e) => `
            <tr>
                <td>${e.be_no}<br><small>${formatDate(e.be_date)}</small></td>
                <td><strong><a href="#" onclick="event.preventDefault(); openLedgerModal('bond', '${e.bond_no}', '${e.bond_no}')">${e.bond_no}</a></strong></td>
                <td><a href="#" onclick="event.preventDefault(); openLedgerModal('item', '${e.id}', '${e.description}')">${e.description}</a></td>
                <td>${e.qty}</td>
                <td class="${e.available_qty < 10 ? "stock-medium" : "stock-high"}"><strong>${e.available_qty}</strong></td>
                <td>${formatDate(e.initial_bonding_expiry)}</td>
                <td>${e.consignment_name}</td>
            </tr>
        `, 7);
  } catch (error) {
    console.error("Detailed stock error:", error);
  }
}

async function openLedgerModal(type, id, reference) {
  try {
    console.log(`Opening ledger modal: type=${type}, id=${id}, ref=${reference}`);
    if (!id || id === 'undefined') {
        showToast(`Invalid ID provided for ${type} ledger`, 'error');
        return;
    }

    const records = await apiCall(`/reports/ledger?type=${type}&id=${encodeURIComponent(id)}`);
    console.log("Ledger records:", records);
    
    const qtyKey = records.length > 0 ? Object.keys(records[0]).find(k => k.includes('qty')) || 'qty' : 'qty';

    const modalTitle = type === 'bond' ? `Ledger: Bond ${reference}` : `Ledger: Item ${reference}`;
    
    let runningBalance = 0;
    
    const rowsHtml = records.map(r => {
      const isAdd = r.txn_type === 'INWARD' || r.txn_type === 'RETURNED';
      const isSub = r.txn_type === 'OUTWARD' || r.txn_type === 'DAMAGED';
      const qty = parseFloat(r[qtyKey]) || parseFloat(r.qty) || 0;
      
      if (isAdd) runningBalance += qty;
      else if (isSub) runningBalance -= qty;
      
      let badgeClass = 'bg-secondary';
      if (r.txn_type === 'INWARD') badgeClass = 'bg-primary';
      if (r.txn_type === 'OUTWARD') badgeClass = 'bg-warning';
      if (r.txn_type === 'RETURNED') badgeClass = 'bg-info';
      
      return `
        <tr>
          <td>${formatDate(r.date)}</td>
          <td><span class="badge ${badgeClass}">${r.txn_type}</span></td>
          <td>${r.reference || ''}</td>
          <td>${r.remarks || ''}</td>
          <td class="text-right ${isAdd ? 'text-success' : ''}">${isAdd ? '+' + qty : '-'}</td>
          <td class="text-right ${isSub ? 'text-danger' : ''}">${isSub ? '-' + qty : '-'}</td>
          <td class="text-right"><strong>${runningBalance}</strong></td>
        </tr>
      `;
    }).join("") || '<tr><td colspan="7" class="text-center">No ledger entries found.</td></tr>';

    const modalHtml = `
      <div class="table-responsive" style="max-height: 50vh; overflow-y: auto;">
        <table class="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Reference</th>
              <th>Remarks</th>
              <th class="text-right">In (+)</th>
              <th class="text-right">Out (-)</th>
              <th class="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    openModal(modalTitle, modalHtml, '<button class="btn btn-secondary" onclick="closeModal()">Close</button>');
  } catch (error) {
    showToast(error.message || 'Failed to fetch ledger', 'error');
  }
}

// ============================================
// Initialize
// ============================================

// Initialize Flatpickr for futuristic date pickers
function initFlatpickr() {
  if (typeof flatpickr !== 'undefined') {
    flatpickr('input[type="date"]:not(.flatpickr-input)', {
      allowInput: true,
      dateFormat: "Y-m-d",
      disableMobile: true, // Use Flatpickr UI instead of native mobile picker
      theme: "dark"
    });
  }
}

// ============================================
// Item Selection Modal Logic
// ============================================

let currentModalResolver = null;
let itemsMasterTemp = []; // Store item master data

async function fetchItemsMaster() {
  try {
    itemsMasterTemp = await apiCall("/items"); 
  } catch (e) {
    console.error("Failed to load item master", e);
  }
}

function openItemSelectionModal(mode, callback) {
  // Remove existing modal if any
  const existing = document.getElementById('item-selection-modal');
  if (existing) existing.remove();

  // Create Modal DOM
  const modal = document.createElement('div');
  modal.id = 'item-selection-modal';
  modal.className = 'item-selection-modal';
  
  let title = 'Select Item';
  let items = [];
  
  // Determine data source
  if (mode === 'STOCK') {
    title = 'Select Stock Item (Shipping Bill)';
    // Use sbAvailableItems but filter out zero qty, expired, and mismatched airline
    const today = new Date().toISOString().split('T')[0];
    const sbConsignmentEl = document.getElementById("sb-consignment");
    const selectedConsignmentId = sbConsignmentEl ? sbConsignmentEl.value : null;
    
    items = sbAvailableItems.filter(i => {
       const isAvailable = i.available_qty > 0;
       const matchesConsignment = !selectedConsignmentId || i.consignment_id == selectedConsignmentId;
       return isAvailable && matchesConsignment;
    });
  } else if (mode === 'MASTER') {
    title = 'Select Item Master (Inward Entry)';
    items = itemsMasterTemp || []; // Assume itemsMasterTemp is available globally or need to fetch
  }

  modal.innerHTML = `
    <div class="item-selection-content">
        <div class="item-selection-header">
            <div class="item-selection-title">${title}</div>
            <button class="item-selection-close" onclick="closeItemSelectionModal()">&times;</button>
        </div>
        <div class="item-selection-body">
            <div class="item-search-container">
                <input type="text" id="item-modal-search" class="item-search-input" placeholder="Type to search Bond No, Description, etc..." autofocus>
            </div>
            <div class="item-table-container">
                <table class="item-selection-table">
                    <thead>
                        ${mode === 'STOCK' 
                          ? '<tr><th>Bond No</th><th>Description</th><th>Expiry</th><th>Available</th><th>Action</th></tr>'
                          : '<tr><th>Description</th><th>Code</th><th>Unit</th><th>Action</th></tr>'
                        }
                    </thead>
                    <tbody id="item-modal-tbody">
                        <!-- Rows populated by JS -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Focus search
  setTimeout(() => document.getElementById('item-modal-search').focus(), 50);

  // Render Function
  const renderRows = (filterText = '') => {
    const tbody = document.getElementById('item-modal-tbody');
    const lowerFilter = filterText.toLowerCase();
    
    const filtered = items.filter(item => {
        if (mode === 'STOCK') {
            return (item.bond_no || '').toLowerCase().includes(lowerFilter) || 
                   (item.description || '').toLowerCase().includes(lowerFilter);
        } else {
            return (item.description || '').toLowerCase().includes(lowerFilter);
        }
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-search-state">No items match "${filterText}"</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        if (mode === 'STOCK') {
            const expiry = getLastExpiry(item);
            return `
                <tr onclick="selectItemFromModal('${item.inward_item_id || item.id}')">
                    <td><span class="badge badge-info">${item.bond_no}</span></td>
                    <td>${item.description}</td>
                    <td>${expiry ? formatDate(expiry) : 'N/A'}</td>
                    <td>${item.available_qty}</td>
                    <td><button class="btn btn-sm btn-primary">Select</button></td>
                </tr>
            `;
        } else {
            return `
                <tr onclick="selectItemFromModal('${item.id}')">
                    <td>${item.description}</td>
                    <td>${item.hsn_code || '-'}</td>
                    <td>${item.unit || 'PCS'}</td>
                    <td><button class="btn btn-sm btn-primary">Select</button></td>
                </tr>
            `;
        }
    }).join('');
  };

  // Initial Render
  renderRows();

  // Search Listener
  const searchInput = document.getElementById('item-modal-search');
  searchInput.addEventListener('input', (e) => renderRows(e.target.value));

  // Enter to Select First Result
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstRow = document.querySelector('#item-modal-tbody tr:not(:empty)');
      if (firstRow && !firstRow.querySelector('.empty-search-state')) {
        firstRow.click();
      }
    }
  });

  // Store callback
  currentModalResolver = (itemId) => {
    const selectedItem = items.find(i => (i.inward_item_id || i.id) == itemId);
    if (selectedItem) callback(selectedItem);
    closeItemSelectionModal();
  };
}

function closeItemSelectionModal() {
  const modal = document.getElementById('item-selection-modal');
  if (modal) modal.remove();
  currentModalResolver = null;
}

function selectItemFromModal(itemId) {
  if (currentModalResolver) currentModalResolver(itemId);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeItemSelectionModal();
});

document.addEventListener("DOMContentLoaded", () => {
  initFlatpickr();
  loadDashboard();
});

let currentInwardId = null;

async function initInwardEntry() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('id');

  // Load item master for modal
  fetchItemsMaster();

  if (consignments.length === 0) consignments = await apiCall("/consignments");

  const airlines = consignments.filter(c => c.type === 'AIRLINE');
  const airlineSelect = document.getElementById("inw-airline-code");
  if (airlineSelect) {
    // Destroy any existing TomSelect so we can repopulate the raw <select>
    if (airlineSelect.tomselect) airlineSelect.tomselect.destroy();
    // Temporarily prevent global DOMContentLoaded handler from initializing TomSelect
    // before we've set the correct value
    airlineSelect.classList.remove('searchable');
    
    airlineSelect.innerHTML =
      '<option value="">Select Airline</option>' +
      airlines
        .map((c) => `<option value="${c.id}" data-code="${c.airline_code || c.code || ''}" data-name="${c.name}">${c.airline_code || c.code ? (c.airline_code || c.code) + ' - ' : ''}${c.name}</option>`)
        .join("");
  }
  
  const ships = consignments.filter(c => c.type === 'SHIP');
  const shipSelect = document.getElementById("inw-ship");
  if (shipSelect) {
    if (shipSelect.tomselect) shipSelect.tomselect.destroy();
    shipSelect.classList.remove('searchable');
    
    shipSelect.innerHTML =
      '<option value="">Select Ship</option>' +
      ships
        .map((c) => `<option value="${c.id}">${c.name}</option>`)
        .join("");
  }

  // DO NOT call initSearchableSelects() here — we set native values first, then init TomSelect at the end

  // Reset or Load Form
  if (editId) {
    currentInwardId = editId;
    document.getElementById("inward-form-title").textContent = "Edit Inward Entry";
    const saveBtn = document.querySelector('button[onclick="saveInwardPage()"]');
    if(saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Update Inward Entry';

    try {
      const entry = await apiCall(`/inward/${editId}`);
      console.log("Loading entry for edit:", entry);

      // Helper to format date for input[type=date]
      const toDateVal = (d) => {
          if (!d) return "";
          return d.split('T')[0];
      };

      // Populate fields
      document.getElementById("inw-be-no").value = entry.be_no || "";
      setFormDate("inw-be-date", toDateVal(entry.be_date));
      document.getElementById("inw-customs-station").value = entry.customs_station || "COK";
      document.getElementById("inw-bond-no").value = entry.bond_no || "";
      setFormDate("inw-bond-date", toDateVal(entry.bond_date));
      setFormDate("inw-sec60-date", toDateVal(entry.date_of_order_section_60));
      document.getElementById("inw-import-sb-no").value = entry.shipping_bill_no || "";
      document.getElementById("inw-import-inv-sl").value = entry.sl_no_import_invoice || "";
      setFormDate("inw-receipt-date", toDateVal(entry.date_of_receipt));
      document.getElementById("inw-wh-code").value = entry.warehouse_code || "";
      document.getElementById("inw-wh-code").readOnly = true;
      document.getElementById("inw-bond-duty-rate").value = entry.duty_rate ? parseFloat(entry.duty_rate).toFixed(2) : "";
      
      // Transport Mode
      updateTransportMode(entry.mode_of_receipt || 'AIRLINE');

      // Set NATIVE <select> value BEFORE TomSelect initializes
      // TomSelect reads the native select's selected option on init
      const consignmentIdStr = entry.consignment_id ? String(entry.consignment_id) : "";
      let mode = entry.mode_of_receipt || 'AIRLINE';
      if (mode === 'By Road') mode = 'ROAD';
      if (mode === 'By Ship') mode = 'SHIP';
      if (mode === 'By Airline') mode = 'AIRLINE';

      // Load airline/consignment selection regardless of mode
      if (airlineSelect) airlineSelect.value = consignmentIdStr;
      if (consignmentIdStr) {
        await loadFlightNumbers(consignmentIdStr, entry.flight_no || "");
      }

      if (mode === 'SHIP') {
         if (shipSelect) shipSelect.value = consignmentIdStr;
      } else if (mode === 'ROAD') {
         const roadEl = document.getElementById("inw-transport-reg");
         if (roadEl) roadEl.value = entry.transport_reg_no || "";
      }

      setFormDate("inw-bond-start", toDateVal(entry.initial_bonding_date));
      setFormDate("inw-bond-expiry", toDateVal(entry.initial_bonding_expiry));
      document.getElementById("inw-bank-guarantee").value = entry.bank_guarantee || "";
      setFormDate("inw-ext-exp1", toDateVal(entry.extended_bonding_expiry1));
      setFormDate("inw-ext-exp2", toDateVal(entry.extended_bonding_expiry2));
      setFormDate("inw-ext-exp3", toDateVal(entry.extended_bonding_expiry3));
      document.getElementById("inw-value-rate").value = entry.value_rate ? parseFloat(entry.value_rate).toFixed(2) : "";
      
      inwardItemsTemp = entry.items || [];
      renderInwardBillingTable();
    } catch (e) {
      console.error(e);
      showToast("Error loading entry", "error");
    }
  } else {
    // New entry - set defaults
    const user = getAuthUser();
    const whCodeInput = document.getElementById("inw-wh-code");
    if (whCodeInput) {
        whCodeInput.value = user.branch_code || "COK15173";
        whCodeInput.readOnly = true;
    }

    const form = document.getElementById("inward-billing-form");
    if (form && typeof form.reset === "function") form.reset();
    setFormDate("inw-receipt-date", new Date().toISOString().split("T")[0]);
    inwardItemsTemp = [];
    addInwardItemPage();
  }
  if (!editId) {
    // Set default transport mode to AIRLINE only for new entries
    updateTransportMode('AIRLINE');
  }

  // Restore searchable class and NOW initialize TomSelect
  // TomSelect will pick up the pre-set native select values
  if (airlineSelect) airlineSelect.classList.add('searchable');
  if (shipSelect) shipSelect.classList.add('searchable');
  initSearchableSelects();

  // Update airline name display after TomSelect is ready
  if (editId) {
    updateAirlineName();
    // Re-render table after we know the bonding mode to ensure correct column visibility
    renderInwardBillingTable();
  }



  // Setup full-form keyboard navigation (Enter = Tab to next)
  setupFormKeyboardNav("inward-billing-form");
}

// Handle transport mode switching
function updateTransportMode(mode) {
  // Legacy mapping
  if (mode === 'By Road') mode = 'ROAD';
  if (mode === 'By Ship') mode = 'SHIP';
  if (mode === 'By Airline' || !mode) mode = 'AIRLINE';

  const airlineSelection = document.getElementById("airline-selection");
  const airlineNameDisplay = document.getElementById("airline-name-display");
  const airlineFlightSelection = document.getElementById("airline-flight-selection");
  const shipSelection = document.getElementById("ship-selection");
  const roadSelection = document.getElementById("road-selection");
  
  // Airline fields are always visible for Inward as goods always arrive via Air
  if(airlineSelection) airlineSelection.style.display = "block";
  if(airlineFlightSelection) airlineFlightSelection.style.display = "block";
  
  // Hide variable conditional fields
  if(shipSelection) shipSelection.style.display = "none";
  if(roadSelection) roadSelection.style.display = "none";
  
  // Show the relevant local transport fields based on mode
  if (mode === "SHIP") {
    if(shipSelection) shipSelection.style.display = "block";
  } else if (mode === "ROAD") {
    if(roadSelection) roadSelection.style.display = "block";
  }

  // Select the correct radio button to reflect the current mode
  const radio = document.querySelector(`input[name="transport-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
}


// Update airline name when code is selected
function updateAirlineName() {
  const airlineCode = document.getElementById("inw-airline-code");
  const airlineName = document.getElementById("inw-airline-name");
  const airlineNameDisplay = document.getElementById("airline-name-display");
  
  const airlineSelectValue = (airlineCode && airlineCode.tomselect) ? airlineCode.tomselect.getValue() : (airlineCode ? airlineCode.value : null);

  if (airlineCode && airlineSelectValue) {
    let selected = airlineCode.options[airlineCode.selectedIndex];
    if (!selected || selected.value !== airlineSelectValue) {
        selected = Array.from(airlineCode.options).find(opt => opt.value == airlineSelectValue);
    }
    
    if (selected) {
        const name = selected.getAttribute('data-name') || '';
        airlineName.value = name;
        if (airlineNameDisplay) airlineNameDisplay.style.display = 'block';

        // Toggle Bond Mode for AIR INDIA
        toggleInwardBondMode(name.toUpperCase().includes("AIR INDIA"));
    }
    
    // Load flight numbers ONLY if the selected airline ACTUALLY changed (prevents race condition during edit prepopulation)
    const flightSelect = document.getElementById("inw-flight-no");
    if (flightSelect && flightSelect.getAttribute('data-airline') !== String(airlineSelectValue)) {
      loadFlightNumbers(airlineSelectValue);
    }
  } else {
    airlineName.value = '';
    if (airlineNameDisplay) airlineNameDisplay.style.display = 'none';
    toggleInwardBondMode(false); // Default to common
    
    // Clear flight dropdown only if it isn't already empty
    const flightSelect = document.getElementById("inw-flight-no");
    if (flightSelect && flightSelect.getAttribute('data-airline') !== 'null') {
      loadFlightNumbers(null);
    }
  }
}

function toggleInwardBondMode(isItemWise) {
  // For Air India (isItemWise=true): show item-level Bond No & Bond Date columns
  // Header sections (Bonding & Expiry, Duty Rate %, Bond No/Date) remain ALWAYS visible
  const itemCols = document.querySelectorAll(".item-bond-col");
  
  itemCols.forEach(col => {
    col.style.display = isItemWise ? "table-cell" : "none";
  });
}

// Load flight numbers for a given airline (consignment_id)
async function loadFlightNumbers(consignmentId, presetValue) {
  const flightSelect = document.getElementById("inw-flight-no");
  if (!flightSelect) return;
  flightSelect.setAttribute('data-airline', String(consignmentId));

  // Destroy existing TomSelect if present
  if (flightSelect.tomselect) flightSelect.tomselect.destroy();
  flightSelect.classList.remove('searchable');

  if (!consignmentId) {
    flightSelect.innerHTML = '<option value="">Select Flight</option>';
    flightSelect.classList.add('searchable');
    initSearchableSelects();
    return;
  }

  try {
    const flights = await apiCall(`/consignments/flights/list?consignment_id=${consignmentId}`);
    
    let hasPreset = false;
    let optionsHtml = '<option value="">Select Flight</option>' +
      flights.map(f => {
         if (presetValue && f.flight_no === presetValue) hasPreset = true;
         return `<option value="${f.flight_no}">${f.flight_no}</option>`;
      }).join('');
      
    if (presetValue && !hasPreset) {
      optionsHtml += `<option value="${presetValue}">${presetValue}</option>`;
    }
    
    flightSelect.innerHTML = optionsHtml;
    
    // Pre-select value if provided
    if (presetValue) {
      flightSelect.value = presetValue;
    }
  } catch (e) {
    console.error('Error loading flights:', e);
    flightSelect.innerHTML = '<option value="">Select Flight</option>';
  }

  flightSelect.classList.add('searchable');
  initSearchableSelects();
}

// Add new flight number for the currently selected airline
async function addNewFlightNumber() {
  const airlineCode = document.getElementById("inw-airline-code");
  const consignmentId = (airlineCode && airlineCode.tomselect) ? airlineCode.tomselect.getValue() : (airlineCode ? airlineCode.value : null);

  if (!consignmentId) {
    showToast("Please select an airline first", "error");
    return;
  }

  const flightNo = prompt("Enter new flight number (e.g. AI-902):");
  if (!flightNo || !flightNo.trim()) return;

  try {
    await apiCall('/consignments/flights', 'POST', {
      consignment_id: consignmentId,
      flight_no: flightNo.trim()
    });
    showToast("Flight number added successfully");
    // Reload flights and select the new one
    await loadFlightNumbers(consignmentId, flightNo.trim());
  } catch (e) {
    showToast(e.message || "Error adding flight number", "error");
  }
}

// Global Enter-key navigation for any form
function setupFormKeyboardNav(formId) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    // Don't override button clicks or textarea
    const target = e.target;
    if (target.tagName === "BUTTON" || target.tagName === "TEXTAREA") return;

    e.preventDefault();

    // Get all focusable inputs in the form
    const focusable = Array.from(
      form.querySelectorAll(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
      ),
    ).filter((el) => el.offsetParent !== null); // Only visible elements

    const currentIndex = focusable.indexOf(target);

    if (currentIndex !== -1 && currentIndex < focusable.length - 1) {
      // Move to next field
      focusable[currentIndex + 1].focus();
    } else if (currentIndex === focusable.length - 1) {
      // At last field, add new item row if in items table
      if (target.closest("#inward-billing-table-tbody")) {
        addInwardItemPage();
        setTimeout(() => {
          const newInputs = form.querySelectorAll(
            "#inward-billing-table-tbody input",
          );
          if (newInputs.length > 0) newInputs[newInputs.length - 13].focus(); // First input of new row
        }, 50);
      }
    }
  });
}
async function initOutwardEntry() {
  if (items.length === 0) items = await apiCall("/items");
  updateItemsDatalist();

  if (consignments.length === 0) consignments = await apiCall("/consignments");

  // Populate Airline Dropdown
  const consSelect = document.getElementById("out-consignment");
  if (consSelect) {
    consSelect.innerHTML =
      '<option value="">Select Airline</option>' +
      consignments
        .filter((c) => c.type === "AIRLINE")
        .map((c) => `<option value="${c.id}">${c.name}</option>`)
        .join("");
  }

  const form = document.getElementById("outward-dispatch-form");
  if (form && typeof form.reset === "function") form.reset();

  document.getElementById("out-date").value = new Date()
    .toISOString()
    .split("T")[0];
  availableInwardItems = [];
  outwardItemsTemp = [];

  const addBtn = document.getElementById("btn-add-outward-item-page");
  if (addBtn) addBtn.disabled = true;

  renderOutwardDispatchTable();
  
  // Setup full-form keyboard navigation (Enter = Tab to next)
  setupFormKeyboardNav('outward-dispatch-form');
}

function renderInwardBillingTable() {
  const tbody = document.getElementById("inward-billing-table-tbody");
  if (inwardItemsTemp.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="14" class="empty-state">No items added. Click "Add Item Row"</td></tr>';
    return;
  }

  tbody.innerHTML = inwardItemsTemp
    .map(
      (item, idx) => `
        <tr data-index="${idx}">
            <td>
                <input type="text" class="form-control" value="${item.description || ""}" 
                       placeholder="Click to search..." readonly
                       onclick="openItemSelectionModal('MASTER', (selected) => {
                           updateInwardItemPage(${idx}, 'description', selected.description);
                           updateInwardItemPage(${idx}, 'unit', selected.unit);
                           updateInwardItemPage(${idx}, 'hsn_code', selected.hsn_code);
                           renderInwardBillingTable();
                       })"
                       style="cursor: pointer;"
                >
            </td>
            <td><input type="text" class="form-control" value="${item.pkg_marks || ""}" onchange="updateInwardItemPage(${idx}, 'pkg_marks', this.value)"></td>
            <td><input type="text" class="form-control" value="${item.unit || "NOS"}" onchange="updateInwardItemPage(${idx}, 'unit', this.value)"></td>
            <td><input type="text" class="form-control" value="${item.hsn_code || ""}" onchange="updateInwardItemPage(${idx}, 'hsn_code', this.value)"></td>
            <td><input type="text" class="form-control" value="${item.duty_percent || 0}" placeholder="%" onchange="updateInwardItemPage(${idx}, 'duty_percent', this.value)"></td>
            <td><input type="number" step="0.01" class="form-control" value="${item.qty || 0}" onchange="updateInwardItemPage(${idx}, 'qty', this.value); renderInwardBillingTable();"></td>
            <td><input type="date" class="form-control" value="${item.shelf_life_date ? item.shelf_life_date.split('T')[0] : ''}" onchange="updateInwardItemPage(${idx}, 'shelf_life_date', this.value)"></td>
            <td><input type="text" class="form-control" value="${item.bond_no || ''}" onchange="updateInwardItemPage(${idx}, 'bond_no', this.value)"></td>
            <td><input type="date" class="form-control" value="${item.bond_date ? item.bond_date.split('T')[0] : ''}" onchange="updateInwardItemPage(${idx}, 'bond_date', this.value)"></td>
            <td><input type="date" class="form-control" value="${item.bond_expiry ? (item.bond_expiry.includes('T') ? item.bond_expiry.split('T')[0] : item.bond_expiry) : ''}" onchange="updateInwardItemPage(${idx}, 'bond_expiry', this.value)"></td>
            <td><input type="number" step="0.01" class="form-control" value="${item.qty_received || item.qty || 0}" onchange="updateInwardItemPage(${idx}, 'qty_received', this.value)"></td>

            <td><input type="number" step="0.01" class="form-control" value="${parseFloat(item.value || 0).toFixed(2)}" onchange="updateInwardItemPage(${idx}, 'value', this.value); renderInwardBillingTable();"></td>
            <td><input type="number" step="0.01" class="form-control" value="${parseFloat(item.duty || 0).toFixed(2)}" onchange="updateInwardItemPage(${idx}, 'duty', this.value); renderInwardBillingTable();"></td>
            <td><button class="action-btn danger" onclick="removeInwardItemPage(${idx})"><i class="fas fa-trash"></i></button></td>
        </tr>
    `,
    )
    .join("");

  // Add Enter key focus management
  const inputs = tbody.querySelectorAll("input");
  inputs.forEach((input, inputIdx) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const nextInput = inputs[inputIdx + 1];
        if (nextInput) {
          nextInput.focus();
        } else {
          addInwardItemPage();
          setTimeout(() => {
            const newTbody = document.getElementById(
              "inward-billing-table-tbody",
            );
            const newInputs = newTbody.querySelectorAll("input");
            newInputs[inputIdx + 1].focus();
          }, 10);
        }
      }
    });
  });
  initFlatpickr();
}

function addInwardItemPage() {
  inwardItemsTemp.push({
    item_id: null,
    description: "",
    pkg_marks: "",
    unit: "NOS",
    hsn_code: "",
    duty_percent: 0,
    qty_adviced: 0,
    shelf_life_date: "",
    qty: 0,
    value: 0,
    duty: 0,
    bond_no: "",
    bond_date: "",
    bond_expiry: ""
  });
  renderInwardBillingTable();
}

function updateInwardItemPage(idx, field, value) {
  inwardItemsTemp[idx][field] = value;
  if (field === "description") {
    const item = items.find((i) => i.description === value);
    if (item) {
      inwardItemsTemp[idx].item_id = item.id;
      inwardItemsTemp[idx].hsn_code = item.hsn_code || "";
      // Don't auto-render here to avoid losing focus if typing,
      // but for selection it's fine.
      const row = document.querySelector(
        `#inward-billing-table-tbody tr[data-index="${idx}"]`,
      );
      if (row) {
        const codeInput = row.querySelectorAll("input")[3]; // 4th input
        if (codeInput) codeInput.value = item.hsn_code || "";
      }
    }
  }
}

function removeInwardItemPage(idx) {
  inwardItemsTemp.splice(idx, 1);
  renderInwardBillingTable();
}

async function fetchAvailableForConsignmentPage(consignmentId) {
  if (!consignmentId) {
    availableInwardItems = [];
    document.getElementById("btn-add-outward-item-page").disabled = true;
    outwardItemsTemp = [];
    renderOutwardDispatchTable();
    return;
  }

  try {
    // Fetch ALL available stock (not filtered by consignment) 
    // The selected airline is the DESTINATION, not the stock source
    availableInwardItems = await apiCall(`/outward/available/items`);
    document.getElementById("btn-add-outward-item-page").disabled = false;
    outwardItemsTemp = [];
    renderOutwardDispatchTable();
    if (availableInwardItems.length === 0) {
      showToast("No stock available in warehouse", "info");
    }
  } catch (e) {
    console.error("Fetch available items error:", e);
  }
}

function renderOutwardDispatchTable() {
  const tbody = document.getElementById("outward-dispatch-table-tbody");
  if (outwardItemsTemp.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="empty-state">Select an Airline first, then add items.</td></tr>';
    return;
  }

  tbody.innerHTML = outwardItemsTemp
    .map(
      (item, idx) => `
        <tr>
            <td>
                <select class="form-control searchable" onchange="updateOutwardItemSourcePage(${idx}, this.value)">
                    <option value="">Select Stock Source</option>
                    ${availableInwardItems
                      .map(
                        (ai) => `
                        <option value="${ai.inward_item_id}" data-available="${ai.available_qty}" data-inward="${ai.inward_id}" data-item="${ai.item_id}" data-desc="${ai.description}" data-value="${ai.value}" data-duty="${ai.duty}" data-hsn="${ai.hsn_code || ''}" data-orig-qty="${ai.original_qty || 1}"
                                ${item.inward_item_id == ai.inward_item_id ? "selected" : ""}>
                            ${ai.bond_no} - ${ai.description} (Avail: ${ai.available_qty})
                        </option>
                    `,
                      )
                      .join("")}
                </select>
            </td>
            <td>${item.hsn_code || '-'}</td>
            <td>${item.available_qty || 0}</td>
            <td><input type="number" class="form-control" value="${item.qty_dispatched || 1}" min="1" max="${item.available_qty}" onchange="updateOutwardItemPage(${idx}, 'qty_dispatched', this.value)"></td>
            <td>${formatCurrency(item.value * (item.qty_dispatched || 1))}</td>
            <td>${formatCurrency(item.duty * (item.qty_dispatched || 1))}</td>
            <td><button class="action-btn danger" onclick="removeOutwardItemPage(${idx})"><i class="fas fa-trash"></i></button></td>
        </tr>
    `,
    )
    .join("");
}

function addOutwardItemPage() {
  outwardItemsTemp.push({
    inward_item_id: null,
    inward_id: null,
    item_id: null,
    description: "",
    qty_dispatched: 1,
    available_qty: 0,
  });
  renderOutwardDispatchTable();
}

function updateOutwardItemSourcePage(idx, value) {
  const select = document.querySelectorAll("#outward-items-billing-table select")[
    idx
  ];
  const option = select.options[select.selectedIndex];
  if (!value) return;

  const origQty = parseFloat(option.dataset.origQty) || 1;
  const totVal = parseFloat(option.dataset.value) || 0;
  const totDuty = parseFloat(option.dataset.duty) || 0;

  outwardItemsTemp[idx] = {
    inward_item_id: parseInt(value),
    inward_id: parseInt(option.dataset.inward),
    item_id: parseInt(option.dataset.item),
    description: option.dataset.desc,
    available_qty: parseInt(option.dataset.available),
    value: totVal / origQty, // Convert TOTAL to UNIT value
    duty: totDuty / origQty, // Convert TOTAL to UNIT duty
    hsn_code: option.dataset.hsn || '',
    qty_dispatched: 1,
  };
  renderOutwardDispatchTable();
}

function updateOutwardItemPage(idx, field, value) {
  outwardItemsTemp[idx][field] = parseInt(value) || 0;
  renderOutwardDispatchTable();
}

function removeOutwardItemPage(idx) {
  outwardItemsTemp.splice(idx, 1);
  renderOutwardDispatchTable();
}

async function saveInwardPage() {
  // Determine consignment_id based on transport mode
  const transportModeEl = document.querySelector('input[name="transport-mode"]:checked');
  const transportMode = transportModeEl ? transportModeEl.value : 'AIRLINE';
  
  // Inward is tied to an airline consignment first
  const airlineSelect = document.getElementById("inw-airline-code");
  let consignment_id = (airlineSelect && airlineSelect.tomselect) ? airlineSelect.tomselect.getValue() : (airlineSelect ? airlineSelect.value : null);
  if (!consignment_id || consignment_id === "") consignment_id = null;
  let transport_reg_no = null;
  
  if (transportMode === 'SHIP') {
    const shipSelect = document.getElementById("inw-ship");
    transport_reg_no = (shipSelect && shipSelect.tomselect) ? shipSelect.tomselect.getValue() : (shipSelect ? shipSelect.value : null);
  } else if (transportMode === 'ROAD') {
    transport_reg_no = document.getElementById("inw-transport-reg").value || null;
  }
  
  const data = {
    be_no: document.getElementById("inw-be-no").value,
    be_date: document.getElementById("inw-be-date").value,
    bond_no: document.getElementById("inw-bond-no").value,
    bond_date: document.getElementById("inw-bond-date").value,
    shipping_bill_no: document.getElementById("inw-import-sb-no").value || null,
    sl_no_import_invoice: document.getElementById("inw-import-inv-sl").value || null,
    date_of_receipt: document.getElementById("inw-receipt-date").value,
    mode_of_receipt: transportMode,
    consignment_id: consignment_id,
    flight_no: (() => { const f = document.getElementById("inw-flight-no"); return f ? ((f.tomselect) ? f.tomselect.getValue() : f.value) : null; })(),
    transport_reg_no: transport_reg_no,
    warehouse_code: document.getElementById("inw-wh-code").value,
    customs_station: document.getElementById("inw-customs-station").value,
    date_of_order_section_60: document.getElementById("inw-sec60-date").value,
    duty_rate: document.getElementById("inw-bond-duty-rate").value || null,
    initial_bonding_date: document.getElementById("inw-bond-start").value || null,
    initial_bonding_expiry: document.getElementById("inw-bond-expiry").value || null,
    extended_bonding_expiry1: document.getElementById("inw-ext-exp1").value || null,
    extended_bonding_expiry2: document.getElementById("inw-ext-exp2").value || null,
    extended_bonding_expiry3: document.getElementById("inw-ext-exp3").value || null,
    bank_guarantee: document.getElementById("inw-bank-guarantee").value || null,
    value_rate: document.getElementById("inw-value-rate").value || null,
    items: inwardItemsTemp,
    branch_id: getAuthUser().branch_id || null
  };

  const isItemWise = data.consignment_id && document.getElementById("inw-airline-name").value.toUpperCase().includes("AIR INDIA");

  if (isItemWise && data.items.length > 0) {
    // For item-wise, use first item's bond info for the header mandatory fields
    data.bond_no = data.items[0].bond_no;
    data.bond_date = data.items[0].bond_date;
  }

  // Validation for mandatory fields
  const missingFields = [];
  if (!data.be_no) missingFields.push("BE No");
  if (!data.be_date) missingFields.push("BE Date");
  if (!data.date_of_receipt) missingFields.push("Receipt Date");
  if (!data.consignment_id) missingFields.push("Airline/Consignment");
  if (transportMode === 'AIRLINE' && !data.flight_no) missingFields.push("Flight No");
  if (transportMode === 'ROAD' && !data.transport_reg_no) missingFields.push("Transport Registration No");
  if (transportMode === 'SHIP' && !data.transport_reg_no) missingFields.push("Ship Selection");
  
  // Bond info is mandatory unless it's Air India (handled separately in the data assignment above)
  if (!data.bond_no) missingFields.push("Bond No");
  
  if (missingFields.length > 0) {
    showToast(`Missing required fields: ${missingFields.join(", ")}`, "error");
    return;
  }

  if (data.items.length === 0) {
    showToast("Please add at least one item", "error");
    return;
  }

  try {
    console.log("Saving Inward Data:", JSON.stringify(data, null, 2));
    if (currentInwardId) {
       await apiCall(`/inward/${currentInwardId}`, "PUT", data);
       showToast("Inward Entry Updated");
    } else {
       await apiCall("/inward", "POST", data);
       showToast("Inward Entry Created");
    }
    window.location.href = 'inward.html';
  } catch (e) {
    console.error(e);
    showToast(e.message, "error");
  }
}

function editInward(id) {
  window.location.href = `inward-entry.html?id=${id}`;
}

async function saveOutwardPage() {
  const data = {
    dispatch_date: document.getElementById("out-date").value,
    flight_no: document.getElementById("out-flight").value,
    consignment_id: document.getElementById("out-consignment").value || null,
    shipping_bill_no: document.getElementById("out-sb-no").value,
    shipping_bill_date: document.getElementById("out-sb-date").value,
    items: outwardItemsTemp,
    branch_id: getAuthUser().branch_id || null
  };

  if (!data.dispatch_date || !data.consignment_id || data.items.length === 0) {
    showToast("Dispatch date, airline and items are required", "error");
    return;
  }

  try {
    await apiCall("/outward", "POST", data);
    showToast("Outward Dispatch Created");
    window.location.href = 'outward.html';
  } catch (e) {
    console.error(e);
  }
}

// ============================================
// Country Masters CRUD
// ============================================

async function loadCountriesPage() {
  try {
    const countries = await apiCall('/countries');
    const tbody = document.getElementById('countries-tbody');
    if (!tbody) return;
    tbody.innerHTML = countries.map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${c.name}</strong></td>
        <td>${c.code}</td>
        <td>${c.port_of_discharge || '-'}</td>
        <td>
          <div class="action-btns">
            <button class="action-btn primary" onclick="editCountry(${c.id})" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="action-btn danger" onclick="deleteCountry(${c.id})" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading countries:', error);
    showToast('Failed to load countries', 'error');
  }
}

function openCountryModal(country = null) {
  const existing = document.getElementById('country-modal');
  if (existing) existing.remove();

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay active" id="country-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
      <div class="card" style="width:450px;max-width:95vw;">
        <div class="card-header"><h3 class="card-title">${country ? 'Edit' : 'Add'} Country</h3></div>
        <div class="card-body">
          <div class="form-group" style="margin-bottom:1rem;">
            <label class="form-label">Country Name *</label>
            <input type="text" class="form-control" id="country-name" value="${country ? country.name : ''}" placeholder="e.g. Kuwait" />
          </div>
          <div class="form-group" style="margin-bottom:1rem;">
            <label class="form-label">Country Code *</label>
            <input type="text" class="form-control" id="country-code" value="${country ? country.code : ''}" placeholder="e.g. KWI" style="text-transform:uppercase;" />
          </div>
          <div class="form-group" style="margin-bottom:1rem;">
            <label class="form-label">Port of Discharge</label>
            <input type="text" class="form-control" id="country-port" value="${country ? (country.port_of_discharge || '') : ''}" placeholder="e.g. COK/KWI/COK" />
          </div>
          <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1.5rem;">
            <button class="btn" onclick="document.getElementById('country-modal').remove()" style="background:var(--bg-tertiary);color:var(--text-primary);">Cancel</button>
            <button class="btn btn-primary" onclick="saveCountry(${country ? country.id : 'null'})">Save</button>
          </div>
        </div>
      </div>
    </div>
  `);
}

async function saveCountry(id) {
  const name = document.getElementById('country-name').value.trim();
  const code = document.getElementById('country-code').value.trim();
  const port_of_discharge = document.getElementById('country-port').value.trim();

  if (!name || !code) return showToast('Name and Code are required', 'error');

  try {
    if (id) {
      await apiCall(`/countries/${id}`, 'PUT', { name, code, port_of_discharge });
      showToast('Country updated', 'success');
    } else {
      await apiCall('/countries', 'POST', { name, code, port_of_discharge });
      showToast('Country added', 'success');
    }
    document.getElementById('country-modal').remove();
    await loadCountriesPage();
  } catch (error) {
    showToast(error.message || 'Failed to save country', 'error');
  }
}

async function editCountry(id) {
  try {
    const country = await apiCall(`/countries/${id}`);
    openCountryModal(country);
  } catch (error) {
    showToast('Failed to load country', 'error');
  }
}

async function deleteCountry(id) {
  if (!confirm('Delete this country?')) return;
  try {
    await apiCall(`/countries/${id}`, 'DELETE');
    showToast('Country deleted', 'success');
    await loadCountriesPage();
  } catch (error) {
    showToast('Failed to delete country', 'error');
  }
}

// ============================================
// Airline Masters CRUD
// ============================================

async function loadAirlineMastersPage() {
  try {
    const res = await fetch('/api/consignments?type=AIRLINE');
    const airlines = await res.json();
    const tbody = document.querySelector('#airline-masters-table tbody');
    if (!tbody) return;
    paginateTable('airline-masters-table', airlines, (a) => `
      <tr>
        <td>${a.id}</td>
        <td>${a.name}</td>
        <td>${a.airline_code || ''}</td>
        <td>${a.code || ''}</td>
        <td>${a.address || ''}</td>
        <td>
          <div class="action-btns">
            <button class="action-btn" onclick="editAirline(${a.id})" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn danger" onclick="deleteAirline(${a.id})" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
            <button class="action-btn info" style="background-color: var(--primary); color: white; border: none; font-size: 1rem; width: 34px; height: 34px;" onclick="manageFlights(${a.id}, '${a.name}')" title="Manage Flights">
              <i class="fas fa-plane"></i>
            </button>
          </div>
        </td>
      </tr>
    `, 6);
  } catch (e) {
    console.error('Error loading airlines:', e);
  }
}

function openAirlineModal(airline = null) {
  const isEdit = airline !== null;
  const title = isEdit ? 'Edit Airline' : 'Add New Airline';
  const body = `
    <div class="form-group">
      <label class="form-label">Airline Name *</label>
      <input type="text" class="form-control" id="airline-name" value="${isEdit ? airline.name : ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Airline Code (IATA 2-letter)</label>
      <input type="text" class="form-control" id="airline-code" value="${isEdit ? (airline.airline_code || '') : ''}" maxlength="3" />
    </div>
    <div class="form-group">
      <label class="form-label">Code</label>
      <input type="text" class="form-control" id="airline-iata" value="${isEdit ? (airline.code || '') : ''}" />
    </div>
    <div class="form-group">
      <label class="form-label">Address</label>
      <input type="text" class="form-control" id="airline-address" value="${isEdit ? (airline.address || '') : ''}" />
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveAirline(${isEdit ? airline.id : 'null'})">${isEdit ? 'Update' : 'Save'}</button>
  `;
  openModal(title, body, footer);
}

async function saveAirline(id) {
  const data = {
    name: document.getElementById('airline-name').value,
    airline_code: document.getElementById('airline-code').value,
    code: document.getElementById('airline-iata').value,
    address: document.getElementById('airline-address').value,
    type: 'AIRLINE'
  };
  if (!data.name) { showToast('Airline name is required', 'error'); return; }
  try {
    const url = id ? `/api/consignments/${id}` : '/api/consignments';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to save airline');
    closeModal();
    showToast(id ? 'Airline updated' : 'Airline added', 'success');
    await loadAirlineMastersPage();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function editAirline(id) {
  try {
    const res = await fetch('/api/consignments?type=AIRLINE');
    const airlines = await res.json();
    const airline = airlines.find(a => a.id === id);
    if (airline) openAirlineModal(airline);
  } catch (e) {
    showToast('Error loading airline', 'error');
  }
}

async function deleteAirline(id) {
  if (!confirm('Delete this airline?')) return;
  try {
    const res = await fetch(`/api/consignments/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    showToast('Airline deleted', 'success');
    await loadAirlineMastersPage();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ============================================
// Manage Flights within Airline Masters
// ============================================

async function manageFlights(airlineId, airlineName) {
  try {
    const res = await fetch(`/api/consignments/flights/list?consignment_id=${airlineId}`);
    const flights = await res.json();
    
    // Build the modal body
    const title = `Manage Flights: ${airlineName}`;
    
    let flightRows = flights.map(f => `
      <tr>
        <td>${f.flight_no}</td>
        <td style="text-align: right;">
          <button class="action-btn danger btn-sm" onclick="deleteFlightNumber(${f.id}, ${airlineId}, '${airlineName}')" title="Delete Flight">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');

    if (flights.length === 0) {
      flightRows = '<tr><td colspan="2" class="empty-state">No flights added for this airline.</td></tr>';
    }

    const body = `
      <div class="form-group" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <input type="text" class="form-control" id="new-flight-input" placeholder="Enter new flight (e.g. AI-902)" style="flex: 1;" />
        <button class="btn btn-primary" onclick="addNewFlightFromModal(${airlineId}, '${airlineName}')">
          <i class="fas fa-plus"></i> Add
        </button>
      </div>
      <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
        <table class="table" style="margin-bottom: 0;">
          <thead style="position: sticky; top: 0; background: var(--bg-color); z-index: 1;">
            <tr>
              <th>Flight No</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${flightRows}
          </tbody>
        </table>
      </div>
    `;
    
    const footer = `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`;
    
    openModal(title, body, footer);
  } catch (e) {
    showToast('Error loading flights', 'error');
    console.error(e);
  }
}

async function addNewFlightFromModal(airlineId, airlineName) {
  const flightInput = document.getElementById('new-flight-input');
  if (!flightInput) return;
  const flightNo = flightInput.value.trim();
  
  if (!flightNo) {
    showToast('Please enter a flight number', 'error');
    return;
  }

  try {
    await apiCall('/consignments/flights', 'POST', {
      consignment_id: airlineId,
      flight_no: flightNo
    });
    showToast("Flight number added successfully");
    // Reload the modal to show the new list
    manageFlights(airlineId, airlineName);
  } catch (e) {
    showToast(e.message || "Error adding flight number", "error");
  }
}

async function deleteFlightNumber(flightId, airlineId, airlineName) {
  if (!confirm('Are you sure you want to delete this flight number?')) return;
  
  try {
    await apiCall(`/consignments/flights/${flightId}`, 'DELETE');
    showToast('Flight number deleted', 'success');
    // Reload the modal to reflect the deletion
    manageFlights(airlineId, airlineName);
  } catch (e) {
    showToast(e.message || "Error deleting flight number", "error");
  }
}


// Global exports
window.openInwardModal = openInwardModal;
window.openOutwardModal = openOutwardModal;
window.openItemModal = openItemModal;
window.openConsignmentModal = openConsignmentModal;
window.loadDashboard = loadDashboard;
window.loadInwardEntries = loadInwardEntries;
window.loadStockPage = loadStockPage;
window.generateFormA = generateFormA;
window.generateFormB = generateFormB;

// ==================== PDF DOWNLOAD FUNCTIONS ====================
function downloadFormAPDF() {
  const container = document.getElementById('forma-report-container');
  if (!container || !container.innerHTML.trim()) {
    showToast('Please generate the report first', 'error');
    return;
  }
  showToast('Generating PDF... Please wait.', 'info');

  const htmlContent = `
    <div style="width: 1580px; min-width: 1580px; margin: 0; padding: 0; background: white; font-family: 'Inter', Arial, sans-serif;">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .card { border: none !important; margin: 0 !important; padding: 0 !important; width: 1580px !important; }
        .card-body { padding: 0 !important; margin: 0 !important; }
        .table { width: 1580px !important; border-collapse: collapse; margin-bottom: 1rem; table-layout: fixed; }
        .table-bordered th, .table-bordered td { border: 1px solid #000 !important; padding: 4px; }
        .text-center { text-align: center !important; }
        .report-table { font-size: 8px; width: 1580px !important; border: 1px solid #000; }
        h4, h5 { margin: 5px 0; text-align: center; width: 100%; }
      </style>
      ${container.innerHTML.trim()}
    </div>
  `;

  const opt = {
    margin:       0,
    filename:     `Form-A_Report_${new Date().toISOString().split('T')[0]}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 1, 
      useCORS: true, 
      letterRendering: true, 
      logging: false, 
      width: 1580,
      windowWidth: 1580,
      scrollX: 0, 
      scrollY: 0 
    },
    jsPDF:        { unit: 'pt', format: 'a3', orientation: 'landscape' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
  };

  html2pdf().set(opt).from(htmlContent).save().then(() => {
    showToast('PDF downloaded successfully!');
  }).catch(err => {
    console.error('PDF Error:', err);
    showToast('Error generating PDF', 'error');
  });
}

function downloadFormBPDF() {
  const container = document.getElementById('formb-report-container');
  if (!container || !container.innerHTML.trim()) {
    showToast('Please generate the report first', 'error');
    return;
  }
  showToast('Generating PDF... Please wait.', 'info');

  // Use a full-width wrapper (1580px) and BAKE the margins in with padding.
  // This is much more reliable than jsPDF margins for alignment.
  const htmlContent = `
    <div style="width: 1580px; min-width: 1580px; margin: 0; padding: 40px 60px; background: white; font-family: 'Inter', Arial, sans-serif;">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .table, .form-b-table { width: 1460px !important; border-collapse: collapse; margin-bottom: 1rem; table-layout: fixed; }
        .table-bordered th, .table-bordered td, .form-b-table th, .form-b-table td { border: 1px solid #000 !important; padding: 4px; }
        .text-center { text-align: center !important; }
        .report-table, .form-b-table { font-size: 8px; width: 1460px !important; border: 1px solid #000; }
        h4, h5 { margin: 5px 0; text-align: center; width: 100%; }
      </style>
      ${container.innerHTML.trim()}
    </div>
  `;

  const opt = {
    margin:       0,
    filename:     `Form-B_Report_${new Date().toISOString().split('T')[0]}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 1, 
      useCORS: true, 
      letterRendering: true, 
      logging: false, 
      width: 1580,
      windowWidth: 1580,
      scrollX: 0, 
      scrollY: 0 
    },
    jsPDF:        { unit: 'pt', format: 'a3', orientation: 'landscape' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
  };

  html2pdf().set(opt).from(htmlContent).save().then(() => {
    showToast('PDF downloaded successfully!');
  }).catch(err => {
    console.error('PDF Error:', err);
    showToast('Error generating PDF', 'error');
  });
}

function downloadStockPDF() {
  const container = document.getElementById('stock-table');
  if (!container || !container.innerHTML.trim()) {
    showToast('Please load the stock report first', 'error');
    return;
  }
  showToast('Generating PDF... Please wait.', 'info');

  const htmlContent = `
    <div style="width: 1100px; margin: 0; padding: 0; background: white; font-family: 'Inter', Arial, sans-serif;">
      <style>
        .table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
        .table-bordered th, .table-bordered td { border: 1px solid #000 !important; padding: 4px; }
        th { background-color: #f9fafb; text-align: left; font-size: 10px; }
        td { font-size: 9px; }
      </style>
      ${container.innerHTML}
    </div>
  `;

  const opt = {
    margin:       0,
    filename:     `Current_Stock_${new Date().toISOString().split('T')[0]}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 1.5, useCORS: true, windowWidth: 1100 },
    jsPDF:        { unit: 'pt', format: 'a4', orientation: 'landscape' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
  };

  html2pdf().set(opt).from(htmlContent).save().then(() => {
    showToast('PDF downloaded successfully!');
  }).catch(err => {
    console.error('PDF Error:', err);
    showToast('Error generating PDF', 'error');
  });
}

window.downloadFormAPDF = downloadFormAPDF;
window.downloadFormBPDF = downloadFormBPDF;
window.downloadStockPDF = downloadStockPDF;
window.fetchAvailableForConsignment = fetchAvailableForConsignment;
window.loadDetailedStockReport = loadDetailedStockReport;
window.loadConsignmentStockReport = loadConsignmentStockReport;
window.navigateTo = navigateTo;
window.addInwardItemPage = addInwardItemPage;
window.removeInwardItemPage = removeInwardItemPage;
window.updateInwardItemPage = updateInwardItemPage;
window.saveInwardPage = saveInwardPage;
window.addOutwardItemPage = addOutwardItemPage;
window.removeOutwardItemPage = removeOutwardItemPage;
window.updateOutwardItemPage = updateOutwardItemPage;
window.updateOutwardItemSourcePage = updateOutwardItemSourcePage;
window.saveOutwardPage = saveOutwardPage;
window.fetchAvailableForConsignmentPage = fetchAvailableForConsignmentPage;
window.updateTransportMode = updateTransportMode;
window.updateAirlineName = updateAirlineName;
// Multi-page init wrappers
window.loadInwardPage = loadInwardPage;
window.loadOutwardPage = loadOutwardPage;
window.loadItemsPage = loadItemsPage;
window.loadConsignmentsPage = loadConsignmentsPage;
window.loadConsignmentStockPage = loadConsignmentStockPage;
window.loadDetailedStockPage = loadDetailedStockPage;
// Airline Masters
window.loadAirlineMastersPage = loadAirlineMastersPage;
window.openAirlineModal = openAirlineModal;
window.saveAirline = saveAirline;
window.editAirline = editAirline;
window.deleteAirline = deleteAirline;
window.manageFlights = manageFlights;
window.addNewFlightFromModal = addNewFlightFromModal;
window.deleteFlightNumber = deleteFlightNumber;
// Country Masters
window.loadCountriesPage = loadCountriesPage;
window.openCountryModal = openCountryModal;
window.saveCountry = saveCountry;
window.editCountry = editCountry;
window.deleteCountry = deleteCountry;
// Shipping Bill CRUD + Workflow
window.loadShippingBillsListPage = loadShippingBillsListPage;
window.initShippingBillEntry = initShippingBillEntry;
window.addShippingBillItem = addShippingBillItem;
window.updateSBItemSource = updateSBItemSource;
window.updateSBItemQty = updateSBItemQty;
window.updateSBItemUnitValue = updateSBItemUnitValue;
window.updateSBItemUnitDuty = updateSBItemUnitDuty;
window.updateSBItemField = updateSBItemField;
window.removeSBItem = removeSBItem;
window.saveShippingBill = saveShippingBill;
window.approveShippingBill = approveShippingBill;
window.unapproveShippingBill = unapproveShippingBill;
window.rejectShippingBill = rejectShippingBill;
window.deleteShippingBill = deleteShippingBill;
window.viewShippingBill = viewShippingBill;
window.printShippingBill = printShippingBill;

// ============================================
// User & Branch Management (Admin Only)
// ========================
// ============= User & Branch Management (Admin Only) =============

async function loadUsersPage() {
    try {
        const usersList = await apiCall('/users');
        paginateTable('users-table', usersList, (u) => `
            <tr>
                <td>${u.id}</td>
                <td>${u.username}</td>
                <td>${u.full_name || "-"}</td>
                <td><span class="badge ${u.role === 'SUPER_ADMIN' ? 'badge-purple' : 'badge-info'}">${u.role}</span></td>
                <td>${u.branch_name || "Central / All"}</td>
                <td><span class="status-indicator ${u.status === 'ACTIVE' ? 'status-active' : 'status-inactive'}"></span> ${u.status}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="openUserModal(${JSON.stringify(u).replace(/"/g, '&quot;')})" title="Edit"><i class="fas fa-edit"></i></button>
                    </div>
                </td>
            </tr>
        `, 7);
    } catch (error) {
        console.error("Users load error:", error);
    }
}

async function openUserModal(user = null) {
    const branches = await apiCall('/branches');
    const isEdit = user !== null;
    const body = `
        <div class="form-grid-2">
            <div class="form-group">
                <label class="form-label">Username *</label>
                <input type="text" class="form-control" id="user-username" value="${user?.username || ""}" ${isEdit ? 'disabled' : ''}>
            </div>
            <div class="form-group">
                <label class="form-label">${isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <input type="password" class="form-control" id="user-password">
            </div>
            <div class="form-group">
                <label class="form-label">Full Name</label>
                <input type="text" class="form-control" id="user-fullname" value="${user?.full_name || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Role</label>
                <select class="form-control" id="user-role">
                    <option value="STAFF" ${user?.role === 'STAFF' ? 'selected' : ''}>Staff</option>
                    <option value="ADMIN" ${user?.role === 'ADMIN' ? 'selected' : ''}>Admin</option>
                    <option value="SUPER_ADMIN" ${user?.role === 'SUPER_ADMIN' ? 'selected' : ''}>Super Admin</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Branch / Godown</label>
                <select class="form-control" id="user-branch">
                    <option value="">None / Central</option>
                    ${branches.map(b => `<option value="${b.id}" ${user?.branch_id == b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-control" id="user-status">
                    <option value="ACTIVE" ${user?.status === 'ACTIVE' ? 'selected' : ''}>Active</option>
                    <option value="INACTIVE" ${user?.status === 'INACTIVE' ? 'selected' : ''}>Inactive</option>
                </select>
            </div>
        </div>
    `;
    openModal(
        isEdit ? "Edit User" : "Add New User",
        body,
        `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="saveUser(${user?.id || 'null'})">${isEdit ? "Update" : "Create"} User</button>
        `
    );
}

async function saveUser(id) {
    const data = {
        username: id ? null : document.getElementById('user-username').value,
        password: document.getElementById('user-password').value,
        full_name: document.getElementById('user-fullname').value,
        role: document.getElementById('user-role').value,
        branch_id: document.getElementById('user-branch').value || null,
        status: document.getElementById('user-status').value
    };
    
    try {
        if (id) {
            await apiCall(`/users/${id}`, "PUT", data);
            showToast("User updated");
        } else {
            if (!data.password) { showToast("Password required for new users", "error"); return; }
            await apiCall("/users", "POST", data);
            showToast("User created");
        }
        closeModal();
        loadUsersPage();
    } catch (e) { console.error(e); }
}

async function loadBranchesPage() {
    try {
        const list = await apiCall('/branches');
        paginateTable('branches-table', list, (b) => `
            <tr>
                <td>${b.id}</td>
                <td>${b.name}</td>
                <td>${b.code || "-"}</td>
                <td>${b.airport_code || "-"}</td>
                <td>${b.address || "-"}</td>
                <td><span class="status-indicator ${b.status === 'ACTIVE' ? 'status-active' : 'status-inactive'}"></span> ${b.status}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="openBranchModal(${JSON.stringify(b).replace(/"/g, '&quot;')})" title="Edit"><i class="fas fa-edit"></i></button>
                    </div>
                </td>
            </tr>
        `, 6);
    } catch (error) { console.error(error); }
}

function openBranchModal(branch = null) {
    const isEdit = branch !== null;
    const body = `
        <div class="form-grid-2">
            <div class="form-group">
                <label class="form-label">Name *</label>
                <input type="text" class="form-control" id="branch-name" value="${branch?.name || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Code</label>
                <input type="text" class="form-control" id="branch-code" value="${branch?.code || ""}">
            </div>
            <div class="form-group">
                <label class="form-label">Airport Code</label>
                <input type="text" class="form-control" id="branch-airport-code" value="${branch?.airport_code || ""}" placeholder="e.g. COK">
            </div>
            <div class="form-group" style="grid-column: span 2">
                <label class="form-label">Address</label>
                <textarea class="form-control" id="branch-address" rows="2">${branch?.address || ""}</textarea>
            </div>
        </div>
    `;
    openModal(
        isEdit ? "Edit Godown" : "Add New Godown",
        body,
        `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="saveBranch(${branch?.id || 'null'})">${isEdit ? "Update" : "Create"}</button>
        `
    );
}

async function saveBranch(id) {
    const data = {
        name: document.getElementById('branch-name').value,
        code: document.getElementById('branch-code').value,
        airport_code: document.getElementById('branch-airport-code').value,
        address: document.getElementById('branch-address').value
    };
    try {
        if (id) await apiCall(`/branches/${id}`, "PUT", data);
        else await apiCall("/branches", "POST", data);
        closeModal();
        loadBranchesPage();
    } catch (e) { console.error(e); }
}

// ================= Bulk Stock Upload =================
async function openBulkUploadModal() {
    try {
        const branches = await apiCall('/branches');
        const user = getAuthUser();
        const body = `
            <div class="form-group">
                <label class="form-label">Select Godown / Branch *</label>
                <select class="form-control" id="bulk-branch-id">
                    <option value="">Select Branch</option>
                    ${branches.map(b => `<option value="${b.id}" ${b.id == user.branch_id ? 'selected' : ''}>${b.name} (${b.airport_code || b.code})</option>`).join('')}
                </select>
            </div>
            <div class="form-group" style="margin-top: 15px">
                <label class="form-label">CSV File *</label>
                <input type="file" class="form-control" id="bulk-stock-file" accept=".csv">
                <p class="help-text" style="margin-top: 5px; font-size: 12px; color: #666;">
                    Make sure to use the <a href="javascript:void(0)" onclick="downloadSampleCSV()" style="color: var(--primary-color); text-decoration: underline;">Sample CSV format</a>.
                </p>
            </div>
        `;
        openModal("Bulk Stock Upload", body, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitBulkUpload()">Start Upload</button>
        `, "active");
    } catch (err) {
        showToast("Error loading branches: " + err.message, "error");
    }
}

async function submitBulkUpload() {
    const branchId = document.getElementById('bulk-branch-id').value;
    const fileInput = document.getElementById('bulk-stock-file');
    const file = fileInput.files[0];

    if (!branchId || !file) {
        showToast("Please select both branch and file", "warning");
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('branch_id', branchId);

    try {
        const uploadBtn = document.querySelector('.modal-footer .btn-primary');
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

        const res = await fetch('/api/bulk-upload/stock', {
            method: 'POST',
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            showToast(result.message, 'success');
            closeModal();
            if (typeof loadStockPage === 'function') loadStockPage();
        } else {
            showToast(result.error || 'Upload failed', 'error');
            uploadBtn.disabled = false;
            uploadBtn.innerText = 'Start Upload';
        }
    } catch (err) {
        showToast('Upload failed: ' + err.message, 'error');
    }
}

async function handleBulkStockUpload(input) {
    // Deprecated in favor of openBulkUploadModal
    console.warn('handleBulkStockUpload is deprecated. Use openBulkUploadModal instead.');
}

function downloadSampleCSV() {
  const headers = ['date', 'consignment', 'description', 'qty', 'unit', 'value', 'duty', 'bond_no', 'bond_expiry'];
  const sampleData = [
    ['2026-03-28', 'AIR INDIA', 'WHISKY 750ML', '100', 'BTL', '50000', '10000', 'BOND-TEST-001', '2027-03-28'],
    ['2026-03-28', 'EMIRATES', 'CIGARETTES CARTON', '50', 'CTN', '25000', '5000', 'BOND-TEST-002', '2027-03-28']
  ];
  
  let csvContent = headers.join(',') + '\n' + sampleData.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'sample_stock_upload.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


function initGlobalSearch(searchInput) {
    if (!searchInput) return;

    // Create results dropdown if it doesn't exist
    let dropdown = document.getElementById('search-results-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'search-results-dropdown';
        dropdown.className = 'search-results-dropdown';
        searchInput.parentElement.style.position = 'relative';
        searchInput.parentElement.appendChild(dropdown);
    }

    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const q = e.target.value.trim();

        if (q.length < 2) {
            dropdown.classList.remove('visible');
            return;
        }

        searchTimeout = setTimeout(async () => {
            try {
                const user = getAuthUser();
                const branchId = user.role !== 'SUPER_ADMIN' ? user.branch_id : null;
                const { results } = await apiCall(`/search?q=${encodeURIComponent(q)}${branchId ? `&branch_id=${branchId}` : ''}`);
                
                if (results.length === 0) {
                    dropdown.innerHTML = '<div class="search-result-item" style="cursor: default">No results found</div>';
                } else {
                    dropdown.innerHTML = results.map(r => `
                        <a href="${r.url}${r.type === 'INWARD' ? `?bond_no=${encodeURIComponent(r.title)}` : r.type === 'OUTWARD' ? `?flight_no=${encodeURIComponent(r.title)}` : ''}" class="search-result-item">
                            <div class="search-result-icon"><i class="${r.icon}"></i></div>
                            <div class="search-result-content">
                                <span class="search-result-title">${r.title}</span>
                                <span class="search-result-subtitle">${r.subtitle}</span>
                            </div>
                            <span class="search-result-type">${r.type}</span>
                        </a>
                    `).join('');
                }
                dropdown.classList.add('visible');
            } catch (err) {
                console.error('Search error:', err);
            }
        }, 300);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('visible');
        }
    });

    // Handle Enter key
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const firstResult = dropdown.querySelector('.search-result-item');
            if (firstResult && firstResult.tagName === 'A') {
                firstResult.click();
            }
        }
    });
}

// ================= Navigation & Sidebar =================

function initNavigation() {
    const user = getAuthUser();
    
    // Initialize sidebar state from localStorage
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        document.body.classList.add('collapsed-sidebar');
    }

    const sidebar = document.getElementById('sidebar-container');
    const topBar = document.getElementById('top-bar-container');
    
    // Auto-populate if containers exist
    if (sidebar) {
        sidebar.innerHTML = `
            <div class="sidebar-header">
              <div class="logo-box"><i class="fas fa-plane-arrival"></i></div>
              <div class="logo-text">CAFS <span>Inventory</span></div>
              <div class="sidebar-toggle" onclick="toggleSidebar()">
                <i class="fas fa-bars"></i>
              </div>
            </div>
            <nav class="sidebar-nav">
              <a href="index.html" class="nav-item ${window.location.pathname.endsWith('index.html') ? 'active' : ''}"><i class="fas fa-th-large"></i> <span>Dashboard</span></a>
              
              ${user.role === 'SUPER_ADMIN' ? `
                <div class="nav-label">Inventory View</div>
                <a href="stock.html" class="nav-item ${window.location.pathname.endsWith('stock.html') ? 'active' : ''}"><i class="fas fa-boxes"></i> <span>Stock Master</span></a>
                
                <div class="nav-label">Master Data</div>
                <a href="items.html" class="nav-item"><i class="fas fa-wine-bottle"></i> <span>Product Master</span></a>
                <a href="consignments.html" class="nav-item"><i class="fas fa-building"></i> <span>Airline Master</span></a>
                <a href="airline-masters.html" class="nav-item ${window.location.pathname.endsWith('airline-masters.html') ? 'active' : ''}"><i class="fas fa-plane"></i> <span>Airline Flights</span></a>
                
                <div class="nav-label">Administration</div>
                <a href="users.html" class="nav-item ${window.location.pathname.endsWith('users.html') ? 'active' : ''}"><i class="fas fa-users-cog"></i> <span>User Management</span></a>
                <a href="branches.html" class="nav-item ${window.location.pathname.endsWith('branches.html') ? 'active' : ''}"><i class="fas fa-warehouse"></i> <span>Godown Management</span></a>
              ` : `
                <div class="nav-label">Transactions</div>
                <a href="inward.html" class="nav-item ${window.location.pathname.endsWith('inward.html') ? 'active' : ''}"><i class="fas fa-arrow-down"></i> <span>Inward Billing</span></a>
                <a href="outward.html" class="nav-item ${window.location.pathname.endsWith('outward.html') ? 'active' : ''}"><i class="fas fa-arrow-up"></i> <span>Outward Billing</span></a>
                <a href="stock.html" class="nav-item ${window.location.pathname.endsWith('stock.html') ? 'active' : ''}"><i class="fas fa-boxes"></i> <span>Balance Stock</span></a>
                <a href="damaged.html" class="nav-item ${window.location.pathname.endsWith('damaged.html') ? 'active' : ''}"><i class="fas fa-heart-broken"></i> <span>Damaged Stock</span></a>
                <a href="return-stock.html" class="nav-item ${window.location.pathname.endsWith('return-stock.html') ? 'active' : ''}"><i class="fas fa-undo"></i> <span>Return Stock</span></a>
                
                <div class="nav-label">Reports</div>
                <a href="form-a.html" class="nav-item ${window.location.pathname.endsWith('form-a.html') ? 'active' : ''}"><i class="fas fa-file-invoice"></i> <span>Form-A Ledger</span></a>
                <a href="form-b.html" class="nav-item ${window.location.pathname.endsWith('form-b.html') ? 'active' : ''}"><i class="fas fa-file-contract"></i> <span>Form-B Monthly</span></a>
                <a href="detailed-stock.html" class="nav-item ${window.location.pathname.endsWith('detailed-stock.html') ? 'active' : ''}"><i class="fas fa-list-ul"></i> <span>Detailed Stock</span></a>
                <a href="shipping-bill.html" class="nav-item ${window.location.pathname.endsWith('shipping-bill.html') ? 'active' : ''}"><i class="fas fa-file-export"></i> <span>Shipping Bill</span></a>

                <div class="nav-label">Master Data</div>
                <a href="items.html" class="nav-item ${window.location.pathname.endsWith('items.html') ? 'active' : ''}"><i class="fas fa-wine-bottle"></i> <span>Items / Products</span></a>
                <a href="consignments.html" class="nav-item ${window.location.pathname.endsWith('consignments.html') ? 'active' : ''}"><i class="fas fa-building"></i> <span>Consignments</span></a>
                <a href="airline-masters.html" class="nav-item ${window.location.pathname.endsWith('airline-masters.html') ? 'active' : ''}"><i class="fas fa-plane"></i> <span>Airline Masters</span></a>
                <a href="country-masters.html" class="nav-item ${window.location.pathname.endsWith('country-masters.html') ? 'active' : ''}"><i class="fas fa-globe"></i> <span>Country Masters</span></a>
              `}
            </nav>
            <div class="sidebar-footer">
              <div class="user-profile">
                <div class="user-avatar">${(user.username || 'GU').substring(0,2).toUpperCase()}</div>
                <div class="user-info">
                  <div class="user-name" style="margin-bottom: 2px;">${user.name || 'Guest'}</div>
                  <div class="user-username" style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); margin-bottom: 4px;">@${user.username}</div>
                  <div class="user-role">${user.branch_name ? `Godown: ${user.branch_name}` : user.role}</div>
                </div>
                <button class="btn-logout" onclick="logout()"><i class="fas fa-sign-out-alt"></i></button>
              </div>
            </div>
        `;
    }

    if (topBar) {
        topBar.innerHTML = `
          <div class="search-box">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search bond no, BE no, flight..." id="global-search" />
          </div>
          <div class="top-actions">
            ${user.role !== 'SUPER_ADMIN' ? `
              <button class="btn btn-primary" onclick="window.location.href='inward-entry.html'">
                <i class="fas fa-plus"></i> New Inward
              </button>
              <button class="btn btn-secondary" onclick="window.location.href='outward-entry.html'">
                <i class="fas fa-plus"></i> New Outward
              </button>
            ` : ''}
            <div class="divider"></div>
            <button class="icon-btn" title="Refresh" onclick="window.location.reload()">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        `;

        // Initialize advanced Global Search
        const searchInput = document.getElementById("global-search");
        if (searchInput) initGlobalSearch(searchInput);
    }
}

function toggleSidebar() {
    const isCollapsed = document.body.classList.toggle('collapsed-sidebar');
    localStorage.setItem('sidebar-collapsed', isCollapsed);
}

// Super Admin Tools - Auto Login / User Swapper
async function renderSuperAdminTools() {
    const container = document.getElementById("super-admin-tools");
    const userList = document.getElementById("auto-login-user-list");
    if (!container || !userList) return;

    container.style.display = "block";
    
    // Add styles if not present
    if (!document.getElementById("super-admin-styles")) {
        const style = document.createElement("style");
        style.id = "super-admin-styles";
        style.innerHTML = `
            .auto-login-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 1rem;
                margin-top: 1rem;
            }
            .user-switch-btn {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                padding: 1rem;
                border-radius: 10px;
                cursor: pointer;
                text-align: left;
                transition: all 0.2s;
                display: flex;
                flex-direction: column;
                position: relative;
                overflow: hidden;
            }
            .user-switch-btn:hover {
                background: white;
                border-color: var(--accent-blue);
                box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                transform: translateY(-2px);
            }
            .user-switch-btn .u-name {
                font-weight: 700;
                font-size: 1rem;
                color: #1e293b;
                margin-bottom: 0.25rem;
            }
            .user-switch-btn .u-role {
                font-size: 0.75rem;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            .user-switch-btn .u-branch {
                margin-top: 0.5rem;
                font-size: 0.8rem;
                color: var(--accent-blue);
                font-weight: 500;
            }
            .user-switch-btn::after {
                content: '\\f0e2';
                font-family: 'Font Awesome 5 Free';
                font-weight: 900;
                position: absolute;
                right: -10px;
                bottom: -10px;
                font-size: 2rem;
                opacity: 0.05;
                transition: all 0.2s;
            }
            .user-switch-btn:hover::after {
                right: 5px;
                bottom: 5px;
                opacity: 0.1;
            }
        `;
        document.head.appendChild(style);
    }

    try {
        const users = await apiCall('/auth/users');
        userList.innerHTML = users.map(u => `
            <button class="user-switch-btn" onclick="autoLogin(${u.id})">
                <span class="u-name">${u.name || u.username}</span>
                <span class="u-role">${u.role}</span>
                <span class="u-branch">${u.branch_name || 'All Branches'}</span>
            </button>
        `).join('');
    } catch (err) {
        userList.innerHTML = '<div class="error">Failed to load users for auto-login</div>';
    }
}

async function autoLogin(userId) {
    try {
        const res = await fetch('/api/auth/auto-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Auto-login failed');

        localStorage.setItem('cafs_auth', JSON.stringify({
            token: data.token,
            user: data.user,
            timestamp: Date.now()
        }));

        showToast("Switching user...", "success");
        setTimeout(() => window.location.href = 'index.html', 800);
    } catch (err) {
        showToast(err.message, "error");
    }
}

// Make functions global
window.loadUsersPage = loadUsersPage;
window.openUserModal = openUserModal;
window.saveUser = saveUser;
window.loadBranchesPage = loadBranchesPage;
window.openBranchModal = openBranchModal;
window.saveBranch = saveBranch;
window.initNavigation = initNavigation;
window.autoLogin = autoLogin;
window.renderSuperAdminTools = renderSuperAdminTools;
