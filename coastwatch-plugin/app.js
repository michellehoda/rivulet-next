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
 * ERDDAP Fetcher via JSONP
 * Bypass CORS by using ERDDAP's native .jsonp support.
 */
function erddapFetch(server, datasetId, variables, constraints) {
    return new Promise((resolve, reject) => {
        const callbackName = 'erddap_callback_' + Math.floor(Math.random() * 1000000);
        
        // Construct Constraints String
        const constraintStr = Object.entries(constraints)
            .map(([k, v]) => {
                if (v instanceof Date) {
                    return `${k}(${v.toISOString().split('T')[0]}T00:00:00Z)`;
                }
                return `${k}(${v})`;
            })
            .join(''); // ERDDAP griddap uses [] for constraints, we'll add those below

        const varStr = variables.join(',');
        
        // ERDDAP griddap URL format for JSONP:
        // [base]/griddap/[datasetID].jsonp?[var][constraints]&callback=[name]
        const url = `${server}/griddap/${datasetId}.jsonp?${varStr}[${constraintStr}]&callback=${callbackName}`;

        // Define the global callback
        window[callbackName] = function(json) {
            const cols = json.table.columnNames;
            const data = json.table.rows.map(row => {
                const obj = {};
                cols.forEach((col, i) => {
                    // Clean up column names (remove units like " (m)") to match previous logic
                    const cleanCol = col.split(' ')[0];
                    obj[cleanCol] = row[i];
                });
                return obj;
            });
            
            resolve(data);
            
            // Cleanup
            delete window[callbackName];
            const scriptTag = document.getElementById(callbackName);
            if (scriptTag) scriptTag.remove();
        };

        // Inject Script Tag
        const script = document.createElement('script');
        script.id = callbackName;
        script.src = url;
        script.onerror = () => {
            reject(new Error("Failed to load data from ERDDAP (JSONP Error). Check your connection or bounding box."));
            delete window[callbackName];
        };
        document.head.appendChild(script);
    });
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
            const datasetId = y.year >= 2024 ? `SEA_SURFACE_HEIGHT_NRT_${y.year}` : `SEA_SURFACE_HEIGHT_${y.year}_v3`;
            
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
        // 1. Fetch ADT
        const adtData = await erddapFetch(
            'https://erddap.aoml.noaa.gov/hdb/erddap',
            targetDate.getFullYear() >= 2024 ? `SEA_SURFACE_HEIGHT_NRT_${targetDate.getFullYear()}` : `SEA_SURFACE_HEIGHT_${targetDate.getFullYear()}_v3`,
            ['adt'],
            { 'time>=': start, 'time<=': end, 'latitude>=': minLat, 'latitude<=': maxLat, 'longitude>=': minLong, 'longitude<=': maxLong }
        );

        // 2. Fetch SST
        const sstData = await erddapFetch(
            'https://coastwatch.noaa.gov/erddap',
            'noaacwBLENDEDCsstDaily',
            ['analysed_sst'],
            { 'time>=': start, 'time<=': end, 'latitude>=': minLat, 'latitude<=': maxLat, 'longitude>=': minLong, 'longitude<=': maxLong }
        );

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
        }).filter(m => m.sst !== null);

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
