// App Logic moved to external script
// Service Worker registration and PWA install prompt handling
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(err => console.log('Service Worker registration failed:', err));
}

let deferredPrompt = null;
const installBtn = document.getElementById && document.getElementById('installBtn');
if (window.addEventListener) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.classList.remove('hidden');
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log(`User response to the install prompt: ${outcome}`);
          deferredPrompt = null;
          installBtn.classList.add('hidden');
        } catch (err) {
          console.log('Install prompt error:', err);
        }
      }
    });
  }

  window.addEventListener('appinstalled', () => {
    console.log('PWA installed successfully');
    deferredPrompt = null;
    if (installBtn) installBtn.classList.add('hidden');
  });
}

const API="https://api.gold-api.com/price/";
const FX="https://api.frankfurter.app/latest?from=USD&to=INR";
const OZ=31.1035,DUTY=1.06,GST=1.03;

let symbol="XAU",name="Gold",type="metal",mode="india",weight=1;
let dailyChart,monthlyChart;
let previousPrices={};
let storedPrices={};
let lastTrend = {};
let currentInrRate = null;
let isOnline = navigator.onLine;
let allMetalsPrices = {};
let lastUpdateTimestamp = null;

window.APP_DATA={goldPriceINR:null,lastUpdated:null};

function formatINR(v){
  return v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function updateDateTime(){
  const n=new Date();
  const el = document.getElementById('datetime');
  if (el) el.innerText = n.toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"})+" | "+n.toLocaleTimeString();
}

async function inr(){
  try {
    const res = await fetch(FX);
    const data = await res.json();
    currentInrRate = data.rates.INR;
    return currentInrRate;
  } catch (e) {
    console.warn('FX fetch failed', e);
    return currentInrRate || 82;
  }
}

async function usd(sym){
  const res = await fetch(API+sym);
  const data = await res.json();
  return data.price;
}

function setActive(c,b){c.querySelectorAll("button").forEach(x=>x.classList.remove("active"));b.classList.add("active");}

function updateStatLabels(){
  const usdLabel = document.getElementById('usdLabel');
  const inrLabel = document.getElementById('inrLabel');
  if(!usdLabel || !inrLabel) return;
  if(type === 'crypto'){
    usdLabel.innerText = 'Price (USD)';
    inrLabel.innerText = 'Price (INR)';
  } else {
    usdLabel.innerText = 'Price (1g in USD)';
    inrLabel.innerText = 'Price (1g in INR)';
  }
}

function renderWeights(){
  const wtg = document.getElementById('weightToggle');
  if(!wtg) return;
  wtg.innerHTML="";
  const wg = document.getElementById('weightGroup');
  
  if(type==="crypto"){
    if(wg) wg.style.display="none";
    return;
  }
  
  if(wg) wg.style.display="block";
  let o=[{v:1,t:"1 g"}];
  if(symbol==="XAU")o.push({v:8,t:"8 g"});
  if(symbol==="XAG")o.push({v:1000,t:"1 kg"});
  
  o.forEach(x=>{
    const b=document.createElement("button");
    b.textContent=x.t;
    if(weight===x.v)b.classList.add("active");
    b.onclick=()=>{weight=x.v;renderWeights();update();};
    wtg.appendChild(b);
  });
}

function storeDaily(price){
  if(mode!=="india" || type!=="metal" || weight!==1) return;
  const key="prices_"+symbol;
  const list=JSON.parse(localStorage.getItem(key)||"[]");
  const d=new Date().toISOString().split("T")[0];
  if(!list.find(x=>x.date===d)){
    list.push({date:d,price});
    localStorage.setItem(key,JSON.stringify(list));
  }
}

async function getSavedDailyPrices(sym) {
  try {
    const res = await fetch("./data/daily_prices.json");
    if (!res.ok) throw new Error('Failed to load prices');
    const data = await res.json();
    
    return Object.entries(data)
      .map(([date, prices]) => ({
        date,
        price: prices[sym.toLowerCase()]
      }))
      .filter(x => x.price !== undefined)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch (e) {
    console.warn('Could not load daily prices:', e.message);
    return [];
  }
}

async function renderCharts(){
  try {
    const data = await getSavedDailyPrices(symbol);
    if (data.length < 2) return;
    const labels = data.map(d => d.date.slice(5));
    const values = data.map(d => d.price);
    const dailyChartEl = document.getElementById('dailyChart');
    if (!dailyChartEl) return;
    const gradient = dailyChartEl.getContext('2d').createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0)');
    if (dailyChart) dailyChart.destroy();
    dailyChart = new Chart(dailyChartEl.getContext("2d"), {
      type: "line",
      data: { labels, datasets: [{ data: values, borderColor: "#22c55e", backgroundColor: gradient, fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: "#22c55e", pointBorderColor: "#fff", pointBorderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, filler: { propagate: true } }, scales: { x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,.05)" } }, y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(255,255,255,.05)" } } } }
    });
  } catch (err) {
    console.error('Error rendering charts:', err);
  }
}

function selectAsset(btn,s,n,t){
  setActive(document.getElementById('assetPills'),btn);
  symbol=s;name=n;type=t;weight=1;
  const assetName = document.getElementById('assetName'); if(assetName) assetName.innerText=n;
  const mg = document.getElementById('modeGroup'); if(mg) mg.style.display = t==="crypto"?"none":"block";
  const ps = document.getElementById('puritySection'); if(ps) ps.style.display = n==="Gold"?"grid":"none";
  updateStatLabels(); renderWeights(); update();
}

function setMode(btn,m){
  setActive(document.getElementById('modeToggle'),btn);
  mode=m; updateStatLabels(); update();
}

// Store price with date when user opens the site
function storeOpenPrice(price) {
  const key = symbol + "_stored";
  const priceData = { price: price, date: new Date().toISOString(), displayDate: new Date().toLocaleDateString(undefined, {weekday:"short", year:"numeric", month:"short", day:"numeric"}) };
  localStorage.setItem(key, JSON.stringify(priceData));
  storedPrices[key] = priceData;
}

function getStoredPrice() {
  const key = symbol + "_stored";
  const stored = localStorage.getItem(key);
  if (stored) {
    try { const data = JSON.parse(stored); storedPrices[key] = data; return data; } catch (e) { return null; }
  }
  return null;
}

// Fetch and cache ALL asset prices (metals + crypto) for both modes
async function fetchAndCacheAllMetals() {
  try {
    const r = await inr();
    const metals = ['XAU', 'XAG', 'XPT', 'XPD', 'HG'];
    const crypto = ['BTC', 'ETH'];
    const cacheData = { india: {}, spot: {} };
    for (const metal of metals) {
      const u = await usd(metal);
      const baseIndia = (u / OZ) * r * DUTY * GST;
      const baseSpot = (u / OZ) * r;
      cacheData.india[metal] = { usd: u, inr: r, base: baseIndia };
      cacheData.spot[metal] = { usd: u, inr: r, base: baseSpot };
      allMetalsPrices[metal] = { usd: u, inr: r, base: baseIndia };
    }
    for (const coin of crypto) {
      const u = await usd(coin);
      cacheData.india[coin] = { usd: u, inr: r, base: u * r };
      cacheData.spot[coin] = { usd: u, inr: r, base: u * r };
      allMetalsPrices[coin] = { usd: u, inr: r, base: u * r };
    }
    localStorage.setItem('allMetalsPrices', JSON.stringify(cacheData));
    localStorage.setItem('lastPriceUpdate', Date.now().toString());
    lastUpdateTimestamp = new Date();
  } catch (err) {
    console.error('Error fetching all metals:', err);
  }
}

async function update(){
  try {
    if (!isOnline) { loadFromCache(); return; }
    const loadingOverlay = document.getElementById('loadingOverlay'); if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    updateDateTime();
    const r = await inr();
    const u = await usd(symbol);
    let base = type === "crypto" ? u * r : ((u / OZ) * r * (mode === "india" ? DUTY * GST : 1));
    const v = base * weight;
    const priceEl = document.getElementById('price'); if(priceEl) priceEl.innerText = "₹ " + formatINR(v);

    // Cache per-symbol for both modes
    const cacheData = JSON.parse(localStorage.getItem('allMetalsPrices') || '{"india": {}, "spot": {}}');
    const baseIndia = type === "crypto" ? u * r : ((u / OZ) * r * (mode === "india" ? DUTY * GST : 1));
    const baseSpot = type === "crypto" ? u * r : ((u / OZ) * r);
    cacheData.india = cacheData.india || {};
    cacheData.spot = cacheData.spot || {};
    cacheData.india[symbol] = { usd: u, inr: r, base: baseIndia };
    cacheData.spot[symbol] = { usd: u, inr: r, base: baseSpot };
    localStorage.setItem('allMetalsPrices', JSON.stringify(cacheData));
    localStorage.setItem('lastPriceUpdate', Date.now().toString());
    lastUpdateTimestamp = new Date();

    // Update stat displays depending on type
    if (type === 'crypto'){
      const usdPriceEl = document.getElementById('usdPrice'); if(usdPriceEl) usdPriceEl.innerText = "$ " + (u).toFixed(2);
      const inrPriceEl = document.getElementById('inrPrice'); if(inrPriceEl) inrPriceEl.innerText = "₹ " + formatINR((u * r).toFixed(2));
    } else {
      const pricePerGramUSD = (u / OZ).toFixed(2);
      const pricePerGramINR = ((u / OZ) * r * (mode === "india" ? DUTY * GST : 1)).toFixed(2);
      const usdPriceEl = document.getElementById('usdPrice'); if(usdPriceEl) usdPriceEl.innerText = "$ " + pricePerGramUSD;
      const inrPriceEl = document.getElementById('inrPrice'); if(inrPriceEl) inrPriceEl.innerText = "₹ " + formatINR(pricePerGramINR);
    }

    // Update status
    const statusIndicator = document.getElementById('statusIndicator'); if(statusIndicator){ statusIndicator.textContent = '● Live - Online'; statusIndicator.style.color = 'var(--success)'; }
    const lastUpdateTime = document.getElementById('lastUpdateTime'); if(lastUpdateTime) lastUpdateTime.innerText = 'Updated just now';

    // delta only for India metal 1g
    const deltaEl = document.getElementById('delta'); if(deltaEl) deltaEl.innerText = '';
    if (mode === "india" && type === "metal" && weight === 1){
      const stored = getStoredPrice();
      if (stored && stored.price !== null){
        const diff = base - stored.price;
        const percentChange = ((diff / stored.price) * 100).toFixed(2);
        const priceElDom = document.getElementById('price');
        if (diff > 0){ if(priceElDom) priceElDom.classList.add('up'); deltaEl.classList.add('up'); deltaEl.innerText = `↑ +₹${formatINR(diff)} (${percentChange}%) from ${stored.displayDate}`; }
        else if (diff < 0){ if(priceElDom) priceElDom.classList.add('down'); deltaEl.classList.add('down'); deltaEl.innerText = `↓ -₹${formatINR(Math.abs(diff))} (${percentChange}%) from ${stored.displayDate}`; }
        else deltaEl.innerText = `— No change from ${stored.displayDate}`;
      } else deltaEl.innerText = '— Storing first price...';
      storeOpenPrice(base);
    }

    if(name === "Gold"){
      const k24 = document.getElementById('k24'); if(k24) k24.innerText = "₹ "+formatINR(v);
      const k22 = document.getElementById('k22'); if(k22) k22.innerText = "₹ "+formatINR(v*.916);
      const k18 = document.getElementById('k18'); if(k18) k18.innerText = "₹ "+formatINR(v*.75);
      window.APP_DATA.goldPriceINR = v.toFixed(2); window.APP_DATA.lastUpdated = new Date().toISOString();
    }

    storeDaily(base);
    await renderCharts();

    const loadingOverlay2 = document.getElementById('loadingOverlay'); if (loadingOverlay2) loadingOverlay2.classList.add('hidden');
  } catch (err) {
    console.error('Error during update:', err);
    const loadingOverlay = document.getElementById('loadingOverlay'); if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }
}

// Load prices from cache
function loadFromCache() {
  try {
    const cacheDataStr = localStorage.getItem('allMetalsPrices') || '{"india": {}, "spot": {}}';
    const cacheData = JSON.parse(cacheDataStr);
    const modeCache = cacheData[mode] || {};
    const lastUpdate = localStorage.getItem('lastPriceUpdate');
    
    if (modeCache[symbol]) {
      const { usd, base } = modeCache[symbol];
      const v = base * weight;
      const priceEl = document.getElementById('price'); if(priceEl) priceEl.innerText = "₹ " + formatINR(v);
      
      if (type === 'crypto'){
        const usdPriceEl = document.getElementById('usdPrice'); if(usdPriceEl) usdPriceEl.innerText = "$ " + (usd).toFixed(2);
        const inrPriceEl = document.getElementById('inrPrice'); if(inrPriceEl) inrPriceEl.innerText = "₹ " + formatINR(base);
      } else {
        const pricePerGramUSD = (usd / OZ).toFixed(2);
        const pricePerGramINR = base.toFixed(2);
        const usdPriceEl = document.getElementById('usdPrice'); if(usdPriceEl) usdPriceEl.innerText = "$ " + pricePerGramUSD;
        const inrPriceEl = document.getElementById('inrPrice'); if(inrPriceEl) inrPriceEl.innerText = "₹ " + formatINR(pricePerGramINR);
      }
      
      if (lastUpdate) {
        const date = new Date(parseInt(lastUpdate));
        const now = new Date();
        const diffMinutes = Math.floor((now - date) / 60000);
        const lastUpdateTime = document.getElementById('lastUpdateTime'); if(lastUpdateTime) lastUpdateTime.innerText = diffMinutes > 0 ? `Cached ${diffMinutes}m ago` : 'Just now';
      }
      
      if(name==="Gold"){
        const k24 = document.getElementById('k24'); if(k24) k24.innerText = "₹ "+formatINR(v);
        const k22 = document.getElementById('k22'); if(k22) k22.innerText = "₹ "+formatINR(v*.916);
        const k18 = document.getElementById('k18'); if(k18) k18.innerText = "₹ "+formatINR(v*.75);
      }
    }
    updateStatLabels();
  } catch (err) {
    console.error('Error loading from cache:', err);
  }
}

function copyToClipboard() {
  const priceText = document.getElementById('price') ? document.getElementById('price').innerText : '--';
  const text = `${name} Price: ${priceText}\n${new Date().toLocaleString()}`;
  navigator.clipboard.writeText(text).then(() => { alert('Copied to clipboard!'); });
}

function formatINRForPDF(value){
  return "Rs. " + value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDateTimeForPDF(){
  const d = new Date();
  return d.toLocaleDateString(undefined,{ weekday:"long", year:"numeric", month:"long", day:"numeric" }) + " | " + d.toLocaleTimeString();
}

async function exportToPDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFillColor(10, 14, 39); doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setFillColor(26, 31, 58); doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setDrawColor(255, 215, 0); doc.setLineWidth(1.5); doc.line(0, 40, pageWidth, 40);
  doc.setTextColor(255, 215, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text("PRECIOUS METALS PRICE TRACKER", pageWidth/2, 18, {align: 'center'});
  doc.setTextColor(0, 212, 255); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text("Live Market Rates - India Market", pageWidth/2, 28, {align: 'center'});
  doc.setTextColor(136, 153, 170); doc.setFontSize(9); doc.text("Generated: " + getDateTimeForPDF(), 14, 35);
  let y = 50; const rate = await inr();
  doc.setFillColor(26, 31, 58); doc.rect(12, y-5, pageWidth-24, 10, 'F');
  doc.setTextColor(255, 215, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("METAL", 16, y+2); doc.text("WEIGHT", 70, y+2); doc.text("PRICE (INR)", 125, y+2); doc.text("PRICE (USD)", 175, y+2);
  doc.setDrawColor(255, 215, 0); doc.setLineWidth(0.8); doc.line(14, y+4, pageWidth-14, y+4);
  y += 12; doc.setTextColor(240, 243, 247); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const metals = [ { s:"XAU", n:"Gold", w:[1,8], color:[255, 215, 0], hex:"FFD700" }, { s:"XAG", n:"Silver", w:[1,1000], color:[192, 192, 192], hex:"C0C0C0" }, { s:"XPT", n:"Platinum", w:[1], color:[229, 228, 226], hex:"E5E4E2" }, { s:"XPD", n:"Palladium", w:[1], color:[218, 165, 32], hex:"DAA520" }, { s:"HG",  n:"Copper", w:[1], color:[184, 115, 51], hex:"B87333" } ];
  for(const m of metals){ const u = await usd(m.s); let base = (u / OZ) * rate * DUTY * GST; doc.setFillColor(m.color[0], m.color[1], m.color[2]); doc.rect(14, y-4, pageWidth-28, 7, 'F'); doc.setTextColor(m.hex === 'FFD700' || m.hex === 'DAA520' ? 0 : 255, m.hex === 'FFD700' || m.hex === 'DAA520' ? 0 : 255, m.hex === 'FFD700' || m.hex === 'DAA520' ? 0 : 255); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(m.n.toUpperCase(), 16, y+1); y += 9; doc.setTextColor(240, 243, 247); doc.setFont("helvetica", "normal"); doc.setFontSize(10); for(const w of m.w){ const weightLabel = w===1000 ? "1 kg" : w+" g"; const inrPrice = formatINRForPDF(base * w); const usdPrice = "$ " + (u / OZ * w).toFixed(2); doc.text(weightLabel, 70, y); doc.text(inrPrice, 125, y); doc.text(usdPrice, 175, y); y += 6; } y += 4; }
  doc.setDrawColor(255, 215, 0); doc.setLineWidth(0.5); doc.line(14, doc.internal.pageSize.getHeight()-20, pageWidth-14, doc.internal.pageSize.getHeight()-20);
  doc.setTextColor(136, 153, 170); doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.text("MetalPrice Live - Real-time Precious Metals Tracker", pageWidth/2, doc.internal.pageSize.getHeight()-15, {align: 'center'});
  doc.text("Prices updated every 60 seconds | Exchange rates from Frankfurter API", pageWidth/2, doc.internal.pageSize.getHeight()-11, {align: 'center'});
  doc.text("Tax included: DUTY (6%) + GST (3%) applied to India Market prices", pageWidth/2, doc.internal.pageSize.getHeight()-7, {align: 'center'});
  doc.save("metal-prices-" + new Date().toISOString().split('T')[0] + ".pdf");
}

const dailyChartEl=document.getElementById("dailyChart");
renderWeights();

// Initial load
if (isOnline) {
  fetchAndCacheAllMetals().then(() => { update(); });
  window.updateInterval = setInterval(() => { fetchAndCacheAllMetals().then(() => { update(); }); }, 60000);
} else {
  loadFromCache();
  const offlineOverlay = document.getElementById('offlineOverlay'); if(offlineOverlay) offlineOverlay.classList.add('show');
}

// Online/Offline Event Listeners (kept here so script is external)
window.addEventListener('online', () => {
  isOnline = true;
  const onlineNotif = document.getElementById('onlineNotification'); if(onlineNotif) onlineNotif.classList.add('show');
  const offlineOverlay = document.getElementById('offlineOverlay'); if(offlineOverlay) offlineOverlay.classList.remove('show');
  setTimeout(() => { if(onlineNotif) { onlineNotif.style.animation = 'popOut 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'; setTimeout(()=>{ onlineNotif.classList.remove('show'); onlineNotif.style.animation=''; },600); } }, 2500);
  const statusNotif = document.getElementById('statusNotification'); if(statusNotif){ statusNotif.classList.remove('offline'); statusNotif.classList.add('online','show'); document.getElementById('statusText').textContent='Online'; setTimeout(()=>statusNotif.classList.remove('show'),3000); }
  const statusIndicator = document.getElementById('statusIndicator'); if(statusIndicator){ statusIndicator.textContent='● Live - Online'; statusIndicator.style.color='var(--success)'; }
  setTimeout(() => { fetchAndCacheAllMetals().then(()=>{ update(); }); }, 2500);
  clearInterval(window.updateInterval);
  window.updateInterval = setInterval(()=>{ fetchAndCacheAllMetals().then(()=>{ update(); }); },60000);
});

window.addEventListener('offline', () => {
  isOnline = false;
  const offlineOverlay = document.getElementById('offlineOverlay'); if(offlineOverlay) offlineOverlay.classList.add('show');
  loadFromCache();
  const lastUpdate = localStorage.getItem('lastPriceUpdate'); if (lastUpdate){ const date = new Date(parseInt(lastUpdate)); const el = document.getElementById('offlineLastUpdate'); if(el) el.innerText = `Last updated: ${date.toLocaleString()}`; }
  const statusNotif = document.getElementById('statusNotification'); if(statusNotif){ statusNotif.classList.remove('online'); statusNotif.classList.add('offline','show'); document.getElementById('statusText').textContent='Offline'; setTimeout(()=>statusNotif.classList.remove('show'),3000); }
  const statusIndicator = document.getElementById('statusIndicator'); if(statusIndicator){ statusIndicator.textContent='● Offline - Cached'; statusIndicator.style.color='#ff4757'; }
  setTimeout(() => { if(offlineOverlay){ offlineOverlay.style.transition='opacity 0.6s ease-out'; offlineOverlay.style.opacity='0'; setTimeout(()=>{ offlineOverlay.classList.remove('show'); offlineOverlay.style.opacity=''; offlineOverlay.style.transition=''; },600); } }, 2500);
  clearInterval(window.updateInterval);
});
