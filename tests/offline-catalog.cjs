const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// проверяем загрузку порциями и поиск после отключения сети
(async () => {
    const data = new Map();
    const requests = [];
    const navigator = {onLine: true};
    const localDB = {
        load: async key => data.get(key),
        save: async (key, value) => data.set(key, structuredClone(value)),
        commitCatalog: async (key, value) => {
            data.set(key, structuredClone(value));
            data.delete(key + ':pending');
        }
    };
    const item = (code, barcodes = []) => ({id: code, code, name: 'Кабель ' + code, barcodes, stock_locations: []});
    let interrupted = true;
    let rejectPage = false;
    let secondPageRemoved = false;
    const reused = [];
    const box = {classList:{add(){},remove(){}},dataset:{}};
    const ctx = vm.createContext({
        AbortController, setTimeout, clearTimeout, navigator, localDB,
        apiBase: 'http://store', APP_CONFIG:{loadTimeoutMs:100,pageSize:60}, currentUser:{id:'a'},
        document:{getElementById:()=>box}, goodsData:[], goodsIndexBuilt:false, goodsByCode:new Map(), goodsByBarcode:new Map(),
        isLoading:false, renderStatus(){}, setConnectionStatus(){}, showToast(){},
        rememberRecentSearch(){}, goodsCardHtml: row => row.name, fmt:String, escapeHtml:String,
        async fetchFrom1C(url) {
            const params = new URL(url).searchParams;
            const cursor = params.get('cursor');
            requests.push(cursor);
            if (cursor && rejectPage) return {ok:false,status:500};
            if (cursor && interrupted) throw new Error('disconnected');
            const page = cursor
                ? {schema:1, items:[item('2',['12345678','87654321'])], next_cursor:''}
                : {schema:1, items:[item('1')], next_cursor:secondPageRemoved ? '' : '1'};
            page.fingerprint = cursor ? 'page-two' : secondPageRemoved ? 'page-one-short' : 'page-one';
            if (params.get('fingerprint') === page.fingerprint) {
                delete page.items;
                page.unchanged = true;
                reused.push(cursor);
            }
            return {ok:true,json:async()=>page};
        }
    });
    for (const file of ['javascript/app/load.js','javascript/features/search.js']) {
        vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
    }

    await ctx.loadGoodsData({silent:true});
    assert.equal(data.has('catalog:v1:a'), false);
    assert.equal(data.get('catalog:v1:a:pending').cursor, '1');
    interrupted = false;
    await ctx.loadGoodsData();
    assert.deepEqual(requests, ['', '1', '1']);
    assert.equal(data.get('catalog:v1:a').items.length, 2);
    rejectPage = true;
    const failedPage = await ctx.loadGoodsData({manual:true,silent:true});
    assert.equal(failedPage.kind, 'http');
    assert.equal(failedPage.status, 500);
    assert.equal(failedPage.cursor, '1');
    assert.deepEqual(reused, ['']);
    assert.equal(data.get('catalog:v1:a:pending').cursor, '1');
    assert.equal(data.get('catalog:v1:a').items.length, 2);
    rejectPage = false;
    await ctx.searchGoodsByBarcode('87654321');
    assert.match(box.innerHTML, /Кабель 2/);
    interrupted = true;
    await ctx.loadGoodsData({manual:true,silent:true});
    assert.equal(ctx.goodsData.length, 2);
    assert.equal(data.get('catalog:v1:a').items.length, 2);
    navigator.onLine = false;
    await ctx.runGoodsSearch('Кабель');
    assert.match(box.innerHTML, /Кабель 1.*Кабель 2/s);
    navigator.onLine = true;
    interrupted = false;
    await ctx.loadGoodsData({manual:true,silent:true});
    assert.ok(reused.includes('1'));
    secondPageRemoved = true;
    await ctx.loadGoodsData({manual:true,silent:true});
    assert.deepEqual(Array.from(ctx.goodsData, product => product.code), ['1']);
    assert.equal(data.get('catalog:v1:a').items.length, 1);
    console.log('PASS: catalog resume, complete snapshot, alternate barcode, offline search, failed refresh preserves data');
})().catch(error => { console.error(error); process.exitCode = 1; });
