// ============================================================
// Sales Section — one table per outlet for the chosen day, SKU | Sales
// with a − 1 + stepper, free items in a separate "Given out" table, and a
// history log of every tap (who, what, where) for that day only.
//
// Only TODAY can be changed with the stepper; earlier days are viewable
// but locked (🔒). Every tap also writes a row to sales_log, so the admin
// app and the promoter app see each other's taps in their history within a
// moment (see the realtime subscription in app.js).
//
// This file is identical in the admin and promoter apps. Each app's app.js
// supplies three small hooks:
//   salesActorName()        who is tapping (admin name / promoter name)
//   salesActorPromoterId()  promoter id for the log row (null for admin)
//   canEditPastSales()      whether past days can be edited via the form
// ============================================================

let salesViewDate = null; // null = today (so a tab left open overnight rolls over)
let salesLog = [];        // sales_log rows for the day being viewed, newest first

function salesViewDateValue(){ return salesViewDate || todayStr(); }

function salesDateOptions(){
  const today = todayStr();
  return [...new Set([today, ...salesReports.map(r=>r.work_date)])].sort((a,b)=>b.localeCompare(a));
}

async function setSalesViewDate(value){
  salesViewDate = value === todayStr() ? null : value;
  try{
    salesLog = await DB.getSalesLogForDate(salesViewDateValue());
  }catch(e){
    console.warn('Could not load sales history (non-fatal):', e);
    salesLog = [];
  }
  render();
}

// The day-notes box (admin app) is a plain textarea inside the page, so a
// redraw would wipe a half-typed note. render() saves and restores it.
function captureNotesDraft(){
  const textarea = document.querySelector('.day-feedback-block textarea');
  if(!textarea) return null;
  const saveButton = document.getElementById(textarea.id.replace('day-feedback-','day-feedback-save-'));
  if(!saveButton || saveButton.style.display === 'none') return null; // nothing unsaved
  return { id: textarea.id, value: textarea.value };
}
function restoreNotesDraft(draft){
  if(!draft) return;
  const textarea = document.getElementById(draft.id);
  if(!textarea) return;
  textarea.value = draft.value;
  const saveButton = document.getElementById(draft.id.replace('day-feedback-','day-feedback-save-'));
  if(saveButton) saveButton.style.display = '';
}

function renderSalesTable(rows, title, isToday, canTapRow){
  const body = rows.map(row=>{
    const qty = Number(row.sales_qty||0);
    const label = esc(canonicalSkuName(row.product_name));
    const sku = canTapRow
      ? `<button type="button" class="ss-sku ss-sku-btn" onclick="openSalesForm('${row.id}')" aria-label="Edit ${label}">${label}</button>`
      : `<span class="ss-sku">${label}</span>`;
    const control = isToday
      ? `<span class="sales-qty-adjust ss-stepper">
          <button type="button" onclick="adjustSalesQuantity(event,'${row.id}',-1)" aria-label="Minus one ${esc(canonicalSkuName(row.product_name))}">−</button>
          <b class="sales-table-number">${qty}</b>
          <button type="button" onclick="adjustSalesQuantity(event,'${row.id}',1)" aria-label="Add one ${esc(canonicalSkuName(row.product_name))}">+</button>
        </span>`
      : `<span class="ss-locked"><b class="sales-table-number">${qty}</b></span>`;
    return `<div class="ss-row">${sku}${control}</div>`;
  }).join('');
  return `<div class="ss-table">
    <div class="ss-head"><span>${title}</span><span>${title==='SKU'?'Sales':'Qty'}</span></div>
    ${body}
  </div>`;
}

function renderSalesOutlet(group, isToday, canTapRow){
  const sorted = [...group.items].sort((a,b)=>skuOrderIndex(a)-skuOrderIndex(b));
  const sold = sorted.filter(r=>!isFreeItem(r));
  const given = sorted.filter(r=>isFreeItem(r));
  return `<section class="ss-outlet">
    <h2 class="ss-outlet-title">${esc(group.label)}</h2>
    ${sold.length ? renderSalesTable(sold,'SKU',isToday,canTapRow) : ''}
    ${given.length ? `<div class="ss-given-title">Given out</div>${renderSalesTable(given,'Item',isToday,canTapRow)}` : ''}
  </section>`;
}

// A log entry is about a free item if its row says so (falling back to the
// default giveaway names for rows that have since been deleted).
function isGivenLogEntry(entry){
  const row = salesReports.find(r=>
    r.work_date===entry.work_date
    && (r.store_id||null)===(entry.store_id||null)
    && canonicalSkuName(r.product_name)===canonicalSkuName(entry.product_name)
  );
  return row ? isFreeItem(row) : isGiveaway(entry.product_name);
}

function renderSalesHistory(date){
  const entries = salesLog
    .filter(e=>e.work_date===date)
    .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const items = entries.map(e=>{
    const store = stores.find(s=>s.id===e.store_id);
    const at = store ? ` at ${esc(store.name)}` : '';
    const unit = isGivenLogEntry(e) ? 'given out' : 'sales';
    const n = Math.abs(Number(e.delta)||0);
    const what = esc(canonicalSkuName(e.product_name));
    const text = Number(e.delta) > 0 ? `added ${n} ${unit} to ${what}${at}` : `removed ${n} ${unit} from ${what}${at}`;
    const time = e.created_at ? new Date(e.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : '';
    return `<li class="ss-history-item"><span class="ss-name">${esc(e.admin_name || 'Someone')}</span><span class="ss-history-text">${text}</span><time>${time}</time></li>`;
  }).join('');
  return `<section class="ss-card">
    <h2 class="ss-card-title">History <small>${date===todayStr()?'today':formatDateShort(date)}</small></h2>
    ${items ? `<ul class="ss-history">${items}</ul>` : `<p class="ss-empty">Nothing logged yet — every + and − will show up here.</p>`}
  </section>`;
}

function renderSalesSection(){
  const date = salesViewDateValue();
  const today = todayStr();
  const isToday = date === today;
  const canTapRow = isToday || canEditPastSales();
  const dates = salesDateOptions();
  const rows = salesReports.filter(r=>r.work_date===date);
  const outlets = groupByOutlet(rows).sort((a,b)=>a.label.localeCompare(b.label));

  let html = `<div class="ss-date-row">
      <label class="ss-date-label" for="sales-date-select">Date</label>
      <select id="sales-date-select" onchange="setSalesViewDate(this.value)">
        ${dates.map(d=>`<option value="${d}" ${d===date?'selected':''}>${d===today?'Today · ':'🔒 '}${formatDateShort(d)}</option>`).join('')}
      </select>
    </div>`;
  if(!isToday) html += `<div class="ss-lock-note">🔒 Locked — only today's sales can be changed${canEditPastSales()?'. Tap a SKU name to correct an earlier record.':'.'}</div>`;

  if(!rows.length){
    html += emptyState('🧾', isToday ? 'No sales to log yet today' : 'No sales recorded for this day', isToday ? 'Outlets appear here once someone is scheduled. Tap + to add a sales report.' : 'Pick another date above.');
  }else{
    html += outlets.map(group=>renderSalesOutlet(group,isToday,canTapRow)).join('');
  }

  html += renderSalesHistory(date);

  // Day photos and the day's general notes sit under the log — same
  // components as before, just no longer inside a pop-up.
  html += `<section class="ss-card"><div class="ss-card-title">Photos &amp; notes</div>
    ${typeof renderDayPhotoRow === 'function' ? renderDayPhotoRow(date,isToday) : ''}
    ${typeof renderDayFeedbackRow === 'function' ? renderDayFeedbackRow(date) : ''}
  </section>`;
  return html;
}

// Tap on − / +. Updates today's sales_qty on the existing row and appends one
// sales_log entry (including decreases).
async function adjustSalesQuantity(event, id, delta){
  event.stopPropagation();
  const row = salesReports.find(item=>item.id===id);
  if(!row || row.work_date !== todayStr()) return;
  const prev = Number(row.sales_qty||0);
  const next = Math.max(0, prev + delta);
  if(next === prev) return;
  const control = event.currentTarget.closest('.sales-qty-adjust');
  const buttons = control ? [...control.querySelectorAll('button')] : [];
  buttons.forEach(button=>button.disabled = true);
  try{
    await DB.updateSalesReport(id, { sales_qty: next });
    row.sales_qty = next;
    try{
      const entry = await DB.addSalesLog({
        work_date: row.work_date,
        store_id: row.store_id || null,
        product_name: canonicalSkuName(row.product_name),
        delta: next - prev,
        admin_name: salesActorName(),
        promoter_id: salesActorPromoterId()
      });
      if(entry.work_date === salesViewDateValue()) salesLog.unshift(entry);
    }catch(logError){
      console.error(logError);
      showToast('Saved, but the history entry could not be logged');
    }
    render();
  }catch(e){
    console.error(e);
    showToast('Could not update quantity — ' + (e.message || 'check your connection'));
    buttons.forEach(button=>button.disabled = false);
  }
}
