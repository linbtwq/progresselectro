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
    const cable = {code:'1012', name:'Кабель', stock:0};
    const cut = {quantity:200, price:10.71, organization_id:'org', store_id:'store', variant:'Кусок №2'};
    assert.match(c.goodsCardHtml({...cable, stockLocations:[{...cut, variant_id:'cut-2'}, {...cut, quantity:40}]}, 0, '', 2), /Всього 240 · До замовлення 200[\s\S]*У замовленні: 2/);
    assert.match(c.goodsCardHtml({...cable, stockLocations:[cut]}), /Залишок є в 1С/);
    assert.match(c.goodsCardHtml({...cable, stockLocations:[]}), /Немає в наявності/);
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
    const scanned = {code:'1012'};
    const scanResults = {dataset:{}, querySelector:()=>box};
    let opened;
    Object.assign(sc, {
        currentUser:{id:'a'}, _searchSeq:1, getTopModal:()=>null,
        searchGoodsByBarcode:async()=>[scanned],
        openGoodsDetails:async (...args)=>{ opened=args; }
    });
    sc.document.getElementById = () => scanResults;
    sc.document.querySelector = () => null;
    await sc.handleBatchBarcode('12345678');
    assert.deepEqual(opened,[scanned,box,true]);
    sc.searchGoodsByBarcode = async () => [scanned, {code:'1013'}];
    sc.showToast = () => {};
    await sc.handleBatchBarcode('12345678');
    assert.equal(scanResults.dataset.scanSelection,'1');
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
    let selectedPage;
    let savedQuantity;
    const order = context({currentUser:{id:'a'},navigator:{onLine:false},document:{getElementById:orderElement},
        newRequestId:()=> 'order-id', selectWorkspacePage:id=>{ selectedPage = id; },
        goodsPhotoHtml:()=>'',escapeHtml:String,money:String});
    order.read('javascript/shipment.js');
    order.read('javascript/features/shipmentDraft.js');
    order.restoreShipmentDraft = () => order.run("shipmentItems=[{code:'1',name:'Обране',qty:1.25,price:2,maxQty:3}]");
    order.saveShipmentDraft = () => { savedQuantity = order.run('shipmentItems[0]?.qty'); };
    order.openShipmentPage();
    assert.equal(selectedPage, 'shipmentPage');
    assert.equal(orderElement('shipmentStart').hidden,true);
    assert.equal(orderElement('shipmentFooter').hidden,false);
    assert(orderElement('shipmentGrid').innerHTML.includes('Обране'));
    assert.equal(savedQuantity,1.25);
    order.run('shipmentItems=[]');
    order.refreshShipmentRows();
    assert.equal(orderElement('shipmentStart').hidden,false);
    assert.equal(orderElement('shipmentFooter').hidden,true);
    console.log('PASS: syntax, pagination, stale responses, logout, scanner lifecycle, modal keys, offline assets, order page, restored positions, empty order');
})().catch(error=>{console.error(error);process.exitCode=1;});
