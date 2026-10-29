// ============================================================
// javascript/ui/focus.js
//
// назначение
// этот файл отвечает за фокус и работу с клавиатурой.
//
// ответственность
// - искать верхнюю модалку по z-index
// - закрывать верхнюю модалку по escape
// - помнить и возвращать фокус
// - держать tab внутри активной модалки
// - обрабатывать глобальные горячие клавиши
// - ставить фокус в первое поле при открытии модалки
//
// зависимости
// - core/state.js дает searchMode и searchTimer
// - features/search.js дает handleSearch
// - app/refresh.js дает manualRefresh
// - ui/dialog.js дает _isFormField
// ============================================================

// ============================================================
// блок 1. список селекторов для обхода по tab
// ============================================================

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// ============================================================
// блок 2. определение верхней модалки
//
// идем по всем активным оверлеям и берем тот у которого z-index больше
// ============================================================

function getTopModal() {
    const modals = document.querySelectorAll('.modal-overlay.active')
    if (!modals.length) return null

    let top = null
    let topZ = -Infinity

    for (const m of modals) {
        const rawZ = getComputedStyle(m).zIndex
        const z = Number(rawZ)
        const zz = Number.isFinite(z) ? z : 1000
        if (zz > topZ) { topZ = zz; top = m }
    }
    return top
}

// ============================================================
// блок 3. закрытие верхней модалки
//
// для диалога подтверждения жмем кнопку отмены
// чтобы сработал cleanup внутри dialog.js и promise зарезолвился
//
// для остальных модалок (когда они появятся) - свои функции закрытия,
// если функции нет - просто убираем active
// ============================================================

function closeTopModal() {
    const m = getTopModal()
    if (!m) return

    // диалог подтверждения - программный клик по отмене
    if (m.id === 'confirmDialogOverlay') {
        const cancelBtn = m.querySelector('#confirmDialogCancel')
        if (cancelBtn) { cancelBtn.click(); return }
    }

    // задел под будущие модалки
    if (m.id === 'modalOverlay' && typeof closeModal === 'function') closeModal()
    else if (m.id === 'stockOverlay' && typeof closeStockModal === 'function') closeStockModal()
    else if (m.id === 'shipmentOverlay' && typeof closeShipmentModal === 'function') closeShipmentModal()
    else if (m.id === 'recountOverlay' && typeof closeRecountModal === 'function') closeRecountModal()
    else if (m.id === 'noteOverlay' && typeof closeNoteModal === 'function') closeNoteModal()
    else if (m.id === 'assortOverlay' && typeof closeAssortModal === 'function') closeAssortModal()
    else if (m.id === 'orderConfirmOverlay' && typeof closeOrderConfirmModal === 'function') closeOrderConfirmModal()
    else if (m.id === 'paymentOverlay' && typeof closePaymentModal === 'function') closePaymentModal()
    else m.classList.remove('active')
}

// ============================================================
// блок 4. запоминание и возврат фокуса
// ============================================================

let _focusBeforeModal = null

// запоминает что было в фокусе до открытия модалки
function rememberFocus() {
    _focusBeforeModal = document.activeElement
}

// возвращает фокус назад после закрытия
function restoreFocus() {
    if (_focusBeforeModal && document.contains(_focusBeforeModal)) {
        try { _focusBeforeModal.focus() } catch (e) {}
    }
    _focusBeforeModal = null
}

// ============================================================
// блок 5. удержание tab внутри модалки
// ============================================================

function trapFocus(e) {
    if (e.key !== 'Tab') return

    const modal = getTopModal()
    if (!modal) return

    const box = modal.querySelector('.modal-box')
    if (!box) return

    const focusables = Array.from(box.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null)
    if (!focusables.length) return

    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
    }
}

// ============================================================
// блок 6. глобальные горячие клавиши
//
// escape закрывает верхнюю модалку или чистит поиск
// слэш или ctrl k ставит фокус в поиск
// r запускает ручное обновление
//
// функция вызывается из initEventListeners в events.js
// ============================================================

function onKeyDown(e) {
    const inField = _isFormField(document.activeElement)

    // escape закрывает модалку или чистит поиск
    if (e.key === 'Escape') {
        if (getTopModal()) { e.preventDefault(); closeTopModal(); return }

        // в html поле поиска называется goodsSearch
        const si = document.getElementById('goodsSearch')
        if (inField && si && si.value) {
            e.preventDefault()
            si.value = ''
            handleSearch({ target: si })
            return
        }
    }

    if (inField) { trapFocus(e); return }

    // слэш или ctrl k фокусирует поиск
    if (e.key === '/' || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        document.getElementById('goodsSearch')?.focus()
        return
    }

    // r обновляет данные
    if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        manualRefresh()
        return
    }

    trapFocus(e)
}

// ============================================================
// блок 7. автфокус в модалке
//
// на тач устройствах фокусируем первую кнопку
// чтобы не поднимать экранную клавиатуру
//
// на устройствах с мышью фокусируем первое поле ввода
// ============================================================

function autofocusModal(modal) {
    if (!modal) return

    const box = modal.querySelector('.modal-box')
    if (!box) return

    // на тач фокус на первую кнопку
    if (window.matchMedia('(pointer: coarse)').matches) {
        const firstButton = Array.from(box.querySelectorAll('button:not([disabled])'))
            .find(el => el.offsetParent !== null)
        if (firstButton) firstButton.focus()
        return
    }

    // иначе первое поле ввода
    const inputs = Array.from(box.querySelectorAll(
        'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])'
    )).filter(el => el.offsetParent !== null)

    if (inputs.length) {
        const firstInput = inputs[0]
        try {
            firstInput.focus()
            if (typeof firstInput.select === 'function') firstInput.select()
        } catch (e) {}
        return
    }

    const focusables = Array.from(box.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null)
    if (focusables.length) focusables[0].focus()
}