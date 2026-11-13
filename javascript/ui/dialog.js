// ============================================================
// javascript/ui/dialog.js
//
// назначение
// этот файл дает универсальный диалог подтверждения.
//
// ответственность
// - показать диалог с заголовком, текстом и списком деталей
// - вернуть promise с ответом пользователя
// - обработать escape и enter
//
// зависимости
// - core/utils.js дает escapeHtml
// ============================================================


// ============================================================
// блок 1. определение поля формы
//
// нужно чтобы enter в активном поле не подтверждал диалог
// иначе пользователь не сможет ввести текст с новой строки
// ============================================================

const _isFormField = (el) => {
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}


// ============================================================
// блок 2. показ диалога
//
// диалог уже есть в разметке index.html.
// тут только заполняем тексты и вешаем обработчики.
// обработчики снимаются после закрытия чтобы не накопились
// ============================================================

// показывает общий диалог или проверку накладной в виде чека
function showConfirmDialog({ title, message, details, receiptItems, receiptGroups, receiptTotal, documentResult, okText, cancelText, danger }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirmDialogOverlay')
        const titleEl = document.getElementById('confirmDialogTitle')
        const msgEl = document.getElementById('confirmDialogMessage')
        const detailsEl = document.getElementById('confirmDialogDetails')
        const okBtn = document.getElementById('confirmDialogOk')
        const cancelBtn = document.getElementById('confirmDialogCancel')

        // если разметки нет просто отдаем отказ
        if (!overlay || !okBtn || !cancelBtn) {
            resolve(false)
            return
        }

        // результат документа оформляется отдельным итоговым блоком
        overlay.classList.toggle('document-result-dialog', !!documentResult);
        cancelBtn.hidden = !!documentResult;

        // заполняем заголовок и текст
        titleEl.textContent = title || 'Підтвердіть дію'
        msgEl.textContent = message || ''
        msgEl.style.display = message ? '' : 'none'

        // список деталей опциональный
        if (documentResult) {
            detailsEl.innerHTML = documentResultMarkup(documentResult);
            detailsEl.style.display = '';
        } else if (receiptGroups?.length) {
            detailsEl.innerHTML = receiptGroups.map(group => `<section class="receipt-group"><h4>${escapeHtml(group.title)}</h4>${receiptMarkup(group.items, group.total)}</section>`).join('') +
                `<div class="receipt-total"><span>Разом за всіма документами</span><strong>${money(receiptTotal)} ₴</strong></div>`;
            detailsEl.style.display = '';
        } else if (Array.isArray(receiptItems) && receiptItems.length) {
            detailsEl.innerHTML = receiptMarkup(receiptItems, receiptTotal);
            detailsEl.style.display = '';
        } else if (Array.isArray(details) && details.length) {
            detailsEl.innerHTML = '<ul>' + details.map(d => `<li>${escapeHtml(d)}</li>`).join('') + '</ul>'
            detailsEl.style.display = ''
        } else {
            detailsEl.innerHTML = ''
            detailsEl.style.display = 'none'
        }

        // тексты и стиль кнопок
        okBtn.textContent = okText || 'OK'
        cancelBtn.textContent = cancelText || 'Скасувати'
        okBtn.className = 'action-btn ' + (danger ? 'btn-danger' : 'btn-primary')

        // удаляет обработчики чтобы они не сработали повторно
        const cleanup = () => {
            overlay.classList.remove('active')
            okBtn.removeEventListener('click', onOk)
            cancelBtn.removeEventListener('click', onCancel)
            overlay.removeEventListener('click', onOverlayClick)
            document.removeEventListener('keydown', onKey)
        }

        const onOk = () => { cleanup(); resolve(true) }
        const onCancel = () => { cleanup(); resolve(false) }
        const onOverlayClick = (e) => { if (e.target === overlay) onCancel() }

        // клавиши закрывают диалог
        // enter не срабатывает если фокус в поле ввода
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                onCancel()
            } else if (e.key === 'Enter' && !_isFormField(document.activeElement)) {
                e.preventDefault()
                if (document.activeElement === cancelBtn) onCancel()
                else onOk()
            }
        }

        okBtn.addEventListener('click', onOk)
        cancelBtn.addEventListener('click', onCancel)
        overlay.addEventListener('click', onOverlayClick)
        document.addEventListener('keydown', onKey)

        overlay.classList.add('active')
        setTimeout(() => okBtn.focus(), 80)
    })
}
// формирует строки чека, экранируя названия товаров перед вставкой в разметку
function receiptMarkup(items, total) {
    const amount = Number.isFinite(Number(total)) ? Number(total) : items.reduce((sum, item) => sum + item.qty * item.price, 0);
    return '<div class="receipt-lines">' + items.map(item => `<div class="receipt-line"><div><span class="receipt-name">${escapeHtml(item.name)}</span><span class="receipt-meta">${fmt(item.qty)} × ${money(item.price)} ₴</span></div><b>${money(item.qty * item.price)} ₴</b></div>`).join('') + `<div class="receipt-total"><span>Разом</span><strong>${money(amount)} ₴</strong></div></div>`;
}

// рисует результат создания накладной и явно отделяет ошибку проведения от успеха
function documentResultMarkup(result) {
    const warning = !!result.error;
    const symbol = warning ? '<path d="M12 7v6m0 4h.01"/><circle cx="12" cy="12" r="9"/>' : '<path d="m5 12 4 4L19 6"/>';
    return '<div class="document-result ' + (warning?'warning':'') + '"><span class="document-result-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + symbol + '</svg></span>' +
        '<p class="document-number">' + (result.number ? (result.documentType === 'customer_order' ? 'Замовлення № ' : 'Накладна № ') + escapeHtml(result.number) : 'Документ підтверджено сервером') + '</p>' +
        (result.date ? '<p class="history-note">' + escapeHtml(formatInvoiceDate(result.date)) + '</p>' : '') +
        '<strong class="document-result-total">' + money(result.total) + ' ₴</strong><span class="document-result-count">Надіслано позицій: ' + fmt(result.count) + '</span>' +
        (warning ? '<p class="document-result-error">' + escapeHtml(result.error) + '</p>' : '<span class="invoice-status">Підтверджено</span>') + '</div>';
}
