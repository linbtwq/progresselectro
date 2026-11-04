const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// воспроизводит ошибки сервера без сетевых запросов и проверяет честную подпись кеша
(async () => {
    let toasts = 0;
    const box = {innerHTML:'', dataset:{}, classList:{add(){},remove(){}}, insertAdjacentHTML(position, html){this.innerHTML = position === 'afterbegin' ? html + this.innerHTML : this.innerHTML + html;}};
    const context = vm.createContext({AbortController, setTimeout, clearTimeout, console:{warn(){}},
        APP_CONFIG:{pageSize:60}, currentUser:null, apiBase:'test', navigator:{onLine:true},
        goodsData:[{code:'1',name:'кабель'}], document:{getElementById:()=>box},
        normalizeGoods:item=>item, rememberRecentSearch(){}, renderRecentSearches(){},
        escapeHtml:String, fmt:String, goodsCardHtml:()=>'<article>кабель</article>', emptyStateHtml:text=>text,
        showToast(){toasts++;}, fetchWithTimeout:async()=>({ok:false,status:500})});
    vm.runInContext(fs.readFileSync('javascript/features/search.js','utf8'),context);
    await context.runGoodsSearch('ка');
    await context.runGoodsSearch('кабель');
    assert.equal(toasts,0);
    assert(box.innerHTML.includes('Не вдалося оновити пошук'));
    assert(!box.innerHTML.includes('Офлайн'));
    assert(!box.innerHTML.includes('results-end'));
    await context.runGoodsSearch('відсутній');
    assert(box.innerHTML.includes('Повний пошук зараз недоступний'));
    context.navigator.onLine=false;
    await context.runGoodsSearch('кабель');
    assert(box.innerHTML.includes('Немає мережі'));
    context.navigator.onLine=true;
    context.fetchWithTimeout=async()=>({ok:true,json:async()=>null});
    await context.runGoodsSearch('кабель');
    assert(box.innerHTML.includes('Не вдалося оновити пошук'));
    context.fetchWithTimeout=async()=>({ok:true,json:async()=>({items:[{code:'1',name:'кабель'}]})});
    await context.runGoodsSearch('кабель');
    assert(!box.innerHTML.includes('search-source-note'));
    assert(box.innerHTML.includes('results-end'));
    context.renderGoodsResults=()=>{throw new Error('render failure');};
    await assert.rejects(context.runGoodsSearch('кабель'),/render failure/);
    assert.equal(toasts,0);
    console.log('PASS: server error, offline, empty cache matches, invalid response, recovery, render errors, no repeated toasts');
})().catch(error=>{console.error(error);process.exitCode=1;});
