// Custom Table Manager - handles saving/loading custom table configurations with HSB adjustments

export class CustomTableManager {
    constructor() {
        this.storageKey = 'poolGame_customTables';
        this.customTables = this.loadCustomTables();
    }

    // Load custom tables from localStorage
    loadCustomTables() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const tables = JSON.parse(saved);
                // Validate structure
                if (Array.isArray(tables)) {
                    return tables;
                }
            }
        } catch (e) {
            console.warn('Failed to load custom tables:', e);
        }
        return [];
    }

    // Save custom tables to localStorage
    saveCustomTables() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.customTables));
        } catch (e) {
            console.warn('Failed to save custom tables:', e);
        }
    }

    // Create a new custom table
    create(config) {
        const id = 'custom_' + Date.now();
        const table = {
            id,
            name: config.name || 'Custom Table',
            baseTable: config.baseTable, // 1, 2, 3, 4, 8, or 9
            hue: config.hue || 0,
            saturation: config.saturation || 100,
            brightness: config.brightness || 100,
            isPredefined: false,
            isCustom: true
        };

        this.customTables.push(table);
        this.saveCustomTables();
        return table;
    }

    // Update an existing custom table
    update(id, config) {
        const index = this.customTables.findIndex(t => t.id === id);
        if (index === -1) return null;

        this.customTables[index] = {
            ...this.customTables[index],
            name: config.name || this.customTables[index].name,
            baseTable: config.baseTable !== undefined ? config.baseTable : this.customTables[index].baseTable,
            hue: config.hue !== undefined ? config.hue : this.customTables[index].hue,
            saturation: config.saturation !== undefined ? config.saturation : this.customTables[index].saturation,
            brightness: config.brightness !== undefined ? config.brightness : this.customTables[index].brightness
        };

        this.saveCustomTables();
        return this.customTables[index];
    }

    // Delete a custom table
    delete(id) {
        const index = this.customTables.findIndex(t => t.id === id);
        if (index === -1) return false;

        this.customTables.splice(index, 1);
        this.saveCustomTables();
        return true;
    }

    // Import a single table from external data (generates new ID)
    importTable(tableData) {
        // Strip existing IDs and metadata to avoid conflicts
        const { id, isPredefined, isCustom, ...cleanData } = tableData;
        return this.create(cleanData);
    }

    // Get a specific custom table by ID
    get(id) {
        return this.customTables.find(t => t.id === id);
    }

    // Get all custom tables
    getAll() {
        return [...this.customTables];
    }

    // Check if a table ID is a custom table
    isCustomTable(id) {
        return typeof id === 'string' && id.startsWith('custom_');
    }

    // Get base table number for rendering
    getBaseTableNumber(tableId) {
        if (this.isCustomTable(tableId)) {
            const customTable = this.get(tableId);
            return customTable ? customTable.baseTable : 1;
        }
        // It's a predefined table number
        return tableId;
    }

    // Get HSB adjustments for a table
    getHSBAdjustments(tableId) {
        if (this.isCustomTable(tableId)) {
            const customTable = this.get(tableId);
            if (customTable) {
                return {
                    hue: customTable.hue || 0,
                    saturation: customTable.saturation || 100,
                    brightness: customTable.brightness || 100
                };
            }
        }
        // No adjustments for predefined tables
        return null;
    }

    // Check if a colorize overlay exists for a base table
    hasColorizeOverlay(baseTable) {
        return [1, 2, 3, 4, 7, 8, 9].includes(baseTable);
    }
}
