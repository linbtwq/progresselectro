// Порожнє джерело у старих чернетках означає організацію й магазин за замовчуванням.
function sameShipmentSource(left, right) {
    if (!left || !right) return (!left || left.is_default === true) && (!right || right.is_default === true);
    return left.organization_id === right.organization_id && left.store_id === right.store_id;
}

// возвращает отдельный ключ черновика для каждого пользователя
function shipmentDraftKey() { return currentUser ? 'customerOrderDraft:' + currentUser.id : null; }

function readShipmentDraftItems() {
    const key = shipmentDraftKey();
    const items = key ? readJsonSafe(key, null)?.items : null;
    return Array.isArray(items) ? items.filter(item => Number.isFinite(item?.qty) && item.qty > 0) : [];
}

// суммируем количество по коду, чтобы показать его в каталоге
function shipmentDraftQuantities() {
    const quantities = new Map();
    for (const item of readShipmentDraftItems()) {
        quantities.set(item.code, (quantities.get(item.code) || 0) + item.qty);
    }
    return quantities;
}

function refreshCatalogDraftBadges() {
    const cards = document.getElementById('resultsContainer')?.querySelectorAll?.('.goods-card');
    if (!cards?.length) return;
    const quantities = shipmentDraftQuantities();
    for (const card of cards) {
        const badge = card.querySelector('.draft-quantity');
        const qty = quantities.get(card.dataset.code);
        badge.hidden = !qty;
        badge.textContent = qty ? 'У замовленні: ' + fmt(qty) : '';
    }
}

// обновляет число позиций в черновике рядом с кнопкой заказа
function updateMainOrderCount() {
    const badge = document.getElementById('mainOrderCount');
    if (!badge) return;
    const key = shipmentDraftKey();
    const items = key ? readJsonSafe(key, null)?.items : null;
    const count = Array.isArray(items) ? items.filter(item => item?.qty > 0).length : 0;
    badge.hidden = count === 0;
    badge.textContent = count ? String(count) : '';
    badge.setAttribute('aria-label', 'Позицій у замовленні: ' + count);
}

// сохраняет только подтвержденные количества и идентификатор повторной отправки
function saveShipmentDraft() {
    const key = shipmentDraftKey();
    if (!key) return;
    const items = shipmentItems.filter(item => item.qty > 0).map(({code, name, price, maxQty, qty, source, organization, store}) => ({code, name, price, maxQty, qty, source, organization, store}));
    try {
        if (items.length) localStorage.setItem(key, JSON.stringify({items, requestId:shipmentRequestId, at:Date.now()}));
        else localStorage.removeItem(key);
        updateMainOrderCount();
        refreshCatalogDraftBadges();
        return true;
    } catch (e) { showToast('Не вдалося зберегти чернетку на пристрої', true); return false; }
}

// восстанавливает выбранные строки из сохраненного черновика заказа
function restoreShipmentDraft() {
    const key = shipmentDraftKey();
    const saved = key ? readJsonSafe(key, null) : null;
    shipmentItems = Array.isArray(saved?.items) ? saved.items.filter(item =>
        item && typeof item.code === 'string' && typeof item.name === 'string' &&
        Number.isFinite(item.price) && item.price > 0 && Number.isFinite(item.maxQty) &&
        Number.isFinite(item.qty) && item.qty > 0 && item.qty <= item.maxQty
    ) : [];
    if (shipmentItems.length && typeof saved.requestId === 'string' && saved.requestId) {
        shipmentRequestId = saved.requestId;
    }
}

// удаляет черновик после подтвержденного создания документа
function clearShipmentDraft(key = shipmentDraftKey()) {
    try { if (key) localStorage.removeItem(key); updateMainOrderCount(); refreshCatalogDraftBadges(); } catch (e) {}
}

// собирает результат из полей ответа сервиса, не выдумывая номер документа
function shipmentResultDetails(response, items, conductError) {
    const details = [`Надіслано позицій: ${items.length}`];
    const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const serverSum = response?.sum;
    details.push(`Сума документа: ${money(serverSum != null && Number.isFinite(Number(serverSum)) ? Number(serverSum) : total)} ₴`);
    if (response?.doc_number) details.push(`Накладна № ${response.doc_number}`);
    else details.push('Сервер підтвердив документ без номера');
    if (response?.doc_date) details.push(`Дата: ${response.doc_date}`);
    if (conductError) details.push(`Причина: ${conductError}`);
    return details;
}
