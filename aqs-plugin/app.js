// AQI Breakpoints from the notebook
const AQI_BREAKPOINTS = {
    '88101': [ // PM2.5 (24-hr, in µg/m³)
        { I_lo: 0, I_hi: 50, C_lo: 0.0, C_hi: 12.0 },
        { I_lo: 51, I_hi: 100, C_lo: 12.1, C_hi: 35.4 },
        { I_lo: 101, I_hi: 150, C_lo: 35.5, C_hi: 55.4 },
        { I_lo: 151, I_hi: 200, C_lo: 55.5, C_hi: 150.4 },
        { I_lo: 201, I_hi: 300, C_lo: 150.5, C_hi: 250.4 },
        { I_lo: 301, I_hi: 400, C_lo: 250.5, C_hi: 350.4 },
        { I_lo: 401, I_hi: 500, C_lo: 350.5, C_hi: 500.4 },
    ],
    '81102': [ // PM10 (24-hr, in µg/m³)
        { I_lo: 0, I_hi: 50, C_lo: 0, C_hi: 54 },
        { I_lo: 51, I_hi: 100, C_lo: 55, C_hi: 154 },
        { I_lo: 101, I_hi: 150, C_lo: 155, C_hi: 254 },
        { I_lo: 151, I_hi: 200, C_lo: 255, C_hi: 354 },
        { I_lo: 201, I_hi: 300, C_lo: 355, C_hi: 424 },
        { I_lo: 301, I_hi: 400, C_lo: 425, C_hi: 504 },
        { I_lo: 401, I_hi: 500, C_lo: 505, C_hi: 604 },
    ],
    '44201': [ // O3 (8-hr, in ppm)
        { I_lo: 0, I_hi: 50, C_lo: 0.000, C_hi: 0.054 },
        { I_lo: 51, I_hi: 100, C_lo: 0.055, C_hi: 0.070 },
        { I_lo: 101, I_hi: 150, C_lo: 0.071, C_hi: 0.085 },
        { I_lo: 151, I_hi: 200, C_lo: 0.086, C_hi: 0.105 },
        { I_lo: 201, I_hi: 300, C_lo: 0.106, C_hi: 0.200 },
    ],
    '42101': [ // CO (8-hr, in ppm)
        { I_lo: 0, I_hi: 50, C_lo: 0.0, C_hi: 4.4 },
        { I_lo: 51, I_hi: 100, C_lo: 4.5, C_hi: 9.4 },
        { I_lo: 101, I_hi: 150, C_lo: 9.5, C_hi: 12.4 },
        { I_lo: 151, I_hi: 200, C_lo: 12.5, C_hi: 15.4 },
        { I_lo: 201, I_hi: 300, C_lo: 15.5, C_hi: 30.4 },
        { I_lo: 301, I_hi: 400, C_lo: 30.5, C_hi: 40.4 },
        { I_lo: 401, I_hi: 500, C_lo: 40.5, C_hi: 50.4 },
    ],
    '42401': [ // SO2 (1-hr, in ppb)
        { I_lo: 0, I_hi: 50, C_lo: 0, C_hi: 35 },
        { I_lo: 51, I_hi: 100, C_lo: 36, C_hi: 75 },
        { I_lo: 101, I_hi: 150, C_lo: 76, C_hi: 185 },
        { I_lo: 151, I_hi: 200, C_lo: 186, C_hi: 304 },
        { I_lo: 201, I_hi: 300, C_lo: 305, C_hi: 604 },
        { I_lo: 301, I_hi: 400, C_lo: 605, C_hi: 804 },
        { I_lo: 401, I_hi: 500, C_lo: 805, C_hi: 1004 },
    ],
    '42602': [ // NO2 (1-hr, in ppb)
        { I_lo: 0, I_hi: 50, C_lo: 0, C_hi: 53 },
        { I_lo: 51, I_hi: 100, C_lo: 54, C_hi: 100 },
        { I_lo: 101, I_hi: 150, C_lo: 101, C_hi: 360 },
        { I_lo: 151, I_hi: 200, C_lo: 361, C_hi: 649 },
        { I_lo: 201, I_hi: 300, C_lo: 650, C_hi: 1249 },
        { I_lo: 301, I_hi: 400, C_lo: 1250, C_hi: 1649 },
        { I_lo: 401, I_hi: 500, C_lo: 1650, C_hi: 2049 },
    ],
};

const POLLUTANT_SPECS = {
    '88101': { decimals: 1 },
    '81102': { decimals: 0 },
    '44201': { decimals: 3 },
    '42101': { decimals: 1 },
    '42401': { decimals: 0 },
    '42602': { decimals: 0 },
};

// Global state
let selectedMonitor = null;
let monitors = [];
let parameters = [];

// Initialize CODAP connection
codapInterface.init({
    name: 'AQS_Explorer',
    title: 'AQS Air Quality Explorer',
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
    
    // Find the tab element that matches this tabId and set it active
    const tabIndexMap = {
        'tab-intro': 0,
        'tab-credentials': 1,
        'tab-area': 2,
        'tab-fetch': 3,
        'tab-aqi': 4,
        'tab-neighbors': 5
    };
    const tabs = document.querySelectorAll('.tab');
    if (tabs[tabIndexMap[tabId]]) {
        tabs[tabIndexMap[tabId]].classList.add('active');
    }
}

// AQS API Helpers
async function aqsFetch(endpoint, params) {
    const email = document.getElementById('email').value || 'test@aqs.api';
    const key = document.getElementById('api-key').value || 'test';
    
    const urlParams = new URLSearchParams({
        email,
        key,
        ...params
    });
    
    const response = await fetch(`https://aqs.epa.gov/data/api/${endpoint}?${urlParams.toString()}`);
    if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.Header[0].status.startsWith('Error')) {
        throw new Error(data.Header[0].status);
    }
    return data;
}

async function checkAqsStatus() {
    const statusEl = document.getElementById('credentials-status');
    statusEl.style.display = 'block';
    statusEl.innerText = 'Checking...';
    statusEl.className = 'status';
    
    try {
        const data = await aqsFetch('metaData/isAvailable', {});
        statusEl.innerText = 'API is available!';
        statusEl.classList.add('success');
    } catch (error) {
        statusEl.innerText = 'Error: ' + error.message;
        statusEl.classList.add('error');
    }
}

async function findMonitors() {
    const minlat = document.getElementById('min-lat').value;
    const maxlat = document.getElementById('max-lat').value;
    const minlon = document.getElementById('min-long').value;
    const maxlon = document.getElementById('max-long').value;
    const date = document.getElementById('target-date').value.replace(/-/g, '');
    
    const selectedParams = Array.from(document.querySelectorAll('input[name="parameter"]:checked')).map(cb => cb.value);
    
    if (selectedParams.length === 0) {
        alert('Please select at least one parameter');
        return;
    }
    
    const listEl = document.getElementById('monitors-list');
    listEl.innerHTML = 'Searching for monitors...';
    
    try {
        const data = await aqsFetch('monitors/byBox', {
            param: selectedParams.join(','),
            bdate: date,
            edate: date,
            minlat, maxlat, minlon, maxlon
        });
        
        monitors = data.Data;
        if (monitors.length === 0) {
            listEl.innerHTML = 'No monitors found in this area for selected parameters.';
            return;
        }
        
        // Group by site to show unique monitors
        const sites = {};
        monitors.forEach(m => {
            const id = `${m.state_code}-${m.county_code}-${m.site_number}`;
            if (!sites[id]) {
                sites[id] = {
                    id,
                    state_code: m.state_code,
                    county_code: m.county_code,
                    site_number: m.site_number,
                    address: m.address,
                    city: m.city_name,
                    parameters: []
                };
            }
            sites[id].parameters.push(m.parameter_code);
        });
        
        listEl.innerHTML = '<strong>Select a monitor:</strong><br>';
        Object.values(sites).forEach(site => {
            const item = document.createElement('div');
            item.className = 'monitor-item';
            item.innerHTML = `
                <strong>${site.city || 'Unknown City'}</strong> (${site.id})<br>
                ${site.address}<br>
                <small>Params: ${site.parameters.join(', ')}</small>
            `;
            item.onclick = () => {
                document.querySelectorAll('.monitor-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedMonitor = site;
                document.getElementById('fetch-controls').style.display = 'block';
            };
            listEl.appendChild(item);
        });
        
    } catch (error) {
        listEl.innerHTML = 'Error finding monitors: ' + error.message;
    }
}

async function fetchSampleData() {
    if (!selectedMonitor) return;
    
    const statusEl = document.getElementById('fetch-status');
    statusEl.style.display = 'block';
    statusEl.innerText = 'Fetching sample data...';
    statusEl.className = 'status';
    
    const targetDate = new Date(document.getElementById('target-date').value);
    const rangeDays = parseInt(document.getElementById('date-range').value);
    
    const bdate = new Date(targetDate);
    bdate.setDate(bdate.getDate() - rangeDays);
    const edate = new Date(targetDate);
    edate.setDate(edate.getDate() + rangeDays);
    
    const bdateStr = bdate.toISOString().split('T')[0].replace(/-/g, '');
    const edateStr = edate.toISOString().split('T')[0].replace(/-/g, '');
    
    const selectedParams = Array.from(document.querySelectorAll('input[name="parameter"]:checked')).map(cb => cb.value);
    
    try {
        const data = await aqsFetch('sampleData/bySite', {
            param: selectedParams.join(','),
            bdate: bdateStr,
            edate: edateStr,
            state: selectedMonitor.state_code,
            county: selectedMonitor.county_code,
            site: selectedMonitor.site_number
        });
        
        const success = await importToCodap(data.Data, 'AQS_Sample_Data', 'Sample Data');
        if (success) {
            statusEl.innerText = 'Data imported to CODAP successfully!';
            statusEl.classList.add('success');
        } else {
            statusEl.innerText = 'No data found for the selected criteria. Nothing was imported.';
            statusEl.classList.add('warning');
        }
    } catch (error) {
        statusEl.innerText = 'Error: ' + error.message;
        statusEl.classList.add('error');
    }
}

async function fetchAqiData() {
    const statusEl = document.getElementById('aqi-status');
    statusEl.style.display = 'block';
    statusEl.innerText = 'Fetching AQI pollutants...';
    statusEl.className = 'status';
    
    if (!selectedMonitor) {
        statusEl.innerText = 'Please select a monitor in Tab III first.';
        statusEl.classList.add('error');
        return;
    }
    
    const targetDate = new Date(document.getElementById('target-date').value);
    const bdate = new Date(targetDate);
    bdate.setDate(bdate.getDate() - 7);
    const edate = new Date(targetDate);
    edate.setDate(edate.getDate() + 7);
    
    const bdateStr = bdate.toISOString().split('T')[0].replace(/-/g, '');
    const edateStr = edate.toISOString().split('T')[0].replace(/-/g, '');
    
    const aqiParams = Object.keys(AQI_BREAKPOINTS).join(',');
    
    try {
        const data = await aqsFetch('sampleData/bySite', {
            param: aqiParams,
            bdate: bdateStr,
            edate: edateStr,
            state: selectedMonitor.state_code,
            county: selectedMonitor.county_code,
            site: selectedMonitor.site_number
        });
        
        // Process data to include individual AQI and composite AQI
        const processedData = processAqiData(data.Data);
        const success = await importToCodap(processedData, 'AQS_AQI_Data', 'AQI Data');
        
        if (success) {
            statusEl.innerText = 'AQI Data imported to CODAP successfully!';
            statusEl.classList.add('success');
        } else {
            statusEl.innerText = 'No AQI data found for the selected monitor and date range.';
            statusEl.classList.add('warning');
        }
    } catch (error) {
        statusEl.innerText = 'Error: ' + error.message;
        statusEl.classList.add('error');
    }
}

function processAqiData(data) {
    // 1. Calculate individual AQI for each sample
    data.forEach(d => {
        d.individual_aqi = calculateIndividualAqi(d.parameter_code, d.sample_measurement);
    });
    
    // 2. Group by datetime to calculate composite AQI
    const byDatetime = {};
    data.forEach(d => {
        const dt = `${d.date_local} ${d.time_local}`;
        if (!byDatetime[dt]) byDatetime[dt] = {};
        byDatetime[dt][d.parameter_code] = d.sample_measurement;
    });
    
    const compositeRows = [];
    for (const dt in byDatetime) {
        const compositeAqi = calculateCompositeAqi(byDatetime[dt]);
        if (compositeAqi !== null) {
            const [date, time] = dt.split(' ');
            compositeRows.push({
                date_local: date,
                time_local: time,
                parameter_code: 'COMPOSITE_AQI',
                parameter: 'Composite AQI',
                sample_measurement: compositeAqi,
                individual_aqi: compositeAqi,
                units_of_measure: 'AQI'
            });
        }
    }
    
    return [...data, ...compositeRows];
}

function truncate(n, decimals = 0) {
    if (typeof n !== 'number' || !isFinite(n)) return null;
    const multiplier = Math.pow(10, decimals);
    return Math.floor(n * multiplier) / multiplier;
}

function calculateIndividualAqi(pollutantCode, concentration) {
    const table = AQI_BREAKPOINTS[pollutantCode];
    const spec = POLLUTANT_SPECS[pollutantCode];
    
    if (!table || !spec) return null;
    if (concentration === null || concentration < 0 || !isFinite(concentration)) return null;
    
    const Cp = truncate(concentration, spec.decimals);
    
    for (const bp of table) {
        if (Cp >= bp.C_lo && Cp <= bp.C_hi) {
            let aqi;
            if (bp.C_hi === bp.C_lo) {
                aqi = bp.I_lo;
            } else {
                aqi = ((bp.I_hi - bp.I_lo) / (bp.C_hi - bp.C_lo)) * (Cp - bp.C_lo) + bp.I_lo;
            }
            return Math.round(aqi);
        }
    }
    
    // Beyond highest breakpoint
    const last = table[table.length - 1];
    if (Cp > last.C_hi) {
        let aqi = ((last.I_hi - last.I_lo) / (last.C_hi - last.C_lo)) * (Cp - last.C_lo) + last.I_lo;
        return Math.round(aqi);
    }
    
    return null;
}

function calculateCompositeAqi(concentrations) {
    const individualAqis = [];
    for (const code in concentrations) {
        const aqi = calculateIndividualAqi(code, concentrations[code]);
        if (aqi !== null) individualAqis.push(aqi);
    }
    if (individualAqis.length === 0) return null;
    return Math.max(...individualAqis);
}

async function fetchNeighborData() {
    const statusEl = document.getElementById('neighbors-status');
    statusEl.style.display = 'block';
    statusEl.innerText = 'Fetching neighbor summaries...';
    statusEl.className = 'status';
    
    const minlat = document.getElementById('min-lat').value;
    const maxlat = document.getElementById('max-lat').value;
    const minlon = document.getElementById('min-long').value;
    const maxlon = document.getElementById('max-long').value;
    const pollutant = document.getElementById('neighbor-pollutant').value;
    
    const targetDate = new Date(document.getElementById('target-date').value);
    const bdate = new Date(targetDate);
    bdate.setDate(bdate.getDate() - 2);
    const edate = new Date(targetDate);
    edate.setDate(edate.getDate() + 2);
    
    const bdateStr = bdate.toISOString().split('T')[0].replace(/-/g, '');
    const edateStr = edate.toISOString().split('T')[0].replace(/-/g, '');
    
    try {
        const data = await aqsFetch('dailyData/byBox', {
            param: pollutant,
            bdate: bdateStr,
            edate: edateStr,
            minlat, maxlat, minlon, maxlon
        });
        
        const success = await importToCodap(data.Data, 'AQS_Neighbor_Data', 'Neighbor Data');
        if (success) {
            statusEl.innerText = 'Neighbor Data imported to CODAP successfully!';
            statusEl.classList.add('success');
        } else {
            statusEl.innerText = 'No neighbor data found for the selected criteria.';
            statusEl.classList.add('warning');
        }
    } catch (error) {
        statusEl.innerText = 'Error: ' + error.message;
        statusEl.classList.add('error');
    }
}

async function importToCodap(data, contextName, contextTitle) {
    if (!data || data.length === 0) return false;
    
    // Add combined datetime_local field if date_local and time_local exist
    data.forEach(item => {
        if (item.date_local && item.time_local && !item.datetime_local) {
            // AQS date_local is YYYY-MM-DD and time_local is HH:MM
            item.datetime_local = `${item.date_local} ${item.time_local}`;
        }
    });

    // Define which attributes belong to the parent (Pollutant) level
    const parentAttrNames = ['parameter_code', 'parameter', 'units_of_measure'];
    
    // Get all unique keys from data to identify child attributes
    const allKeys = new Set();
    data.forEach(d => {
        Object.keys(d).forEach(k => allKeys.add(k));
    });
    
    const parentAttrs = [];
    const childAttrs = [];
    
    allKeys.forEach(key => {
        if (parentAttrNames.includes(key)) {
            parentAttrs.push({ name: key });
        } else {
            childAttrs.push({ name: key });
        }
    });
    
    // If for some reason parameter_code isn't in the data, 
    // we should at least have one parent attribute to avoid errors.
    if (parentAttrs.length === 0 && allKeys.has('parameter_code')) {
        parentAttrs.push({ name: 'parameter_code' });
    }

    const tableSetupRequest = {
        action: 'create',
        resource: 'dataContext',
        values: {
            name: contextName,
            title: contextTitle,
            collections: [
                {
                    name: 'Pollutants',
                    title: 'List of Pollutants',
                    attrs: parentAttrs
                },
                {
                    name: 'Measurements',
                    title: 'Individual Measurements',
                    parent: 'Pollutants',
                    attrs: childAttrs
                }
            ]
        }
    };
    
    await codapInterface.sendRequest(tableSetupRequest);
    
    // Batch insert items. CODAP automatically distributes values 
    // between the collections based on the attribute names.
    await codapInterface.sendRequest({
        action: 'create',
        resource: `dataContext[${contextName}].item`,
        values: data
    });

    return true;
}
