// --- Map setup ---
const map = L.map('map').setView([51.505, -0.09], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

// --- Username ---
let username = localStorage.getItem('username');
if(!username){
    username = prompt("Enter your username:");
    if(username) localStorage.setItem('username', username);
}

// --- Pixel data ---
let pixelData = JSON.parse(localStorage.getItem('pixels') || '[]');
function savePixels(){ localStorage.setItem('pixels', JSON.stringify(pixelData)); }

// --- UI State ---
let paintMode = false;
let selectedColor = "#ff0000";
let spacePressed=false;
let isDragging=false;
let hoverRect = null;

// --- Bottom UI ---
const bottomDiv = document.createElement('div');
bottomDiv.className='bottom-ui';
document.body.appendChild(bottomDiv);

// Paint button
const paintBtn = document.createElement('button');
paintBtn.className='paint-btn';
paintBtn.innerHTML='<i class="fas fa-paint-brush"></i> Paint';
bottomDiv.appendChild(paintBtn);

// Palette bar
const paletteBar = document.createElement('div');
paletteBar.id='palette-bar';
bottomDiv.appendChild(paletteBar);

// Confirm button
const confirmBtn = document.createElement('button');
confirmBtn.innerHTML='<i class="fas fa-check"></i> Confirm';
paletteBar.appendChild(confirmBtn);

// Default colors
const paletteColors = ["#FF0000","#00FF00","#0000FF","#FFFF00","#FF00FF","#00FFFF","#FFFFFF","#000000","#FFA500","#800080","#008000","#FFC0CB","#A52A2A","#808080","#FFD700","#00FA9A"];
paletteColors.forEach(color=>{
    const c = document.createElement('div');
    c.className='palette-color';
    c.style.background=color;
    c.onclick=()=>selectedColor=color;
    paletteBar.appendChild(c);
});

// Custom color input (hidden)
const customColorInput = document.createElement('input');
customColorInput.type='color';
customColorInput.style.display='none';
customColorInput.oninput = e => selectedColor=e.target.value;
document.body.appendChild(customColorInput);

// Custom color gradient button
const customColorBtn = document.createElement('div');
customColorBtn.id='custom-color';
customColorBtn.onclick=()=>customColorInput.click();
paletteBar.appendChild(customColorBtn);

// --- Bottom Button Logic ---
paintBtn.onclick = ()=>{
    paintMode=true;
    paletteBar.classList.add('active');
    paintBtn.style.display='none';
    map.dragging.disable();
};
confirmBtn.onclick = ()=>{
    paintMode=false;
    paletteBar.classList.remove('active');
    paintBtn.style.display='block';
    map.dragging.enable();
    if(hoverRect){ map.removeLayer(hoverRect); hoverRect=null; }
};

// --- Top-right buttons ---
const topButtonsDiv = document.createElement('div');
topButtonsDiv.className='top-buttons';
document.body.appendChild(topButtonsDiv);

function createTopBtn(label, icon, onClick){
    const btn = document.createElement('button');
    btn.innerHTML=`<i class="fas ${icon}"></i> ${label}`;
    btn.onclick=onClick;
    topButtonsDiv.appendChild(btn);
    return btn;
}

createTopBtn('Export','fa-file-export',exportPixels);
createTopBtn('Import','fa-file-import',importPixels);
createTopBtn('Wipe Map','fa-trash',()=>{
    if(confirm("Are you sure you want to wipe the entire map? This cannot be undone.")){
        pixelData = [];
        savePixels();
        map.eachLayer(layer=>{
            if(layer instanceof L.Rectangle) map.removeLayer(layer);
        });
    }
});

// --- Top-center search bar ---
const topSearch = document.createElement('input');
topSearch.id='top-search';
topSearch.placeholder='Search location...';
document.body.appendChild(topSearch);
topSearch.addEventListener('keypress', async (e)=>{
    if(e.key==='Enter'){
        const query=topSearch.value;
        const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data=await res.json();
        if(data[0]) map.setView([parseFloat(data[0].lat),parseFloat(data[0].lon)],18);
        else alert('Location not found');
    }
});

// --- Keyboard ---
document.addEventListener('keydown', e=>{ if(e.code==='Space') spacePressed=true; });
document.addEventListener('keyup', e=>{ if(e.code==='Space') spacePressed=false; isDragging=false; });

// --- Pixel size ---
const PIXEL_SIZE = 0.00005; // fixed latitude size

function lngDeltaAtLat(lat){
    return PIXEL_SIZE / Math.cos(lat * Math.PI / 180);
}

// --- Draw / Place Pixel (with snapping) ---
function placePixel(e){
    if(!paintMode) return;

    const lat = Math.floor(e.latlng.lat / PIXEL_SIZE) * PIXEL_SIZE;
    const deltaLng = lngDeltaAtLat(lat);
    const lng = Math.floor(e.latlng.lng / deltaLng) * deltaLng;

    // Prevent duplicates
    if(pixelData.some(p => p.lat === lat && p.lng === lng)) return;

    const pixel = { lat, lng, color: selectedColor, username, timestamp: Date.now() };
    pixelData.push(pixel);
    drawPixel(pixel);
    savePixels();
}

// --- Draw pixel as visually square on map ---
function drawPixel(pixel){
    const deltaLng = lngDeltaAtLat(pixel.lat);
    const topLeft = [pixel.lat, pixel.lng];
    const bottomRight = [pixel.lat + PIXEL_SIZE, pixel.lng + deltaLng];

    L.rectangle([topLeft, bottomRight], {
        color: pixel.color,
        weight: 0,
        fillColor: pixel.color,
        fillOpacity: 1
    }).addTo(map);
}

// --- Hover bounding box ---
map.on('mousemove', e=>{
    if(paintMode){
        if(hoverRect) map.removeLayer(hoverRect);

        const lat = Math.floor(e.latlng.lat / PIXEL_SIZE) * PIXEL_SIZE;
        const deltaLng = lngDeltaAtLat(lat);
        const lng = Math.floor(e.latlng.lng / deltaLng) * deltaLng;

        const topLeft = [lat, lng];
        const bottomRight = [lat + PIXEL_SIZE, lng + deltaLng];

        hoverRect = L.rectangle([topLeft, bottomRight], {color:'#ffffff', weight:1, fill:false}).addTo(map);
    }
});

// --- Mouse paint ---
map.on('mousedown', e=>{
    if(paintMode && spacePressed){ isDragging=true; placePixel(e); }
});
map.on('mousemove', e=>{
    if(paintMode && spacePressed && isDragging) placePixel(e);
});
map.on('mouseup', e=>{
    if(paintMode && spacePressed) isDragging=false;
});

// --- Click handler ---
map.on('click', e=>{
    if(paintMode && !spacePressed) placePixel(e);
});

// --- Export / Import ---
function exportPixels(){ 
    const dataStr = JSON.stringify(pixelData);
    const blob = new Blob([dataStr], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='pixels.json'; a.click(); 
}
function importPixels(){
    const input = document.createElement('input'); input.type='file';
    input.onchange = e=>{
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = ev=>{
            const imported = JSON.parse(ev.target.result);
            imported.forEach(p=>{
                pixelData.push(p);
                drawPixel(p);
            });
            savePixels();
        };
        reader.readAsText(file);
    };
    input.click();
}

// --- Draw saved pixels ---
pixelData.forEach(drawPixel);
