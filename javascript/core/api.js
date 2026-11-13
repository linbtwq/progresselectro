// ============================================================
// javascript/core/api.js
// ============================================================

// в браузере используем fetch, на android запрос идет через capacitor
function fetchFrom1C(url, options = {}) {
    const endpoint = new URL(url, location.href);
    if (window.Capacitor?.getPlatform() === 'android') return fetchFromAndroid(endpoint, options);
    const local = endpoint.protocol === 'http:' && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(endpoint.hostname);
    return fetch(url, local ? {...options, targetAddressSpace: 'local'} : options);
}

async function fetchFromAndroid(endpoint, {method = 'GET', headers, body, signal} = {}) {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    const binary = endpoint.searchParams.has('photo');
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const abort = () => rejectAbort(new DOMException('Request aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, {once:true});
    try {
        const result = await Promise.race([aborted, window.Capacitor.Plugins.CapacitorHttp.request({
            url: endpoint.href, method, headers, data: body,
            responseType: binary ? 'arraybuffer' : 'text',
            connectTimeout: APP_CONFIG.loadTimeoutMs,
            readTimeout: APP_CONFIG.sendTimeoutMs,
            disableRedirects: true
        })]);
        // приводим ответ android к обычному Response, фото возвращаем байтами
        const empty = [204, 205, 304].includes(result.status);
        const content = empty ? null : binary && result.status < 400
            ? Uint8Array.from(atob(result.data), character => character.charCodeAt(0))
            : typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
        return new Response(content, {status:result.status, headers:result.headers});
    } finally {
        signal?.removeEventListener('abort', abort);
    }
}

async function fetchWithTimeout(url, options = {}, ms = APP_CONFIG.loadTimeoutMs) {
    const ctrl = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
        timedOut = true
        ctrl.abort()
    }, ms)

    if (options.signal) {
        if (options.signal.aborted) {
            ctrl.abort()
        } else {
            options.signal.addEventListener('abort', () => ctrl.abort(), { once: true })
        }
    }

    try {
        return await fetchFrom1C(url, { ...options, signal: ctrl.signal })
    } catch (err) {
        if (err.name === 'AbortError' && timedOut) throw new Error('Failed to fetch (timeout)')
        throw err
    } finally {
        clearTimeout(timer)
    }
}

const newRequestId = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

const postJson = (path, payload) => fetchWithTimeout(
    `${apiBase}/${path}?v=${APP_CONFIG.apiVersion}`,
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(typeof currentUser !== 'undefined' && currentUser
                ? { 'X-User-Code': currentUser.id }
                : {})
        },
        body: JSON.stringify(payload)
    },
    APP_CONFIG.sendTimeoutMs
)

let _topProgressHideTimer = null

function showTopProgress() {
    const el = document.getElementById('topProgress')
    if (!el) return
    el.classList.remove('active')
    void el.offsetWidth
    el.classList.add('active')
}

function hideTopProgress() {
    const el = document.getElementById('topProgress')
    if (!el) return
    clearTimeout(_topProgressHideTimer)
    _topProgressHideTimer = setTimeout(() => el.classList.remove('active'), 1800)
}
