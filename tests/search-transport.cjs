const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// проверяет транспорт поиска без обращения к серверу и изменения документов
(async () => {
    const ctx = vm.createContext({AbortController,setTimeout,clearTimeout,console,APP_CONFIG:{loadTimeoutMs:30},navigator:{onLine:true},currentUser:{id:'test'},apiBase:'test'});
    vm.runInContext(fs.readFileSync('javascript/features/search.js','utf8'),ctx);
    let calls=0;
    ctx.fetchWithTimeout=async()=>{calls++;return calls===1?{ok:false,status:503}:{ok:true,json:async()=>({items:[{code:'1'}]})};};
    assert.equal((await ctx.remoteSearchGoods('4',new AbortController().signal)).items.length,1);
    assert.equal(calls,2);
    calls=0;ctx.fetchWithTimeout=async()=>{calls++;return {ok:false,status:401};};
    await assert.rejects(ctx.remoteSearchGoods('4'),error=>error.status===401);assert.equal(calls,1);
    // зависшее тело ответа должно завершиться таймаутом даже после получения заголовков
    calls=0;ctx.fetchWithTimeout=async()=>{calls++;return {ok:true,json:()=>new Promise(()=>{})};};
    await assert.rejects(ctx.remoteSearchGoods('4'),error=>error.code==='timeout');assert.equal(calls,2);
    // новый ввод отменяет чтение json без перехода к сохраненной выдаче
    const controller=new AbortController();calls=0;
    const bodyPending=ctx.remoteSearchGoods('old',controller.signal);
    controller.abort();await assert.rejects(bodyPending,error=>error.name==='AbortError');assert.equal(calls,1);
    // отмена во время паузы запрещает запланированный повтор
    calls=0;ctx.fetchWithTimeout=async()=>{calls++;return {ok:false,status:503};};
    const retryController=new AbortController();const retryPending=ctx.remoteSearchGoods('old',retryController.signal);
    await new Promise(resolve=>setTimeout(resolve,10));retryController.abort();
    await assert.rejects(retryPending,error=>error.name==='AbortError');assert.equal(calls,1);
    // поврежденные элементы не доходят до отрисовки карточек
    ctx.fetchWithTimeout=async()=>({ok:true,json:async()=>({items:[null]})});
    await assert.rejects(ctx.remoteSearchGoods('4'),/Некоректний товар/);
    let url;ctx.fetchWithTimeout=async value=>{url=value;return {ok:true,json:async()=>[]};};
    await ctx.remoteSearchGoods('12345678',undefined,true);assert(url.includes('barcode=12345678'));
    ctx.fetchWithTimeout=async value=>{url=value;return {ok:true,json:async()=>({
        items:[], organization:'Магазин', store:'Прогрес Електро', matched_count:1,
        unavailable_reason:'stock', stock_locations:[{organization:'Інша організація', quantity:1}]
    })};};
    const availability=await ctx.remoteSearchGoods('35052',undefined,false,'customer-order',true);
    assert(url.includes('/customer-order?') && url.includes('q=35052&exact=1'));
    assert.equal(availability.organization,'Магазин');
    assert.equal(availability.unavailableReason,'stock');
    assert.equal(availability.stockLocations[0].organization,'Інша організація');
    console.log('PASS: search retry, HTTP rejection, body timeout, abort during body and retry, invalid items, barcode route');
})().catch(error=>{console.error(error);process.exitCode=1;});
