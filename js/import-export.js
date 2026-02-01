// Import/Export utility for custom ball sets and tables

/**
 * Trigger a browser download of a JSON file
 */
function downloadJSON(filename, data) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Export a single ball set as JSON
 */
export function exportBallSet(ballSet) {
    const data = {
        type: 'poolGame_ballSet',
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: ballSet
    };
    const filename = `ballSet_${ballSet.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.json`;
    downloadJSON(filename, data);
}

/**
 * Export a single table as JSON
 */
export function exportTable(table) {
    const data = {
        type: 'poolGame_table',
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: table
    };
    const filename = `table_${table.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.json`;
    downloadJSON(filename, data);
}

/**
 * Validate ball set data structure
 */
function validateBallSetData(data) {
    if (typeof data !== 'object' || data === null) {
        throw new Error('Ball set data must be an object.');
    }

    if (!data.name || typeof data.name !== 'string') {
        throw new Error('Ball set must have a valid "name" field.');
    }
    if (!data.style || !['solid', 'stripe', 'snooker'].includes(data.style)) {
        throw new Error('Ball set must have a valid "style" field (solid, stripe, or snooker).');
    }
    if (!data.colors || typeof data.colors !== 'object') {
        throw new Error('Ball set must have a valid "colors" object.');
    }
    if (!data.options || typeof data.options !== 'object') {
        throw new Error('Ball set must have a valid "options" object.');
    }
}

/**
 * Parse and validate a single ball set JSON content
 */
export function importBallSet(jsonContent) {
    let parsed;
    try {
        parsed = JSON.parse(jsonContent);
    } catch (e) {
        throw new Error('Invalid file format. Please select a valid JSON file.');
    }

    if (parsed.type !== 'poolGame_ballSet') {
        throw new Error('Invalid file type. Expected ball set data.');
    }

    if (!parsed.data) {
        throw new Error('Invalid data format. Expected "data" field.');
    }

    validateBallSetData(parsed.data);
    return parsed.data;
}

/**
 * Validate table data structure
 */
function validateTableData(data) {
    if (typeof data !== 'object' || data === null) {
        throw new Error('Table data must be an object.');
    }

    if (!data.name || typeof data.name !== 'string') {
        throw new Error('Table must have a valid "name" field.');
    }
    if (data.baseTable === undefined || ![1, 2, 3, 4, 8, 9].includes(data.baseTable)) {
        throw new Error('Table must have a valid "baseTable" field (1, 2, 3, 4, 8, or 9).');
    }
    if (data.hue === undefined || typeof data.hue !== 'number') {
        throw new Error('Table must have a valid "hue" field.');
    }
    if (data.saturation === undefined || typeof data.saturation !== 'number') {
        throw new Error('Table must have a valid "saturation" field.');
    }
    if (data.brightness === undefined || typeof data.brightness !== 'number') {
        throw new Error('Table must have a valid "brightness" field.');
    }
}

/**
 * Parse and validate a single table JSON content
 */
export function importTable(jsonContent) {
    let parsed;
    try {
        parsed = JSON.parse(jsonContent);
    } catch (e) {
        throw new Error('Invalid file format. Please select a valid JSON file.');
    }

    if (parsed.type !== 'poolGame_table') {
        throw new Error('Invalid file type. Expected table data.');
    }

    if (!parsed.data) {
        throw new Error('Invalid data format. Expected "data" field.');
    }

    validateTableData(parsed.data);
    return parsed.data;
}
