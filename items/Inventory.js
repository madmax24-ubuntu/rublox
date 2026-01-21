export class Inventory {
    constructor() {
        this.items = new Array(10).fill(null); // Slots 0-9
        this.selectedSlot = 0;
    }

    addItem(weapon) {
        if (!weapon) return { slot: -1, added: false };
        const existingSlot = this.findSlotByType(weapon.type);
        if (existingSlot !== -1) {
            const existing = this.items[existingSlot];
            if (existing && typeof existing.resetCharges === 'function') {
                existing.resetCharges();
            }
            return { slot: existingSlot, added: false };
        }

        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] === null) {
                this.items[i] = weapon;
                return { slot: i, added: true };
            }
        }
        return { slot: -1, added: false };
    }

    findSlotByType(type) {
        if (!type) return -1;
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i]?.type === type) return i;
        }
        return -1;
    }

    removeItem(slot) {
        if (slot >= 0 && slot < this.items.length) {
            const item = this.items[slot];
            this.items[slot] = null;
            return item;
        }
        return null;
    }

    selectSlot(slot) {
        if (slot >= 0 && slot < this.items.length) {
            this.selectedSlot = slot;
            return this.items[slot];
        }
        return null;
    }

    getSelectedWeapon() {
        return this.items[this.selectedSlot];
    }

    hasItem(slot) {
        return this.items[slot] !== null;
    }

    getItems() {
        return this.items;
    }
}
