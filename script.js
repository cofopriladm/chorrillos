const supabaseUrl = 'https://esygimlogfjdsrynlrjx.supabase.co';

const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzeWdpbWxvZ2ZqZHNyeW5scmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NjUxMjAsImV4cCI6MjA4ODI0MTEyMH0.UHcXxEpz4bO1vDWaT32vl7ddEOnDrHOjhSFZDsXu33g';
const layersConfig = {
    'oferta': { name: 'Ofertas Inmobiliarias', color: '#6b7280', type: 'point', active: true }
};

let map, layerGroups = {}, currentBasemap = 'osm';
let legendControl = null;
let ofertasData = [];

function init() {
    map = L.map('map', {
        center: [-12.18692, -77.00821],
        zoom: 13,
        zoomControl: false
    });

    const basemaps = {
        'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }),
        'esri': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri, Maxar, Earthstar Geographics'
        }),
        'carto': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap © CartoDB'
        }),
        'streets': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri, HERE, Garmin'
        })
    };

    basemaps[currentBasemap].addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);


    buildBasemapUI(basemaps);
    buildLayersUI();
    loadDefaultLayers();
    setupEventListeners();

    setStatus('success', 'Geoportal cargado correctamente');
}

function setupEventListeners() {
    const btnApplyFilter = document.getElementById('btn-apply-filter');
    if (btnApplyFilter) {
        btnApplyFilter.addEventListener('click', applyFilters);
    }

    const filterTipoEl = document.getElementById('filter-tipo');
    if (filterTipoEl) filterTipoEl.addEventListener('change', applyFilters);

    const filterFuenteEl = document.getElementById('filter-fuente');
    if (filterFuenteEl) filterFuenteEl.addEventListener('change', applyFilters);
}

function buildBasemapUI(basemaps) {
    const container = document.getElementById('basemaps');
    const basemapData = [
        { id: 'osm', name: 'OpenStreetMap', icon: 'fas fa-map', layer: basemaps.osm },
        { id: 'esri', name: 'Satélite', icon: 'fas fa-satellite', layer: basemaps.esri },
        { id: 'carto', name: 'Claro', icon: 'fas fa-map-marked', layer: basemaps.carto },
        { id: 'streets', name: 'Calles', icon: 'fas fa-road', layer: basemaps.streets }
    ];

    basemapData.forEach(bm => {
        const button = document.createElement('button');
        button.className = `basemap-btn ${bm.id === currentBasemap ? 'active' : ''}`;
        button.innerHTML = `<i class="${bm.icon}"></i><span>${bm.name}</span>`;
        button.addEventListener('click', () => changeBasemap(bm.id, bm.layer, basemaps));
        container.appendChild(button);
    });
}

function changeBasemap(id, layer, basemaps) {
    if (id === currentBasemap) return;

    map.removeLayer(basemaps[currentBasemap]);
    layer.addTo(map);
    currentBasemap = id;

    document.querySelectorAll('.basemap-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.basemap-btn:nth-child(${Object.keys(basemaps).indexOf(id) + 1})`).classList.add('active');

    setStatus('info', `Cambiado a: ${document.querySelector(`.basemap-btn:nth-child(${Object.keys(basemaps).indexOf(id) + 1}) span`).textContent}`);
}

function buildLayersUI() {
    const container = document.getElementById('layers');
    Object.entries(layersConfig).forEach(([key, cfg]) => {
        const item = document.createElement('div');
        item.className = 'layer-item';
        item.innerHTML = `
            <div class="layer-left">
                <span class="layer-badge" style="background-color: ${cfg.color};"></span>
                <span class="layer-label">${cfg.name}</span>
            </div>
            <label class="layer-switch">
                <input type="checkbox" ${cfg.active ? 'checked' : ''}>
                <span class="layer-slider"></span>
            </label>
        `;

        const checkbox = item.querySelector('input');
        checkbox.addEventListener('change', (e) => toggleLayer(key, e.target.checked));
        container.appendChild(item);
    });
}

async function loadDefaultLayers() {
    for (const [key, cfg] of Object.entries(layersConfig)) {
        if (cfg.active) {
            await loadLayer(key);
        }
    }
}

async function toggleLayer(key, visible) {
    if (visible) {
        await loadLayer(key);
    } else {
        if (layerGroups[key]) {
            map.removeLayer(layerGroups[key]);
            delete layerGroups[key];
        }
    }
    updateLegendControls();
}

async function loadLayer(key) {
    setStatus('warning', `Cargando ${layersConfig[key].name}...`);

    try {
        if (layersConfig[key].isRPC) {
            if (key === 'reportes') {
                await loadReportes();
            }
            return;
        }

        const response = await fetch(`${supabaseUrl}/rest/v1/${key}?select=*&limit=2000`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (key === 'oferta') {
            ofertasData = data;
            renderOfertas(data);
        } else {
            const group = L.layerGroup();

            data.forEach(item => {
                if (!item.geom) return;

                const geom = typeof item.geom === 'string' ? safeParseJSON(item.geom) : item.geom;
                if (!geom) return;

                const style = featureStyle(key);
                const layer = L.geoJSON(geom, {
                    style: style,
                    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
                        ...style,
                        radius: 6,
                        weight: 2,
                        fillOpacity: 0.7
                    })
                });

                if (key === 'barrios' && item.BARRIO) {
                    layer.bindTooltip(item.BARRIO, {
                        permanent: false,
                        direction: 'top',
                        offset: [0, -6]
                    });
                }

                layer.on('click', () => {
                    const props = Object.assign({}, item);
                    delete props.geom;
                    showPopup(layer, props);
                });

                group.addLayer(layer);
            });

            layerGroups[key] = group;
            group.addTo(map);
            setStatus('success', `${layersConfig[key].name}: ${data.length} elementos`);
            updateLegendControls();
        }

    } catch (error) {
        console.error(error);
        setStatus('error', `Error cargando ${layersConfig[key].name}`);
    }
}

function renderOfertas(dataToRender) {
    if (layerGroups['oferta']) {
        map.removeLayer(layerGroups['oferta']);
        delete layerGroups['oferta'];
    }

    const group = L.layerGroup();

    dataToRender.forEach(item => {
        if (!item.geom) return;

        const geom = typeof item.geom === 'string' ? safeParseJSON(item.geom) : item.geom;
        if (!geom) return;

        const layer = L.geoJSON(geom, {
            style: () => getOfertaStyle(item),
            pointToLayer: (feature, latlng) => {
                return L.circleMarker(latlng, getOfertaStyle(item));
            }
        });

        layer.on('click', () => {
            const props = Object.assign({}, item);
            delete props.geom;
            showPopup(layer, props);
        });

        group.addLayer(layer);
    });

    layerGroups['oferta'] = group;
    group.addTo(map);

    updateLegendControls();
}

function applyFilters() {
    const filterTipo = document.getElementById('filter-tipo').value;
    const filterFuente = document.getElementById('filter-fuente').value.toLowerCase();

    console.log('=== APLICANDO FILTROS ===');
    console.log('filterTipo:', JSON.stringify(filterTipo));
    console.log('filterFuente:', JSON.stringify(filterFuente));
    console.log('ofertasData.length:', ofertasData.length);
    if (ofertasData.length > 0) {
        console.log('Ejemplo item[0]:', JSON.stringify({ tipo: ofertasData[0].tipo, fuente: ofertasData[0].fuente }));
    }

    setStatus('warning', 'Aplicando filtros...');

    const filteredData = ofertasData.filter(item => {
        const itemTipo = String(item.tipo ?? '');
        const itemFuente = String(item.fuente ?? '').toLowerCase();

        const matchTipo = !filterTipo || itemTipo === filterTipo;
        const matchFuente = !filterFuente || itemFuente.includes(filterFuente);

        return matchTipo && matchFuente;
    });

    console.log('filteredData.length:', filteredData.length);

    renderOfertas(filteredData);
    setStatus('success', `Ofertas filtradas: ${filteredData.length} elementos`);
}

function featureStyle(key) {
    const color = layersConfig[key].color;
    const type = layersConfig[key].type;

    if (type === 'line') {
        return { color: color, weight: 2.5, opacity: 0.9 };
    }
    if (type === 'point') {
        return { color: color, weight: 2, opacity: 1, fillColor: color, fillOpacity: 0.8 };
    }
    return { color: color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.15 };
}

function getOfertaStyle(item) {
    const tipo = String(item.tipo || '');
    const fuente = String(item.fuente || '').toLowerCase();

    let fillColor = '#6b7280';
    if (tipo === '1') fillColor = '#8b4513';
    else if (tipo === '2') fillColor = '#ef4444';
    else if (tipo === '3') fillColor = '#3b82f6';
    else if (tipo === '4') fillColor = '#10b981';
    else if (tipo === '5') fillColor = '#eab308';
    else if (tipo === '6') fillColor = '#d97706';
    else if (tipo === '7') fillColor = '#8b5cf6';
    else if (tipo === '8') fillColor = '#6366f1';
    else if (tipo === '9') fillColor = '#f163d2ff';

    let color = '#ffffff';
    if (fuente.includes('urbania')) color = '#f97316';
    else if (fuente.includes('adonde')) color = '#e11d48';
    else if (fuente.includes('remax')) color = '#1d4ee1ff';

    return {
        radius: 7,
        fillColor: fillColor,
        color: color,
        weight: 3,
        opacity: 1,
        fillOpacity: 0.85
    };
}

function updateLegendControls() {
    const activeLayers = Object.keys(layerGroups);
    updateLegend(activeLayers);
}

function updateLegend(visibleLayers) {
    if (legendControl) {
        map.removeControl(legendControl);
        legendControl = null;
    }

    if (visibleLayers.includes('oferta')) {
        legendControl = L.control({ position: 'bottomleft' });
        legendControl.onAdd = function (map) {
            const div = L.DomUtil.create('div', 'info legend');
            div.innerHTML = `
                <h4>Clasificación de Ofertas</h4>
                <div class="legend-section">
                    <strong>Por Tipo (Color)</strong>
                    <div class="legend-item"><i style="background: #8b4513"></i> Venta Terreno - 1</div>
                    <div class="legend-item"><i style="background: #ef4444"></i> Venta Casa - 2</div>
                    <div class="legend-item"><i style="background: #3b82f6"></i> Venta Departamento - 3</div>
                    <div class="legend-item"><i style="background: #10b981"></i> Alquiler Departamento - 4</div>
                    <div class="legend-item"><i style="background: #eab308"></i> Alquiler Habitación - 5</div>
                    <div class="legend-item"><i style="background: #d97706"></i> Alquiler Terreno - 6</div>
                    <div class="legend-item"><i style="background: #8b5cf6"></i> Alquiler Local Comercial - 7</div>
                    <div class="legend-item"><i style="background: #6366f1"></i> Venta de Local Comercial - 8</div>
                    <div class="legend-item"><i style="background: #f163d2ff"></i> Alquiler de casa - 9</div>

                    <div class="legend-item"><i style="background: #6b7280"></i> Otros</div>
                </div>
                <div class="legend-section mt-2">
                    <strong>Por Fuente</strong>
                    <div class="legend-item"><i class="border-icon" style="border-color: #f97316"></i> Urbania</div>
                    <div class="legend-item"><i class="border-icon" style="border-color: #e11d48"></i> AdondeVivir</div>
                    <div class="legend-item"><i class="border-icon" style="border-color: #1d4ee1ff"></i> Remax</div>

                    <div class="legend-item"><i class="border-icon" style="border-color: #ffffff"></i> Otra</div>
                </div>
            `;
            return div;
        };
        legendControl.addTo(map);
    }
}

function showPopup(layer, props) {
    const html = `
        <div style="min-width: 220px;">
            ${Object.entries(props).map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`).join('')}
        </div>
    `;

    try {
        const center = layer.getBounds ? layer.getBounds().getCenter() : null;
        if (center) {
            L.popup().setLatLng(center).setContent(html).openOn(map);
        }
    } catch (e) { }
}







function setStatus(type, message) {
    const statusPanel = document.getElementById('status');
    statusPanel.className = `status-panel show ${type}`;

    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    statusPanel.innerHTML = `<i class="${icons[type]}"></i> ${message}`;

    setTimeout(() => {
        statusPanel.classList.remove('show');
    }, 5000);
}

function safeParseJSON(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

window.addEventListener('load', init);
