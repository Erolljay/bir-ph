// ── api.js — Manager.io API layer ──
// All calls go directly to Manager's REST API using an access token.
// Base URL and token are stored in sessionStorage for the session.

const API = (() => {

  let _base = '';  // e.g. https://app.manager.io
  let _token = '';

  const PAGE_SIZE = 50;

  function init(baseUrl, token) {
    _base = baseUrl.replace(/\/$/, '');
    _token = token;
  }

  function clear() { _base = ''; _token = ''; }

  function headers() {
    return {
      'Authorization': 'Basic ' + btoa(':' + _token),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  async function fetchWithTimeout(url, options, ms = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } finally { clearTimeout(id); }
  }

  async function get(path) {
    const r = await fetchWithTimeout(`${_base}${path}`, { headers: headers() });
    if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${r.statusText}`);
    return r.json();
  }

  async function put(path, body) {
    const r = await fetch(`${_base}${path}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`PUT ${path} → ${r.status}: ${text}`);
    }
    // Some PUT endpoints return 200 with body, others return 204 no content
    const ct = r.headers.get('content-type') || '';
    if (r.status === 204 || !ct.includes('application/json')) return {};
    return r.json();
  }

  async function post(path, body) {
    const r = await fetch(`${_base}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`POST ${path} → ${r.status}: ${text}`);
    }
    const ct = r.headers.get('content-type') || '';
    if (r.status === 204 || !ct.includes('application/json')) return {};
    return r.json();
  }

  // Fetch all pages of a batch endpoint (Manager returns max 50 per page)
  async function fetchAll(path, business) {
    const qs = business
      ? `Business=${encodeURIComponent(business)}&Skip=0&PageSize=${PAGE_SIZE}`
      : `Skip=0&PageSize=${PAGE_SIZE}`;
    let all = [];
    let skip = 0;
    while (true) {
      const qsFull = business
        ? `Business=${encodeURIComponent(business)}&Skip=${skip}&PageSize=${PAGE_SIZE}`
        : `Skip=${skip}&PageSize=${PAGE_SIZE}`;
      const res = await get(`${path}?${qsFull}`);
      const items = res.items || res.data || [];
      all = all.concat(items);
      if (items.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }
    return all;
  }

  // ── Businesses ──
  async function getBusinesses() {
    // API2: test connection with /api2/customers, businesses must be entered manually
    // Try api4/businesses first, fall back gracefully
    try {
      const res = await get('/api4/businesses');
      if (res.businesses) return (res.businesses || []).map(b => b.name);
    } catch {}
    // API2: ping to verify token is valid
    await get('/api2/customers?pageSize=1');
    return ['__api2__']; // signal to app that we're in API2 mode
  }

  // ── Customers (batch) ──
  async function getCustomers(business) {
    return fetchAll('/api4/customer-batch', business);
  }

  async function saveCustomer(business, key, value) {
    return put('/api4/customer-batch', {
      business,
      values: [{ key, value }]
    });
  }

  // ── Suppliers (batch) ──
  async function getSuppliers(business) {
    return fetchAll('/api4/supplier-batch', business);
  }

  async function saveSupplier(business, key, value) {
    return put('/api4/supplier-batch', {
      business,
      values: [{ key, value }]
    });
  }

  // ── Employees (batch) ──
  async function getEmployees(business) {
    return fetchAll('/api4/employee-batch', business);
  }

  async function saveEmployee(business, key, value) {
    return put('/api4/employee-batch', {
      business,
      values: [{ key, value }]
    });
  }

  // ── Sales Invoices ──
  async function getSalesInvoices(business, from, to) {
    let all = [], skip = 0;
    while (true) {
      let qs = `Business=${encodeURIComponent(business)}&Skip=${skip}&PageSize=${PAGE_SIZE}`;
      if (from) qs += `&StartDate=${from}`;
      if (to) qs += `&EndDate=${to}`;
      const res = await get(`/api4/sales-invoice-batch?${qs}`);
      const items = res.items || [];
      all = all.concat(items);
      if (items.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }
    return all;
  }

  // ── Purchase Invoices ──
  async function getPurchaseInvoices(business, from, to) {
    let all = [], skip = 0;
    while (true) {
      let qs = `Business=${encodeURIComponent(business)}&Skip=${skip}&PageSize=${PAGE_SIZE}`;
      if (from) qs += `&StartDate=${from}`;
      if (to) qs += `&EndDate=${to}`;
      const res = await get(`/api4/purchase-invoice-batch?${qs}`);
      const items = res.items || [];
      all = all.concat(items);
      if (items.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }
    return all;
  }

  // ── Tax Codes (batch) ──
  async function getTaxCodes(business) {
    return fetchAll('/api4/tax-code-batch', business);
  }

  async function saveTaxCode(business, key, value) {
    // Create or update a tax code
    if (key) {
      return put('/api4/tax-code-batch', { business, values: [{ key, value }] });
    } else {
      // New — POST
      return post('/api4/tax-code-batch', { business, values: [{ value }] });
    }
  }

  // ── Business custom fields ──
  // We store BIR details as custom fields on the business entity
  async function getBusinessDetails(business) {
    // Try to read from a known custom fields endpoint
    try {
      const res = await get(`/api4/business-details?Business=${encodeURIComponent(business)}`);
      return res;
    } catch {
      return {};
    }
  }

  async function saveBusinessDetails(business, fields) {
    return put(`/api4/business-details`, { business, ...fields });
  }

  // ── Payslip Items ──
  async function getPayslipItems(business) {
    return fetchAll('/api4/payslip-item-batch', business);
  }

  async function savePayslipItem(business, key, value) {
    return put('/api4/payslip-item-batch', { business, values: [{ key, value }] });
  }

  // ── Reports (install) ──
  // Install a report extension into a business via the report API
  async function installReport(business, reportDefinition) {
    return put('/api4/report', { business, ...reportDefinition });
  }

  async function getInstalledReports(business) {
    try {
      const res = await get(`/api4/report-batch?Business=${encodeURIComponent(business)}&Skip=0&PageSize=50`);
      return res.items || [];
    } catch {
      return [];
    }
  }

  return {
    init, clear,
    getBusinesses,
    getCustomers, saveCustomer,
    getSuppliers, saveSupplier,
    getEmployees, saveEmployee,
    getSalesInvoices,
    getPurchaseInvoices,
    getTaxCodes, saveTaxCode,
    getBusinessDetails, saveBusinessDetails,
    getPayslipItems, savePayslipItem,
    installReport, getInstalledReports,
    get, put, post
  };
})();
