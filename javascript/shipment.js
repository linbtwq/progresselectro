let _shipmentLoadSeq = 0;
let _shipmentOrganizationSeq = 0;
let shipmentSending = false;
let shipmentRequestId = null;
let shipmentItems = [];
let shipmentReviewPending = false;

function resetShipmentPage() {
    ++_shipmentLoadSeq;
    closeQuantityKeyboard(false);
    shipmentItems = [];
    shipmentRequestId = null;
}

function initShipmentPage() {
    const grid = document.getElementById('shipmentGrid');
    document.getElementById('shipmentAddBtn').addEventListener('click', () => {
        if (!shipmentSending && !shipmentReviewPending) openCatalogPage(true);
    });
    grid.addEventListener('click', event => {
        if (shipmentSending || shipmentReviewPending) return;
        const input = event.target.closest('.qty-input');
        if (input) return openQuantityKeyboard(input);
        const button = event.target.closest('.qty-btn');
        if (!button) return;
        const row = button.closest('[data-shipment-row]');
        const item = shipmentItems[Number(row.dataset.idx)];
        item.qty = Math.min(item.maxQty, Math.max(0, Number((item.qty + Number(button.dataset.step)).toFixed(3))));
        row.querySelector('.qty-input').value = item.qty;
        updateShipmentRow(row, Number(row.dataset.idx));
    });
    grid.addEventListener('keydown', event => {
        if (shipmentSending || shipmentReviewPending || !event.target.matches('.qty-input') || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        openQuantityKeyboard(event.target);
    });
}

function openShipmentPage() {
    if (!currentUser || shipmentSending || shipmentReviewPending) return;
    shipmentRequestId = newRequestId();
    restoreShipmentDraft();
    refreshShipmentRows();
    selectWorkspacePage('shipmentPage');
    loadShipmentOrganization();
}

async function loadShipmentOrganization() {
    const label = document.getElementById('shipmentOrganization');
    if (!label) return;
    const user = currentUser;
    const sequence = ++_shipmentOrganizationSeq;
    label.textContent = 'Завантажуємо організацію з 1С…';
    const selected = shipmentItems[0];
    if (selected && shipmentItems.some(item => !sameShipmentSource(item.source, selected.source))) {
        label.textContent = 'Кілька організацій або магазинів · окремий документ для кожного джерела';
        return;
    }
    if (selected?.organization) {
        label.textContent = [selected.organization, selected.store].filter(Boolean).join(' · ');
        return;
    }
    if (!navigator.onLine) {
        label.textContent = '';
        return;
    }
    let organization, store;
    try {
        ({organization, store} = await remoteSearchGoods('', undefined, false, 'customer-order'));
    } catch {
        // Сервер може бути недоступним або ще не повертає організацію.
    }
    if (currentUser !== user || sequence !== _shipmentOrganizationSeq) return;
    for (const item of shipmentItems) {
        if (!item.source && !item.organization && organization) { item.organization = organization; item.store = store; }
    }
    if (shipmentItems.length && organization) refreshShipmentRows();
    label.textContent = organization?.trim() ? 'Організація: ' + [organization, store].filter(Boolean).join(' · ') : 'Організацію не вдалося отримати з 1С';
}

// собираем позиции по источнику остатка, каждая группа станет отдельным документом
function shipmentGroups() {
    const groups = [];
    for (const [index, position] of shipmentItems.entries()) {
        if (position.qty <= 0) continue;
        let group = groups.find(entry => sameShipmentSource(entry.source, position.source));
        if (!group) {
            group = {source: position.source, organization: position.organization, store: position.store, items: [], indexes: []};
            groups.push(group);
        } else if (!group.source && position.source) {
            group.source = position.source;
        }
        group.indexes.push(index);
        group.items.push({
            code: position.code, name: position.name, price: position.price, qty: position.qty,
            ...(position.source?.variant_id ? {variant_id: position.source.variant_id, variant: position.source.variant} : {})
        });
    }
    return groups;
}

function shipmentGroupTitle(group) {
    return [group.organization, group.store].filter(Boolean).join(' · ') || 'Організація та магазин за замовчуванням';
}

function shipmentTotal(items) {
    return items.reduce((sum, item) => sum + Math.round(item.qty * item.price * 100), 0) / 100;
}

function refreshShipmentRows() {
    const renderRow = (item, index) => `
        <article class="order-item" data-shipment-row data-idx="${index}">
            <div class="order-product-photo" aria-hidden="true">${goodsPhotoHtml(item.code)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5m-9 5L3 7m9 5v10"/></svg></div>
            <div class="order-product">
                <strong>${escapeHtml(item.name)}</strong>
                <span class="goods-code">${escapeHtml(item.code)}</span>
                ${item.source?.variant ? `<small class="order-source">${escapeHtml(item.source.variant)}</small>` : ""}
                <div class="order-line">
                    <div class="qty" role="group" aria-label="Кількість">
                        <button type="button" class="qty-btn" data-step="-1" aria-label="Зменшити кількість">−</button>
                        <input type="text" class="qty-input" value="${item.qty}" readonly inputmode="none" aria-label="Кількість товару" aria-haspopup="dialog">
                        <button type="button" class="qty-btn" data-step="1" aria-label="Збільшити кількість">+</button>
                    </div>
                    <b class="row-total">${money(item.qty * item.price)} ₴</b>
                </div>
            </div>
        </article>`;
    document.getElementById('shipmentGrid').innerHTML = shipmentGroups().map(group =>
        `<section class="order-group"><header><strong>${escapeHtml(shipmentGroupTitle(group))}</strong><b data-group-total></b></header>
        ${group.indexes.map(index => renderRow(shipmentItems[index], index)).join('')}</section>`
    ).join('');
    updateShipmentSummary();
}

function updateShipmentRow(row, index) {
    const item = shipmentItems[index];
    if (!item.qty) {
        shipmentItems.splice(index, 1);
        refreshShipmentRows();
        const grid = document.getElementById('shipmentGrid');
        const rows = grid.querySelectorAll('[data-shipment-row]');
        const next = rows[Math.min(index, rows.length - 1)];
        (next?.querySelector('.qty-input') || document.getElementById('shipmentAddBtn')).focus();
        return;
    }
    row.querySelector('.row-total').textContent = `${money(item.qty * item.price)} ₴`;
    updateShipmentSummary();
}

function updateShipmentSummary() {
    const count = shipmentItems.length;
    const total = shipmentTotal(shipmentItems);
    const groups = shipmentGroups();
    document.getElementById('shipmentGrid').querySelectorAll('[data-group-total]').forEach((label, index) => {
        label.textContent = money(shipmentTotal(groups[index].items)) + ' ₴';
    });
    const documents = document.getElementById('shipmentDocuments');
    documents.textContent = count ? 'Документів у 1С: ' + groups.length : '';
    documents.hidden = !count;
    const countLabel = document.getElementById('shipmentCount');
    const plural = new Intl.PluralRules('uk').select(count);
    const unit = {one: 'позиція', few: 'позиції', many: 'позицій'};
    countLabel.textContent = `${count} ${unit[plural] || 'позиції'}`;
    countLabel.hidden = !count;
    document.getElementById('shipmentStart').hidden = Boolean(count);
    document.getElementById('shipmentGrid').hidden = !count;
    document.getElementById('shipmentFooter').hidden = !count;
    document.getElementById('shipmentSummary').innerHTML = `<span>Разом</span><b>${money(total)} ₴</b>`;
    document.getElementById('shipmentSendBtn').disabled = !count || shipmentSending;
    saveShipmentDraft();
}

async function submitShipment() {
    if (!currentUser || shipmentSending || shipmentReviewPending) return;
    closeQuantityKeyboard();

    const groups = shipmentGroups();
    const items = groups.flatMap(group => group.items.map(item => ({
        ...item, name: [item.name, item.variant, group.organization, group.store].filter(Boolean).join(' · ')
    })));
    if (!items.length) return showToast('Додайте хоча б одну позицію', true);
    if (!navigator.onLine) return showToast('Немає мережі. Чернетку збережено.', true);

    const reviewUser = currentUser;
    const reviewSeq = _shipmentLoadSeq;
    const overlay = document.getElementById('shipmentPage');
    const total = shipmentTotal(items);
    // блокируем экран заказа, пока открыто окно проверки
    shipmentReviewPending = true;
    overlay.inert = true;
    let confirmed = false;
    try {
        confirmed = await showConfirmDialog({title:'Перевірте замовлення',
            message: 'Документів у 1С: ' + groups.length + ' · Позицій: ' + items.length,
            receiptGroups: groups.map(group => ({
                title: shipmentGroupTitle(group),
                items: group.items.map(item => ({...item, name: [item.name, item.variant].filter(Boolean).join(' · ')})),
                total: shipmentTotal(group.items)
            })),
            receiptTotal: total, okText:'Відправити в 1С', cancelText:'Редагувати'});
    } finally { shipmentReviewPending = false; overlay.inert = false; }
    if (!confirmed && currentUser === reviewUser) document.getElementById('shipmentSendBtn')?.focus?.();
    if (!confirmed || currentUser !== reviewUser || _shipmentLoadSeq !== reviewSeq) return;
    if (!navigator.onLine) return showToast('Немає мережі. Чернетку збережено.', true);

    const orderGroups = groups.map(({source, items}) => ({
        items,
        ...(source ? {source: {organization_id: source.organization_id, store_id: source.store_id}} : {})
    }));
    const batch = groups.length > 1 || items.some(item => item.variant_id);
    const payload = {
        point_id: '0',
        technician_id: reviewUser.id,
        request_id: shipmentRequestId || newRequestId(),
        ...(batch ? {groups: orderGroups} : orderGroups[0])
    };

    const btn = document.getElementById('shipmentSendBtn');

    const sendingUser = currentUser;
    const draftKey = shipmentDraftKey();
    shipmentSending = true;

    // убираем черновик после того, как 1с вернет номера всех документов
    const validDocument = document => document?.ok === true && document.document_type === 'customer_order' && Boolean(document.doc_number);
    await submitDocument({
        endpoint: 'customer-order',
        validateResponse: response => batch
            ? response?.ok === true && Array.isArray(response.documents) && response.documents.length === groups.length && response.documents.every(validDocument)
            : validDocument(response),
        payload, btn,
        successText: '',
        errorPrefix: 'Не вдалося додати',
        onSuccess: (response, conductError) => {
            const documents = batch ? response.documents : [response];
            documents.forEach((document, index) => saveInvoiceHistory(sendingUser, {
                request_id: batch ? payload.request_id + ':' + index : payload.request_id,
                items: groups[index].items
            }, document, conductError));
            clearShipmentDraft(draftKey);
            if (currentUser !== sendingUser) return;
            shipmentSending = false;
            shipmentItems = [];
            shipmentRequestId = newRequestId();
            refreshShipmentRows();
            loadShipmentOrganization();
            showConfirmDialog({title: conductError ? 'Замовлення створено з помилкою' : 'Замовлення створено',
                message: conductError ? 'Перевірте замовлення в 1С перед повторною відправкою.' : 'Сервер підтвердив створення замовлення.',
                ...(batch ? {details: documents.map(document => [document.doc_number, document.organization, document.store].filter(Boolean).join(' · '))}
                    : {documentResult: shipmentDocumentResult(response, items, conductError)}), okText: 'Зрозуміло', cancelText: 'Закрити'});
        }
    });

    shipmentSending = false;
    if (currentUser === sendingUser) updateShipmentSummary();
}
