// вводится черновое количество: только подтверждение меняет выбранный товар
let quantityDraft = null;

// обрабатывает дробное количество и удаление последней цифры без отрицательных значений
function quantityKeyValue(value, key, replace = false) {
    if (key === '-') return value.slice(0, -1) || '0';
    // запятая и точка вводят один десятичный разделитель, внутри хранится точка
    if (key === ',' || key === '.') return replace ? '0.' : value.includes('.') ? value : value + '.';
    if (!/^\d$/.test(key)) return value;
    const next = (replace || value === '0') ? key : value + key;
    const [whole, fraction = ''] = next.split('.');
    return whole.length > 6 || fraction.length > 6 ? value : next;
}

// создает цифровую клавиатуру и подключает кнопки и физические клавиши
function initQuantityKeyboard() {
    const overlay = document.createElement('div');
    overlay.id = 'quantityKeyboardOverlay';
    overlay.className = 'modal-overlay quantity-keyboard';
    overlay.innerHTML = `<section class="modal-box quantity-panel" role="dialog" aria-modal="true" aria-labelledby="quantityTitle">
        <h3 id="quantityTitle">Кількість товару</h3>
        <p id="quantityProduct" class="quantity-product"></p>
        <output id="quantityValue" class="quantity-value" aria-live="polite">0</output>
        <p id="quantityHint" class="quantity-hint" aria-live="polite"></p>
        <div class="quantity-keys">${['1','2','3','4','5','6','7','8','9',',','0','-','OK'].map(key =>
            `<button type="button" data-quantity-key="${key}" ${key === '-' ? 'aria-label="Видалити останню цифру"' : key === ',' ? 'aria-label="Десятковий роздільник"' : ''} class="${key === 'OK' ? 'quantity-ok' : ''}">${key === '-' ? '−' : key === 'OK' ? 'ОК' : key}</button>`).join('')}</div>
    </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
        if (event.target === overlay) { closeQuantityKeyboard(); return; }
        const button = event.target.closest('[data-quantity-key]');
        if (button) handleQuantityKey(button.dataset.quantityKey);
    });
    document.addEventListener('keydown', event => {
        if (!quantityDraft) return;
        const key = event.key;
        if (/^\d$/.test(key) || ['Backspace', 'Delete', '-', '.', ',', 'Enter', 'Escape'].includes(key)) {
            event.preventDefault(); event.stopImmediatePropagation();
            if (key === 'Escape') closeQuantityKeyboard();
            else handleQuantityKey(key === 'Enter' ? 'OK' : ['Backspace','Delete'].includes(key) ? '-' : key);
        }
    }, true);
}

// открывает ввод для выбранного товара без системной клавиатуры
function openQuantityKeyboard(input) {
    if (shipmentSending) return;
    const row = input.closest('[data-shipment-row]');
    const idx = Number(row?.dataset.idx);
    const item = shipmentItems[idx];
    if (!row || !item) return;
    showQuantityKeyboard(item, input, row);
}

// открывает ту же клавиатуру в заказе или внутри карточки товара
function showQuantityKeyboard(item, input, row, dialog, onConfirm) {
    const overlay = document.getElementById('quantityKeyboardOverlay');
    const parent = dialog ? overlay.parentElement : null;
    if (dialog) dialog.append(overlay);
    document.activeElement?.blur();
    quantityDraft = { input, row, item, parent, onConfirm, value: String(item.qty), replace: true };
    document.getElementById('quantityProduct').textContent = item.name;
    document.getElementById('quantityKeyboardOverlay').classList.add('active');
    document.getElementById('shipmentPage').inert = true;
    updateQuantityKeyboard();
    document.querySelector('[data-quantity-key="1"]').focus({preventScroll:true});
}

// показывает количество, сумму и доступный остаток
function updateQuantityKeyboard() {
    if (!quantityDraft) return;
    const {value, item} = quantityDraft;
    const invalid = Number(value) > item.maxQty;
    document.getElementById('quantityValue').textContent = value.replace('.', ',');
    const hint = document.getElementById('quantityHint');
    // остаток и сумма разделены визуально, чтобы быстрее проверить введенное число
    if (invalid) hint.textContent = `Доступно лише ${fmt(item.maxQty)}. Зменште кількість`;
    else hint.innerHTML = `<span>На складі: ${fmt(item.maxQty)}</span><span>Сума: <strong>${money(Number(value) * item.price)} ₴</strong></span>`;
    hint.classList.toggle('error', invalid);
    document.querySelector('[data-quantity-key="OK"]').disabled = invalid;
}

// применяет нажатие и подтверждает количество только в пределах остатка
function handleQuantityKey(key) {
    if (!quantityDraft) return;
    if (key === 'OK') {
        const {input, row, item, value, onConfirm} = quantityDraft;
        if (Number(value) > item.maxQty) return;
        if (onConfirm) {
            closeQuantityKeyboard();
            onConfirm(Number(value));
            return;
        }
        item.qty = Number(value);
        input.value = item.qty;
        updateShipmentRow(row, Number(row.dataset.idx));
        closeQuantityKeyboard();
        return;
    }
    quantityDraft.value = quantityKeyValue(quantityDraft.value, key, quantityDraft.replace);
    quantityDraft.replace = false;
    updateQuantityKeyboard();
}

// закрывает клавиатуру без сохранения неподтвержденного ввода
function closeQuantityKeyboard(restore = true) {
    const {input, parent} = quantityDraft || {};
    if (parent) parent.append(document.getElementById('quantityKeyboardOverlay'));
    quantityDraft = null;
    document.getElementById('quantityKeyboardOverlay')?.classList.remove('active');
    const shipment = document.getElementById('shipmentPage');
    if (shipment) shipment.inert = false;
    if (restore && input?.isConnected) input.focus({preventScroll:true});
}
