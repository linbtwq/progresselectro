// ============================================================
// javascript/app/sync.js
//
// назначение
// синхронизация офлайн-очереди с сервером.
// сейчас очередь всегда пуста, поэтому файл работает вхолостую.
// это заготовка на будущее - когда появится отправка документов
// (заказы, списания, показания), сюда будут попадать записи.
//
// ответственность
// - пройти по очереди и попробовать отправить каждую запись
// - при 409 считать что сервер уже видел запись и не создавать дубль
// - при серии ошибок перенести запись в список отклоненных
// - снимать локальные блокировки после успешной отправки
// - рассчитывать паузу до следующей попытки по экспоненте
//
// зависимости
// - core/api.js дает postJson, newRequestId
// - core/queue.js дает readQueue, saveQueue, readFailed, saveFailed, unlockPoint
// - core/locks.js дает markSynced, lockPoint, invalidateLockSnapshot
// - core/state.js дает isSyncing, retryAttempt, retryTimer, lastSyncError
// - ui/status.js дает setConnectionStatus, renderStatus
// - ui/toast.js дает showToast
// - app/load.js дает loadGoodsData
// ============================================================

// ============================================================
// блок 1. прогон очереди
// ============================================================

async function runSync({ manual, quiet }) {
    const queue = readQueue()
    if (queue.length === 0) return

    // добавляем ключ защиты старым записям без него
    let queueChanged = false
    for (const p of queue) {
        if (!p.request_id) {
            p.request_id = newRequestId()
            queueChanged = true
        }
    }
    if (queueChanged) saveQueue(queue)

    if (!quiet) showToast(`Відправка записів із черги: ${queue.length}...`)

    const done = new Set()
    const dropped = []
    let sentCount = 0
    let netFail = false
    let serverError = ''

    for (const payload of queue) {
        try {
            const response = await postJson('meters', payload)

            // 409 значит 1с уже видела эту запись раньше, считаем успехом
            if (response.ok || response.status === 409) {
                markSynced(payload.point_id)
                done.add(payload.request_id)
                sentCount++
                setConnectionStatus(true)
            } else {
                const body = (await response.text().catch(() => '')).slice(0, 160)
                serverError = `1С відповіла ${response.status}${body ? ': ' + body : ''}`
                console.warn('[sync] помилка сервера:', response.status, body, payload)

                payload.attempts = (payload.attempts || 0) + 1
                payload.lastError = serverError

                if (payload.attempts >= MAX_QUEUE_ATTEMPTS) {
                    dropped.push(payload)
                    done.add(payload.request_id)
                }
            }
        } catch (err) {
            netFail = true
            console.warn('[sync] немає зв\'язку з 1С:', err.message)
            setConnectionStatus(false)
            continue
        }
    }

    // отклоненные записи перекладываем в failed, не теряем
    if (dropped.length) {
        const failed = readFailed()
        for (const p of dropped) {
            failed.push({ payload: p, error: p.lastError || '', at: Date.now() })
        }
        saveFailed(failed)
    }

    // оставляем в очереди только те что не ушли
    const byId = new Map(queue.map(p => [p.request_id, p]))
    const rest = readQueue()
        .filter(p => !done.has(p.request_id))
        .map(p => byId.get(p.request_id) || p)
    saveQueue(rest)

    for (const p of dropped) {
        if (!rest.some(r => String(r.point_id) === String(p.point_id))) unlockPoint(p.point_id)
    }
    invalidateLockSnapshot()

    lastSyncError = rest.length ? (netFail ? 'немає зв\'язку з 1С' : serverError) : ''
    if (sentCount) retryAttempt = 0

    // показываем результат
    // функция называется loadGoodsData, а не loadData
    if (dropped.length) {
        showToast(`1С відхилила записів: ${dropped.length}. Натисніть на статус зв'язку.`, true)
    } else if (sentCount && rest.length === 0) {
        showToast('Усі записи з черги відправлені в 1С.')
        loadGoodsData({ silent: true })
    } else if (sentCount) {
        showToast(`Відправлено: ${sentCount}, залишилось: ${rest.length}`, true)
    } else if (rest.length && !quiet) {
        showToast(`Не відправлено: ${rest.length}. ${lastSyncError || 'немає зв\'язку з 1С'}`, true)
    }

    if (sentCount && rest.length === 0 && dropped.length) loadGoodsData({ silent: true })
}

// ============================================================
// блок 2. публичная обертка синхронизации
// ============================================================

async function syncOfflineMeters(opts) {
    const manual = !!(opts && opts.manual === true)
    const quiet = !!(opts && opts.quiet === true)

    if (isSyncing) {
        if (manual) showToast('Відправка вже йде...')
        return
    }

    isSyncing = true
    try { await runSync({ manual, quiet }) }
    finally {
        isSyncing = false
        renderStatus()
        scheduleSyncRetry()
    }
}

// ============================================================
// блок 3. планирование повторной попытки
//
// экспоненциальная задержка от пяти секунд до syncRetrySeconds.
// если очередь пуста таймер не ставим.
// ============================================================

function scheduleSyncRetry() {
    clearTimeout(retryTimer)

    if (readQueue().length === 0) {
        retryAttempt = 0
        return
    }

    const max = APP_CONFIG.syncRetrySeconds * 1000
    const delay = Math.min(5000 * Math.pow(2, retryAttempt), max)
    retryAttempt++

    retryTimer = setTimeout(() => syncOfflineMeters({ quiet: true }), delay)
}

// ============================================================
// блок 4. офлайн-сохранение
//
// кладет запись в очередь и блокирует точку.
// сейчас не используется, но пригодится когда появится отправка.
// ============================================================

function saveOffline(payload) {
    const queue = readQueue().slice()
    queue.push(payload)
    saveQueue(queue)

    lockPoint(payload.point_id, true)
    invalidateLockSnapshot()

    showToast('Немає зв\'язку з 1С. Збережено на пристрої, відправимо автоматично.', true)

    retryAttempt = 0
    setConnectionStatus(false)
    scheduleSyncRetry()
}