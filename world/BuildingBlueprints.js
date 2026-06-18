import * as THREE from "/node_modules/three/build/three.module.js";

// Building templates per biome
// Each template defines: dimensions, floors, rooms, windows, doors, props, loot placement

export const BUILDING_TEMPLATES = [
    // Forest: log_cabin
    {
        type: "log_cabin", biome: ["forest"],
        width: 6, depth: 6, height: 4.5, floors: 1.5,
        rooms: [{ x: 0, z: 0, w: 5.4, d: 5.4, type: "main" }],
        windows: [{ dx: 0, dz: 3.0, width: 1.5, height: 1.2, side: "front" },
                  { dx: 0, dz: -3.0, width: 1.5, height: 1.2, side: "back" }],
        doors: [{ dx: 0, dz: 3.0, width: 1.8 }],
        props: [
            { type: "table", dx: 0, dz: 0, w: 2.4, d: 1.8, h: 1.125 },
            { type: "crate", dx: 1.8, dz: 1.8, w: 0.75, d: 0.75, h: 0.75 },
            { type: "crate", dx: -1.8, dz: 1.8, w: 0.75, d: 0.75, h: 0.75 },
            { type: "barrel", dx: 2.25, dz: 0, w: 0.6, d: 0.6, h: 1.2 },
            { type: "sandbag", dx: 1.2, dz: 2.55, w: 1.2, d: 0.6, h: 0.9 },
            { type: "sandbag", dx: -1.2, dz: 2.55, w: 1.2, d: 0.6, h: 0.9 }
        ],
        lootFloor: { ground: 3, first: 0, roof: 0 },
        wallColor: 0x5d4037, roofColor: 0x3e2723,
        hasRoof: true, hasStairs: false, hasMezzanine: false
    },
    // Forest: hunting_lodge
    {
        type: "hunting_lodge", biome: ["forest"],
        width: 8, depth: 6, height: 6, floors: 2,
        rooms: [
            { x: -1.5, z: -1, w: 3.6, d: 2.8, type: "living" },
            { x: 1.5, z: -1, w: 3.6, d: 2.8, type: "kitchen" },
            { x: -1.5, z: 1.5, w: 3.6, d: 2.8, type: "bedroom" }
        ],
        windows: [
            { dx: -1.5, dz: 3.0, width: 0.8, height: 0.9, side: "front" },
            { dx: 1.5, dz: 3.0, width: 0.8, height: 0.9, side: "front" },
            { dx: -1.5, dz: -3.0, width: 0.8, height: 0.9, side: "back" },
            { dx: 0, dz: 0, width: 1.0, height: 0.8, side: "side" }
        ],
        doors: [{ dx: 0, dz: 3.0, width: 1.2 }],
        props: [
            { type: "table", dx: -1.5, dz: -1, w: 1.6, d: 1.2, h: 0.75 },
            { type: "table", dx: 1.5, dz: -1, w: 1.2, d: 1.0, h: 0.75 },
            { type: "crate", dx: 3.0, dz: 0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "ammo_box", dx: -3.0, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "barrel", dx: 0, dz: 2.5, w: 0.4, d: 0.4, h: 0.8 },
            { type: "barrel", dx: 0, dz: -2.5, w: 0.4, d: 0.4, h: 0.8 },
            { type: "sandbag", dx: 0.8, dz: 2.7, w: 0.8, d: 0.4, h: 0.6 },
            { type: "sandbag", dx: -0.8, dz: 2.7, w: 0.8, d: 0.4, h: 0.6 },
            { type: "concrete_barrier", dx: 3.2, dz: 2.0, w: 1.2, d: 0.6, h: 0.6 }
        ],
        lootFloor: { ground: 2, first: 2, roof: 1 },
        wallColor: 0x6d4c41, roofColor: 0x4e342e,
        hasRoof: true, hasStairs: true, hasMezzanine: false
    },
    // Forest: watchtower
    {
        type: "watchtower", biome: ["forest"],
        width: 3, depth: 3, height: 7, floors: 1,
        rooms: [{ x: 0, z: 0, w: 2.6, d: 2.6, type: "tower" }],
        windows: [{ dx: 0, dz: 1.5, width: 0.8, height: 0.6, side: "front" }],
        doors: [{ dx: 0, dz: 1.5, width: 0.8 }],
        props: [
            { type: "ammo_box", dx: 0.8, dz: 0.8, w: 0.5, d: 0.7, h: 0.5 },
            { type: "crate", dx: -0.8, dz: 0.8, w: 0.5, d: 0.5, h: 0.5 }
        ],
        lootFloor: { ground: 1, first: 0, roof: 3 },
        wallColor: 0x5d4037, roofColor: 0x3e2723,
        hasRoof: true, hasStairs: false, hasMezzanine: false,
        hasRoofPlatform: true, hasLadder: true
    },
    // Swamp: stilt_house
    {
        type: "stilt_house", biome: ["swamp"],
        width: 6, depth: 5, height: 3.5, floors: 1, elevated: true,
        rooms: [{ x: 0, z: 0, w: 5.6, d: 4.6, type: "main" }],
        windows: [{ dx: 0, dz: 2.5, width: 1.0, height: 0.8, side: "front" }],
        doors: [{ dx: 0, dz: 2.5, width: 1.2 }],
        props: [
            { type: "table", dx: 0, dz: 0, w: 1.4, d: 1.0, h: 0.75 },
            { type: "crate", dx: 2.0, dz: 1.5, w: 0.5, d: 0.5, h: 0.5 },
            { type: "barrel", dx: -2.0, dz: 1.5, w: 0.4, d: 0.4, h: 0.8 },
            { type: "ammo_box", dx: 1.5, dz: -1.5, w: 0.5, d: 0.7, h: 0.5 }
        ],
        lootFloor: { ground: 2, first: 0, roof: 1 },
        wallColor: 0x4e342e, roofColor: 0x3e2723,
        hasRoof: true, hasStairs: false, hasMezzanine: false,
        elevated: true, elevationHeight: 2
    },
    // Swamp: swamp_shack
    {
        type: "swamp_shack", biome: ["swamp"],
        width: 4, depth: 4, height: 2.8, floors: 1,
        rooms: [{ x: 0, z: 0, w: 3.6, d: 3.6, type: "shack" }],
        windows: [{ dx: 0, dz: 2.0, width: 0.8, height: 0.7, side: "front" }],
        doors: [{ dx: 0, dz: 2.0, width: 1.0 }],
        props: [
            { type: "crate", dx: 1.0, dz: 1.0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "barrel", dx: -1.0, dz: -1.0, w: 0.4, d: 0.4, h: 0.8 }
        ],
        lootFloor: { ground: 1, first: 0, roof: 0 },
        wallColor: 0x3e4a3e, roofColor: 0x2e3b2e,
        hasRoof: true, hasStairs: false, hasMezzanine: false
    },
    // Desert: mud_hut
    {
        type: "mud_hut", biome: ["desert"],
        width: 5, depth: 5, height: 3.2, floors: 1,
        rooms: [{ x: 0, z: 0, w: 4.6, d: 4.6, type: "hut" }],
        windows: [{ dx: 0, dz: 2.5, width: 0.8, height: 1.0, side: "front" }],
        doors: [{ dx: 0, dz: 2.5, width: 1.2 }],
        props: [
            { type: "table", dx: 0, dz: 0, w: 1.6, d: 1.2, h: 0.75 },
            { type: "crate", dx: 1.8, dz: 1.8, w: 0.5, d: 0.5, h: 0.5 },
            { type: "ammo_box", dx: -1.8, dz: 1.8, w: 0.5, d: 0.7, h: 0.5 },
            { type: "barrel", dx: 1.8, dz: -1.8, w: 0.4, d: 0.4, h: 0.8 },
            { type: "sandbag", dx: 0.8, dz: 2.2, w: 0.8, d: 0.4, h: 0.6 },
            { type: "sandbag", dx: -0.8, dz: 2.2, w: 0.8, d: 0.4, h: 0.6 }
        ],
        lootFloor: { ground: 2, first: 0, roof: 1 },
        wallColor: 0x8d6e63, roofColor: 0x6d4c41,
        hasRoof: true, hasStairs: false, hasMezzanine: false
    },
    // Desert: desert_outpost
    {
        type: "desert_outpost", biome: ["desert"],
        width: 8, depth: 8, height: 5.5, floors: 2,
        rooms: [
            { x: -1.5, z: -1.5, w: 3.6, d: 3.6, type: "quarters" },
            { x: 1.5, z: 1.5, w: 3.6, d: 3.6, type: "storage" }
        ],
        windows: [
            { dx: -1.5, dz: 2.5, width: 0.8, height: 0.8, side: "front" },
            { dx: 1.5, dz: 2.5, width: 0.8, height: 0.8, side: "front" }
        ],
        doors: [{ dx: 0, dz: 4.0, width: 1.4 }],
        props: [
            { type: "table", dx: -1.5, dz: -1.5, w: 1.6, d: 1.2, h: 0.75 },
            { type: "table", dx: 1.5, dz: 1.5, w: 1.2, d: 1.0, h: 0.75 },
            { type: "crate", dx: 3.0, dz: 0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "crate", dx: -3.0, dz: 0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "ammo_box", dx: 0, dz: -3.0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "barrel", dx: 2.0, dz: 2.0, w: 0.4, d: 0.4, h: 0.8 },
            { type: "sandbag", dx: 0.8, dz: 3.5, w: 0.8, d: 0.4, h: 0.6 },
            { type: "sandbag", dx: -0.8, dz: 3.5, w: 0.8, d: 0.4, h: 0.6 },
            { type: "concrete_barrier", dx: 3.5, dz: 3.0, w: 1.2, d: 0.6, h: 0.6 }
        ],
        lootFloor: { ground: 3, first: 3, roof: 2 },
        wallColor: 0x9e8c6c, roofColor: 0x6d4c41,
        hasRoof: true, hasStairs: true, hasMezzanine: false
    },
    // Industrial: warehouse
    {
        type: "warehouse", biome: ["industrial"],
        width: 15, depth: 20, height: 8, floors: 1,
        rooms: [
            { x: -3, z: -3, w: 8, d: 10, type: "storage_a" },
            { x: 4, z: 4, w: 8, d: 10, type: "storage_b" }
        ],
        windows: [
            { dx: 0, dz: 10.0, width: 1.2, height: 1.2, side: "front" },
            { dx: -5, dz: 10.0, width: 1.0, height: 1.0, side: "front" },
            { dx: 5, dz: -10.0, width: 1.2, height: 1.2, side: "back" }
        ],
        doors: [{ dx: 0, dz: 10.0, width: 3.0 }, { dx: -6, dz: -10.0, width: 2.0 }],
        props: [
            { type: "ammo_box", dx: 0, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "ammo_box", dx: 3, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "ammo_box", dx: -3, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "crate", dx: 6, dz: 5, w: 0.5, d: 0.5, h: 0.5 },
            { type: "barrel", dx: -6, dz: -5, w: 0.4, d: 0.4, h: 0.8 },
            { type: "concrete_barrier", dx: 0, dz: 8, w: 1.2, d: 0.6, h: 0.6 },
            { type: "sandbag", dx: 2, dz: 8, w: 0.8, d: 0.4, h: 0.6 }
        ],
        lootFloor: { ground: 5, first: 0, roof: 2 },
        wallColor: 0x78909c, roofColor: 0x546e7a,
        hasRoof: true, hasStairs: false, hasMezzanine: true
    },
    // Industrial: factory
    {
        type: "factory", biome: ["industrial"],
        width: 20, depth: 15, height: 10, floors: 2,
        rooms: [
            { x: -4, z: -3, w: 10, d: 8, type: "assembly" },
            { x: 5, z: 3, w: 10, d: 8, type: "packaging" }
        ],
        windows: [
            { dx: -4, dz: 7.5, width: 1.0, height: 1.5, side: "front" },
            { dx: 5, dz: 7.5, width: 1.0, height: 1.5, side: "front" },
            { dx: -4, dz: -7.5, width: 1.0, height: 1.5, side: "back" }
        ],
        doors: [{ dx: 0, dz: 7.5, width: 2.5 }],
        props: [
            { type: "table", dx: -4, dz: -3, w: 2.4, d: 1.6, h: 0.8 },
            { type: "table", dx: 5, dz: 3, w: 2.4, d: 1.6, h: 0.8 },
            { type: "ammo_box", dx: 3, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "crate", dx: -6, dz: 3, w: 0.5, d: 0.5, h: 0.5 },
            { type: "barrel", dx: 0, dz: -5, w: 0.4, d: 0.4, h: 0.8 },
            { type: "concrete_barrier", dx: 0, dz: 5, w: 1.2, d: 0.6, h: 0.6 },
            { type: "sandbag", dx: 2, dz: 6, w: 0.8, d: 0.4, h: 0.6 }
        ],
        lootFloor: { ground: 4, first: 4, roof: 3 },
        wallColor: 0x607d8b, roofColor: 0x455a64,
        hasRoof: true, hasStairs: true, hasMezzanine: true
    },
    // Industrial: storage_unit
    {
        type: "storage_unit", biome: ["industrial"],
        width: 6, depth: 4, height: 4, floors: 1,
        rooms: [{ x: 0, z: 0, w: 5.6, d: 3.6, type: "storage" }],
        windows: [{ dx: 0, dz: 2.0, width: 0.8, height: 0.8, side: "front" }],
        doors: [{ dx: 0, dz: 2.0, width: 1.5 }],
        props: [
            { type: "ammo_box", dx: 1.5, dz: 1.0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "ammo_box", dx: -1.5, dz: 1.0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "crate", dx: 1.5, dz: -1.0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "barrel", dx: -1.5, dz: -1.0, w: 0.4, d: 0.4, h: 0.8 },
            { type: "sandbag", dx: 0.8, dz: 1.7, w: 0.8, d: 0.4, h: 0.6 },
            { type: "sandbag", dx: -0.8, dz: 1.7, w: 0.8, d: 0.4, h: 0.6 }
        ],
        lootFloor: { ground: 3, first: 0, roof: 1 },
        wallColor: 0x78909c, roofColor: 0x455a64,
        hasRoof: true, hasStairs: false, hasMezzanine: false
    },
    // Ruins: ruined_house
    {
        type: "ruined_house", biome: ["ruins"],
        width: 6, depth: 8, height: 4, floors: 1,
        rooms: [
            { x: -1.2, z: 0, w: 2.8, d: 3.6, type: "room_a" },
            { x: 1.2, z: 0, w: 2.8, d: 3.6, type: "room_b" }
        ],
        windows: [
            { dx: -1.2, dz: 4.0, width: 0.8, height: 0.8, side: "front" },
            { dx: 1.2, dz: 4.0, width: 0.8, height: 0.8, side: "front" }
        ],
        doors: [{ dx: 0, dz: 4.0, width: 1.2 }],
        props: [
            { type: "crate", dx: -1.2, dz: 0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "crate", dx: 1.2, dz: 0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "barrel", dx: 0, dz: -3.0, w: 0.4, d: 0.4, h: 0.8 },
            { type: "ammo_box", dx: 0, dz: 2.0, w: 0.5, d: 0.7, h: 0.5 }
        ],
        lootFloor: { ground: 3, first: 0, roof: 2 },
        wallColor: 0x795548, roofColor: 0x5d4037,
        hasRoof: true, hasStairs: false, hasMezzanine: false,
        isRuined: true
    },
    // Ruins: ancient_temple
    {
        type: "ancient_temple", biome: ["ruins"],
        width: 8, depth: 8, height: 5, floors: 1,
        rooms: [{ x: 0, z: 0, w: 7.0, d: 7.0, type: "temple" }],
        windows: [{ dx: 0, dz: 4.0, width: 1.5, height: 1.2, side: "front" }],
        doors: [{ dx: 0, dz: 4.0, width: 2.0 }],
        props: [
            { type: "table", dx: 0, dz: 0, w: 2.0, d: 1.4, h: 0.8 },
            { type: "crate", dx: 3.0, dz: 3.0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "ammo_box", dx: -3.0, dz: 3.0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "sandbag", dx: 1.0, dz: 3.5, w: 0.8, d: 0.4, h: 0.6 },
            { type: "sandbag", dx: -1.0, dz: 3.5, w: 0.8, d: 0.4, h: 0.6 }
        ],
        lootFloor: { ground: 3, first: 0, roof: 3 },
        wallColor: 0x8d6e63, roofColor: 0x6d4c41,
        hasRoof: true, hasStairs: false, hasMezzanine: false,
        isRuined: true, hasColumns: true
    },
    // Mountain: mountain_lodge
    {
        type: "mountain_lodge", biome: ["mountain"],
        width: 10, depth: 8, height: 7, floors: 2,
        rooms: [
            { x: -2, z: -1, w: 4.6, d: 3.6, type: "living" },
            { x: 2, z: -1, w: 4.6, d: 3.6, type: "dining" },
            { x: -2, z: 2.5, w: 4.6, d: 3.6, type: "bedroom_a" },
            { x: 2, z: 2.5, w: 4.6, d: 3.6, type: "bedroom_b" }
        ],
        windows: [
            { dx: -2, dz: 4.0, width: 1.0, height: 1.0, side: "front" },
            { dx: 2, dz: 4.0, width: 1.0, height: 1.0, side: "front" },
            { dx: -2, dz: -4.0, width: 1.0, height: 1.0, side: "back" },
            { dx: 2, dz: -4.0, width: 1.0, height: 1.0, side: "back" }
        ],
        doors: [{ dx: 0, dz: 4.0, width: 1.4 }],
        props: [
            { type: "table", dx: -2, dz: -1, w: 1.6, d: 1.2, h: 0.75 },
            { type: "table", dx: 2, dz: -1, w: 1.4, d: 1.0, h: 0.75 },
            { type: "crate", dx: 4.5, dz: 0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "ammo_box", dx: -4.5, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "barrel", dx: 0, dz: -3, w: 0.4, d: 0.4, h: 0.8 },
            { type: "sandbag", dx: 0.8, dz: 3.6, w: 0.8, d: 0.4, h: 0.6 },
            { type: "sandbag", dx: -0.8, dz: 3.6, w: 0.8, d: 0.4, h: 0.6 },
            { type: "concrete_barrier", dx: 4.5, dz: 3, w: 1.2, d: 0.6, h: 0.6 }
        ],
        lootFloor: { ground: 3, first: 3, roof: 2 },
        wallColor: 0x6d4c41, roofColor: 0x4e342e,
        hasRoof: true, hasStairs: true, hasMezzanine: false
    },
    // Plain: farmhouse
    {
        type: "farmhouse", biome: ["plains"],
        width: 8, depth: 6, height: 6, floors: 2,
        rooms: [
            { x: -1.5, z: -1, w: 3.6, d: 2.8, type: "kitchen" },
            { x: 1.5, z: -1, w: 3.6, d: 2.8, type: "living" },
            { x: -1.5, z: 1.5, w: 3.6, d: 2.8, type: "bedroom" }
        ],
        windows: [
            { dx: -1.5, dz: 3.0, width: 0.8, height: 0.9, side: "front" },
            { dx: 1.5, dz: 3.0, width: 0.8, height: 0.9, side: "front" },
            { dx: -1.5, dz: -3.0, width: 0.8, height: 0.9, side: "back" }
        ],
        doors: [{ dx: 0, dz: 3.0, width: 1.2 }],
        props: [
            { type: "table", dx: -1.5, dz: -1, w: 1.6, d: 1.2, h: 0.75 },
            { type: "table", dx: 1.5, dz: -1, w: 1.2, d: 1.0, h: 0.75 },
            { type: "crate", dx: 3.0, dz: 0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "ammo_box", dx: -3.0, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "barrel", dx: 0, dz: 2.5, w: 0.4, d: 0.4, h: 0.8 },
            { type: "barrel", dx: 0, dz: -2.5, w: 0.4, d: 0.4, h: 0.8 },
            { type: "sandbag", dx: 0.8, dz: 2.7, w: 0.8, d: 0.4, h: 0.6 },
            { type: "sandbag", dx: -0.8, dz: 2.7, w: 0.8, d: 0.4, h: 0.6 },
            { type: "concrete_barrier", dx: 3.5, dz: 2, w: 1.2, d: 0.6, h: 0.6 }
        ],
        lootFloor: { ground: 2, first: 2, roof: 1 },
        wallColor: 0xd7ccc8, roofColor: 0x5d4037,
        hasRoof: true, hasStairs: true, hasMezzanine: false
    },
    // Plain: barn
    {
        type: "barn", biome: ["plains"],
        width: 12, depth: 8, height: 5, floors: 1,
        rooms: [{ x: 0, z: 0, w: 11.6, d: 7.6, type: "barn" }],
        windows: [
            { dx: -3, dz: 4.0, width: 1.0, height: 1.0, side: "front" },
            { dx: 3, dz: 4.0, width: 1.0, height: 1.0, side: "front" }
        ],
        doors: [{ dx: 0, dz: 4.0, width: 3.0 }],
        props: [
            { type: "crate", dx: 4, dz: 2, w: 0.5, d: 0.5, h: 0.5 },
            { type: "crate", dx: -4, dz: 2, w: 0.5, d: 0.5, h: 0.5 },
            { type: "ammo_box", dx: 4, dz: -2, w: 0.5, d: 0.7, h: 0.5 },
            { type: "barrel", dx: -4, dz: -2, w: 0.4, d: 0.4, h: 0.8 },
            { type: "sandbag", dx: 2, dz: 3.5, w: 0.8, d: 0.4, h: 0.6 }
        ],
        lootFloor: { ground: 4, first: 0, roof: 2 },
        wallColor: 0x8d6e63, roofColor: 0x5d4037,
        hasRoof: true, hasStairs: false, hasMezzanine: false
    },
    // Plain: silo
    {
        type: "silo", biome: ["plains"],
        width: 3, depth: 3, height: 8, floors: 1,
        rooms: [{ x: 0, z: 0, w: 2.6, d: 2.6, type: "silo" }],
        windows: [{ dx: 0, dz: 1.5, width: 0.8, height: 0.8, side: "front" }],
        doors: [{ dx: 0, dz: 1.5, width: 0.8 }],
        props: [
            { type: "ammo_box", dx: 0.8, dz: 0.8, w: 0.5, d: 0.7, h: 0.5 },
            { type: "crate", dx: -0.8, dz: 0.8, w: 0.5, d: 0.5, h: 0.5 }
        ],
        lootFloor: { ground: 2, first: 0, roof: 2 },
        wallColor: 0x9e9e9e, roofColor: 0x616161,
        hasRoof: true, hasStairs: false, hasMezzanine: false,
        hasRoofPlatform: true, hasLadder: true
    },
    // Snow: igloo
    {
        type: "igloo", biome: ["snow"],
        width: 5, depth: 5, height: 2.5, floors: 1,
        rooms: [{ x: 0, z: 0, w: 4.6, d: 4.6, type: "igloo" }],
        windows: [{ dx: 0, dz: 2.5, width: 0.8, height: 0.6, side: "front" }],
        doors: [{ dx: 0, dz: 2.5, width: 1.0 }],
        props: [
            { type: "table", dx: 0, dz: 0, w: 1.2, d: 0.8, h: 0.6 },
            { type: "crate", dx: 1.5, dz: 1.5, w: 0.5, d: 0.5, h: 0.5 },
            { type: "ammo_box", dx: -1.5, dz: 1.5, w: 0.5, d: 0.7, h: 0.5 }
        ],
        lootFloor: { ground: 2, first: 0, roof: 1 },
        wallColor: 0xe0e0e0, roofColor: 0xbdbdbd,
        hasRoof: true, hasStairs: false, hasMezzanine: false
    },
    // Snow: snow_shelter
    {
        type: "snow_shelter", biome: ["snow"],
        width: 4, depth: 3, height: 2.5, floors: 1,
        rooms: [{ x: 0, z: 0, w: 3.6, d: 2.6, type: "shelter" }],
        windows: [{ dx: 0, dz: 1.5, width: 0.8, height: 0.6, side: "front" }],
        doors: [{ dx: 0, dz: 1.5, width: 0.8 }],
        props: [
            { type: "crate", dx: 1.0, dz: 0.8, w: 0.5, d: 0.5, h: 0.5 },
            { type: "ammo_box", dx: -1.0, dz: 0.8, w: 0.5, d: 0.7, h: 0.5 }
        ],
        lootFloor: { ground: 1, first: 0, roof: 0 },
        wallColor: 0xf5f5f5, roofColor: 0xe0e0e0,
        hasRoof: true, hasStairs: false, hasMezzanine: false
    },
    // Snow: mountain_cache
    {
        type: "mountain_cache", biome: ["snow"],
        width: 6, depth: 4, height: 3, floors: 1,
        rooms: [{ x: 0, z: 0, w: 5.6, d: 3.6, type: "cache" }],
        windows: [{ dx: 0, dz: 2.0, width: 1.0, height: 0.8, side: "front" }],
        doors: [{ dx: 0, dz: 2.0, width: 1.2 }],
        props: [
            { type: "ammo_box", dx: 1.5, dz: 1.0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "ammo_box", dx: -1.5, dz: 1.0, w: 0.5, d: 0.7, h: 0.5 },
            { type: "crate", dx: 1.5, dz: -1.0, w: 0.5, d: 0.5, h: 0.5 },
            { type: "sandbag", dx: 0.8, dz: 1.7, w: 0.8, d: 0.4, h: 0.6 },
            { type: "sandbag", dx: -0.8, dz: 1.7, w: 0.8, d: 0.4, h: 0.6 }
        ],
        lootFloor: { ground: 3, first: 0, roof: 2 },
        wallColor: 0xb0bec5, roofColor: 0x78909c,
        hasRoof: true, hasStairs: false, hasMezzanine: false
    },
    // --- NEW SURVIVAL MAP BUILDING TYPES ---
    {
    type: "big_house", biome: ["plains", "forest"],
    width: 12, depth: 10, height: 7, floors: 2,
    rooms: [
        { x: -2.5, z: -1.5, w: 4.8, d: 3.8, type: "kitchen" },
        { x: 2.5, z: -1.5, w: 4.8, d: 3.8, type: "living" },
        { x: -2.5, z: 2.5, w: 4.8, d: 3.8, type: "bedroom_a" },
        { x: 2.5, z: 2.5, w: 4.8, d: 3.8, type: "bedroom_b" }
    ],
    windows: [
        { dx: -2.5, dz: 5.0, width: 1.2, height: 1.2, side: "front" },
        { dx: 2.5, dz: 5.0, width: 1.2, height: 1.2, side: "front" },
        { dx: -2.5, dz: -5.0, width: 1.0, height: 1.0, side: "back" },
        { dx: 2.5, dz: -5.0, width: 1.0, height: 1.0, side: "back" }
    ],
    doors: [
        { dx: 0, dz: 5.0, width: 1.8 },
        { dx: -2.5, dz: 5.0, width: 1.0 }
    ],
    props: [
        { type: "table", dx: -2.5, dz: -1.5, w: 1.8, d: 1.2, h: 0.75 },
        { type: "table", dx: 2.5, dz: -1.5, w: 1.6, d: 1.0, h: 0.75 },
        { type: "crate", dx: 5.5, dz: 0, w: 0.8, d: 0.8, h: 0.8 },
        { type: "ammo_box", dx: -5.5, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
        { type: "barrel", dx: 0, dz: -4, w: 0.4, d: 0.4, h: 0.8 },
        { type: "sandbag", dx: 3.0, dz: 4.5, w: 1.2, d: 0.6, h: 0.9 },
        { type: "concrete_barrier", dx: -3.0, dz: 4.5, w: 1.2, d: 0.6, h: 0.6 }
    ],
    lootFloor: { ground: 3, first: 3, roof: 2 },
    wallColor: 0xe8d5b7, roofColor: 0x5d4037,
    hasRoof: true, hasStairs: true, hasMezzanine: false
},
{
    type: "hangar", biome: ["industrial"],
    width: 20, depth: 12, height: 8, floors: 1,
    rooms: [{ x: 0, z: 0, w: 18, d: 10, type: "main_bay" }],
    windows: [
        { dx: -5, dz: 6.0, width: 1.5, height: 2.0, side: "front" },
        { dx: 5, dz: 6.0, width: 1.5, height: 2.0, side: "front" },
        { dx: -8, dz: -6.0, width: 1.2, height: 1.5, side: "back" }
    ],
    doors: [
        { dx: 0, dz: 6.0, width: 4.0 },
        { dx: -8, dz: -6.0, width: 3.0 }
    ],
    props: [
        { type: "table", dx: -5, dz: 0, w: 2.4, d: 1.6, h: 0.8 },
        { type: "crate", dx: 8, dz: 4, w: 1.0, d: 1.0, h: 1.0 },
        { type: "crate", dx: -8, dz: 4, w: 1.0, d: 1.0, h: 1.0 },
        { type: "ammo_box", dx: 5, dz: -4, w: 0.5, d: 0.7, h: 0.5 },
        { type: "ammo_box", dx: -5, dz: -4, w: 0.5, d: 0.7, h: 0.5 },
        { type: "barrel", dx: 0, dz: 5, w: 0.5, d: 0.5, h: 1.0 },
        { type: "sandbag", dx: 6, dz: 5.5, w: 1.2, d: 0.6, h: 0.9 },
        { type: "concrete_barrier", dx: -6, dz: 5.5, w: 1.2, d: 0.6, h: 0.6 }
    ],
    lootFloor: { ground: 5, first: 0, roof: 2 },
    wallColor: 0x90a4ae, roofColor: 0x546e7a,
    hasRoof: true, hasStairs: false, hasMezzanine: false
},
{
    type: "industrial_shed", biome: ["industrial"],
    width: 16, depth: 10, height: 6, floors: 1,
    rooms: [{ x: 0, z: 0, w: 14, d: 8, type: "storage" }],
    windows: [
        { dx: -4, dz: 5.0, width: 1.0, height: 1.5, side: "front" },
        { dx: 4, dz: 5.0, width: 1.0, height: 1.5, side: "front" }
    ],
    doors: [
        { dx: 0, dz: 5.0, width: 3.5 }
    ],
    props: [
        { type: "ammo_box", dx: 5, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
        { type: "ammo_box", dx: -5, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
        { type: "crate", dx: 0, dz: 4, w: 0.8, d: 0.8, h: 0.8 },
        { type: "barrel", dx: -8, dz: -3, w: 0.5, d: 0.5, h: 1.0 },
        { type: "sandbag", dx: 4, dz: 4.5, w: 1.2, d: 0.6, h: 0.9 },
        { type: "concrete_barrier", dx: -4, dz: 4.5, w: 1.2, d: 0.6, h: 0.6 }
    ],
    lootFloor: { ground: 4, first: 0, roof: 1 },
    wallColor: 0x78909c, roofColor: 0x455a64,
    hasRoof: true, hasStairs: false, hasMezzanine: false
},
{
    type: "barracks", biome: ["industrial", "ruins"],
    width: 14, depth: 8, height: 5, floors: 1,
    rooms: [
        { x: -3.5, z: -1.5, w: 4.0, d: 3.0, type: "quarters_a" },
        { x: 0, z: -1.5, w: 4.0, d: 3.0, type: "quarters_b" },
        { x: 3.5, z: -1.5, w: 4.0, d: 3.0, type: "quarters_c" }
    ],
    windows: [
        { dx: -3.5, dz: 4.0, width: 0.8, height: 0.8, side: "front" },
        { dx: 0, dz: 4.0, width: 0.8, height: 0.8, side: "front" },
        { dx: 3.5, dz: 4.0, width: 0.8, height: 0.8, side: "front" }
    ],
    doors: [
        { dx: 0, dz: 4.0, width: 1.4 }
    ],
    props: [
        { type: "table", dx: -3.5, dz: 0, w: 1.2, d: 0.8, h: 0.6 },
        { type: "table", dx: 3.5, dz: 0, w: 1.2, d: 0.8, h: 0.6 },
        { type: "crate", dx: 0, dz: 3.0, w: 0.6, d: 0.6, h: 0.6 },
        { type: "ammo_box", dx: -6, dz: -3, w: 0.5, d: 0.7, h: 0.5 },
        { type: "ammo_box", dx: 6, dz: -3, w: 0.5, d: 0.7, h: 0.5 },
        { type: "sandbag", dx: 4, dz: 3.5, w: 1.2, d: 0.6, h: 0.9 },
        { type: "sandbag", dx: -4, dz: 3.5, w: 1.2, d: 0.6, h: 0.9 },
        { type: "concrete_barrier", dx: 0, dz: 3.5, w: 1.2, d: 0.6, h: 0.6 }
    ],
    lootFloor: { ground: 3, first: 0, roof: 1 },
    wallColor: 0xb0bec5, roofColor: 0x78909c,
    hasRoof: true, hasStairs: false, hasMezzanine: false
},
{
    type: "farm_barn", biome: ["plains"],
    width: 14, depth: 10, height: 6, floors: 1,
    rooms: [{ x: 0, z: 0, w: 13, d: 9, type: "barn" }],
    windows: [
        { dx: -4, dz: 5.0, width: 1.2, height: 1.5, side: "front" },
        { dx: 4, dz: 5.0, width: 1.2, height: 1.5, side: "front" }
    ],
    doors: [
        { dx: 0, dz: 5.0, width: 3.5 }
    ],
    props: [
        { type: "crate", dx: 5, dz: 3, w: 0.8, d: 0.8, h: 0.8 },
        { type: "crate", dx: -5, dz: 3, w: 0.8, d: 0.8, h: 0.8 },
        { type: "ammo_box", dx: 0, dz: -3, w: 0.5, d: 0.7, h: 0.5 },
        { type: "barrel", dx: -8, dz: -3, w: 0.5, d: 0.5, h: 1.0 },
        { type: "barrel", dx: 8, dz: -3, w: 0.5, d: 0.5, h: 1.0 },
        { type: "sandbag", dx: 6, dz: 4.5, w: 1.2, d: 0.6, h: 0.9 }
    ],
    lootFloor: { ground: 4, first: 0, roof: 2 },
    wallColor: 0xa1887f, roofColor: 0x5d4037,
    hasRoof: true, hasStairs: false, hasMezzanine: false
},
{
    type: "fortified_outpost", biome: ["desert", "ruins"],
    width: 10, depth: 10, height: 6, floors: 2,
    rooms: [
        { x: -2, z: -2, w: 3.8, d: 3.8, type: "watch" },
        { x: 2, z: -2, w: 3.8, d: 3.8, type: "storage" }
    ],
    windows: [
        { dx: -2, dz: 5.0, width: 0.8, height: 0.8, side: "front" },
        { dx: 2, dz: 5.0, width: 0.8, height: 0.8, side: "front" },
        { dx: -2, dz: -5.0, width: 0.8, height: 0.8, side: "back" },
        { dx: 2, dz: -5.0, width: 0.8, height: 0.8, side: "back" }
    ],
    doors: [
        { dx: 0, dz: 5.0, width: 1.5 }
    ],
    props: [
        { type: "ammo_box", dx: -3.5, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
        { type: "ammo_box", dx: 3.5, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
        { type: "crate", dx: 0, dz: 3.5, w: 0.8, d: 0.8, h: 0.8 },
        { type: "sandbag", dx: 4, dz: 4.5, w: 1.2, d: 0.6, h: 0.9 },
        { type: "sandbag", dx: -4, dz: 4.5, w: 1.2, d: 0.6, h: 0.9 },
        { type: "sandbag", dx: 4, dz: -4.5, w: 1.2, d: 0.6, h: 0.9 },
        { type: "sandbag", dx: -4, dz: -4.5, w: 1.2, d: 0.6, h: 0.9 },
        { type: "concrete_barrier", dx: 0, dz: 4.5, w: 1.2, d: 0.6, h: 0.6 },
        { type: "concrete_barrier", dx: 0, dz: -4.5, w: 1.2, d: 0.6, h: 0.6 }
    ],
    lootFloor: { ground: 3, first: 3, roof: 3 },
    wallColor: 0x9e9e9e, roofColor: 0x616161,
    hasRoof: true, hasStairs: true, hasMezzanine: false,
    hasRoofPlatform: true, hasLadder: true
},
{
    type: "warehouse_large", biome: ["industrial"],
    width: 18, depth: 16, height: 8, floors: 1,
    rooms: [
        { x: -4, z: -3, w: 8, d: 7, type: "storage_a" },
        { x: 4, z: 3, w: 8, d: 7, type: "storage_b" }
    ],
    windows: [
        { dx: 0, dz: 8.0, width: 1.5, height: 1.5, side: "front" },
        { dx: -6, dz: 8.0, width: 1.0, height: 1.0, side: "front" },
        { dx: 6, dz: -8.0, width: 1.5, height: 1.5, side: "back" }
    ],
    doors: [
        { dx: 0, dz: 8.0, width: 3.5 },
        { dx: -6, dz: -8.0, width: 2.5 }
    ],
    props: [
        { type: "ammo_box", dx: 0, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
        { type: "ammo_box", dx: 4, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
        { type: "ammo_box", dx: -4, dz: 0, w: 0.5, d: 0.7, h: 0.5 },
        { type: "ammo_box", dx: 0, dz: 4, w: 0.5, d: 0.7, h: 0.5 },
        { type: "crate", dx: 8, dz: 5, w: 1.0, d: 1.0, h: 1.0 },
        { type: "crate", dx: -8, dz: -5, w: 1.0, d: 1.0, h: 1.0 },
        { type: "barrel", dx: -6, dz: 5, w: 0.5, d: 0.5, h: 1.0 },
        { type: "concrete_barrier", dx: 0, dz: 7, w: 1.2, d: 0.6, h: 0.6 },
        { type: "sandbag", dx: 4, dz: 7, w: 1.2, d: 0.6, h: 0.9 },
        { type: "sandbag", dx: -4, dz: 7, w: 1.2, d: 0.6, h: 0.9 }
    ],
    lootFloor: { ground: 6, first: 0, roof: 3 },
    wallColor: 0x607d8b, roofColor: 0x455a64,
    hasRoof: true, hasStairs: false, hasMezzanine: true
},
{
    type: "ruined_factory", biome: ["ruins", "industrial"],
    width: 16, depth: 12, height: 7, floors: 2,
    rooms: [
        { x: -3, z: -2, w: 7, d: 5, type: "machine_a" },
        { x: 3, z: 2, w: 7, d: 5, type: "machine_b" }
    ],
    windows: [
        { dx: -3, dz: 6.0, width: 1.2, height: 1.5, side: "front" },
        { dx: 3, dz: 6.0, width: 1.2, height: 1.5, side: "front" }
    ],
    doors: [
        { dx: 0, dz: 6.0, width: 2.5 }
    ],
    props: [
        { type: "crate", dx: 5, dz: 4, w: 1.0, d: 1.0, h: 1.0 },
        { type: "crate", dx: -5, dz: 4, w: 1.0, d: 1.0, h: 1.0 },
        { type: "ammo_box", dx: 0, dz: -4, w: 0.5, d: 0.7, h: 0.5 },
        { type: "barrel", dx: -6, dz: -3, w: 0.5, d: 0.5, h: 1.0 },
        { type: "sandbag", dx: 5, dz: 5.5, w: 1.2, d: 0.6, h: 0.9 },
        { type: "concrete_barrier", dx: -5, dz: 5.5, w: 1.2, d: 0.6, h: 0.6 }
    ],
    lootFloor: { ground: 4, first: 3, roof: 3 },
    wallColor: 0x6d4c41, roofColor: 0x3e2723,
    hasRoof: true, hasStairs: true, hasMezzanine: false,
    isRuined: true
},
// === Stone Maze biomes (NE quadrant) ===
{
    type: "maze_wall", biome: ["stone_maze"],
    width: 12, depth: 12, height: 4.5, floors: 0,
    rooms: [{ x: 0, z: 0, w: 8, d: 8, type: "corridor" }],
    windows: [], // No windows in maze walls — solid structure
    doors: [
        { dx: -3, dz: 6.0, width: 2.0 },   // corridor entrance left
        { dx: 3, dz: -6.0, width: 2.0 }     // exit opposite side
    ],
    props: [],
    lootFloor: { ground: 5, first: 0, roof: 0 },
    wallColor: 0x7a7a6e, roofColor: 0x8b8b7d,
    hasRoof: false, hasStairs: false, isMazeWall: true
},
{
    type: "maze_tower", biome: ["stone_maze"],
    width: 5, depth: 5, height: 10, floors: 2,
    rooms: [{ x: 0, z: 0, w: 4.6, d: 4.6, type: "tower" }],
    windows: [
        { dx: 0, dz: 2.5, width: 1.0, height: 1.5, side: "front", type: "archer_loophole" },
        { dx: -2.3, dz: 0, width: 1.0, height: 1.5, side: "left", type: "archer_loophole" }
    ],
    doors: [{ dx: 0, dz: 2.5, width: 1.8 }],
    props: [
        { type: "ammo_box", dx: 0, dz: 0, w: 0.6, d: 0.4, h: 0.6 },
        { type: "crate", dx: 2, dz: 1, w: 0.8, d: 0.8, h: 0.8 }
    ],
    lootFloor: { ground: 3, first: 0, roof: 4 },
    wallColor: 0x696960, roofColor: 0x5a5a52,
    hasRoof: true, hasStairs: false, isMazeTower: true
},

// === Military Zone biomes (SW quadrant) ===
{
    type: "bunker", biome: ["military"],
    width: 10, depth: 8, height: 5.5, floors: 1,
    rooms: [{ x: 0, z: 0, w: 9.6, d: 7.6, type: "bunker" }],
    windows: [
        { dx: -2, dz: 4.0, width: 0.8, height: 0.8, side: "front", type: "observation_port" },
        { dx: 2, dz: 4.0, width: 0.8, height: 0.8, side: "front", type: "observation_port" }
    ],
    doors: [{ dx: 0, dz: 4.0, width: 1.5 }],
    props: [
        { type: "ammo_box", dx: -3, dz: 2, w: 0.6, d: 0.8, h: 0.7 },
        { type: "ammo_box", dx: 3, dz: 2, w: 0.6, d: 0.8, h: 0.7 },
        { type: "crate", dx: -4, dz: -3, w: 1.0, d: 1.0, h: 1.0 },
        { type: "sandbag", dx: 5, dz: 2, w: 1.2, d: 0.6, h: 0.9 }
    ],
    lootFloor: { ground: 8, first: 2, roof: 4 },
    wallColor: 0x3a4f2e, roofColor: 0x2d3b1f,
    hasRoof: true, hasStairs: false, isBunker: true
},
{
    type: "tank_hangar", biome: ["military"],
    width: 18, depth: 14, height: 6.5, floors: 0,
    rooms: [{ x: 0, z: 0, w: 17.6, d: 13.6, type: "hangar" }],
    windows: [], // Open front for vehicle access
    doors: [
        { dx: -4, dz: 7.0, width: 5.0 },   // large bay door left
        { dx: 4, dz: 7.0, width: 5.0 }     // large bay door right
    ],
    props: [], // Tanks occupy interior space — handled separately by map generator
    lootFloor: { ground: 12, first: 0, roof: 0 },
    wallColor: 0x4a5e38, roofColor: 0x3d4f2f,
    hasRoof: true, hasStairs: false, isTankHangar: true
},

// === Ice Lake biome (SE quadrant) ===
{
    type: "ice_crystal", biome: ["ice_lake"],
    width: 6, depth: 6, height: 4.5, floors: 0,
    rooms: [{ x: 0, z: 0, w: 5.6, d: 5.6, type: "crystal" }],
    windows: [],
    doors: [], // Ice crystals have no entrance — decorative/cover only
    props: [],
    lootFloor: { ground: 2, first: 0, roof: 0 },
    wallColor: 0x87ceeb, roofColor: 0xb0e0e6,
    hasRoof: false, isIceCrystal: true
},
{
    type: "radio_tower", biome: ["ice_lake"],
    width: 4, depth: 4, height: 12.5, floors: 0,
    rooms: [{ x: 0, z: 0, w: 3.6, d: 3.6, type: "tower_base" }],
    windows: [],
    doors: [{ dx: 0, dz: 1.8, width: 1.2 }],
    props: [
        { type: "ammo_box", dx: -1.5, dz: 0, w: 0.4, d: 0.4, h: 0.6 },
        { type: "crate", dx: 1.5, dz: 0, w: 0.5, d: 0.5, h: 0.8 }
    ],
    lootFloor: { ground: 3, first: 2, roof: 6 },
    wallColor: 0x4a5e7d, roofColor: 0x3a4f6d,
    hasRoof: false, isRadioTower: true
}
];

// Get templates for a given biome
export function getTemplatesForBiome(biome) {
    return BUILDING_TEMPLATES.filter(t => t.biome.includes(biome));
}

// Get a random template for a biome
export function getRandomTemplateForBiome(biome, exclude = []) {
    const available = BUILDING_TEMPLATES.filter(t => t.biome.includes(biome) && !exclude.includes(t.type));
    if (available.length === 0) return BUILDING_TEMPLATES[0];
    return available[Math.floor(Math.random() * available.length)];
}

// Get template by type name
export function getTemplateByType(type) {
    return BUILDING_TEMPLATES.find(t => t.type === type) || BUILDING_TEMPLATES[0];
}
