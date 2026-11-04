const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const data=new Map(); const ctx=vm.createContext({currentUser:{id:'a'},localStorage:{setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},readJsonSafe:(k,f)=>data.has(k)?JSON.parse(data.get(k)):f,shipmentLoading:false,shipmentItems:[],shipmentRequestId:'retry-id',showToast(){},fmt:String,money:String,document:{getElementById:()=>null}});
for(const p of ['javascript/features/recentSearches.js','javascript/features/shipmentDraft.js'])vm.runInContext(fs.readFileSync(p,'utf8'),ctx);
ctx.rememberRecentSearch('ка');ctx.rememberRecentSearch('кабель');
assert.deepEqual(Array.from(ctx.readRecentSearches()),['кабель']);
ctx.shipmentItems=[{code:'007',qty:5,maxQty:10,price:2}];ctx.saveShipmentDraft();
ctx.shipmentItems=[{code:'007',qty:0,maxQty:10,price:2}];ctx.restoreShipmentDraft();assert.equal(ctx.shipmentItems[0].qty,5);
ctx.shipmentItems=[{code:'007',qty:0,maxQty:2,price:2}];ctx.restoreShipmentDraft();assert.equal(ctx.shipmentItems[0].qty,2);
ctx.currentUser={id:'b'};ctx.shipmentItems=[{code:'007',qty:0,maxQty:10}];ctx.restoreShipmentDraft();assert.equal(ctx.shipmentItems[0].qty,0);assert.equal(ctx.readRecentSearches().length,0);
const details=ctx.shipmentResultDetails({doc_number:'123',sum:10,doc_date:'2026-10-30'},[{qty:5,price:2}],'test');assert(details.some(s=>s.includes('123')));assert(details.some(s=>s.includes('test')));
// дробный черновик восстанавливается точно и ограничивается дробным остатком
ctx.currentUser={id:'a'};ctx.shipmentItems=[{code:'007',qty:1.25,maxQty:2.5}];ctx.saveShipmentDraft();
ctx.shipmentItems=[{code:'007',qty:0,maxQty:2.5}];ctx.restoreShipmentDraft();assert.equal(ctx.shipmentItems[0].qty,1.25);
ctx.shipmentItems=[{code:'007',qty:0,maxQty:0.75}];ctx.restoreShipmentDraft();assert.equal(ctx.shipmentItems[0].qty,0.75);
ctx.currentUser={id:'a'};ctx.clearShipmentDraft();assert(!data.has('shipmentDraft:a'));

// проверяет представление цен, безопасную подсветку и календарные даты без зависимости от текущего дня
const presentation = vm.createContext({Intl,Date});
vm.runInContext(fs.readFileSync('javascript/core/utils.js','utf8'),presentation);
assert.equal(presentation.money(54.8),'54,80');
assert.equal(presentation.money(249),'249,00');
assert.equal(presentation.highlightText('<b>Кабель</b>','кабель'),'&lt;b&gt;<mark>Кабель</mark>&lt;/b&gt;');
assert.equal(presentation.highlightText('a+b a+b','a+b'),'<mark>a+b</mark> <mark>a+b</mark>');
const referenceDate = Date.parse('2026-11-03T10:00:00Z');
assert.equal(presentation.formatInvoiceDate('2026-11-03 09:24:00',null,referenceDate),'Сьогодні, 09:24');
assert.equal(presentation.formatInvoiceDate('2026-11-02 23:45:00',null,referenceDate),'Вчора, 23:45');
assert.equal(presentation.formatInvoiceDate('2026-10-30 10:24:00',null,referenceDate),'30.10.2026, 10:24');
assert.equal(presentation.formatInvoiceDate('2026-02-30 10:00:00',null,referenceDate),'Дата не вказана');

console.log('PASS: recent queries, draft restore, stock changes, user isolation, receipt fields, draft cleanup, prices, safe highlights, calendar dates');
