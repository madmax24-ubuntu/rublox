/**
 * Game Test API - Add this to main.js for better automation support
 * Exposes game state and testing utilities via window.gameAPI
 */

// This file is meant to be appended to main.js or loaded separately
// It adds a comprehensive test/debug API to window.gameAPI

const GAME_TEST_API = `
// Game Test API (added to main.js)
window.gameAPI = {
    // Get scene statistics
    getSceneStats() {
        if (!window.game || !window.game.scene) return null;
        let total = 0, meshes = 0, groups = 0, geometries = new Set();
        
        function count(obj) {
            total++;
            if (obj.isMesh) {
                meshes++;
                geometries.add(obj.geometry?.uuid);
            }
            if (obj.isGroup) groups++;
            const children = obj.children || [];
            for (const child of children) count(child);
        }
        
        count(window.game.scene);
        return { total, meshes, groups, uniqueGeometries: geometries.size };
    },

    // Move player to position
    movePlayer(x, y, z) {
        if (window.game?.player) {
            window.game.player.position.set(x, y || 3, z);
            return true;
        }
        return false;
    },

    // Move camera
    moveCamera(x, y, z, lookAt = { x: 0, y: 0, z: 0 }) {
        if (window.game?.camera) {
            window.game.camera.position.set(x, y, z);
            window.game.camera.lookAt(lookAt.x, lookAt.y, lookAt.z);
            return true;
        }
        return false;
    },

    // Check if map is generated
    isMapReady() {
        if (!window.game?.scene) return false;
        let ready = false;
        window.game.scene.traverse(obj => {
            if (obj.userData?.mapGenerated) ready = true;
        });
        return ready;
    },

    // Get all biome objects (simple check)
    countBiomeObjects() {
        let count = 0;
        if (!window.game?.scene) return 0;
        window.game.scene.traverse(obj => {
            if (obj.isMesh || obj.isGroup) count++;
        });
        return count;
    },

    // Clear scene (for testing)
    clearScene() {
        if (!window.game?.scene) return;
        const toRemove = [];
        window.game.scene.traverse(obj => {
            if (obj.userData?.testObject || obj.userData?.temporary) {
                toRemove.push(obj);
            }
        });
        toRemove.forEach(obj => obj.parent?.remove(obj));
    },

    // Get game info
    getInfo() {
        return {
            hasPlayer: !!window.game?.player,
            hasCamera: !!window.game?.camera,
            hasScene: !!window.game?.scene,
            isMapReady: this.isMapReady(),
            sceneStats: this.getSceneStats()
        };
    }
};

console.log('[GameTestAPI] API initialized');
`;

console.log('Game Test API template created');
console.log('Copy GAME_TEST_API content to main.js (after window.game initialization)');
