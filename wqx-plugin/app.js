// Initialize CODAP connection
codapInterface.init({
    name: 'WQX_Explorer',
    title: 'WQX Water Quality Explorer',
    version: '1.0',
    dimensions: { width: 450, height: 600 }
});

// Global state
let state = {
    selectedSalinitySite: null,
    selectedEColiSite: null,
    selectedOxygenSite: null,
    selectedNitratesSite: null,
    selectedLeadSite: null,
    salinitySites: [],
    ecoliSites: [],
    oxygenSites: [],
    nitratesSites: [],
    leadSites: []
};

// Tab switching
function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');
    
    // Set active tab styling
    const tabElements = document.querySelectorAll('.tab');
    tabElements.forEach(tab => {
        const onClickAttr = tab.getAttribute('onclick');
        if (onClickAttr && onClickAttr.includes(tabId)) {
            tab.classList.add('active');
        }
    });
}

// Utility: Format date to YYYY-MM-DD
function formatDate(dateStr) {
    return dateStr;
}

// Utility: Get date +/- days
function addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

// Generic Site Search (NWIS)
async function findGenericSites(pCode, prefix, siteType = 'all', stateCd = null) {
    const minLat = document.getElementById('min-lat').value;
    const maxLat = document.getElementById('max-lat').value;
    const minLong = document.getElementById('min-long').value;
    const maxLong = document.getElementById('max-long').value;
    
    const statusEl = document.getElementById(`${prefix}-status`);
    const listEl = document.getElementById(`${prefix}-sites-list`);
    
    statusEl.style.display = 'block';
    statusEl.innerText = 'Searching for sites...';
    statusEl.className = 'status';
    listEl.innerHTML = '';
    
    let url = `https://waterservices.usgs.gov/nwis/site/?format=json&parameterCd=${pCode}&siteStatus=all&hasDataTypeCd=iv,dv`;
    
    if (stateCd) {
        url += `&stateCd=${stateCd}`;
    } else {
        const bbox = `${minLong},${minLat},${maxLong},${maxLat}`;
        url += `&bBox=${bbox}`;
    }

    if (siteType !== 'all') {
        url += `&siteType=${siteType}`;
    }
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch sites');
        const data = await response.json();
        
        const sites = data.value.timeSeries || [];
        if (sites.length === 0) {
            statusEl.innerText = 'No sites found for the given criteria.';
            statusEl.className = 'status error';
            return;
        }
        
        const uniqueSites = [];
        const seen = new Set();
        sites.forEach(ts => {
            const siteCode = ts.sourceInfo.siteCode[0].value;
            if (!seen.has(siteCode)) {
                seen.add(siteCode);
                uniqueSites.push({
                    id: siteCode,
                    name: ts.sourceInfo.siteName
                });
            }
        });
        
        state[`${prefix}Sites`] = uniqueSites;
        statusEl.innerText = `Found ${uniqueSites.length} sites.`;
        statusEl.className = 'status success';
        
        uniqueSites.forEach(site => {
            const item = document.createElement('div');
            item.className = 'monitor-item';
            item.innerHTML = `<strong>${site.name}</strong><br>ID: ${site.id}`;
            item.onclick = () => {
                document.querySelectorAll(`#${prefix}-sites-list .monitor-item`).forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                state[`selected${prefix.charAt(0).toUpperCase() + prefix.slice(1)}Site`] = site;
                document.getElementById(`${prefix}-import-area`).style.display = 'block';
            };
            listEl.appendChild(item);
        });
        
    } catch (error) {
        statusEl.innerText = 'Error: ' + error.message;
        statusEl.className = 'status error';
    }
}

// Generic Data Import (NWIS)
async function importGenericData(pCode, prefix, contextName) {
    const siteKey = `selected${prefix.charAt(0).toUpperCase() + prefix.slice(1)}Site`;
    const site = state[siteKey];
    if (!site) return;
    
    const targetDate = document.getElementById('target-date').value;
    const startDate = addDays(targetDate, -4);
    const endDate = addDays(targetDate, 4);
    
    const statusEl = document.getElementById(`${prefix}-status`);
    statusEl.innerText = 'Importing data to CODAP...';
    
    const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site.id}&parameterCd=${pCode}&startDT=${startDate}&endDT=${endDate}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch data');
        const data = await response.json();
        
        if (!data.value.timeSeries || data.value.timeSeries.length === 0) {
            throw new Error('No data found for this site in the selected period.');
        }
        
        const timeSeries = data.value.timeSeries[0];
        const values = timeSeries.values[0].value;
        const variableName = timeSeries.variable.variableName;
        const unit = timeSeries.variable.unit.unitCode;
        
        const codapData = values.map(v => ({
            SiteName: site.name,
            SiteID: site.id,
            DateTime: v.dateTime,
            Value: parseFloat(v.value),
            Characteristic: variableName,
            Unit: unit
        }));
        
        await codapInterface.sendRequest({
            action: 'create',
            resource: 'dataContext',
            values: {
                name: contextName,
                title: contextName.replace(/_/g, ' '),
                collections: [{
                    name: 'Observations',
                    attrs: [
                        { name: 'SiteName', type: 'nominal' },
                        { name: 'SiteID', type: 'nominal' },
                        { name: 'DateTime', type: 'date' },
                        { name: 'Characteristic', type: 'nominal' },
                        { name: 'Value', type: 'numeric', unit: unit },
                        { name: 'Unit', type: 'nominal' }
                    ]
                }]
            }
        });
        
        await codapInterface.sendRequest({
            action: 'create',
            resource: 'dataContext[' + contextName + '].item',
            values: codapData
        });
        
        statusEl.innerText = 'Data imported successfully!';
        statusEl.className = 'status success';
        
    } catch (error) {
        statusEl.innerText = 'Error: ' + error.message;
        statusEl.className = 'status error';
    }
}

// Specialized function for Salinity Sites
async function findSalinitySites() {
    const stateCd = document.getElementById('salinity-state').value;
    await findGenericSites('00095', 'salinity', 'ES', stateCd || null);
}

// Specialized function for Salinity Import
async function importSalinityData() {
    await importGenericData('00095', 'salinity', 'Salinity_Data');
}

// WQP Services for E.Coli
async function findEColiSites() {
    const minLat = document.getElementById('min-lat').value;
    const maxLat = document.getElementById('max-lat').value;
    const minLong = document.getElementById('min-long').value;
    const maxLong = document.getElementById('max-long').value;
    
    const statusEl = document.getElementById('ecoli-status');
    const listEl = document.getElementById('ecoli-sites-list');
    
    statusEl.style.display = 'block';
    statusEl.innerText = 'Searching for sites...';
    statusEl.className = 'status';
    listEl.innerHTML = '';
    
    const url = `https://www.waterqualitydata.us/data/Station/search?bBox=${minLong},${minLat},${maxLong},${maxLat}&pCode=31625;50468;90901&mimeType=json`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch sites');
        const data = await response.json();
        
        const features = data.features || [];
        if (features.length === 0) {
            statusEl.innerText = 'No sites found for the given criteria.';
            statusEl.className = 'status error';
            return;
        }
        
        const sites = features.map(f => ({
            id: f.properties.MonitoringLocationIdentifier,
            name: f.properties.MonitoringLocationName,
            org: f.properties.OrganizationIdentifier
        }));
        
        state.ecoliSites = sites;
        statusEl.innerText = `Found ${sites.length} sites.`;
        statusEl.className = 'status success';
        
        sites.forEach(site => {
            const item = document.createElement('div');
            item.className = 'monitor-item';
            item.innerHTML = `<strong>${site.name}</strong><br>ID: ${site.id}`;
            item.onclick = () => {
                document.querySelectorAll('#ecoli-sites-list .monitor-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                state.selectedEColiSite = site;
                document.getElementById('ecoli-import-area').style.display = 'block';
            };
            listEl.appendChild(item);
        });
        
    } catch (error) {
        statusEl.innerText = 'Error: ' + error.message;
        statusEl.className = 'status error';
    }
}

async function importEColiData() {
    if (!state.selectedEColiSite) return;
    const site = state.selectedEColiSite;
    const targetDate = document.getElementById('target-date').value;
    
    const startObj = new Date(targetDate);
    startObj.setDate(startObj.getDate() - 3);
    const startD = `${String(startObj.getMonth() + 1).padStart(2, '0')}-${String(startObj.getDate()).padStart(2, '0')}-${startObj.getFullYear()}`;
    
    const endObj = new Date(targetDate);
    endObj.setDate(endObj.getDate() + 3);
    const endD = `${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}-${endObj.getFullYear()}`;

    const statusEl = document.getElementById('ecoli-status');
    statusEl.innerText = 'Importing data to CODAP...';
    
    const url = `https://www.waterqualitydata.us/data/Result/search?siteid=${site.id}&pCode=31625;50468;90901&startDateLo=${startD}&startDateHi=${endD}&mimeType=json`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch data');
        const data = await response.json();
        const results = data.features || [];
        
        if (results.length === 0) throw new Error('No data found for this site.');
        
        const codapData = results.map(f => {
            const props = f.properties;
            return {
                SiteName: site.name,
                SiteID: site.id,
                DateTime: props.ActivityStartDate + ' ' + (props.ActivityStartTime_Time || ''),
                Characteristic: props.CharacteristicName,
                Value: parseFloat(props.ResultMeasureValue),
                Unit: props.ResultMeasure_MeasureUnitCode
            };
        });
        
        await codapInterface.sendRequest({
            action: 'create',
            resource: 'dataContext',
            values: {
                name: 'EColi_Data',
                title: 'E.Coli Data',
                collections: [{
                    name: 'Observations',
                    attrs: [
                        { name: 'SiteName', type: 'nominal' },
                        { name: 'SiteID', type: 'nominal' },
                        { name: 'DateTime', type: 'date' },
                        { name: 'Characteristic', type: 'nominal' },
                        { name: 'Value', type: 'numeric' },
                        { name: 'Unit', type: 'nominal' }
                    ]
                }]
            }
        });
        
        await codapInterface.sendRequest({
            action: 'create',
            resource: 'dataContext[EColi_Data].item',
            values: codapData
        });
        
        statusEl.innerText = 'Data imported successfully!';
        statusEl.className = 'status success';
        
    } catch (error) {
        statusEl.innerText = 'Error: ' + error.message;
        statusEl.className = 'status error';
    }
}
