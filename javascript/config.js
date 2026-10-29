// ============================================================
// javascript/config.js
//
// назначение
// единая точка настроек приложения.
//
// ответственность
// - адрес сервиса 1с
// - таймауты сетевых запросов
// - параметры кеша и автообновления
//
// про apiBase
// пока стоит адрес от старого проекта coffee-meters.
// когда появится свой сервис для прогреса - поменять здесь.
// можно переопределить в консоли через localStorage.setItem('apiBaseOverride', '...'),
// но это только для отладки, в проде должно быть твёрдое значение.
//
// зависимости
// подключается первым, до всего остального.
// state.js читает отсюда apiBase и lockMode.
// ============================================================

// адрес по умолчанию, пока заглушка от старого проекта
const _RAW_API_BASE_DEFAULT = 'https://api.coffeemeters.pp.ua/siteapinew/hs/siteapi';

// проверяет есть ли переопределение адреса в localstorage
// удобно когда нужно переключиться на тестовый сервер без пересборки
function resolveApiBase() {
    try {
        const override = localStorage.getItem('apiBaseOverride');
        if (override && /^https?:\/\/.+/i.test(override)) {
            return override.replace(/\/+$/, '');
        }
    } catch (e) {}
    return _RAW_API_BASE_DEFAULT;
}

const _RAW_API_BASE = resolveApiBase();

const APP_CONFIG = {
    // адрес сервиса 1с без завершающего слеша
    apiBase: _RAW_API_BASE,

    // версия api, добавляется к запросам как ?v=
    apiVersion: '1.0',

    // таймаут загрузки справочника
    // справочник большой поэтому даем запас
    loadTimeoutMs: 15000,

    // таймаут отправки документа
    sendTimeoutMs: 20000,

    // пауза между попытками синхронизации очереди
    syncRetrySeconds: 30,

    // режим блокировки точки после сдачи показаний
    // endOfDay - до полуночи, hours - на lockHours часов
    // сейчас не используется в прогрес электро, оставлено на будущее
    lockMode: 'endOfDay',
    lockHours: 12,

    // автоматический выход после успешной отправки
    // сейчас не используется, оставлено на будущее
    autoLogoutAfterSubmit: false,

    // сколько карточек показывать за один раз
    pageSize: 60,

    // через сколько минут автообновление данных
    refreshAfterMinutes: 5
};

if (!APP_CONFIG.apiVersion) APP_CONFIG.apiVersion = '1.0';