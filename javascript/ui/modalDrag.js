// ============================================================
// javascript/ui/modalDrag.js
//
// назначение
// этот файл отвечает за закрытие модалок свайпом на тач устройствах.
//
// ответственность
// - запомнить начало касания в верхней части модалки
// - сдвигать модалку за пальцем
// - постепенно осветлять затемнение
// - закрыть модалку если потянули достаточно далеко или быстро
//
// зависимости
// - core/state.js не нужен
// - init вызывается из events.js
// ============================================================

// ============================================================
// блок 1. состояние жеста
// ============================================================

const _modalDrag = {
    box: null,
    overlay: null,
    startY: 0,
    currentY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0
}

// ============================================================
// блок 2. универсальное закрытие по оверлею
//
// подбираем правильную функцию закрытия по id модалки
// для confirmDialogOverlay жмем отмену,
// чтобы promise зарезолвился и cleanup сработал
// ============================================================

function closeModalByOverlay(overlay) {
    if (!overlay) return
    const id = overlay.id

    if (id === 'confirmDialogOverlay') {
        const cancelBtn = overlay.querySelector('#confirmDialogCancel')
        if (cancelBtn) { cancelBtn.click(); return }
    }

    if (id === 'invoiceHistoryOverlay') closeInvoiceHistory()
    else if (id === 'quantityKeyboardOverlay') closeQuantityKeyboard()
    else if (id === 'barcodeScannerOverlay') closeBarcodeScanner()
    else if (id === 'modalOverlay' && typeof closeModal === 'function') closeModal()
    else if (id === 'stockOverlay' && typeof closeStockModal === 'function') closeStockModal()
    else if (id === 'shipmentOverlay' && typeof closeShipmentModal === 'function') closeShipmentModal()
    else if (id === 'recountOverlay' && typeof closeRecountModal === 'function') closeRecountModal()
    else if (id === 'noteOverlay' && typeof closeNoteModal === 'function') closeNoteModal()
    else if (id === 'assortOverlay' && typeof closeAssortModal === 'function') closeAssortModal()
    else if (id === 'orderConfirmOverlay' && typeof closeOrderConfirmModal === 'function') closeOrderConfirmModal()
    else if (id === 'paymentOverlay' && typeof closePaymentModal === 'function') closePaymentModal()
    else overlay.classList.remove('active')
}

// ============================================================
// блок 3. инициализация жеста
//
// жесты работают только на тач устройствах.
// если устройство с мышью выходим сразу.
//
// реагируем только на касание в верхних семидесяти пикселях модалки.
// крестик и кнопки формы не перехватываем.
// маленький диалог подтверждения свайпом не закрываем.
// ============================================================

function initModalDrag() {
    // только для тач, на мышке не нужно
    if (!window.matchMedia('(pointer: coarse)').matches) return

    // начало жеста
    document.addEventListener('touchstart', (e) => {
        const box = e.target.closest('.modal-box')
        if (!box) return

        // крестик не трогаем, он сам закроет
        if (e.target.closest('.modal-close')) return

        const overlay = box.closest('.modal-overlay')
        if (!overlay) return

        // confirmDialogOverlay свайпом не закрываем
        // он маленький и это опасно - пользователь может случайно отменить
        if (overlay.id === 'confirmDialogOverlay' || overlay.id === 'quantityKeyboardOverlay') return

        // реагируем только на касание в верхней части модалки
        const rect = box.getBoundingClientRect()
        const y = e.touches[0].clientY
        if (y > rect.top + 70) return

        _modalDrag.box = box
        _modalDrag.overlay = overlay
        _modalDrag.startY = y
        _modalDrag.lastY = y
        _modalDrag.lastTime = Date.now()
        _modalDrag.currentY = 0
        _modalDrag.velocity = 0

        box.style.transition = 'none'
    }, { passive: true })

    // движение пальца
    document.addEventListener('touchmove', (e) => {
        if (!_modalDrag.box) return

        const y = e.touches[0].clientY
        const dy = Math.max(0, y - _modalDrag.startY)
        _modalDrag.currentY = dy

        // считаем скорость чтобы понимать быстрый свайп или медленный
        const now = Date.now()
        const dt = now - _modalDrag.lastTime || 1
        _modalDrag.velocity = (y - _modalDrag.lastY) / dt
        _modalDrag.lastY = y
        _modalDrag.lastTime = now

        _modalDrag.box.style.transform = `translateY(${dy}px)`

        // фон постепенно светлеет
        if (_modalDrag.overlay) {
            const base = 0.5
            const factor = Math.max(0.15, 1 - dy / 400)
            _modalDrag.overlay.style.background = `rgba(10, 18, 16, ${(base * factor).toFixed(3)})`
        }
    }, { passive: true })

    // завершение жеста
    document.addEventListener('touchend', () => {
        if (!_modalDrag.box) return

        const box = _modalDrag.box
        const overlay = _modalDrag.overlay
        const dy = _modalDrag.currentY
        const v = _modalDrag.velocity

        box.style.transition = ''
        if (overlay) overlay.style.background = ''

        // закрываем если протянули далеко или свайпнули быстро
        const shouldClose = dy > 90 || v > 0.6

        _modalDrag.box = null
        _modalDrag.overlay = null
        _modalDrag.currentY = 0

        box.style.transform = ''

        if (shouldClose && overlay) {
            closeModalByOverlay(overlay)
        }
    }, { passive: true })

    // если жест отменили возвращаем модалку на место
    document.addEventListener('touchcancel', () => {
        if (_modalDrag.box) {
            _modalDrag.box.style.transition = ''
            _modalDrag.box.style.transform = ''
        }
        if (_modalDrag.overlay) {
            _modalDrag.overlay.style.background = ''
        }

        _modalDrag.box = null
        _modalDrag.overlay = null
        _modalDrag.currentY = 0
    }, { passive: true })
}