// ============================================================
// javascript/features/goods-card.js
// ============================================================

// в заказ идут только доступные источники с остатком
function isOrderableStock(row) {
    const quantity = Number(row?.quantity);
    const price = Number(row?.price);
    return Boolean(row?.organization_id && row.store_id && (!row.variant || row.variant_id) &&
        Number.isFinite(quantity) && quantity > 0 && Number.isFinite(price) && price > 0);
}

function totalStockQuantity(locations) {
    return locations.reduce((total, row) => {
        const quantity = Number(row?.quantity);
        return Number.isFinite(quantity) && quantity > 0 ? total + quantity : total;
    }, 0);
}

// строит карточку с единой иерархией названия, цены и остатков
function goodsCardHtml(item, idx, query = '', ordered = 0) {
    const code = escapeHtml(item.code || '');
    const name = highlightText(item.name || '—', query);
    const price = Number(item.price) || 0;
    const stock = item.stock != null ? Number(item.stock) : null;
    const id = escapeHtml(item.id || item.code || '');

    let stockHtml = '';
    // остатки показываются без неподтвержденных единиц измерения или порога малого запаса
    if (Array.isArray(item.stockLocations)) {
        const locations = item.stockLocations;
        const total = totalStockQuantity(locations);
        const orderable = totalStockQuantity(locations.filter(isOrderableStock));
        if (locations.some(isOrderableStock)) {
            stockHtml = `<span class="goods-stock ok">${orderable < total ? 'Всього ' + fmt(total) + ' · До замовлення ' + fmt(orderable) : 'В наявності: ' + fmt(total)}</span>`;
        } else if (total > 0) {
            stockHtml = `<span class="goods-stock warning">Залишок є в 1С: ${fmt(total)}</span>`;
        } else {
            stockHtml = '<span class="goods-stock zero">Немає в наявності</span>';
        }
    } else if (stock !== null && Number.isFinite(stock)) {
        const state = stock > 0 ? 'ok' : stock < 0 ? 'warning' : 'zero';
        const label = stock > 0 ? 'В наявності: ' + fmt(stock) : stock < 0 ? 'Недостача: ' + fmt(Math.abs(stock)) : 'Немає в наявності';
        stockHtml = `<span class="goods-stock ${state}">${label}</span>`;
    }

    return `
        <button type="button" class="goods-card" aria-haspopup="dialog" data-rendered="1" data-id="${id}" data-code="${code}">
            <span class="goods-thumbnail" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5m-9 5L3 7m9 5v10M7.5 4.5l9 5"/></svg>
                ${goodsPhotoHtml(item.code)}
            </span>
            <span class="goods-description">
                <span class="goods-title">${name}</span>
                ${code ? `<span class="goods-code">${code}</span>` : ''}
                ${stockHtml}
                <span class="goods-stock draft-quantity"${ordered ? '' : ' hidden'}>${ordered ? 'У замовленні: ' + fmt(ordered) : ''}</span>
            </span>
            <span class="price-val">${money(price)} ₴</span>
            <svg class="goods-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>
        </button>
    `;
}

// создает место для фото и запрашивает файл при появлении карточки на экране
function goodsPhotoHtml(code) {
    return /^\d+$/.test(String(code || '')) ? `<img class="goods-photo" data-photo-code="${code}" alt="">` : '';
}

if (typeof IntersectionObserver === 'function' && typeof MutationObserver === 'function') {
    const photoObserver = new IntersectionObserver(entries => {
        for (const {target, isIntersecting} of entries) {
            if (!isIntersecting) continue;
            photoObserver.unobserve(target);
            const img = target.querySelector('[data-photo-code]');
            if (img) loadGoodsPhoto(img);
        }
    });
    new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.matches?.('[data-photo-code]')) photoObserver.observe(node.closest('.goods-card, .order-item, .goods-details-body') || node.parentElement);
                node.querySelectorAll?.('[data-photo-code]').forEach(img => photoObserver.observe(img.closest('.goods-card, .order-item, .goods-details-body') || img.parentElement));
            }
            for (const node of record.removedNodes) {
                if (node.matches?.('[data-photo-code]')) photoObserver.unobserve(node);
                node.querySelectorAll?.('[data-photo-code]').forEach(img => photoObserver.unobserve(img.closest('.goods-card, .order-item, .goods-details-body') || img.parentElement));
            }
        }
    }).observe(document.body, {childList: true, subtree: true});
}

// загружает фото с кодом сотрудника в заголовке запроса
async function loadGoodsPhoto(img) {
    if (!currentUser || !img.isConnected) return;
    try {
        const user = currentUser;
        const url = apiBase + '/goods?photo=' + encodeURIComponent(img.dataset.photoCode);
        const key = 'catalogPhoto:' + user.id + ':' + img.dataset.photoCode;
        let blob = await localDB.load(key).catch(() => null);
        if (!blob && navigator.onLine) {
            const response = await fetchWithTimeout(url, {headers: {'X-User-Code': user.id}});
            if (!response.ok || !/^image\/(jpeg|png|gif)\b/i.test(response.headers.get('Content-Type') || '')) return;
            blob = await response.blob();
            if (currentUser === user && blob.size <= 1024 * 1024) localDB.save(key, blob).catch(() => {});
        }
        if (!blob || currentUser !== user || !img.isConnected) return;
        const src = URL.createObjectURL(blob);
        img.onload = () => { img.classList.add('loaded'); URL.revokeObjectURL(src); };
        img.onerror = () => URL.revokeObjectURL(src);
        img.src = src;
    } catch {}
}

// открывает сведения о товаре и проверяет доступность в 1с
async function openGoodsDetails(item, trigger, batch = false) {
    const user = currentUser;
    const dialog = document.createElement('dialog');
    dialog.className = 'goods-details';
    dialog.setAttribute('aria-label', item.name);
    const barcode = String(item.barcode || '').trim();
    dialog.innerHTML = '<form method="dialog"><button class="modal-close" aria-label="Закрити">×</button></form>' +
        '<div class="goods-details-body"><h3></h3><p class="goods-details-code"></p><p class="goods-details-price"></p><p role="status"></p>' +
        '<div class="goods-stock-locations" hidden></div>' +
        '<div class="goods-details-photo">' + goodsPhotoHtml(item.code) + '</div>' +
        (barcode ? '<p class="goods-details-barcode">Штрихкод ' + escapeHtml(barcode) + '</p>' : '') +
        '</div>' + (batch ? '<footer class="goods-details-footer"><button type="button" class="action-btn btn-secondary" data-scan-next>Наступний штрихкод</button></footer>' : '');
    dialog.querySelector('h3').textContent = item.name;
    dialog.querySelector('.goods-details-code').textContent = 'Код ' + item.code;
    const price = dialog.querySelector('.goods-details-price');
    price.textContent = money(item.price) + ' ₴';
    const status = dialog.querySelector('[role="status"]');
    status.textContent = 'Перевіряємо наявність…';
    const controller = new AbortController();
    let scanNext = false;
    const nextScan = () => {
        scanNext = true;
        dialog.close();
    };
    dialog.querySelector('[data-scan-next]')?.addEventListener('click', nextScan);
    dialog.addEventListener('close', () => {
        controller.abort();
        if (dialog.contains(document.getElementById('quantityKeyboardOverlay'))) closeQuantityKeyboard(false);
        dialog.remove();
        if (scanNext && currentUser === user) openBarcodeScanner(true);
        else if (trigger?.isConnected) trigger.focus();
    }, {once: true});
    document.body.append(dialog);
    dialog.showModal();
    const section = dialog.querySelector('.goods-stock-locations');
    const note = document.createElement('p');
    note.className = 'goods-stock-date';
    status.after(note);
    const render = (result, saved, autoChoose) => {
        const match = result.items.find(row => String(row.Code) === item.code && Number(row.quantity) > 0 && Number(row.price) > 0);
        const reasons = {
            stock: 'Немає доступного залишку для організації та магазину замовлення',
            price: 'У 1С немає ціни для замовлення',
            unit: 'Перевірте основну одиницю виміру товару в 1С'
        };
        const locations = Array.isArray(result.stockLocations) ? result.stockLocations.filter(row =>
            row && Number.isFinite(Number(row.quantity)) && Number(row.quantity) > 0) : [];
        const available = locations.filter(isOrderableStock);
        const unavailable = locations.filter(row => !isOrderableStock(row));
        if (match && !available.some(row => row.is_default && !row.variant_id)) {
            available.unshift({...match, organization: result.organization, store: result.store, is_default: true});
        }
        available.sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)));
        status.hidden = available.length > 0;
        status.textContent = reasons[result.unavailableReason] || 'Немає залишку, доступного для замовлення';
        if (saved && catalogSavedAt) {
            const timestamp = new Date(catalogSavedAt).toLocaleString('uk-UA', {dateStyle:'short', timeStyle:'short'});
            note.textContent = 'Збережені залишки · ' + timestamp;
        } else note.textContent = saved ? 'Збережені залишки' : '';
        section.hidden = !available.length && !unavailable.length;
        section.onclick = null;
        const sourceOf = row => row.organization_id && row.store_id ? row : null;
        const matchesPosition = (position, location) => position.code === item.code
            && sameShipmentSource(position.source, sourceOf(location))
            && (position.source?.variant_id || '') === (location.variant_id || '');
        const buttonText = qty => qty > 0 ? 'У замовленні: ' + fmt(qty) + ' · Змінити' : 'Додати';
        const choose = (location, triggerButton) => {
            if (currentUser !== user) return;
            restoreShipmentDraft();
            const source = sourceOf(location);
            const samePosition = row => matchesPosition(row, location);
            const previous = shipmentItems.find(samePosition);
            const position = {
                code: item.code, name: item.name, price: Number(location.price),
                maxQty: Number(location.quantity), qty: Math.min(previous?.qty ?? 0, Number(location.quantity)),
                source,
                organization: location.organization || result.organization || '',
                store: location.store || result.store || ''
            };
            showQuantityKeyboard(position, triggerButton, null, dialog, qty => {
                if (currentUser !== user) return;
                shipmentItems = shipmentItems.filter(row => !samePosition(row));
                if (qty > 0) shipmentItems.push({...position, qty});
                if (!saveShipmentDraft()) return;
                triggerButton.textContent = buttonText(qty);
                showToast(qty > 0 ? 'Додано до замовлення' : 'Позицію прибрано із замовлення');
                if (batch && qty > 0) nextScan();
            });
        };
        if (available.length || unavailable.length) {
            const draft = readShipmentDraftItems();
            const renderStockGroups = (rows, canAdd) => {
                const groups = new Map();
                for (const row of rows) {
                    const key = JSON.stringify([row.organization_id || row.organization, row.store_id || row.store]);
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(row);
                }
                return Array.from(groups.values(), group => {
                    const {organization, store} = group[0];
                    return `<div class="stock-source"><strong>${escapeHtml(String(organization || 'Організація за замовчуванням'))}</strong>
                        ${store ? `<small>Магазин: ${escapeHtml(String(store))}</small>` : ''}
                        <ul>${group.map(row => {
                            const qty = draft.find(position => matchesPosition(position, row))?.qty || 0;
                            return `<li><span>${escapeHtml(String(row.variant || 'Без характеристики'))}</span>
                                <b>${fmt(Number(row.quantity))}</b>
                                ${canAdd ? `<button type="button" class="stock-order-button" data-stock-index="${available.indexOf(row)}">${buttonText(qty)}</button>` : ''}
                            </li>`;
                        }).join('')}</ul></div>`;
                }).join('');
            };
            const total = totalStockQuantity([...available, ...unavailable]);
            const orderable = totalStockQuantity(available);
            section.innerHTML = `<div class="stock-total"><strong>Загальний залишок</strong><b>${fmt(total)}</b></div>` +
                (orderable < total ? `<div class="stock-total"><strong>До замовлення</strong><b>${fmt(orderable)}</b></div>` : '') +
                (available.length ? '<section class="stock-group"><h4>Можна замовити</h4>' + renderStockGroups(available, true) + '</section>' : '') +
                (unavailable.length ? '<section class="stock-group"><h4>Інші залишки в 1С</h4>' + renderStockGroups(unavailable, false) + '</section>' : '');
            section.hidden = false;
            section.onclick = event => {
                const button = event.target.closest('[data-stock-index]');
                if (button) choose(available[Number(button.dataset.stockIndex)], button);
            };
            if (autoChoose && batch && available.length === 1) choose(available[0], section.querySelector('[data-stock-index]'));
        }
        const currentPrice = result.price ?? match?.price ?? available[0]?.price;
        if (Number.isFinite(currentPrice)) price.textContent = money(currentPrice) + ' ₴';
    };

    // показываем кеш сразу и уточняем остатки только для открытого товара
    const savedLocations = item.stockLocations;
    const cached = Array.isArray(savedLocations) ? {
        items: savedLocations.filter(row => row.is_default && !row.variant).map(row => ({...row, Code:item.code})),
        stockLocations: savedLocations
    } : null;
    if (cached) render(cached, true, !navigator.onLine);
    if (!navigator.onLine) {
        if (!cached) status.textContent = 'Залишки ще не збережено на цьому пристрої';
        return;
    }
    const canUpdate = () => dialog.open && currentUser === user &&
        !dialog.contains(document.getElementById('quantityKeyboardOverlay'));
    try {
        const current = await remoteSearchGoods(item.code, controller.signal, false, 'customer-order', true);
        if (canUpdate()) render(current, false, true);
    } catch {
        if (!canUpdate()) return;
        if (cached && batch) render(cached, true, true);
        else if (!cached) status.textContent = 'Не вдалося перевірити наявність';
    }
}

if (typeof document !== 'undefined') {
    document.getElementById('resultsContainer')?.addEventListener?.('click', event => {
        const trigger = event.target.closest('.goods-card');
        if (!trigger || !currentUser) return;
        const item = _goodsResults.find(product => (product.id || product.code) === trigger.dataset.id);
        if (item) {
            const batch = event.currentTarget.dataset.scanSelection === '1';
            delete event.currentTarget.dataset.scanSelection;
            openGoodsDetails(item, trigger, batch);
        }
    });
}
