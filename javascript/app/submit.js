// ============================================================
// javascript/app/submit.js
//
// назначение
// единая точка отправки документов в 1с.
// сейчас не используется, это заготовка на будущее.
// когда появится отправка заказов, списаний или показаний,
// использовать эту функцию чтобы не дублировать код.
//
// ответственность
// - блокировка кнопок на время отправки
// - перехват сетевых ошибок и таймаутов
// - проверка поля conduct_error (документ создан но не проведен)
// - показ галочки успеха и обновление данных
//
// особенности
// onSuccess - пользовательский коллбэк который
// закрывает модалку и чистит форму.
// он обернут в try/catch чтобы не ронять перезагрузку данных.
//
// зависимости
// - core/api.js дает postJson
// - core/utils.js дает isBlankServerError
// - ui/toast.js дает showToast, showSuccessAnimation
// - app/load.js дает loadGoodsData
// ============================================================

async function submitDocument({
    endpoint,
    payload,
    btn,
    closeBtn,
    loadingText = 'Відправка...',
    successText = 'Документ створено',
    errorPrefix = 'Помилка',
    onSuccess
}) {
    // защита от повторных кликов
    if (btn && btn.disabled) {
        if (typeof showToast === 'function') showToast('Зачекайте, триває відправка...');
        return;
    }

    // включаем спиннер
    if (btn) setBtnLoading(btn, loadingText);
    if (closeBtn) closeBtn.disabled = true;

    let success = false;
    let responseBody = null;
    let conductError = '';

    try {
        const response = await postJson(endpoint, payload);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error((errText && errText.slice(0, 200)) || 'Помилка сервера 1С');
        }

        try { responseBody = await response.json(); } catch (e) {}

        // 1с может ответить 200 но с полем conduct_error
        if (responseBody && responseBody.conduct_error != null) {
            const raw = String(responseBody.conduct_error);
            if (!isBlankServerError(raw)) conductError = raw;
        }

        // явная ошибка от 1с
        if (responseBody && responseBody.ok === false) {
            throw new Error(responseBody.error || responseBody.debt_error || '1С відхилила документ.');
        }

        success = true;

    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        const isNetwork = msg.includes('Failed to fetch') || msg.toLowerCase().includes('timeout');

        const displayMsg = isNetwork
            ? '1С не відповідає. Перевірте інтернет і спробуйте знову.'
            : `${errorPrefix}: ${msg}`;

        if (typeof showToast === 'function') showToast(displayMsg, true);

    } finally {
        if (success) {
            if (conductError) {
                console.error('[1С] Документ не проведено:', conductError);
                if (typeof showToast === 'function') {
                    showToast('Документ створено, але НЕ ПРОВЕДЕНО: ' + conductError.slice(0, 150), true);
                }
            } else {
                if (typeof showSuccessAnimation === 'function') showSuccessAnimation();
                if (successText && typeof showToast === 'function') showToast(successText);
            }

            // пользовательский коллбэк (закрытие модалки, очистка формы)
            // ловим ошибку чтобы не сломать перезагрузку данных
            if (typeof onSuccess === 'function') {
                try {
                    onSuccess(responseBody, conductError);
                } catch (e) {
                    console.error('[submitDocument] onSuccess failed:', e);
                }
            }

            // перезагружаем данные с сервера
            // в проекте функция называется loadGoodsData, а не loadData
            if (typeof loadGoodsData === 'function') {
                try {
                    loadGoodsData({ silent: true });
                } catch (e) {
                    console.error('[submitDocument] loadGoodsData failed:', e);
                }
            }
        }

        // снимаем спиннер и разблокируем крестик в самом конце
        if (btn) resetBtn(btn, btn.dataset.originalText || 'OK');
        if (closeBtn) closeBtn.disabled = false;
    }
}

function setBtnLoading(btn, text) {
    if (!btn) return
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent.trim()
    btn.disabled = true
    btn.textContent = text
    btn.classList.add('btn-loading')
}

function resetBtn(btn, text) {
    if (!btn) return
    btn.disabled = false
    btn.textContent = text || btn.dataset.originalText || 'OK'
    btn.classList.remove('btn-loading')
}