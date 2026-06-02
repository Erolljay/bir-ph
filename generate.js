// ── generate.js — BIR Report generators ──
// Produces .DAT files, Excel-compatible CSV, and 2307/2316 print layouts.

const GEN = (() => {

  // ── Helpers ──

  function formatTIN(tin, branch) {
    // Output: NNN-NNN-NNN-NNNN (13 chars with dashes)
    const t = (tin || '').replace(/[^0-9]/g, '').padEnd(9, '0').slice(0, 9);
    const b = (branch || '0000').replace(/[^0-9]/g, '').padEnd(4, '0').slice(0, 4);
    return `${t.slice(0,3)}-${t.slice(3,6)}-${t.slice(6,9)}-${b}`;
  }

  function formatTINRaw(tin, branch) {
    // Without dashes for DAT file: NNNNNNNNNNNNN (13 digits)
    const t = (tin || '').replace(/[^0-9]/g, '').padEnd(9, '0').slice(0, 9);
    const b = (branch || '0000').replace(/[^0-9]/g, '').padEnd(4, '0').slice(0, 4);
    return t + b;
  }

  function formatName(item) {
    // For DAT: Individual → LASTNAME, FIRSTNAME MIDDLENAME
    //          Non-Individual → Registered Name
    if (item.taxpayerType === 'INDIVIDUAL') {
      const last = (item.lastName || '').toUpperCase();
      const first = (item.firstName || '').toUpperCase();
      const mid = (item.middleName || '').toUpperCase();
      return mid ? `${last}, ${first} ${mid}` : `${last}, ${first}`;
    }
    return (item.registeredName || item.name || '').toUpperCase();
  }

  function amt(val) {
    return parseFloat(val || 0).toFixed(2);
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  function periodLabel(type, year, quarter, month) {
    if (type === 'month') {
      const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[month]} ${year}`;
    }
    if (type === 'quarter') return `Q${quarter} ${year}`;
    return `${year}`;
  }

  function dateRange(type, year, quarter, month) {
    let from, to;
    if (type === 'month') {
      from = new Date(year, month - 1, 1);
      to = new Date(year, month, 0);
    } else if (type === 'quarter') {
      const startMonth = (quarter - 1) * 3;
      from = new Date(year, startMonth, 1);
      to = new Date(year, startMonth + 3, 0);
    } else {
      from = new Date(year, 0, 1);
      to = new Date(year, 11, 31);
    }
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10)
    };
  }

  // ── SLS — Summary List of Sales ──
  // BIR RELIEF format: pipe-delimited
  // Fields: TIN|RegisteredName|DocumentNo|Date|GrossAmount|ExemptAmount|ZeroRatedAmount|TaxableAmount|OutputVAT
  function buildSLS(invoices, customerMap) {
    const rows = [];
    for (const inv of invoices) {
      const custKey = inv.item?.customer?.key || inv.item?.Customer;
      const cust = customerMap[custKey] || {};
      const tin = formatTINRaw(cust.tin, cust.branchCode);
      const name = formatName(cust);
      const docNo = inv.item?.invoiceNumber || inv.item?.InvoiceNumber || '';
      const date = fmtDate(inv.item?.issueDate || inv.item?.IssueDate);
      const gross = amt(inv.item?.amountDue || 0);
      const exempt = amt(inv.item?.exemptAmount || 0);
      const zeroRated = amt(inv.item?.zeroRatedAmount || 0);
      const taxable = amt(inv.item?.taxableAmount || 0);
      const outputVAT = amt(inv.item?.vatAmount || 0);
      rows.push({ tin, name, docNo, date, gross, exempt, zeroRated, taxable, outputVAT, raw: inv });
    }
    return rows;
  }

  function slsToDAT(rows) {
    return rows.map(r =>
      `${r.tin}|${r.name}|${r.docNo}|${r.date}|${r.gross}|${r.exempt}|${r.zeroRated}|${r.taxable}|${r.outputVAT}`
    ).join('\r\n');
  }

  // ── SLP — Summary List of Purchases ──
  // Fields: TIN|RegisteredName|DocumentNo|Date|GrossAmount|ExemptAmount|ZeroRatedAmount|TaxableAmount|InputVAT
  function buildSLP(invoices, supplierMap) {
    const rows = [];
    for (const inv of invoices) {
      const suppKey = inv.item?.supplier?.key || inv.item?.Supplier;
      const supp = supplierMap[suppKey] || {};
      const tin = formatTINRaw(supp.tin, supp.branchCode);
      const name = formatName(supp);
      const docNo = inv.item?.invoiceNumber || inv.item?.InvoiceNumber || '';
      const date = fmtDate(inv.item?.issueDate || inv.item?.IssueDate);
      const gross = amt(inv.item?.amountDue || 0);
      const exempt = amt(inv.item?.exemptAmount || 0);
      const zeroRated = amt(inv.item?.zeroRatedAmount || 0);
      const taxable = amt(inv.item?.taxableAmount || 0);
      const inputVAT = amt(inv.item?.vatAmount || 0);
      rows.push({ tin, name, docNo, date, gross, exempt, zeroRated, taxable, inputVAT, raw: inv });
    }
    return rows;
  }

  function slpToDAT(rows) {
    return rows.map(r =>
      `${r.tin}|${r.name}|${r.docNo}|${r.date}|${r.gross}|${r.exempt}|${r.zeroRated}|${r.taxable}|${r.inputVAT}`
    ).join('\r\n');
  }

  // ── QAP — Quarterly Alphalist of Payees ──
  // Fields: TIN|PayeeName|ATCCode|IncomePayment|TaxWithheld
  function buildQAP(invoices, supplierMap) {
    // Aggregate by supplier per ATC
    const map = {};
    for (const inv of invoices) {
      const suppKey = inv.item?.supplier?.key || inv.item?.Supplier;
      const supp = supplierMap[suppKey] || {};
      if (!supp.includeInQAP) continue;
      const tin = formatTINRaw(supp.tin, supp.branchCode);
      const name = formatName(supp);
      const atc = supp.atcCode || '';
      const k = `${tin}|${atc}`;
      if (!map[k]) map[k] = { tin, name, atc, income: 0, withheld: 0 };
      map[k].income += parseFloat(inv.item?.amountDue || 0);
      map[k].withheld += parseFloat(inv.item?.ewtAmount || inv.item?.withholdingTax || 0);
    }
    return Object.values(map);
  }

  function qapToDAT(rows) {
    return rows.map(r =>
      `${r.tin}|${r.name}|${r.atc}|${amt(r.income)}|${amt(r.withheld)}`
    ).join('\r\n');
  }

  // ── 2307 — Certificate of Creditable Tax Withheld at Source ──
  function build2307(invoices, supplierMap, businessInfo, supplierFilter) {
    const records = [];
    for (const inv of invoices) {
      const suppKey = inv.item?.supplier?.key || inv.item?.Supplier;
      if (supplierFilter && suppKey !== supplierFilter) continue;
      const supp = supplierMap[suppKey] || {};
      const ewt = parseFloat(inv.item?.ewtAmount || inv.item?.withholdingTax || 0);
      if (ewt <= 0) continue;
      records.push({
        payorTIN: formatTIN(businessInfo.tin, businessInfo.branchCode),
        payorName: businessInfo.registeredName || '',
        payorAddress: businessInfo.address || '',
        payeeTIN: formatTIN(supp.tin, supp.branchCode),
        payeeName: formatName(supp),
        atcCode: supp.atcCode || '',
        incomePayment: parseFloat(inv.item?.amountDue || 0),
        taxWithheld: ewt,
        invoiceNo: inv.item?.invoiceNumber || '',
        invoiceDate: inv.item?.issueDate || ''
      });
    }
    return records;
  }

  // ── 2316 — Certificate of Compensation ──
  function build2316(employees, payrollData, businessInfo, employeeFilter) {
    const records = [];
    for (const emp of employees) {
      if (employeeFilter && emp.key !== employeeFilter) continue;
      const bir = emp.item?.birDetails || {};
      records.push({
        employerTIN: formatTIN(businessInfo.tin, businessInfo.branchCode),
        employerName: businessInfo.registeredName || '',
        employerAddress: businessInfo.address || '',
        employeeTIN: formatTIN(bir.tin, bir.branchCode),
        employeeName: `${emp.item?.lastName || ''}, ${emp.item?.firstName || ''} ${emp.item?.middleName || ''}`.trim(),
        taxStatus: bir.taxStatus || '',
        sss: bir.sss || '',
        philhealth: bir.philhealth || '',
        pagibig: bir.pagibig || '',
        grossCompensation: 0, // filled from payroll
        nonTaxable13thMonth: 0,
        otherNonTaxable: 0,
        totalNonTaxable: 0,
        taxableCompensation: 0,
        totalTaxDue: 0,
        taxWithheld: 0
      });
    }
    return records;
  }

  // ── Excel/CSV export ──
  function toCSV(headers, rows) {
    const escape = v => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(escape).join(',')];
    for (const row of rows) lines.push(row.map(escape).join(','));
    return lines.join('\r\n');
  }

  function slsToCSV(rows) {
    return toCSV(
      ['TIN (w/ Branch)', 'Registered Name', 'Document No', 'Date', 'Gross Amount', 'Exempt', 'Zero-Rated', 'Taxable Amount', 'Output VAT'],
      rows.map(r => [formatTIN(r.tin.slice(0,9), r.tin.slice(9)), r.name, r.docNo, r.date, r.gross, r.exempt, r.zeroRated, r.taxable, r.outputVAT])
    );
  }

  function slpToCSV(rows) {
    return toCSV(
      ['TIN (w/ Branch)', 'Registered Name', 'Document No', 'Date', 'Gross Amount', 'Exempt', 'Zero-Rated', 'Taxable Amount', 'Input VAT'],
      rows.map(r => [formatTIN(r.tin.slice(0,9), r.tin.slice(9)), r.name, r.docNo, r.date, r.gross, r.exempt, r.zeroRated, r.taxable, r.inputVAT])
    );
  }

  function qapToCSV(rows) {
    return toCSV(
      ['TIN (w/ Branch)', 'Payee Name', 'ATC Code', 'Income Payment', 'Tax Withheld'],
      rows.map(r => [r.tin, r.name, r.atc, amt(r.income), amt(r.withheld)])
    );
  }

  function form2307ToCSV(records) {
    return toCSV(
      ['Payor TIN', 'Payor Name', 'Payee TIN', 'Payee Name', 'ATC', 'Invoice No', 'Invoice Date', 'Income Payment', 'Tax Withheld'],
      records.map(r => [r.payorTIN, r.payorName, r.payeeTIN, r.payeeName, r.atcCode, r.invoiceNo, fmtDate(r.invoiceDate), amt(r.incomePayment), amt(r.taxWithheld)])
    );
  }

  // ── Download helpers ──
  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadDAT(content, filename) {
    downloadFile(content, filename, 'text/plain');
  }

  function downloadCSV(content, filename) {
    // UTF-8 BOM for Excel compatibility
    downloadFile('﻿' + content, filename, 'text/csv;charset=utf-8');
  }

  // ── 2307 Print HTML ──
  function print2307HTML(records, period, businessInfo) {
    if (!records.length) return '<p>No EWT records found for this period.</p>';
    return records.map(r => `
      <div class="form2307" style="font-family:Arial,sans-serif;font-size:11px;border:1px solid #000;padding:16px;max-width:700px;margin:0 auto 32px;page-break-after:always;">
        <h3 style="text-align:center;font-size:13px;margin:0 0 8px">BIR FORM 2307<br>Certificate of Creditable Tax Withheld at Source</h3>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <tr><td style="width:50%;padding:4px;border:1px solid #aaa"><strong>Payor TIN:</strong> ${r.payorTIN}</td><td style="padding:4px;border:1px solid #aaa"><strong>Period:</strong> ${period}</td></tr>
          <tr><td colspan="2" style="padding:4px;border:1px solid #aaa"><strong>Payor Name:</strong> ${r.payorName}</td></tr>
          <tr><td style="padding:4px;border:1px solid #aaa"><strong>Payee TIN:</strong> ${r.payeeTIN}</td><td style="padding:4px;border:1px solid #aaa"><strong>ATC:</strong> ${r.atcCode}</td></tr>
          <tr><td colspan="2" style="padding:4px;border:1px solid #aaa"><strong>Payee Name:</strong> ${r.payeeName}</td></tr>
          <tr><td style="padding:4px;border:1px solid #aaa"><strong>Invoice No:</strong> ${r.invoiceNo}</td><td style="padding:4px;border:1px solid #aaa"><strong>Invoice Date:</strong> ${fmtDate(r.invoiceDate)}</td></tr>
          <tr><td style="padding:4px;border:1px solid #aaa"><strong>Income Payment:</strong> ${parseFloat(r.incomePayment).toLocaleString('en-PH', {minimumFractionDigits:2})}</td>
              <td style="padding:4px;border:1px solid #aaa"><strong>Tax Withheld:</strong> ${parseFloat(r.taxWithheld).toLocaleString('en-PH', {minimumFractionDigits:2})}</td></tr>
        </table>
      </div>`).join('');
  }

  // ── 2316 Print HTML ──
  function print2316HTML(records, year, businessInfo) {
    if (!records.length) return '<p>No employee records found.</p>';
    return records.map(r => `
      <div class="form2316" style="font-family:Arial,sans-serif;font-size:11px;border:1px solid #000;padding:16px;max-width:700px;margin:0 auto 32px;page-break-after:always;">
        <h3 style="text-align:center;font-size:13px;margin:0 0 8px">BIR FORM 2316<br>Certificate of Compensation Payment / Tax Withheld<br>For Compensation Payment With or Without Tax Withheld</h3>
        <p style="text-align:center;font-size:11px">For the Year: <strong>${year}</strong></p>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px">
          <tr><td style="padding:4px;border:1px solid #aaa;width:50%"><strong>Employer TIN:</strong> ${r.employerTIN}</td><td style="padding:4px;border:1px solid #aaa"><strong>Tax Status:</strong> ${r.taxStatus}</td></tr>
          <tr><td colspan="2" style="padding:4px;border:1px solid #aaa"><strong>Employer Name:</strong> ${r.employerName}</td></tr>
          <tr><td style="padding:4px;border:1px solid #aaa"><strong>Employee TIN:</strong> ${r.employeeTIN}</td><td style="padding:4px;border:1px solid #aaa"><strong>SSS:</strong> ${r.sss}</td></tr>
          <tr><td style="padding:4px;border:1px solid #aaa"><strong>Employee Name:</strong> ${r.employeeName}</td><td style="padding:4px;border:1px solid #aaa"><strong>PhilHealth:</strong> ${r.philhealth}</td></tr>
          <tr><td style="padding:4px;border:1px solid #aaa"></td><td style="padding:4px;border:1px solid #aaa"><strong>Pag-IBIG:</strong> ${r.pagibig}</td></tr>
          <tr><td style="padding:4px;border:1px solid #aaa"><strong>Gross Compensation:</strong> ${parseFloat(r.grossCompensation||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</td>
              <td style="padding:4px;border:1px solid #aaa"><strong>Tax Withheld:</strong> ${parseFloat(r.taxWithheld||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr>
          <tr><td style="padding:4px;border:1px solid #aaa"><strong>Non-Taxable (13th Mo + De Minimis):</strong> ${parseFloat(r.totalNonTaxable||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</td>
              <td style="padding:4px;border:1px solid #aaa"><strong>Taxable Compensation:</strong> ${parseFloat(r.taxableCompensation||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</td></tr>
        </table>
      </div>`).join('');
  }

  function openPrintWindow(html, title) {
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>@media print{.no-print{display:none}}</style></head><body>${html}<div class="no-print" style="text-align:center;padding:20px"><button onclick="window.print()">🖨 Print</button></div></body></html>`);
    w.document.close();
  }

  return {
    formatTIN, formatTINRaw, formatName, periodLabel, dateRange, amt, fmtDate,
    buildSLS, slsToDAT, slsToCSV,
    buildSLP, slpToDAT, slpToCSV,
    buildQAP, qapToDAT, qapToCSV,
    build2307, form2307ToCSV, print2307HTML,
    build2316, print2316HTML,
    downloadDAT, downloadCSV, downloadFile, openPrintWindow
  };
})();
