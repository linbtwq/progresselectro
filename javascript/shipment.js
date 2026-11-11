let _shipmentLoadSeq = 0;
let _shipmentSearchTimer = null;
let _shipmentSearchAbort = null;
let shipmentSending = false;
let shipmentRequestId = null;
let shipmentItems = [];
let shipmentMatches = new Set();
let shipmentReviewPending = false;

// отменяет текущий поиск при вводе нового запроса или закрытии окна
function cancelShipmentSearch() {
    clearTimeout(_shipmentSearchTimer);
    _shipmentSearchAbort?.abort();
    _shipmentSearchAbort = null;
}

// сохраняет выбранные позиции и закрывает подбор
function closeShipmentModal(force = false) {
    if (shipmentSending && force !== true) return;
    cancelShipmentSearch();
    saveShipmentDraft();
    closeQuantityKeyboard(false);
    ++_shipmentLoadSeq;
    document.getElementById('shipmentOverlay')?.classList.remove('active');
    document.body.classList.remove('modal-open');
    shipmentItems = [];
    shipmentMatches.clear();
    shipmentRequestId = null;
    if (typeof getTopModal === 'function' && !getTopModal() && typeof restoreFocus === 'function') restoreFocus();
}

// открывает поиск без запроса списка товаров и показывает сохраненные позиции
function openShipmentModal() {
    const overlay = document.getElementById('shipmentOverlay');
    if (!currentUser || shipmentSending || !overlay || overlay.classList.contains('active')) return;
    ++_shipmentLoadSeq;
    rememberFocus();
    shipmentRequestId = newRequestId();
    shipmentMatches.clear();
    restoreShipmentDraft();
    const close = overlay.querySelector('.modal-close');
    if (close) close.onclick = () => closeShipmentModal();
    document.body.classList.add('modal-open');
    renderShipmentBody();
    overlay.classList.add('active');
}

// подключает поиск, сканер и клавиатуру количества
function renderShipmentBody() {
    const searchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5" stroke-linecap="round"/></svg>';
    document.getElementById('shipmentBody').innerHTML = [
        '<div class="assort-top shipment-controls">',
        '<button type="button" class="action-btn shipment-scan-action" id="shipmentScanBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8V4h4m10 0h4v4M3 16v4h4m10 0h4v-4M7 8v8m4-9v10m3-9v10"/></svg>Сканувати штрихкод</button>',
        '<div class="shipment-search-field">' + searchIcon,
        '<input type="search" class="assort-search" id="shipmentSearch" placeholder="Введіть назву або код" aria-label="Пошук товару" autocomplete="off"></div>',
        '</div><p id="shipmentSearchStatus" class="shipment-search-status" role="status"></p>',
        '<div class="shipment-state" id="shipmentEmpty" role="status" hidden><span class="shipment-state-icon">' + searchIcon + '</span><strong></strong><span class="shipment-state-detail"></span></div>',
        '<h4 class="shipment-selected-heading" id="shipmentSelectedHeading" hidden>У замовленні</h4>',
        '<div id="shipmentGrid" class="assort-grid"></div>'
    ].join('');
    const input = document.getElementById('shipmentSearch');
    input.addEventListener('input', () => {
        cancelShipmentSearch();
        shipmentMatches.clear();
        refreshShipmentRows();
        const query = input.value.trim();
        if (query) _shipmentSearchTimer = setTimeout(() => runShipmentSearch(query), 300);
    });
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const query = input.value.trim();
        if (query) runShipmentSearch(query);
    });
    document.getElementById('shipmentScanBtn').addEventListener('click', openBarcodeScanner);
    const grid = document.getElementById('shipmentGrid');
    grid.addEventListener('click', event => {
        const quantity = event.target.closest('.qty-input');
        if (quantity) openShipmentQuantity(quantity);
        const button = event.target.closest('.qty-btn');
        if (!button) return;
        const row = button.closest('[data-shipment-row]');
        const index = Number(row.dataset.idx);
        const item = shipmentItems[index];
        if (!item) return;
        const next = Number((item.qty + Number(button.dataset.step)).toFixed(3));
        item.qty = Math.min(item.maxQty, Math.max(0, next));
        row.querySelector('.qty-input').value = item.qty;
        updateShipmentRow(row, index);
        updateShipmentSummary();
    });
    grid.addEventListener('keydown', event => {
        if (!event.target.matches('.qty-input') || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        openShipmentQuantity(event.target);
    });
    refreshShipmentRows();
    updateShipmentSummary();
}

// сохраняет текущую строку при открытии клавиатуры во время поиска
function openShipmentQuantity(input) {
    cancelShipmentSearch();
    document.getElementById('shipmentSearchStatus').hidden = true;
    openQuantityKeyboard(input);
}

// обновляет сетку из выбранных позиций и совпадений последнего запроса
function refreshShipmentRows(message = '', state = '') {
    const grid = document.getElementById('shipmentGrid');
    const status = document.getElementById('shipmentSearchStatus');
    if (!grid || !status) return;
    shipmentItems = shipmentItems.filter(item => item.qty > 0 || shipmentMatches.has(item.code));
    grid.innerHTML = renderShipmentRows();
    grid.querySelectorAll('[data-shipment-row]').forEach(row => updateShipmentRow(row, Number(row.dataset.idx)));
    status.textContent = message;
    status.hidden = !message;
    updateShipmentEmptyState(state);
}

// показывает выбранные позиции или сообщение о результате поиска
function updateShipmentEmptyState(state = '') {
    const empty = document.getElementById('shipmentEmpty');
    const heading = document.getElementById('shipmentSelectedHeading');
    if (!empty || !heading) return;
    const query = document.getElementById('shipmentSearch').value.trim();
    const selected = shipmentItems.some(item => item.qty > 0);
    heading.hidden = Boolean(query) || !selected;
    const copy = {
        missing: ['Нічого не знайдено', 'Перевірте назву чи код або спробуйте сканер'],
        error: ['Не вдалося завантажити результати', 'Спробуйте повторити пошук']
    };
    const content = copy[state];
    empty.hidden = !content;
    if (!content) return;
    empty.setAttribute('data-state', state);
    empty.querySelector('strong').textContent = content[0];
    empty.querySelector('.shipment-state-detail').textContent = content[1];
}

// ищет только по запросу, отменяя устаревший поиск при каждом новом вводе
async function runShipmentSearch(query, scanned = false) {
    cancelShipmentSearch();
    const controller = new AbortController();
    _shipmentSearchAbort = controller;
    shipmentMatches.clear();
    refreshShipmentRows('Шукаємо товари…');
    try {
        const barcode = scanned || /^\d{8,}$/.test(query);
        let result = await remoteSearchGoods(query, controller.signal, barcode, 'customer-order');
        if (barcode && !scanned && !result.items.length && !controller.signal.aborted) {
            result = await remoteSearchGoods(query, controller.signal, false, 'customer-order');
        }
        if (controller.signal.aborted || _shipmentSearchAbort !== controller) return;
        if (typeof quantityDraft !== 'undefined' && quantityDraft) {
            document.getElementById('shipmentSearchStatus').hidden = true;
            return;
        }
        let lastCode;
        for (const row of result.items) {
            const code = String(row.Code ?? '');
            const name = String(row.Name ?? '');
            const price = Number(row.price);
            const maxQty = Number(row.quantity);
            if (!code || !name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(maxQty) || maxQty <= 0) continue;
            shipmentMatches.add(code);
            lastCode = code;
            const item = shipmentItems.find(candidate => candidate.code === code);
            if (item) Object.assign(item, {name, price, maxQty, qty: Math.min(item.qty, maxQty)});
            else shipmentItems.push({code, name, price, maxQty, qty:0});
        }
        const message = shipmentMatches.size && result.truncated ? 'Уточніть пошук, щоб звузити результати' : '';
        refreshShipmentRows(message, shipmentMatches.size ? '' : 'missing');
        updateShipmentSummary();
        if (scanned && shipmentMatches.size === 1) {
            const index = shipmentItems.findIndex(item => item.code === lastCode);
            const input = document.querySelector('#shipmentGrid [data-idx="' + index + '"] .qty-input');
            if (input) openShipmentQuantity(input);
        }
    } catch (error) {
        if (!controller.signal.aborted && _shipmentSearchAbort === controller) {
            refreshShipmentRows('', 'error');
            console.warn('[customer order search]', error);
        }
    }
}

// передает код сканера в поиск по заказу
function searchShipmentByBarcode(barcode) {
    const query = String(barcode || '').replace(/\s+/g, '');
    const input = document.getElementById('shipmentSearch');
    if (!query || !input) return;
    input.value = query;
    return runShipmentSearch(query, true);
}



function renderShipmentRows() {
    return shipmentItems.map((it, i) => {
        return renderProductRow({
            idx: i, code: it.code, name: it.name, price: it.price, showHeadPrice: false,
            dataAttr: 'data-shipment-row', fieldsClass: 'shipment-row-fields',
            col1: { label: 'На складі', value: fmt(it.maxQty), isStatic: true, isLarge: true },
            col2: { label: 'Ціна', value: `${money(it.price)} ₴`, isStatic: true },
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
    if (totalEl) totalEl.textContent = `${money(it.qty * it.price)} ₴`
    row.classList.toggle('picked', it.qty > 0)
}

// пересчитывает итог, счетчик выбранных позиций и сохраняет черновик
function updateShipmentSummary() {
    const summary = document.getElementById('shipmentSummary')
    const btn = document.getElementById('shipmentSendBtn')
    if (!summary || !btn) return

    let count = 0, sum = 0
    shipmentItems.forEach(it => { if (it.qty > 0) { count++; sum += it.qty * it.price; } })

    // итог и кнопка появляются после выбора первой позиции
    const footer = document.getElementById('shipmentFooter');
    if (footer) footer.hidden = count === 0;
    saveShipmentDraft();
    if (!document.getElementById('shipmentSearch')?.value?.trim()) updateShipmentEmptyState();

    if (!count) {
        summary.textContent = ''
        btn.disabled = true
        return
    }
    summary.innerHTML = `<span>${count} ${count === 1 ? "позиція" : "поз."}</span><b>${money(sum)} ₴</b>`
    btn.disabled = shipmentSending
}

// сначала показывает снимок выбранных позиций и отправляет только после подтверждения
async function submitShipment() {
    if (!currentUser || shipmentSending || shipmentReviewPending) return;
    cancelShipmentSearch();
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
        confirmed = await showConfirmDialog({title:'Перевірте замовлення',
            message: 'Вибрано позицій: ' + items.length,
            receiptItems: items, receiptTotal: total, okText:'Відправити в 1С', cancelText:'Редагувати'});
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
        endpoint: 'customer-order',
        validateResponse: response => response?.ok === true && response.document_type === 'customer_order' && Boolean(response.doc_number),
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
            showConfirmDialog({title: conductError ? 'Замовлення створено з помилкою' : 'Замовлення створено',
                message: conductError ? 'Перевірте замовлення в 1С перед повторною відправкою.' : 'Сервер підтвердив створення замовлення.',
                documentResult: shipmentDocumentResult(response, items, conductError), okText: 'Зрозуміло', cancelText: 'Закрити'});
        }
    });

    shipmentSending = false;
    if (shipmentItems.length) updateShipmentSummary();
}
