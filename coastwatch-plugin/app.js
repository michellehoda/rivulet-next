// Initialize CODAP connection
codapInterface.init({
    name: 'CoastWatch_Explorer',
    title: 'CoastWatch Ocean Explorer',
    version: '1.0',
    dimensions: { width: 450, height: 600 }
});

// Tab switching
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');
    
    const tabIndexMap = {
        'tab-intro': 0,
        'tab-area': 1,
        'tab-historic': 2,
        'tab-thermal': 3
    };
    const tabs = document.querySelectorAll('.tab');
    if (tabs[tabIndexMap[tabId]]) {
        tabs[tabIndexMap[tabId]].classList.add('active');
    }
}

/**
 * Helper to build griddap range string [(min):1:(max)]
 */
function buildGriddapRange(constraints) {
    const dims = ['time', 'latitude', 'longitude'];
    let rangeStr = '';
    dims.forEach(dim => {
        const low = constraints[`${dim}>=`];
        const high = constraints[`${dim}<=`];
        if (low !== undefined && high !== undefined) {
            let s = low, e = high;
            if (low instanceof Date) {
                const yyyy = low.getFullYear();
                const mm = String(low.getMonth() + 1).padStart(2, '0');
                const dd = String(low.getDate()).padStart(2, '0');
                s = `${yyyy}-${mm}-${dd} 00:00:00`;
            }
            if (high instanceof Date) {
                const yyyy = high.getFullYear();
                const mm = String(high.getMonth() + 1).padStart(2, '0');
                const dd = String(high.getDate()).padStart(2, '0');
                e = `${yyyy}-${mm}-${dd} 00:00:00`;
            }
            // Use :1: stride as requested
            rangeStr += `[(${s}):1:(${e})]`;
        }
    });
    return rangeStr;
}

/**
 * Main ERDDAP fetcher with multi-stage fallback.
 * 1. Direct fetch (CORS)
 * 2. AllOrigins Proxy
 * 3. CorsProxy.io
 */
async function erddapFetch(server, datasetId, variables, constraints) {
    const rangeStr = buildGriddapRange(constraints);
    const queryStr = variables.map(v => `${v}${rangeStr}`).join(',');
    const targetUrl = `${server}/griddap/${datasetId}.json?${queryStr}`;

    // 1. Try direct fetch first
    try {
        const response = await fetch(targetUrl);
        if (response.ok) {
            const json = await response.json();
            return processErddapData(json);
        }
        console.warn(`Direct fetch failed (Status ${response.status}). Trying AllOrigins...`);
    } catch (e) {
        console.warn("Direct fetch blocked (CORS). Trying AllOrigins...");
    }

    // 2. Try AllOrigins
    try {
        return await fetchViaAllOrigins(targetUrl);
    } catch (e) {
        console.warn("AllOrigins failed. Trying CorsProxy.io...");
    }

    // 3. Final attempt: CorsProxy.io
    try {
        return await fetchViaCorsProxy(targetUrl);
    } catch (e) {
        throw new Error("All fetch attempts failed. The ERDDAP server may be down or unreachable.");
    }
}

/**
 * Common data processor for ERDDAP JSON responses
 */
function processErddapData(json) {
    if (!json || !json.table || !json.table.columnNames || !json.table.rows) {
        throw new Error("Invalid data format received from ERDDAP.");
    }
    const cols = json.table.columnNames;
    return json.table.rows.map(row => {
        const obj = {};
        cols.forEach((col, i) => {
            const cleanCol = col.split(' ')[0]; // Remove units
            obj[cleanCol] = row[i];
        });
        return obj;
    });
}

/**
 * Fallback via AllOrigins Proxy
 */
async function fetchViaAllOrigins(targetUrl) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    const response = await fetch(proxyUrl);
    const result = await response.json();
    
    if (!result.contents) throw new Error("AllOrigins empty response");
    
    // Check for ERDDAP errors in the returned text
    if (result.contents.trim().startsWith('Error {')) {
         throw new Error("ERDDAP Server Error via AllOrigins");
    }

    const json = JSON.parse(result.contents);
    return processErddapData(json);
}

/**
 * Fallback via CorsProxy.io
 */
async function fetchViaCorsProxy(targetUrl) {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("CorsProxy.io failed");
    
    const json = await response.json();
    return processErddapData(json);
}

async function fetchHistoricData() {
    const statusEl = document.getElementById('historic-status');
    statusEl.style.display = 'block';
    statusEl.innerText = 'Fetching multi-decade data...';
    statusEl.className = 'status';

    const targetDate = new Date(document.getElementById('target-date').value);
    const minLat = document.getElementById('min-lat').value;
    const maxLat = document.getElementById('max-lat').value;
    const minLong = document.getElementById('min-long').value;
    const maxLong = document.getElementById('max-long').value;

    const years = [
        { label: 'Latest', year: targetDate.getFullYear() },
        { label: '10 Years Ago', year: targetDate.getFullYear() - 10 },
        { label: '20 Years Ago', year: targetDate.getFullYear() - 20 }
    ];

    const server = 'https://erddap.aoml.noaa.gov/hdb/erddap';
    let allData = [];

    try {
        for (const y of years) {
            // Updated threshold to 2023 as requested
            const datasetId = y.year >= 2023 ? `SEA_SURFACE_HEIGHT_NRT_${y.year}` : `SEA_SURFACE_HEIGHT_${y.year}_v3`;
            
            // 10 day window around the date in that specific year
            const d = new Date(targetDate);
            d.setFullYear(y.year);
            const start = new Date(d); start.setDate(d.getDate() - 5);
            const end = new Date(d); end.setDate(d.getDate() + 5);

            const data = await erddapFetch(server, datasetId, ['adt'], {
                'time>=': start,
                'time<=': end,
                'latitude>=': minLat,
                'latitude<=': maxLat,
                'longitude>=': minLong,
                'longitude<=': maxLong
            });
            
            // Add metadata
            data.forEach(item => {
                item.comparison_period = y.label;
                item.comparison_year = y.year;
            });
            allData = allData.concat(data);
        }

        const success = await importToCodap(allData, 'Historic_Sea_Level', 'Historic Sea Level Comparison', 'comparison_period');
        if (success) {
            statusEl.innerText = 'Historic data imported successfully!';
            statusEl.classList.add('success');
        }
    } catch (error) {
        console.error(error);
        statusEl.innerText = 'Error: ' + error.message;
        statusEl.classList.add('error');
    }
}

async function fetchThermalData() {
    const statusEl = document.getElementById('thermal-status');
    statusEl.style.display = 'block';
    statusEl.innerText = 'Fetching ADT and SST data...';
    statusEl.className = 'status';

    const targetDate = new Date(document.getElementById('target-date').value);
    const minLat = document.getElementById('min-lat').value;
    const maxLat = document.getElementById('max-lat').value;
    const minLong = document.getElementById('min-long').value;
    const maxLong = document.getElementById('max-long').value;

    const start = new Date(targetDate); start.setDate(targetDate.getDate() - 10);
    const end = new Date(targetDate); end.setDate(targetDate.getDate() + 10);

    try {
        // Updated threshold to 2023
        const datasetId = targetDate.getFullYear() >= 2023 ? `SEA_SURFACE_HEIGHT_NRT_${targetDate.getFullYear()}` : `SEA_SURFACE_HEIGHT_${targetDate.getFullYear()}_v3`;
        
        /*
        // 1. Fetch ADT
        const adtData = await erddapFetch(
            'https://erddap.aoml.noaa.gov/hdb/erddap',
            datasetId,
            ['adt'], {
                'time>=': start,
                'time<=': end,
                'latitude>=': minLat,
                'latitude<=': maxLat,
                'longitude>=': minLong,
                'longitude<=': maxLong
            }
        );
        */

        
        // 2. Fetch SST
        const sstData = await erddapFetch(
            'https://coastwatch.noaa.gov/erddap',
            'noaacwBLENDEDCsstDaily',
            ['analysed_sst'],{
                'time>=': start,
                'time<=': end,
                'latitude>=': minLat,
                'latitude<=': maxLat,
                'longitude>=': minLong,
                'longitude<=': maxLong
            }
        );

        /*
        // 3. Merge by Time/Lat/Long
        // We normalize times to dates for merging since resolutions might vary slightly
        const sstMap = new Map();
        sstData.forEach(s => {
            const key = `${s.time.split('T')[0]}_${parseFloat(s.latitude).toFixed(3)}_${parseFloat(s.longitude).toFixed(3)}`;
            sstMap.set(key, s.analysed_sst);
        });

        const merged = adtData.map(a => {
            const key = `${a.time.split('T')[0]}_${parseFloat(a.latitude).toFixed(3)}_${parseFloat(a.longitude).toFixed(3)}`;
            return {
                ...a,
                sst: sstMap.get(key) || null,
                grid_point: `${parseFloat(a.latitude).toFixed(2)}, ${parseFloat(a.longitude).toFixed(2)}`
            };
        }).filter(m => m.sst !== null);*/

        const success = await importToCodap(merged, 'Thermal_Expansion_Data', 'Thermal Expansion Study', 'grid_point');
        if (success) {
            statusEl.innerText = 'Correlation data imported successfully!';
            statusEl.classList.add('success');
        } else {
            statusEl.innerText = 'No matching data found for merge.';
            statusEl.classList.add('warning');
        }
    } catch (error) {
        console.error(error);
        statusEl.innerText = 'Error: ' + error.message;
        statusEl.classList.add('error');
    }
}

async function importToCodap(data, contextName, contextTitle, parentAttrName) {
    if (!data || data.length === 0) return false;

    // Identify attributes
    const allKeys = Object.keys(data[0]);
    const parentAttrs = [{ name: parentAttrName }];
    const childAttrs = allKeys.filter(k => k !== parentAttrName).map(k => ({ name: k }));

    const tableSetupRequest = {
        action: 'create',
        resource: 'dataContext',
        values: {
            name: contextName,
            title: contextTitle,
            collections: [
                {
                    name: 'Groups',
                    attrs: parentAttrs
                },
                {
                    name: 'Measurements',
                    parent: 'Groups',
                    attrs: childAttrs
                }
            ]
        }
    };
    
    await codapInterface.sendRequest(tableSetupRequest);
    
    await codapInterface.sendRequest({
        action: 'create',
        resource: `dataContext[${contextName}].item`,
        values: data
    });

    return true;
}
