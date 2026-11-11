// возвращает отдельный ключ черновика для каждого пользователя
function shipmentDraftKey() { return currentUser ? 'customerOrderDraft:' + currentUser.id : null; }

// сохраняет только подтвержденные количества и идентификатор повторной отправки
function saveShipmentDraft() {
    const key = shipmentDraftKey();
    if (!key) return;
    const items = shipmentItems.filter(item => item.qty > 0).map(({code, name, price, maxQty, qty}) => ({code, name, price, maxQty, qty}));
    try {
        if (items.length) localStorage.setItem(key, JSON.stringify({items, requestId:shipmentRequestId, at:Date.now()}));
        else localStorage.removeItem(key);
    } catch (e) { showToast('Не вдалося зберегти чернетку на пристрої', true); }
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
    try { if (key) localStorage.removeItem(key); } catch (e) {}
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
