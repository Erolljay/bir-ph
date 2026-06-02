// ── app.js — Main application logic ──

(async () => {

  // ── State ──
  let currentBusiness = '';
  let customers = [], suppliers = [], employees = [];
  let custPage = 1, suppPage = 1;
  const PAGE = 30;

  // BIR tax codes to create
  const BIR_TAX_CODES = [
    { name: 'VAT 12%',          rate: 0.12, type: 'Output/Input VAT' },
    { name: 'VAT 0% (Zero-Rated)', rate: 0,  type: 'Zero-Rated' },
    { name: 'VAT Exempt',       rate: 0,    type: 'Exempt' },
    { name: 'EWT 1%',           rate: 0.01, type: 'Expanded Withholding Tax' },
    { name: 'EWT 2%',           rate: 0.02, type: 'Expanded Withholding Tax' },
    { name: 'EWT 5%',           rate: 0.05, type: 'Expanded Withholding Tax' },
    { name: 'EWT 10%',          rate: 0.10, type: 'Expanded Withholding Tax' },
    { name: 'EWT 15%',          rate: 0.15, type: 'Expanded Withholding Tax' },
    { name: 'EWT 25%',          rate: 0.25, type: 'Expanded Withholding Tax' },
  ];

  // BIR reports to install
  const BIR_REPORTS = [
    { id: 'SLSP', name: 'SLSP — Summary List of Sales & Purchases', desc: 'Quarterly VAT relief report (combined SLS + SLP)' },
    { id: 'QAP',  name: 'QAP — Quarterly Alphalist of Payees',      desc: 'EWT alphalist for BIR Form 1601-EQ' },
    { id: 'VAT',  name: 'VAT Return (2550Q / 2550M)',               desc: 'VAT return summary report' },
    { id: '2307', name: 'Form 2307 — Certificate of CWT',           desc: 'Per-supplier EWT certificate' },
    { id: '2316', name: 'Form 2316 — Certificate of Compensation',  desc: 'Annual employee compensation certificate' },
    { id: '1601C',name: '1601-C — Monthly Remittance (Compensation)',desc: 'Monthly withholding on compensation' },
    { id: '1601E',name: '1601-EQ — Quarterly EWT Remittance',       desc: 'Quarterly expanded withholding remittance' },
  ];

  // Payslip BIR categories
  const PAYSLIP_CATEGORIES = [
    'Basic Pay', 'Holiday Pay', 'Overtime Pay', 'Night Differential',
    '13th Month Pay', 'De Minimis Benefits', 'SSS Contribution',
    'PhilHealth Contribution', 'Pag-IBIG Contribution', 'Tax Withheld',
    'Other Non-Taxable', 'Other Taxable Compensation', 'Gross Compensation Income'
  ];

  // ── Helpers ──
  function show(id) { document.getElementById(id).hidden = false; }
  function hide(id) { document.getElementById(id).hidden = true; }
  function val(id) { return document.getElementById(id).value.trim(); }
  function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
  function showMsg(id, msg, type = 'success') {
    const el = document.getElementById(id);
    el.textContent = msg; el.className = `save-msg ${type}`; el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 4000);
  }

  function loading(msg = 'Loading…') {
    document.getElementById('loadingMsg').textContent = msg;
    document.getElementById('loadingOverlay').classList.add('active');
  }
  function loaded() { document.getElementById('loadingOverlay').classList.remove('active'); }

  // ── Session storage ──
  function saveSession(url, token) {
    sessionStorage.setItem('mgr_url', url);
    sessionStorage.setItem('mgr_token', token);
  }
  function loadSession() {
    return { url: sessionStorage.getItem('mgr_url'), token: sessionStorage.getItem('mgr_token') };
  }
  function clearSession() {
    sessionStorage.removeItem('mgr_url');
    sessionStorage.removeItem('mgr_token');
  }

  // ── Connection ──
  async function connect(url, token) {
    loading('Connecting to Manager…');
    try {
      API.init(url, token);
      const businesses = await API.getBusinesses();
      saveSession(url, token);
      hide('connPanel');
      show('mainApp');
      populateBusinessSelect(businesses);
      setConnected(true);
    } catch (e) {
      const err = document.getElementById('connError');
      err.textContent = `Connection failed: ${e.message}`;
      err.hidden = false;
      API.clear();
    } finally {
      loaded();
    }
  }

  function populateBusinessSelect(businesses) {
    const sel = document.getElementById('bizSelect');
    sel.innerHTML = '<option value="">— select a business —</option>';
    businesses.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b; opt.textContent = b;
      sel.appendChild(opt);
    });
  }

  function setConnected(yes) {
    const dot = document.querySelector('.conn-dot');
    const label = document.querySelector('.conn-label');
    dot.className = `conn-dot ${yes ? 'connected' : 'disconnected'}`;
    label.textContent = yes ? 'Connected' : 'Not connected';
  }

  // ── Tab switching ──
  document.getElementById('tabNav').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    onTabChange(btn.dataset.tab);
  });

  function onTabChange(tab) {
    if (!currentBusiness) return;
    if (tab === 'customers' && !customers.length) loadCustomers();
    if (tab === 'suppliers' && !suppliers.length) loadSuppliers();
    if (tab === 'employees' && !employees.length) loadEmployees();
    if (tab === 'generate') populateGenSelects();
  }

  // ── Business select ──
  document.getElementById('bizSelect').addEventListener('change', async e => {
    currentBusiness = e.target.value;
    customers = []; suppliers = []; employees = [];
    const tabs = ['reports','taxcodes','business','customers','suppliers','employees','payslip','generate'];
    tabs.forEach(t => {
      const notice = document.getElementById(`${t}NoBiz`);
      if (notice) notice.hidden = !!currentBusiness;
    });
    const activeTab = document.querySelector('.tab.active')?.dataset.tab;
    if (currentBusiness && activeTab) onTabChange(activeTab);
  });

  // ── Disconnect ──
  document.getElementById('btnDisconnect').addEventListener('click', () => {
    clearSession(); API.clear();
    hide('mainApp'); show('connPanel');
    setConnected(false);
    document.getElementById('bizSelect').innerHTML = '<option value="">— select a business —</option>';
    currentBusiness = '';
  });

  // ── REPORTS TAB ──
  function renderReports(installed) {
    const installedIds = new Set(installed.map(r => r.item?.reportId || r.item?.id || ''));
    const tbody = document.getElementById('reportsTbody');
    tbody.innerHTML = BIR_REPORTS.map(r => `
      <tr>
        <td><strong>${r.name}</strong></td>
        <td>${r.desc}</td>
        <td><span class="badge ${installedIds.has(r.id) ? 'badge-installed' : 'badge-missing'}">${installedIds.has(r.id) ? 'Installed' : 'Not installed'}</span></td>
        <td><button class="btn-sm btn-outline" data-report="${r.id}">Install</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-report]').forEach(btn => {
      btn.addEventListener('click', () => installReport(btn.dataset.report));
    });
  }

  async function installReport(reportId) {
    loading(`Installing ${reportId}…`);
    try {
      await API.installReport(currentBusiness, { reportId });
      const installed = await API.getInstalledReports(currentBusiness);
      renderReports(installed);
    } catch (e) {
      alert(`Could not install report: ${e.message}`);
    } finally { loaded(); }
  }

  document.querySelector('[data-tab="reports"]').addEventListener('click', async () => {
    if (!currentBusiness) return;
    loading('Loading reports…');
    try {
      const installed = await API.getInstalledReports(currentBusiness);
      renderReports(installed);
    } catch { renderReports([]); } finally { loaded(); }
  }, { once: false });

  // ── TAX CODES TAB ──
  function renderTaxCodes(existing) {
    const existingNames = new Set(existing.map(tc => tc.item?.name || tc.item?.Name || ''));
    const tbody = document.getElementById('taxcodesTbody');
    tbody.innerHTML = BIR_TAX_CODES.map(tc => `
      <tr>
        <td>${tc.name}</td>
        <td>${tc.rate > 0 ? (tc.rate * 100).toFixed(0) + '%' : '—'}</td>
        <td>${tc.type}</td>
        <td><span class="badge ${existingNames.has(tc.name) ? 'badge-present' : 'badge-missing'}">${existingNames.has(tc.name) ? 'Present' : 'Not present'}</span></td>
        <td><button class="btn-sm btn-outline" data-tcname="${tc.name}" data-tcrate="${tc.rate}">${existingNames.has(tc.name) ? 'Update' : 'Create'}</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('[data-tcname]').forEach(btn => {
      btn.addEventListener('click', () => createTaxCode(btn.dataset.tcname, parseFloat(btn.dataset.tcrate)));
    });
  }

  async function createTaxCode(name, rate) {
    loading(`Saving tax code: ${name}…`);
    try {
      await API.saveTaxCode(currentBusiness, null, { name, rate });
      document.getElementById('btnLoadTaxStatus').click();
    } catch (e) { alert(`Error: ${e.message}`); } finally { loaded(); }
  }

  document.getElementById('btnLoadTaxStatus').addEventListener('click', async () => {
    if (!currentBusiness) return;
    loading('Loading tax codes…');
    try {
      const codes = await API.getTaxCodes(currentBusiness);
      renderTaxCodes(codes);
    } catch { renderTaxCodes([]); } finally { loaded(); }
  });

  // ── BUSINESS TAB ──
  document.getElementById('businessForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentBusiness) return;
    loading('Saving business details…');
    try {
      await API.saveBusinessDetails(currentBusiness, {
        tin: val('biz_tin'), branchCode: val('biz_branch'),
        rdoCode: val('biz_rdo'), lineOfBusiness: val('biz_lob'),
        registeredName: val('biz_regname'), registrationType: val('biz_regtype'),
        taxpayerClassification: val('biz_formtype')
      });
      showMsg('bizSaveMsg', '✓ Business details saved.');
    } catch (e) { showMsg('bizSaveMsg', `Error: ${e.message}`, 'error'); } finally { loaded(); }
  });

  async function loadBusinessDetails() {
    if (!currentBusiness) return;
    try {
      const d = await API.getBusinessDetails(currentBusiness);
      setVal('biz_tin', d.tin); setVal('biz_branch', d.branchCode);
      setVal('biz_rdo', d.rdoCode); setVal('biz_lob', d.lineOfBusiness);
      setVal('biz_regname', d.registeredName); setVal('biz_regtype', d.registrationType);
      setVal('biz_formtype', d.taxpayerClassification);
    } catch {}
  }

  document.querySelector('[data-tab="business"]').addEventListener('click', loadBusinessDetails);

  // ── CUSTOMERS TAB ──
  async function loadCustomers() {
    if (!currentBusiness) return;
    loading('Loading customers…');
    try {
      customers = await API.getCustomers(currentBusiness);
      renderCustomers();
    } catch (e) { alert(`Error loading customers: ${e.message}`); } finally { loaded(); }
  }

  function renderCustomers(filter = '') {
    const filtered = filter
      ? customers.filter(c => (c.item?.name || '').toLowerCase().includes(filter.toLowerCase()))
      : customers;
    const total = filtered.length;
    const pages = Math.ceil(total / PAGE) || 1;
    custPage = Math.min(custPage, pages);
    const slice = filtered.slice((custPage - 1) * PAGE, custPage * PAGE);
    const tbody = document.getElementById('customersTbody');
    tbody.innerHTML = slice.map(c => {
      const bir = c.item?.birDetails || {};
      const k = c.key;
      return `<tr>
        <td>${c.item?.name || ''}</td>
        <td><select class="cust-type" data-key="${k}">
          <option value="NON-INDIVIDUAL" ${bir.taxpayerType==='NON-INDIVIDUAL'?'selected':''}>Non-Individual</option>
          <option value="INDIVIDUAL" ${bir.taxpayerType==='INDIVIDUAL'?'selected':''}>Individual</option>
        </select></td>
        <td><input type="text" class="cust-lastname" data-key="${k}" value="${bir.lastName||bir.registeredName||''}" placeholder="Last / Reg. Name"></td>
        <td><input type="text" class="cust-firstname" data-key="${k}" value="${bir.firstName||''}" placeholder="First Name"></td>
        <td><input type="text" class="cust-middlename" data-key="${k}" value="${bir.middleName||''}" placeholder="Middle Name"></td>
        <td><input type="text" class="cust-tin" data-key="${k}" value="${bir.tin||''}" placeholder="000-000-000" style="width:100px"></td>
        <td><input type="text" class="cust-branch" data-key="${k}" value="${bir.branchCode||''}" placeholder="0000" style="width:56px"></td>
        <td><button class="btn-sm btn-primary cust-save" data-key="${k}">Save</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.cust-save').forEach(btn => {
      btn.addEventListener('click', () => saveCustomerRow(btn.dataset.key));
    });
    renderPagination('custPagination', custPage, pages, p => { custPage = p; renderCustomers(val('custSearch')); });
  }

  async function saveCustomerRow(key) {
    const cust = customers.find(c => c.key === key);
    if (!cust) return;
    const bir = {
      taxpayerType: document.querySelector(`.cust-type[data-key="${key}"]`).value,
      lastName: document.querySelector(`.cust-lastname[data-key="${key}"]`).value,
      firstName: document.querySelector(`.cust-firstname[data-key="${key}"]`).value,
      middleName: document.querySelector(`.cust-middlename[data-key="${key}"]`).value,
      tin: document.querySelector(`.cust-tin[data-key="${key}"]`).value,
      branchCode: document.querySelector(`.cust-branch[data-key="${key}"]`).value,
    };
    bir.registeredName = bir.taxpayerType === 'NON-INDIVIDUAL' ? bir.lastName : '';
    loading('Saving customer…');
    try {
      await API.saveCustomer(currentBusiness, key, { ...cust.item, birDetails: bir });
      const idx = customers.findIndex(c => c.key === key);
      if (idx >= 0) customers[idx].item.birDetails = bir;
      showMsg && console.log('Customer saved');
    } catch (e) { alert(`Error: ${e.message}`); } finally { loaded(); }
  }

  document.getElementById('custSearch').addEventListener('input', e => { custPage = 1; renderCustomers(e.target.value); });
  document.getElementById('btnCustReload').addEventListener('click', () => { customers = []; loadCustomers(); });

  // ── SUPPLIERS TAB ──
  async function loadSuppliers() {
    if (!currentBusiness) return;
    loading('Loading suppliers…');
    try {
      suppliers = await API.getSuppliers(currentBusiness);
      renderSuppliers();
    } catch (e) { alert(`Error loading suppliers: ${e.message}`); } finally { loaded(); }
  }

  function renderSuppliers(filter = '') {
    const filtered = filter
      ? suppliers.filter(s => (s.item?.name || '').toLowerCase().includes(filter.toLowerCase()))
      : suppliers;
    const pages = Math.ceil(filtered.length / PAGE) || 1;
    suppPage = Math.min(suppPage, pages);
    const slice = filtered.slice((suppPage - 1) * PAGE, suppPage * PAGE);
    const tbody = document.getElementById('suppliersTbody');
    tbody.innerHTML = slice.map(s => {
      const bir = s.item?.birDetails || {};
      const k = s.key;
      return `<tr>
        <td>${s.item?.name || ''}</td>
        <td><select class="supp-type" data-key="${k}">
          <option value="NON-INDIVIDUAL" ${bir.taxpayerType==='NON-INDIVIDUAL'?'selected':''}>Non-Individual</option>
          <option value="INDIVIDUAL" ${bir.taxpayerType==='INDIVIDUAL'?'selected':''}>Individual</option>
        </select></td>
        <td><input type="text" class="supp-lastname" data-key="${k}" value="${bir.lastName||bir.registeredName||''}" placeholder="Last / Reg. Name"></td>
        <td><input type="text" class="supp-firstname" data-key="${k}" value="${bir.firstName||''}" placeholder="First"></td>
        <td><input type="text" class="supp-middlename" data-key="${k}" value="${bir.middleName||''}" placeholder="Middle"></td>
        <td><input type="text" class="supp-tin" data-key="${k}" value="${bir.tin||''}" placeholder="000-000-000" style="width:100px"></td>
        <td><input type="text" class="supp-branch" data-key="${k}" value="${bir.branchCode||''}" placeholder="0000" style="width:56px"></td>
        <td><input type="text" class="supp-atc" data-key="${k}" value="${bir.atcCode||''}" placeholder="WI010" style="width:64px"></td>
        <td style="text-align:center"><input type="checkbox" class="supp-qap" data-key="${k}" ${bir.includeInQAP?'checked':''}></td>
        <td><button class="btn-sm btn-primary supp-save" data-key="${k}">Save</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.supp-save').forEach(btn => {
      btn.addEventListener('click', () => saveSupplierRow(btn.dataset.key));
    });
    renderPagination('suppPagination', suppPage, pages, p => { suppPage = p; renderSuppliers(val('suppSearch')); });
  }

  async function saveSupplierRow(key) {
    const supp = suppliers.find(s => s.key === key);
    if (!supp) return;
    const bir = {
      taxpayerType: document.querySelector(`.supp-type[data-key="${key}"]`).value,
      lastName: document.querySelector(`.supp-lastname[data-key="${key}"]`).value,
      firstName: document.querySelector(`.supp-firstname[data-key="${key}"]`).value,
      middleName: document.querySelector(`.supp-middlename[data-key="${key}"]`).value,
      tin: document.querySelector(`.supp-tin[data-key="${key}"]`).value,
      branchCode: document.querySelector(`.supp-branch[data-key="${key}"]`).value,
      atcCode: document.querySelector(`.supp-atc[data-key="${key}"]`).value,
      includeInQAP: document.querySelector(`.supp-qap[data-key="${key}"]`).checked,
    };
    bir.registeredName = bir.taxpayerType === 'NON-INDIVIDUAL' ? bir.lastName : '';
    loading('Saving supplier…');
    try {
      await API.saveSupplier(currentBusiness, key, { ...supp.item, birDetails: bir });
      const idx = suppliers.findIndex(s => s.key === key);
      if (idx >= 0) suppliers[idx].item.birDetails = bir;
    } catch (e) { alert(`Error: ${e.message}`); } finally { loaded(); }
  }

  document.getElementById('suppSearch').addEventListener('input', e => { suppPage = 1; renderSuppliers(e.target.value); });
  document.getElementById('btnSuppReload').addEventListener('click', () => { suppliers = []; loadSuppliers(); });

  // ── EMPLOYEES TAB ──
  async function loadEmployees() {
    if (!currentBusiness) return;
    loading('Loading employees…');
    try {
      employees = await API.getEmployees(currentBusiness);
      renderEmployees();
    } catch (e) { alert(`Error loading employees: ${e.message}`); } finally { loaded(); }
  }

  function renderEmployees(filter = '') {
    const filtered = filter
      ? employees.filter(e => (e.item?.name || '').toLowerCase().includes(filter.toLowerCase()))
      : employees;
    const tbody = document.getElementById('employeesTbody');
    tbody.innerHTML = filtered.map(emp => {
      const bir = emp.item?.birDetails || {};
      return `<tr>
        <td>${emp.item?.name || ''}</td>
        <td>${bir.tin || '—'}</td>
        <td>${bir.sss || '—'}</td>
        <td>${bir.philhealth || '—'}</td>
        <td>${bir.pagibig || '—'}</td>
        <td>${bir.taxStatus || '—'}</td>
        <td><button class="btn-sm btn-outline emp-edit" data-key="${emp.key}">Edit</button></td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.emp-edit').forEach(btn => {
      btn.addEventListener('click', () => openEmpEditor(btn.dataset.key));
    });
  }

  function openEmpEditor(key) {
    const emp = employees.find(e => e.key === key);
    if (!emp) return;
    const bir = emp.item?.birDetails || {};
    document.getElementById('empEditorName').textContent = emp.item?.name || key;
    setVal('emp_tin', bir.tin); setVal('emp_branch', bir.branchCode);
    setVal('emp_sss', bir.sss); setVal('emp_philhealth', bir.philhealth);
    setVal('emp_pagibig', bir.pagibig); setVal('emp_civil', bir.civilStatus);
    setVal('emp_taxstatus', bir.taxStatus); setVal('emp_dob', bir.dateOfBirth);
    setVal('emp_hired', bir.dateHired); setVal('emp_separated', bir.dateSeparated);
    setVal('emp_empstatus', bir.employmentStatus || 'REGULAR');
    document.getElementById('empEditor').dataset.key = key;
    show('empEditorWrap');
  }

  document.getElementById('btnEmpSave').addEventListener('click', async () => {
    const key = document.getElementById('empEditor').dataset.key;
    const emp = employees.find(e => e.key === key);
    if (!emp) return;
    const bir = {
      tin: val('emp_tin'), branchCode: val('emp_branch'),
      sss: val('emp_sss'), philhealth: val('emp_philhealth'),
      pagibig: val('emp_pagibig'), civilStatus: val('emp_civil'),
      taxStatus: val('emp_taxstatus'), dateOfBirth: val('emp_dob'),
      dateHired: val('emp_hired'), dateSeparated: val('emp_separated'),
      employmentStatus: val('emp_empstatus')
    };
    loading('Saving employee…');
    try {
      await API.saveEmployee(currentBusiness, key, { ...emp.item, birDetails: bir });
      const idx = employees.findIndex(e => e.key === key);
      if (idx >= 0) employees[idx].item.birDetails = bir;
      hide('empEditorWrap');
      renderEmployees(val('empSearch'));
      showMsg('empSaveMsg', '✓ Saved.');
    } catch (e) { showMsg('empSaveMsg', `Error: ${e.message}`, 'error'); } finally { loaded(); }
  });

  document.getElementById('btnEmpCancel').addEventListener('click', () => hide('empEditorWrap'));
  document.getElementById('empSearch').addEventListener('input', e => renderEmployees(e.target.value));
  document.getElementById('btnEmpReload').addEventListener('click', () => { employees = []; loadEmployees(); });

  // ── PAYSLIP ITEMS TAB ──
  document.getElementById('btnPayslipLoad').addEventListener('click', async () => {
    if (!currentBusiness) return;
    loading('Loading payslip items…');
    try {
      const items = await API.getPayslipItems(currentBusiness);
      const tbody = document.getElementById('payslipTbody');
      tbody.innerHTML = items.map(item => {
        const bir = item.item?.birCategory || '';
        const type = item.item?.type || '';
        return `<tr>
          <td>${item.item?.name || ''}</td>
          <td>${type}</td>
          <td><select class="payslip-cat" data-key="${item.key}">
            <option value="">— none —</option>
            ${PAYSLIP_CATEGORIES.map(c => `<option value="${c}" ${bir===c?'selected':''}>${c}</option>`).join('')}
          </select></td>
          <td><button class="btn-sm btn-primary payslip-save" data-key="${item.key}">Save</button></td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('.payslip-save').forEach(btn => {
        btn.addEventListener('click', async () => {
          const it = items.find(i => i.key === btn.dataset.key);
          if (!it) return;
          const cat = document.querySelector(`.payslip-cat[data-key="${btn.dataset.key}"]`).value;
          loading('Saving…');
          try {
            await API.savePayslipItem(currentBusiness, btn.dataset.key, { ...it.item, birCategory: cat });
          } catch (e) { alert(e.message); } finally { loaded(); }
        });
      });
    } catch (e) { alert(`Error: ${e.message}`); } finally { loaded(); }
  });

  // ── GENERATE TAB ──
  function populateGenSelects() {
    // Year
    const yearSel = document.getElementById('genYear');
    const curYear = new Date().getFullYear();
    yearSel.innerHTML = '';
    for (let y = curYear; y >= curYear - 5; y--) {
      const o = document.createElement('option'); o.value = y; o.textContent = y;
      yearSel.appendChild(o);
    }
    // Suppliers for 2307
    const suppSel = document.getElementById('gen2307Supplier');
    suppSel.innerHTML = '<option value="">— All suppliers —</option>';
    suppliers.forEach(s => {
      const o = document.createElement('option'); o.value = s.key; o.textContent = s.item?.name || s.key;
      suppSel.appendChild(o);
    });
    // Employees for 2316
    const empSel = document.getElementById('gen2316Employee');
    empSel.innerHTML = '<option value="">— All employees —</option>';
    employees.forEach(e => {
      const o = document.createElement('option'); o.value = e.key; o.textContent = e.item?.name || e.key;
      empSel.appendChild(o);
    });
  }

  // Show/hide period controls based on period type
  document.getElementById('genPeriodType').addEventListener('change', updatePeriodCtrls);
  function updatePeriodCtrls() {
    const type = val('genPeriodType');
    document.querySelectorAll('.period-ctrl').forEach(el => {
      el.style.display = (el.dataset.for || '').split(',').includes(type) ? '' : 'none';
    });
  }
  updatePeriodCtrls();

  // Show/hide extra options for 2307 / 2316
  document.getElementById('genReportType').addEventListener('change', () => {
    const t = val('genReportType');
    document.getElementById('gen2307Options').hidden = (t !== '2307');
    document.getElementById('gen2316Options').hidden = (t !== '2316');
    document.getElementById('btnExportDat').hidden = ['2316','2307'].includes(t) ? false : false;
    document.getElementById('btnExportPrint').hidden = !['2307','2316'].includes(t);
  });

  document.getElementById('btnGenPreview').addEventListener('click', async () => {
    if (!currentBusiness) return;
    const type = val('genReportType');
    const periodType = val('genPeriodType');
    const year = parseInt(val('genYear'));
    const quarter = parseInt(val('genQuarter'));
    const month = parseInt(val('genMonth'));
    const { from, to } = GEN.dateRange(periodType, year, quarter, month);
    const period = GEN.periodLabel(periodType, year, quarter, month);

    loading(`Fetching data for ${period}…`);
    try {
      // Build lookup maps
      const custMap = {}, suppMap = {};
      customers.forEach(c => { custMap[c.key] = { ...c.item?.birDetails, name: c.item?.name }; });
      suppliers.forEach(s => { suppMap[s.key] = { ...s.item?.birDetails, name: s.item?.name }; });

      // Get business details for payor info
      let bizInfo = {};
      try { bizInfo = await API.getBusinessDetails(currentBusiness); } catch {}
      bizInfo.name = currentBusiness;

      let rows = [], html = '', summaryHtml = '';

      if (type === 'SLS' || type === 'SLSP') {
        const invoices = await API.getSalesInvoices(currentBusiness, from, to);
        rows = GEN.buildSLS(invoices, custMap);
        const totalTaxable = rows.reduce((s, r) => s + parseFloat(r.taxable), 0);
        const totalVAT = rows.reduce((s, r) => s + parseFloat(r.outputVAT), 0);
        summaryHtml = `<strong>SLS — ${period}</strong> &nbsp;|&nbsp; ${rows.length} transactions &nbsp;|&nbsp; Taxable: ₱${totalTaxable.toLocaleString('en-PH',{minimumFractionDigits:2})} &nbsp;|&nbsp; Output VAT: ₱${totalVAT.toLocaleString('en-PH',{minimumFractionDigits:2})}`;
        html = buildPreviewTable(['TIN (w/ Branch)','Name','Doc No','Date','Gross','Exempt','Zero-Rated','Taxable','Output VAT'],
          rows.map(r => [GEN.formatTIN(r.tin.slice(0,9),r.tin.slice(9)), r.name, r.docNo, r.date, r.gross, r.exempt, r.zeroRated, r.taxable, r.outputVAT]));
      }
      if (type === 'SLP' || type === 'SLSP') {
        const invoices = await API.getPurchaseInvoices(currentBusiness, from, to);
        const slpRows = GEN.buildSLP(invoices, suppMap);
        const totalTaxable = slpRows.reduce((s, r) => s + parseFloat(r.taxable), 0);
        const totalVAT = slpRows.reduce((s, r) => s + parseFloat(r.inputVAT), 0);
        if (type === 'SLSP') {
          summaryHtml += `<br><strong>SLP — ${period}</strong> &nbsp;|&nbsp; ${slpRows.length} transactions &nbsp;|&nbsp; Taxable: ₱${totalTaxable.toLocaleString('en-PH',{minimumFractionDigits:2})} &nbsp;|&nbsp; Input VAT: ₱${totalVAT.toLocaleString('en-PH',{minimumFractionDigits:2})}`;
          html += '<h3 style="margin:18px 0 8px">Summary List of Purchases</h3>';
        } else {
          summaryHtml = `<strong>SLP — ${period}</strong> &nbsp;|&nbsp; ${slpRows.length} transactions`;
        }
        html += buildPreviewTable(['TIN (w/ Branch)','Name','Doc No','Date','Gross','Exempt','Zero-Rated','Taxable','Input VAT'],
          slpRows.map(r => [GEN.formatTIN(r.tin.slice(0,9),r.tin.slice(9)), r.name, r.docNo, r.date, r.gross, r.exempt, r.zeroRated, r.taxable, r.inputVAT]));
        rows = type === 'SLSP' ? { sls: rows, slp: slpRows } : slpRows;
      }
      if (type === 'QAP') {
        const invoices = await API.getPurchaseInvoices(currentBusiness, from, to);
        rows = GEN.buildQAP(invoices, suppMap);
        summaryHtml = `<strong>QAP — ${period}</strong> &nbsp;|&nbsp; ${rows.length} payees`;
        html = buildPreviewTable(['TIN (w/ Branch)','Payee Name','ATC','Income Payment','Tax Withheld'],
          rows.map(r => [r.tin, r.name, r.atc, GEN.amt(r.income), GEN.amt(r.withheld)]));
      }
      if (type === '2307') {
        const invoices = await API.getPurchaseInvoices(currentBusiness, from, to);
        const suppFilter = val('gen2307Supplier');
        rows = GEN.build2307(invoices, suppMap, bizInfo, suppFilter);
        summaryHtml = `<strong>Form 2307 — ${period}</strong> &nbsp;|&nbsp; ${rows.length} certificates`;
        html = buildPreviewTable(['Payor TIN','Payee TIN','Payee Name','ATC','Invoice No','Date','Income Payment','Tax Withheld'],
          rows.map(r => [r.payorTIN, r.payeeTIN, r.payeeName, r.atcCode, r.invoiceNo, GEN.fmtDate(r.invoiceDate), GEN.amt(r.incomePayment), GEN.amt(r.taxWithheld)]));
      }
      if (type === '2316') {
        const empFilter = val('gen2316Employee');
        rows = GEN.build2316(employees, [], bizInfo, empFilter);
        summaryHtml = `<strong>Form 2316 — ${year}</strong> &nbsp;|&nbsp; ${rows.length} employees`;
        html = buildPreviewTable(['Employee TIN','Employee Name','Tax Status','SSS','PhilHealth','Pag-IBIG'],
          rows.map(r => [r.employeeTIN, r.employeeName, r.taxStatus, r.sss, r.philhealth, r.pagibig]));
      }

      document.getElementById('genSummary').innerHTML = summaryHtml;
      document.getElementById('genPreviewTable').innerHTML = html;
      show('genPreviewArea');

      // Wire export buttons
      const isSLSP = type === 'SLSP';
      document.getElementById('btnExportDat').hidden = ['2316'].includes(type);
      document.getElementById('btnExportPrint').hidden = !['2307','2316'].includes(type);

      document.getElementById('btnExportDat').onclick = () => {
        if (type === 'SLS') GEN.downloadDAT(GEN.slsToDAT(rows), `SLS_${period.replace(/\s/g,'_')}.dat`);
        else if (type === 'SLP') GEN.downloadDAT(GEN.slpToDAT(rows), `SLP_${period.replace(/\s/g,'_')}.dat`);
        else if (type === 'SLSP') {
          GEN.downloadDAT(GEN.slsToDAT(rows.sls), `SLS_${period.replace(/\s/g,'_')}.dat`);
          setTimeout(() => GEN.downloadDAT(GEN.slpToDAT(rows.slp), `SLP_${period.replace(/\s/g,'_')}.dat`), 300);
        } else if (type === 'QAP') GEN.downloadDAT(GEN.qapToDAT(rows), `QAP_${period.replace(/\s/g,'_')}.dat`);
        else if (type === '2307') GEN.downloadDAT(GEN.form2307ToCSV(rows), `2307_${period.replace(/\s/g,'_')}.dat`);
      };
      document.getElementById('btnExportExcel').onclick = () => {
        if (type === 'SLS') GEN.downloadCSV(GEN.slsToCSV(rows), `SLS_${period.replace(/\s/g,'_')}.csv`);
        else if (type === 'SLP') GEN.downloadCSV(GEN.slpToCSV(rows), `SLP_${period.replace(/\s/g,'_')}.csv`);
        else if (type === 'SLSP') {
          GEN.downloadCSV(GEN.slsToCSV(rows.sls) + '\r\n\r\n' + GEN.slpToCSV(rows.slp), `SLSP_${period.replace(/\s/g,'_')}.csv`);
        } else if (type === 'QAP') GEN.downloadCSV(GEN.qapToCSV(rows), `QAP_${period.replace(/\s/g,'_')}.csv`);
        else if (type === '2307') GEN.downloadCSV(GEN.form2307ToCSV(rows), `2307_${period.replace(/\s/g,'_')}.csv`);
        else if (type === '2316') GEN.downloadCSV(GEN.toCSV ? '' : '', `2316_${year}.csv`);
      };
      document.getElementById('btnExportPrint').onclick = () => {
        if (type === '2307') GEN.openPrintWindow(GEN.print2307HTML(rows, period, bizInfo), 'BIR Form 2307');
        else if (type === '2316') GEN.openPrintWindow(GEN.print2316HTML(rows, year, bizInfo), 'BIR Form 2316');
      };

    } catch (e) { alert(`Error generating report: ${e.message}`); } finally { loaded(); }
  });

  function buildPreviewTable(headers, rows) {
    if (!rows.length) return '<p style="color:#888;padding:12px">No records found for this period.</p>';
    return `<div style="overflow-x:auto"><table class="data-table">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  // ── Pagination helper ──
  function renderPagination(containerId, current, total, onPage) {
    const el = document.getElementById(containerId);
    if (total <= 1) { el.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= total; i++) {
      html += `<button class="${i===current?'active':''}" data-p="${i}">${i}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => onPage(parseInt(btn.dataset.p)));
    });
  }

  // ── Connect button ──
  document.getElementById('btnConnect').addEventListener('click', () => {
    const url = val('apiUrl') || 'https://app.manager.io';
    const token = val('apiToken');
    if (!token) { document.getElementById('connError').textContent = 'Access token is required.'; document.getElementById('connError').hidden = false; return; }
    connect(url, token);
  });

  // Allow Enter key in token field
  document.getElementById('apiToken').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnConnect').click();
  });

  // ── Cancel loading ──
  document.getElementById('btnCancelLoad').addEventListener('click', () => {
    loaded();
    clearSession();
    API.clear();
  });

  // ── Clear any stale session on load ──
  clearSession();

})();
