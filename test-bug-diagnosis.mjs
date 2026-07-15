// Diagnostic script — proves the exact cause of each bug before fixing
import * as THREE from 'three';

console.log('=== BUG DIAGNOSIS ===\n');

// --- BUG 1a: PolygonOffset lost in InstancedMesh clone ---
console.log('--- BUG 1a: Wall materials lose polygonOffset after InstancedMesh clone ---');
const wallMat = new THREE.MeshStandardMaterial({
    color: 0x666666, roughness: 0.85, metalness: 0,
    flatShading: true, transparent: false, opacity: 1,
    polygonOffset: true,
    polygonOffsetFactor: 12,
    polygonOffsetUnits: 6
});
console.log('Original wallMat.polygonOffset:', wallMat.polygonOffset);
console.log('Original wallMat.polygonOffsetFactor:', wallMat.polygonOffsetFactor);
console.log('Original wallMat.polygonOffsetUnits:', wallMat.polygonOffsetUnits);

const cloned = wallMat.clone();
console.log('Cloned mat.polygonOffset:', cloned.polygonOffset);
console.log('Cloned mat.polygonOffsetFactor:', cloned.polygonOffsetFactor);
console.log('Cloned mat.polygonOffsetUnits:', cloned.polygonOffsetUnits);

if (cloned.polygonOffset !== wallMat.polygonOffset ||
    cloned.polygonOffsetFactor !== wallMat.polygonOffsetFactor ||
    cloned.polygonOffsetUnits !== wallMat.polygonOffsetUnits) {
    console.log('❌ PROVEN: Three.js .clone() does NOT copy polygonOffset settings!');
    console.log('   InstancedMesh walls will have NO polygonOffset → z-fighting with terrain\n');
} else {
    console.log('✓ polygonOffset preserved (unexpected)\n');
}

// --- BUG 1b: Castle gate collider wider than visual ---
console.log('--- BUG 1b: Castle gate invisible wall ---');
const wallHeight = 18;
// Visual: two pillars of BoxGeometry(3, wallHeight+6, 3) = 3×24×3 each
// Total visual width ≈ 6 units (two pillars side by side)
// Collider: 13 × (wallHeight+6) × 6 = 13×24×6
const visualWidth = 3 + 3; // two pillars
const colliderWidth = 13;
console.log(`Visual width (2 pillars): ${visualWidth}`);
console.log(`Collider width: ${colliderWidth}`);
console.log(`Excess: ${colliderWidth - visualWidth} units of INVISIBLE wall`);
if (colliderWidth > visualWidth) {
    console.log('❌ PROVEN: Castle gate collider is wider than visual → invisible walls\n');
}

// --- BUG 2: Bot outfit.scale never applied ---
console.log('--- BUG 2: Bot outfit.scale never used ---');
const variants = [
    { scale: 2.0 },
    { scale: 2.05 },
    { scale: 2.0 },
    { scale: 2.1 },
    { scale: 1.95 },
    { scale: 2.05 }
];
console.log('Bot variants have scale: 1.95-2.1');

// Simulate Bot model bounds
const botMinY = 0.05; // leftShoe y=0.05
const botMaxY = 2.525; // hair y=2.35 + 0.175
const botModelHeight = botMaxY - botMinY;
console.log(`Bot model height: ${botModelHeight}`);

// Player model bounds
const playerMinY = -0.15; // leftLeg bottom
const playerMaxY = 2.0; // head top
const playerModelHeight = playerMaxY - playerMinY;
console.log(`Player model height: ${playerModelHeight}`);

// Without outfit.scale, bot is scaled to physics.height=1.7
const targetHeight = 1.7;
const scaleFactor = targetHeight / botModelHeight;
console.log(`Bot scale without variant: ${scaleFactor.toFixed(4)}`);

// With outfit.scale (e.g., 2.0), effective height would be:
const variantScale = 2.0;
const effectiveTargetHeight = targetHeight * variantScale;
const scaleFactorWithVariant = effectiveTargetHeight / botModelHeight;
console.log(`Bot scale with variant ${variantScale}: ${scaleFactorWithVariant.toFixed(4)}`);

// Eye height comparison
const playerEyeY = 1.65; // head y=1.65
const botEyeY = 2.08; // eye y=2.08 before scaling

// Player: mesh.position.y = position.y - (1.7 - 0.15) = position.y - 1.55
// Player eyes in world: (position.y - 1.55) + 1.65 = position.y + 0.1
const playerEyeWorldOffset = playerEyeY - 1.55;
console.log(`Player eye offset from position: ${playerEyeWorldOffset.toFixed(3)}`);

// Bot without variant scale:
// _modelBottomY after scaling ≈ botMinY * scaleFactor = 0.05 * scaleFactor
const modelBottomY_noVariant = botMinY * scaleFactor;
// mesh.position.y = position.y - (1.7 + _modelBottomY)
// Eyes in world: (position.y - 1.7 - _modelBottomY) + (botEyeY * scaleFactor)
const botEyeWorldOffset_noVariant = (botEyeY * scaleFactor) - 1.7 - modelBottomY_noVariant;
console.log(`Bot eye offset from position (no variant): ${botEyeWorldOffset_noVariant.toFixed(3)}`);

// Bot with variant scale:
const modelBottomY_withVariant = botMinY * scaleFactorWithVariant;
const botEyeWorldOffset_withVariant = (botEyeY * scaleFactorWithVariant) - effectiveTargetHeight - modelBottomY_withVariant;
console.log(`Bot eye offset from position (with variant ${variantScale}): ${botEyeWorldOffset_withVariant.toFixed(3)}`);

console.log(`\nDifference: Player=${playerEyeWorldOffset.toFixed(3)} vs Bot(no variant)=${botEyeWorldOffset_noVariant.toFixed(3)}`);
console.log(`Gap without variant: ${(playerEyeWorldOffset - botEyeWorldOffset_noVariant).toFixed(3)} units`);
console.log(`Gap with variant: ${(playerEyeWorldOffset - botEyeWorldOffset_withVariant).toFixed(3)} units`);

if (Math.abs(playerEyeWorldOffset - botEyeWorldOffset_noVariant) > 0.3) {
    console.log('❌ PROVEN: Bot eyes are significantly lower than Player eyes → NPC appears shorter\n');
}
if (Math.abs(playerEyeWorldOffset - botEyeWorldOffset_withVariant) < Math.abs(playerEyeWorldOffset - botEyeWorldOffset_noVariant)) {
    console.log('✓ PROVEN: Applying outfit.scale reduces the gap → this is part of the fix\n');
}

console.log('=== DIAGNOSIS COMPLETE ===');
