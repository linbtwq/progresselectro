const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = p => fs.readFileSync(p, 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
function context(extra = {}) {
    const c = vm.createContext({ console, AbortController, setTimeout, clearTimeout, ...extra });
    c.run = code => vm.runInContext(code, c);
    c.read = p => c.run(source(p));
    return c;
}
(async () => {
    for (const file of fs.readdirSync('javascript', {recursive:true}).filter(f => f.endsWith('.js'))) new vm.Script(source('javascript/' + file));
    for (const file of ['sw.js', 'version.js']) new vm.Script(source(file));
    const box = {innerHTML:'', dataset:{}, scrollTop:0, querySelector:()=>({remove(){}}), insertAdjacentHTML(_, html){this.innerHTML += html;}};
    const c = context({ navigator:{onLine:true}, rememberRecentSearch(){}, renderRecentSearches(){}, readJsonSafe:()=>[], localDB:{save:async()=>{}}, APP_CONFIG:{pageSize:60,loadTimeoutMs:100}, document:{getElementById:()=>box}, goodsData:[], goodsIndexBuilt:false, goodsByCode:new Map(), goodsByBarcode:new Map(), escapeHtml:String,highlightText:String, fmt:String,money:String, emptyStateHtml:String, showToast(){}, apiBase:'test', currentUser:{id:'a'} });
    c.read('javascript/app/load.js'); c.read('javascript/features/goods-card.js'); c.read('javascript/features/search.js');
    c.goodsData = Array.from({length:301}, (_,i)=>({id:String(i),code:String(i),name:'wire',price:1}));
    assert.equal(c.localSearchGoods('wire').length,301);
    c.renderGoodsResults(c.goodsData,'wire',false);
    assert.equal((box.innerHTML.match(/goods-card/g)||[]).length,60);
    while(c.run('_goodsShown < _goodsResults.length')) c.showMoreGoods();
    assert.equal((box.innerHTML.match(/goods-card/g)||[]).length,301);
    assert(!box.innerHTML.includes('data-action="catalog"'));
    const pending = deferred(); c.fetchWithTimeout=()=>pending.promise;
    c.goodsData=[]; box.classList={add(){},remove(){}};
    const search=c.searchGoodsByBarcode('12345678');
    await c.runGoodsSearch('');
    pending.resolve({ok:true,json:async()=>[{code:'old',name:'old'}]}); await search;
    assert.equal(box.innerHTML,'');
    const load = deferred(); let saves=0;
    Object.assign(c,{isLoading:false,reloadQueued:false,showTopProgress(){},hideTopProgress(){},localDB:{load:async()=>null,save:async()=>{saves++;}},fetchWithTimeout:()=>load.promise,setConnectionStatus(){},renderStatus(){}});
    const loading = c.loadGoodsData(); await Promise.resolve(); await Promise.resolve();
    c.cancelGoodsLoad(); c.currentUser=null;
    load.resolve({ok:true,json:async()=>[{code:'old',name:'old'}]}); await loading;
    assert.equal(c.goodsData.length,0); assert.equal(saves,0);
    const camera=deferred(); let stopped=0,plays=0;
    const overlay={classList:{contains:()=>false,add(){},remove(){}}};
    const video={pause(){},play(){plays++;return Promise.resolve();}};
    const sc=context({document:{getElementById:id=>id==='scannerVideo'?video:overlay,addEventListener(){}},window:{BarcodeDetector:class {}},navigator:{mediaDevices:{getUserMedia:()=>camera.promise}}});
    sc.read('javascript/scanner.js');
    const opening=sc.openBarcodeScanner(); sc.closeBarcodeScanner();
    camera.resolve({getTracks:()=>[{stop(){stopped++;}}]}); await opening;
    assert.equal(stopped,1); assert.equal(plays,0);
    const focus=context({_isFormField:()=>true,document:{activeElement:{},getElementById:id=>id==='goodsSearch'?{value:'wire'}:{}},runGoodsSearch:q=>assert.equal(q,'')});
    focus.read('javascript/ui/focus.js'); focus.getTopModal=()=>null;
    focus.onKeyDown({key:'Escape',preventDefault(){}});
    const scripts=[...source('index.html').matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(scripts.filter(p=>!source('sw.js').includes("'./"+p+"'")),[]);
    assert(source('javascript/app/events.js').includes("addEventListener('click', submitShipment)"));
    const orderElements = new Map();
    const orderElement = id => {
        if (!orderElements.has(id)) {
            const classes = new Set();
            orderElements.set(id, {classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},
                addEventListener(){},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[]});
        }
        return orderElements.get(id);
    };
    orderElement('shipmentSearch').value = '';
    orderElement('shipmentEmpty').querySelector = selector => orderElement(selector);
    const orderRequests = [];
    let quantityOpened = false;
    const order = context({currentUser:{id:'a'},document:{body:orderElement('body'),getElementById:orderElement,querySelector:()=>({})},
        rememberFocus(){},restoreShipmentDraft(){},saveShipmentDraft(){},newRequestId:()=> 'order-id',
        openBarcodeScanner(){},openQuantityKeyboard(){quantityOpened=true;},renderProductRow:()=>'',fmt:String,money:String,
        remoteSearchGoods(query,signal,barcode,endpoint) {
            const request = deferred();
            orderRequests.push({query,signal,barcode,endpoint,resolve:request.resolve});
            return request.promise;
        }});
    order.read('javascript/shipment.js');
    order.openShipmentModal();
    assert.equal(orderRequests.length,0);
    assert.equal(orderElement('shipmentEmpty').hidden,true);
    assert.equal(orderElement('shipmentFooter').hidden,true);
    assert(orderElement('shipmentBody').innerHTML.includes('shipmentScanBtn'));
    order.run("shipmentItems=[{code:'1',name:'Обране',qty:1.25,price:2,maxQty:3}]");
    order.updateShipmentSummary();
    assert.equal(orderElement('shipmentFooter').hidden,false);
    const oldOrderSearch = order.runShipmentSearch('старый');
    const scannedOrderSearch = order.searchShipmentByBarcode('4820000001234');
    assert.equal(orderRequests[0].signal.aborted,true);
    assert.equal(orderRequests[1].endpoint,'customer-order');
    assert.equal(orderRequests[1].barcode,true);
    orderRequests[1].resolve({items:[{Code:'2',Name:'Знайдено',price:3,quantity:4}]});
    await scannedOrderSearch;
    orderRequests[0].resolve({items:[{Code:'3',Name:'Старий',price:5,quantity:6}]});
    await oldOrderSearch;
    assert.equal(quantityOpened,true);
    assert.equal(order.run("shipmentItems.find(item=>item.code==='1').qty"),1.25);
    assert.equal(order.run("shipmentItems.some(item=>item.code==='3')"),false);
    console.log('PASS: syntax, pagination, stale responses, logout, scanner lifecycle, modal keys, offline assets, instant order opening, scoped barcode lookup, selected positions');
})().catch(error=>{console.error(error);process.exitCode=1;});
