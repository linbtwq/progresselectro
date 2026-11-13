const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// подменяем capacitor, чтобы проверить ответы 1с без телефона
(async () => {
    const calls = [];
    const ctx = vm.createContext({
        AbortController, DOMException, URL, Response, atob,
        location: {href: 'https://localhost/'},
        APP_CONFIG: {loadTimeoutMs: 100, sendTimeoutMs: 100},
        window: {Capacitor: {getPlatform: () => 'android', Plugins: {
            CapacitorHttp: {request(options) {
                calls.push(options);
                if (options.url.includes('wait')) return new Promise(() => {});
                if (options.responseType === 'arraybuffer') {
                    return Promise.resolve({status:200, headers:{'Content-Type':'image/jpeg'}, data:'/9g='});
                }
                return Promise.resolve({status:200, headers:{'Content-Type':'application/json'}, data:{ok:true}});
            }}
        }}}
    });
    vm.runInContext(fs.readFileSync('javascript/core/api.js', 'utf8'), ctx);
    const base = 'http://192.168.1.23/BasePE/hs/progresselectrosite';
    const json = await ctx.fetchFrom1C(base + '/customer-order', {method:'POST', body:'{"items":[]}'});
    assert.equal((await json.json()).ok, true);
    assert.equal(calls[0].data, '{"items":[]}');
    assert.equal(calls[0].disableRedirects, true);
    const photo = await ctx.fetchFrom1C(base + '/goods?photo=1');
    const blob = await photo.blob();
    assert.equal(blob.type, 'image/jpeg');
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [255,216]);
    const controller = new AbortController();
    const pending = ctx.fetchFrom1C(base + '/wait', {signal:controller.signal});
    controller.abort();
    await assert.rejects(pending, {name:'AbortError'});
    console.log('PASS: Android native transport, JSON, photo bytes, cancellation');
})().catch(error => {console.error(error); process.exitCode = 1;});
