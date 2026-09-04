const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const USA_SPENDING = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
const CONTRACT_TYPES = ['A', 'B', 'C', 'D'];

function send(res, status, data, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
}

function dateRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - 1);
  return [{ start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) }];
}

function payload({ agency, page = 1, limit = 20 } = {}) {
  const filters = { time_period: dateRange(), award_type_codes: CONTRACT_TYPES };
  if (agency) filters.agencies = [{ type: 'awarding', tier: 'toptier', name: agency }];
  return {
    filters,
    fields: ['Award ID', 'Recipient Name', 'Awarding Agency', 'Award Amount', 'Start Date', 'End Date', 'Description'],
    page,
    limit,
    sort: 'Award Amount',
    order: 'desc',
    spending_level: 'awards'
  };
}

async function awardSearch(options) {
  const response = await fetch(USA_SPENDING, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload(options)),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`USAspending returned ${response.status}`);
  return response.json();
}

function normalizeAward(row) {
  const amount = Number(row['Award Amount'] || 0);
  const end = row['End Date'] || null;
  const endDate = end ? new Date(end) : null;
  const expired = endDate && endDate < new Date();
  const endingSoon = endDate && !expired && endDate < new Date(Date.now() + 45 * 86400000);
  return {
    id: row['Award ID'] || 'Unavailable',
    title: row.Description || 'Federal contract award',
    vendor: row['Recipient Name'] || 'Recipient unavailable',
    agency: row['Awarding Agency'] || 'Agency unavailable',
    amount,
    startDate: row['Start Date'] || null,
    endDate: end,
    status: expired ? 'EXPIRED' : endingSoon ? 'REVIEW DUE' : 'ACTIVE',
    needsAction: Boolean(expired || endingSoon)
  };
}

async function contracts(query) {
  const data = await awardSearch({ agency: query.get('agency') || undefined, limit: 50 });
  let rows = (data.results || []).map(normalizeAward);
  const search = (query.get('q') || '').trim().toLowerCase();
  if (search) rows = rows.filter(row => `${row.title} ${row.vendor} ${row.id}`.toLowerCase().includes(search));
  if (query.get('action') === 'true') rows = rows.filter(row => row.needsAction);
  return { results: rows, pageMetadata: data.page_metadata || {}, sourceUpdated: new Date().toISOString() };
}

async function summary() {
  const data = await awardSearch({ limit: 100 });
  const rows = (data.results || []).map(normalizeAward);
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const agencies = Object.values(rows.reduce((all, row) => {
    const item = all[row.agency] || { name: row.agency, value: 0, awards: 0 };
    item.value += Math.max(0, row.amount); item.awards += 1; all[row.agency] = item; return all;
  }, {})).sort((a, b) => b.value - a.value).slice(0, 4);
  return { total, awards: rows.length, actionCount: rows.filter(row => row.needsAction).length, agencies, sourceUpdated: new Date().toISOString() };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    if (url.pathname === '/api/contracts') return send(res, 200, await contracts(url.searchParams));
    if (url.pathname === '/api/summary') return send(res, 200, await summary());
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), 'text/html');
    }
    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return send(res, 502, { error: 'Live federal data is temporarily unavailable. Please try again.', detail: error.message });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Contract Command Center running at http://localhost:${PORT}`));
