// ============================================================
// javascript/shipment.js
// ============================================================

let _shipmentLoadSeq = 0;
let shipmentLoading = false
let shipmentSending = false
let shipmentRequestId = null
let shipmentItems = []
let shipmentSearchQuery = ''
let shipmentSearchNumeric = false;
let shipmentSelectedOnly = false;
let shipmentReviewPending = false;

// закрывает выбор товаров, сохраняя подтвержденные количества в черновике
function closeShipmentModal(force = false) {
    if (shipmentSending && force !== true) return
    saveShipmentDraft();
    closeQuantityKeyboard(false);
    ++_shipmentLoadSeq;
    ++_shipmentScanSeq;
    shipmentLoading = false;
    clearShipmentScanHighlight();
    document.getElementById('shipmentOverlay')?.classList.remove('active')
    document.body.classList.remove('modal-open'); // Убираем класс
    shipmentRequestId = null
    shipmentItems = []
    shipmentSearchQuery = ''
    shipmentSearchNumeric = false
    shipmentSelectedOnly = false;
    if (typeof getTopModal === 'function' && !getTopModal() && typeof restoreFocus === 'function') {
        restoreFocus()
    }
}

async function openShipmentModal() {
    if (!currentUser || shipmentLoading || shipmentSending) return
    const seq = ++_shipmentLoadSeq;

    rememberFocus()
    const overlay = document.getElementById('shipmentOverlay')
    const sub = document.getElementById('shipmentSub')
    const body = document.getElementById('shipmentBody')
    const summary = document.getElementById('shipmentSummary')
    const sendBtn = document.getElementById('shipmentSendBtn')

    if (!overlay) return

    // === ФИКС КРЕСТИКА ===
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.replaceWith(newCloseBtn);
        newCloseBtn.addEventListener('click', closeShipmentModal);
    }

    // Добавляем класс, чтобы подвинуть сканер
    document.body.classList.add('modal-open');

    shipmentRequestId = newRequestId()
    shipmentItems = []
    shipmentSearchQuery = ''

    // Убираем "test" и пишем нормальный текст
    sub.textContent = 'Вибір товарів'
    
    summary.textContent = ''
    sendBtn.disabled = true

    body.innerHTML = `<div class="assort-loading"><div class="skeleton skeleton-text" style="width:60%;"></div><div class="skeleton skeleton-text" style="width:80%;"></div><div class="skeleton skeleton-text" style="width:50%;"></div></div>`
    overlay.classList.add('active')
    shipmentLoading = true

    try {
        const u = currentUser ? encodeURIComponent(currentUser.id) : ''
        const res = await fetchWithTimeout(
            `${apiBase}/shipment?u=${u}&t=${Date.now()}`,
            { method: 'GET', cache: 'no-store' },
            APP_CONFIG.loadTimeoutMs
        )

        if (!res.ok) throw new Error('Помилка мережі')
        const data = await res.json()
        if (seq !== _shipmentLoadSeq) return
        if (!Array.isArray(data)) throw new Error('Невірна відповідь 1С')

        if (isStubResponse(data)) {
            body.innerHTML = emptyStateHtml(data[0].Name, '36px 20px', 'alert')
            return
        }

        shipmentItems = data.map(it => ({
            code: String(it.Code || ''),
            name: String(it.Name || ''),
            price: Number(it.price) || 0,
            maxQty: Math.max(0, Math.floor(Number(it.quantity) || 0)),
            qty: 0
        }))

        if (!shipmentItems.length) {
            body.innerHTML = emptyStateHtml('На складі немає товарів', '36px 20px', 'box')
            return
        }

        restoreShipmentDraft();
        renderShipmentBody()
    } catch (err) {
        if (seq !== _shipmentLoadSeq) return;
        const message = err && err.message ? err.message : String(err)
        body.innerHTML = `<div class="assort-error">Не вдалося завантажити товари: ${escapeHtml(message)}</div>`
    } finally {
        if (seq === _shipmentLoadSeq) shipmentLoading = false
    }
}

function renderShipmentBody() {
    const body = document.getElementById('shipmentBody')
    if (!body) return

    body.innerHTML = `
        <div class="assort-top">
            <div class="assort-search-wrap" style="display: flex; gap: 8px;">
                <input type="search" class="assort-search" id="shipmentSearch"
                       placeholder="Пошук товару..." autocomplete="off"
                       value="${escapeHtml(shipmentSearchQuery)}"
                       inputmode="${shipmentSearchNumeric ? 'numeric' : 'text'}"
                       style="flex: 1;">
                <button type="button" class="dg-scan-btn numeric-toggle ${shipmentSearchNumeric ? 'active' : ''}"
                        id="shipmentNumericBtn"
                        aria-label="Цифрова клавіатура"
                        aria-pressed="${shipmentSearchNumeric ? 'true' : 'false'}"
                        title="Цифрова клавіатура">123</button>
                <button type="button" class="dg-scan-btn" id="shipmentScanBtn" aria-label="Сканувати штрихкод"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8V4h4m10 0h4v4M3 16v4h4m10 0h4v-4M7 8v8m4-9v10m3-9v8m3-9v10"/></svg></button>
            </div>
            <button type="button" id="shipmentSelectedOnly" class="selected-filter" aria-pressed="false">Тільки вибрані <span id="shipmentSelectedCount">0</span></button>
        </div>
        <div id="shipmentGrid" class="assort-grid" style="margin-top:14px;">
            ${renderShipmentRows()}
        </div>
        <div id="shipmentNoMatch" class="empty-state" style="display:none; margin-top:14px;">Нічого не знайдено</div>
    `

    const searchInput = document.getElementById('shipmentSearch')
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            shipmentSearchQuery = searchInput.value.trim().toLowerCase()
            applyShipmentSearch()
        })
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = searchInput.value.trim();
                if (!q) return;
                if (/^\d{8,}$/.test(q)) {
                    searchShipmentByBarcode(q);
                }
            }
        })
    }

    const numericBtn = document.getElementById('shipmentNumericBtn')
    if (numericBtn && searchInput) {
        numericBtn.addEventListener('click', () => {
            shipmentSearchNumeric = !shipmentSearchNumeric
            numericBtn.classList.toggle('active', shipmentSearchNumeric)
            numericBtn.setAttribute('aria-pressed', shipmentSearchNumeric ? 'true' : 'false')
            searchInput.setAttribute('inputmode', shipmentSearchNumeric ? 'numeric' : 'text')
            searchInput.focus()
        })
    }

    document.getElementById('shipmentSelectedOnly').addEventListener('click', () => {
        shipmentSelectedOnly = !shipmentSelectedOnly;
        document.getElementById('shipmentSelectedOnly').setAttribute('aria-pressed', String(shipmentSelectedOnly));
        applyShipmentSearch();
    });
    document.getElementById('shipmentScanBtn')?.addEventListener('click', openBarcodeScanner);
    const grid = document.getElementById('shipmentGrid')
    grid.addEventListener('click', e => {
        const input = e.target.closest('.qty-input');
        if (input) openQuantityKeyboard(input);
    });
    grid.addEventListener('keydown', e => {
        if (e.target.matches('.qty-input') && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault(); openQuantityKeyboard(e.target);
        }
    });

    grid.addEventListener('click', e => {
        const btn = e.target.closest('.qty-btn')
        if (!btn) return
        const row = btn.closest('[data-shipment-row]')
        if (!row) return
        const idx = Number(row.dataset.idx)
        if (!shipmentItems[idx]) return
        const step = Number(btn.dataset.step) || 0
        const maxQ = shipmentItems[idx].maxQty
        let next = shipmentItems[idx].qty + step
        if (next < 0) next = 0
        if (next > maxQ) next = maxQ
        shipmentItems[idx].qty = next
        const inp = row.querySelector('.qty-input')
        if (inp) inp.value = next
        updateShipmentRow(row, idx)
        updateShipmentSummary()
    })

    grid.addEventListener('input', e => {
        if (!e.target.classList.contains('qty-input')) return
        const row = e.target.closest('[data-shipment-row]')
        if (!row) return
        const idx = Number(row.dataset.idx)
        if (!shipmentItems[idx]) return
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6)
        let val = Number(e.target.value) || 0
        const maxQ = shipmentItems[idx].maxQty
        if (val > maxQ) val = maxQ
        shipmentItems[idx].qty = val
        updateShipmentRow(row, idx)
        updateShipmentSummary()
    })

    grid.addEventListener('focusout', e => {
        if (!e.target.classList.contains('qty-input')) return
        const row = e.target.closest('[data-shipment-row]')
        if (!row) return
        const idx = Number(row.dataset.idx)
        if (shipmentItems[idx]) e.target.value = shipmentItems[idx].qty
    })

    document.querySelectorAll('#shipmentGrid [data-shipment-row]').forEach(row => {
        updateShipmentRow(row, Number(row.dataset.idx))
    })

    applyShipmentSearch()
    updateShipmentSummary()
}

function renderShipmentRows() {
    return shipmentItems.map((it, i) => {
        return renderProductRow({
            idx: i, code: it.code, name: it.name, price: it.price, showHeadPrice: false,
            dataAttr: 'data-shipment-row', fieldsClass: 'shipment-row-fields',
            col1: { label: 'На складі', value: fmt(it.maxQty), isStatic: true, isLarge: true },
            col2: { label: 'Ціна', value: `${fmt(it.price)} ₴`, isStatic: true },
            col3: { label: 'Кількість', isInput: true, inputValue: it.qty,
                inputAttrs: 'readonly inputmode="none" aria-label="Кількість товару" aria-haspopup="dialog"' },
            col4: { label: 'Сума', value: '0 ₴', isTotal: true }
        });
    }).join('')
}

function updateShipmentRow(row, idx) {
    const it = shipmentItems[idx]
    if (!it) return
    const totalEl = row.querySelector('.assort-row-total')
    if (totalEl) totalEl.textContent = `${fmt(it.qty * it.price)} ₴`
    row.classList.toggle('picked', it.qty > 0)
}

// пересчитывает итог, счетчик выбранных позиций и сохраняет черновик
function updateShipmentSummary() {
    const summary = document.getElementById('shipmentSummary')
    const btn = document.getElementById('shipmentSendBtn')
    if (!summary || !btn) return

    let count = 0, sum = 0
    shipmentItems.forEach(it => { if (it.qty > 0) { count++; sum += it.qty * it.price; } })

    const counter = document.getElementById('shipmentSelectedCount');
    if (counter) counter.textContent = count;
    saveShipmentDraft();
    if (shipmentSelectedOnly) applyShipmentSearch();
    if (!count) {
        summary.textContent = 'Вкажіть кількість товарів'
        btn.disabled = true
        return
    }
    summary.innerHTML = `Додаємо: <b>${count} поз.</b> на <b>${fmt(sum)} ₴</b>`
    btn.disabled = shipmentSending
}

function applyShipmentSearch() {
    const q = shipmentSearchQuery
    let shown = 0
    document.querySelectorAll('#shipmentGrid [data-shipment-row]').forEach(row => {
        const idx = Number(row.dataset.idx)
        const it = shipmentItems[idx]
        if (!it) return
        const hay = (it.name + ' ' + it.code).toLowerCase()
        const ok = (!q || hay.includes(q)) && (!shipmentSelectedOnly || it.qty > 0)
        row.style.display = ok ? '' : 'none'
        if (ok) shown++
    })
    const empty = document.getElementById('shipmentNoMatch');
    empty.style.display = shown ? 'none' : 'block';
    empty.textContent = shipmentSelectedOnly ? 'Вибраних товарів за цим запитом немає' : 'Нічого не знайдено';
}

// сначала показывает снимок выбранных позиций и отправляет только после подтверждения
async function submitShipment() {
    if (!currentUser || shipmentSending || shipmentReviewPending) return;
    closeQuantityKeyboard();

    const items = [];
    shipmentItems.forEach(it => {
        if (it.qty > 0) items.push({ code: it.code, name: it.name, price: it.price, qty: it.qty });
    });

    if (!items.length) return showToast('Додайте хоча б одну позицію', true);
    if (!navigator.onLine) return showToast('Немає мережі! Додавання лише онлайн.', true);

    const reviewUser = currentUser;
    const reviewSeq = _shipmentLoadSeq;
    const overlay = document.getElementById('shipmentOverlay');
    const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    shipmentReviewPending = true;
    overlay.inert = true;
    let confirmed = false;
    try {
        confirmed = await showConfirmDialog({title:'Перевірте накладну',
            message: 'Позицій: ' + items.length + ' · Разом: ' + fmt(total) + ' ₴',
            details: shipmentReviewDetails(items), okText:'Відправити в 1С', cancelText:'Редагувати'});
    } finally { shipmentReviewPending = false; overlay.inert = false; }
    if (!confirmed && currentUser === reviewUser) document.getElementById('shipmentSendBtn')?.focus?.();
    if (!confirmed || currentUser !== reviewUser || _shipmentLoadSeq !== reviewSeq) return;
    if (!navigator.onLine) return showToast('Немає мережі. Чернетку збережено.', true);

    const payload = {
        point_id: '0', 
        technician_id: currentUser ? currentUser.id : '',
        request_id: shipmentRequestId || newRequestId(),
        items
    };

    const btn = document.getElementById('shipmentSendBtn');
    const closeBtn = document.querySelector('#shipmentOverlay .modal-close');

    const sendingUser = currentUser;
    const draftKey = shipmentDraftKey();
    shipmentSending = true;

    await submitDocument({
        endpoint: 'shipment',
        payload, btn, closeBtn,
        successText: '',
        errorPrefix: 'Не вдалося додати',
        onSuccess: (response, conductError) => {
            saveInvoiceHistory(sendingUser, payload, response, conductError);
            clearShipmentDraft(draftKey);
            if (currentUser !== sendingUser) return;
            shipmentSending = false;
            shipmentItems = [];
            closeShipmentModal();
            showConfirmDialog({title: conductError ? 'Накладну створено, але не проведено' : 'Документ створено',
                message: conductError ? 'Не створюйте накладну повторно. Потрібно перевірити її в обліку.' : 'Сервер підтвердив створення накладної.',
                details: shipmentResultDetails(response, items, conductError), okText: 'Зрозуміло', cancelText: 'Закрити'});
        }
    });

    shipmentSending = false;
    if (shipmentItems.length) updateShipmentSummary();
}

let _shipmentHighlightTimer = null;
let _shipmentScanSeq = 0;

async function searchShipmentByBarcode(barcode) {
    const searchInput = document.getElementById('shipmentSearch');
    if (!searchInput) return;

    const cleanBarcode = String(barcode || '').replace(/\s+/g, '');
    if (!cleanBarcode) {
        showToast('Порожній штрих-код', true);
        return;
    }

    const seq = ++_shipmentScanSeq;
    clearShipmentScanHighlight();

    searchInput.value = '';
    searchInput.disabled = true;

    shipmentSearchQuery = '';
    applyShipmentSearch();

    try {
        const u = currentUser ? encodeURIComponent(currentUser.id) : '';
        const res = await fetchWithTimeout(
            `${apiBase}/goods?u=${u}&barcode=${encodeURIComponent(cleanBarcode)}&t=${Date.now()}`,
            { method: 'GET', cache: 'no-store' },
            APP_CONFIG.loadTimeoutMs
        );

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error((errText && errText.slice(0, 160)) || 'Помилка мережі');
        }

        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);

        if (seq !== _shipmentScanSeq) return;

        if (!items.length) {
            showToast(`Товар зі штрих-кодом ${cleanBarcode} не знайдено в номенклатурі 1С`, true);
            return;
        }

        const foundItem = normalizeGoods(items[0]);
        const foundName = String(foundItem.name || '').trim() || 'Без назви';
        const idx = findShipmentItemIndex(foundItem);

        if (idx < 0) {
            const stock = Number(foundItem.stock);
            const stockText = isFinite(stock) && stock > 0 ? ` (залишок у 1С: ${stock})` : '';
            showToast(`Товар «${foundName}» знайдено в номенклатурі, але на складі немає залишку${stockText}`, true);
            return;
        }

        const shipmentItem = shipmentItems[idx];
        const priceIsZero = !Number(shipmentItem.price);
        shipmentSelectedOnly = false;
        document.getElementById('shipmentSelectedOnly')?.setAttribute('aria-pressed', 'false');
        applyShipmentSearch();
        highlightShipmentRow(idx);
        const input = document.querySelector(`#shipmentGrid [data-idx="${idx}"] .qty-input`);
        if (input) openQuantityKeyboard(input);

        if (priceIsZero) {
            showToast(`Знайдено: ${foundName}. Увага: ціна в 1С не вказана (0 ₴)`, true);
        } else {
            showToast(`Знайдено: ${foundName}`, false);
        }

    } catch (err) {
        if (seq !== _shipmentScanSeq) return;
        const msg = err && err.message ? err.message : String(err);
        showToast(`Помилка пошуку: ${msg}`, true);
    } finally {
        if (seq === _shipmentScanSeq) {
            searchInput.disabled = false;
        }
    }
}

function findShipmentItemIndex(foundItem) {
    const normCode = normalizeCode(foundItem.code);
    const normName = String(foundItem.name || '').trim().toLowerCase();

    if (normCode) {
        const i = shipmentItems.findIndex(it => normalizeCode(it.code) === normCode);
        if (i >= 0) return i;
    }
    if (normName) {
        const i = shipmentItems.findIndex(it => String(it.name || '').trim().toLowerCase() === normName);
        if (i >= 0) return i;
    }
    return -1;
}

function clearShipmentScanHighlight() {
    if (_shipmentHighlightTimer) {
        clearTimeout(_shipmentHighlightTimer);
        _shipmentHighlightTimer = null;
    }
    document.querySelectorAll('#shipmentGrid .assort-row.scanned').forEach(row => {
        row.classList.remove('scanned');
    });
}

function highlightShipmentRow(idx) {
    const row = document.querySelector(`#shipmentGrid [data-shipment-row][data-idx="${idx}"]`);
    if (!row) return;
    row.style.display = '';
    row.classList.add('scanned');
    try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { try { row.scrollIntoView(); } catch (e2) {} }
    if (navigator.vibrate) navigator.vibrate(40);
    _shipmentHighlightTimer = setTimeout(() => {
        row.classList.remove('scanned');
        _shipmentHighlightTimer = null;
    }, 2200);
}