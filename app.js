// 1. Initialize the plugin connection with CODAP
// This establishes the iframe handshake with the parent CODAP window.
codapInterface.init({
    name: 'SimpleDummyData',
    title: 'Dummy Data Importer',
    version: '1.0',
    dimensions: { width: 300, height: 250 }
});

// 2. Define the structure of your table (Data Context)
const tableSetupRequest = {
    action: 'create',
    resource: 'dataContext',
    values: {
        name: 'Dummy_Dataset',
        title: 'My Dummy Data',
        collections: [{
            name: 'Measurements',
            attrs: [
                { name: 'ID', type: 'numeric' },
                { name: 'Value', type: 'numeric' }
            ]
        }]
    }
};

// 3. Define the function that sends the data when the button is clicked
async function importData() {
    const msgEl = document.getElementById('message');
    msgEl.innerText = "Communicating with CODAP...";
    msgEl.style.color = "black";

    try {
        // Step A: Tell CODAP to create the table structure
        await codapInterface.sendRequest(tableSetupRequest);

        // Step B: Tell CODAP to insert rows (items) into that specific table
        await codapInterface.sendRequest({
            action: 'create',
            resource: 'dataContext[Dummy_Dataset].item',
            values: [
                { ID: 1, Value: 10 },
                { ID: 2, Value: 20 },
                { ID: 3, Value: 30 }
            ]
        });

        msgEl.innerText = "Data imported successfully!";
        msgEl.style.color = "green";

    } catch (error) {
        console.error("CODAP Error:", error);
        msgEl.innerText = "Failed to import data.";
        msgEl.style.color = "red";
    }
}

// 4. Attach the function to the button once the webpage has fully loaded
window.onload = function() {
    document.getElementById('import-btn').addEventListener('click', importData);
};