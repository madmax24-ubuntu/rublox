# Battle Royale Map Improvement Plan
## For C:\Users\maksk\Desktop\rublox (Three.js WebGL Survival Shooter)

Based on industrial BR design principles (Fortnite devs, The Guardian, Game Wisdom, Level Design Book).

---

## 1. CURRENT STATE ASSESSMENT

Existing `MapGenerator.js` has: 4 biomes, building shells (open walls + roof), trees, rocks, fences, barrels, loot chests.

**Critical gaps:**
- Buildings are hollow shells — no interior walls, stairs, mezzanines, or cover props
- No vertical gameplay depth (only treehouse has stairs)
- No tactical props (sandbags, ammo crates, car doors, breakable walls)
- No sightline engineering — windows don't create sightlines, doors don't guide movement
- No hot/cool zone hierarchy for loot density
- Interiors feel flat and uninteresting
- No roof access for buildings (ladders, stairs)
- Engagement zones are undefined (no 3-5 enemy spots per building)

---

## 2. TOP 7 DESIGN PRINCIPLES (from industry research)

### 2.1 Vertical Gameplay Layers
> Every area must offer 3 vertical layers (ground, elevated, high) with tactical value.

**Fix:**
- Add internal staircase to ALL 2-story buildings (central, not corner)
- Add ladder roof access to single-story buildings (makes them climbable)
- Add mezzanine floor to hangars (already done — check implementation)
- Add watchtowers (5-8m) to open areas (4 corners + 2 random)

### 2.2 Cover Systems (Not Obstacles)
> Cover must serve tactical purposes — blocking LOS, enabling breakable shields, or repositioning.

**Fix:**
- Add sandbag stacks (solid cover, 0.6m tall) near building entrances
- Add ammo crates (breakable wooden cover, 0.5x0.7x0.5m) inside buildings
- Add car doors (partial cover, blocks view but not bullets)
- Add concrete barriers (solid, 1m tall) in open areas
- **Rule:** Max 4-6 meaningful cover points per 30x30m area

### 2.3 Sightline Engineering
> 2-3 intentional long-range sightlines + 1-2 ambush corridors per area.

**Fix:**
- Align windows across streets to create cross-street sightlines
- Place doorways to create sightlines OUTWARD toward roads/other buildings
- Limit windows to 1-2 per room (per Epic: "limiting windows helps control visibility")
- Add tall buildings at ~60m intervals along major routes

### 2.4 Engaging Interiors
> Indoor spaces must be spacious enough for building, with controlled visibility.

**Fix:**
- Add interior partition walls (divide rooms into 2-3 spaces)
- Add staircases to second floors (central placement)
- Add mezzanine/loft floor for 2-story buildings
- Room sizes: min 4x4m single, 6x8m two-room, 8x12m large
- Floor height: 3m minimum per floor

### 2.5 Hot Zone / Safe Zone Hierarchy
> Loot density decreases with distance from center.

**Fix:**
- Hot zone (center): 50-100% loot, 5-8 enemies/building, complex interiors
- Mid zone: 30-60% loot, 3-4 enemies/building, simple interiors
- Cool zone: 15-30% loot, 1-2 enemies/building, basic interiors
- Edge zone: <15% loot, 0-1 enemies, no buildings

### 2.6 Spawn-to-Contact Timing
> Optimal players reach each other in 30-90 seconds.

**Fix:**
- Add "runway" buildings along paths from spawn to hot zone
- These have minimal cover and common-only loot
- Players choose: take longer route with more loot, or rush hot?

### 2.7 Controlled Openness
> Open areas should feel open but have enough cover to prevent instant kills.

**Fix:**
- Place 1-3 cover points per 50m wide open space (in APPROACH path, not center)
- Max 5-10 small props (barrels, crates) per 30x30m open area
- Place 1-2 elevated positions per open area ("must-control" points)
- Every elevated position needs 2+ approach paths

---

## 3. PRIORITY IMPLEMENTATION PLAN

### P0 — Building Interiors & Tactical Depth (High Impact, Low Effort)
**Files:** `world/MapGenerator.js`

1. **Interior partition walls** (15 min)
   - Add `placeInteriorWalls()` method inside `addOpenBuildingShell()`
   - For buildings 6x8m+: divide into 2-3 rooms with 1-2m gaps (doors)
   - Wall thickness: 0.2m, height: 2.6m (below ceiling)
   - Add collider for each wall

2. **Staircases for 2-story buildings** (20 min)
   - Add `placeStaircase()` method
   - Central placement, 2m wide, 3m rise
   - Steps: 15 steps, 0.18m rise each
   - Add collider along entire staircase path

3. **Ladder roof access** (10 min)
   - Add `placeRoofLadder()` for single-story buildings
   - Against back wall, metal ladder (cylinder + rungs)
   - Height = building height + 0.5m
   - Mark as climbable in player controller

4. **Improved furniture/cover props** (20 min)
   - Replace basic crates with:
     - **Sandbag stacks**: 0.8x0.4x0.3m, stacked 2-high, near doors
     - **Ammo crates**: 0.5x0.7x0.5m, wooden texture color (0x6b4226)
     - **Concrete barriers**: 1.2x0.6x0.3m, grey (0x808080)
   - Scatter 3-5 props per building interior
   - Each prop has collider

5. **Interior lighting** (10 min)
   - Add 1-2 point lights per building (already done in P0)
   - Color: warm white (0xfff9c4), intensity 0.5-1.0, range 8-12m
   - Visible fixture: small sphere (0.15m radius) at ceiling

**Subtotal: ~75 min**

### P1 — Vertical Landmarks & Military Props (High Impact, Medium Effort)
**Files:** `world/MapGenerator.js`, `entities/BotAI.js`

1. **Watchtowers** (20 min)
   - Build 4-6 watchtowers in open areas
   - Height: 6-8m, platform 2x2m at top
   - Spiral staircase (15 steps) + ladder on one side
   - 2-3 rare loot items on platform
   - Must have 2+ approach paths (no single-camp spots)

2. **Water towers** (15 min)
   - Build 3-4 water towers near buildings
   - Height: 5m, tank at top (cylinder, 2m radius)
   - Wooden/metal support structure (cross beams)
   - Ladder access, uncommon loot on platform

3. **Military props** (15 min)
   - Sandbag walls: 2m long, 0.6m tall, placed near military buildings
   - Ammo box stacks: 2-3 crates stacked, inside buildings
   - Barbed wire: horizontal lines between posts (decoration only)
   - Military crates: 0.8x0.6x0.4m, green (0x556b2f)

4. **Vehicle props** (15 min)
   - Wrecked cars (2-3 per hot zone)
   - Car body: box geometry, color varies
   - Car doors: thin boxes on sides (open = cover)
   - Hoods: slight slope forward (15 degree angle)
   - Each car has collider

**Subtotal: ~65 min**

### P2 — Sightlines & Engagement Zones (Medium Impact, Medium Effort)

1. **Window alignment pass** (15 min)
   - After placing all buildings, check window positions
   - Align windows across streets (same height, facing each other)
   - Limit to 1-2 windows per room (already partially done)

2. **Engagement zone marking** (15 min)
   - Add `EngagementZone` class
   - Each zone: center point, 3-5 enemy spots, sightline lengths
   - Bots use these for pathing and positioning
   - Hot zone zones have 5 spots, cool zone has 2-3 spots

3. **Escape route coverage** (10 min)
   - Every room must have visible escape route
   - Add floor markings (lighter color) showing paths
   - Bots use these for retreat behavior

**Subtotal: ~40 min**

### P3 — Loot Distribution & Dynamic Elements (Medium Impact, High Effort)

1. **Loot by zone hierarchy** (20 min)
   - Tag each building with zone type (hot/mid/cool/edge)
   - Loot chest placement respects zone type
   - Hot zone: 50-100% loot density, all rarities
   - Edge: <15% loot, common only

2. **Vertical loot placement** (15 min)
   - Ground floor: common items (ammo, basic weapons)
   - Second floor/mezzanine: uncommon items
   - Roof: rare/epic items (reward high ground control)

3. **Breakable walls** (25 min)
   - 15-25% of indoor wall area should be breakable (wood/drywall)
   - Mark as `userData.breakable = true`
   - On break: remove mesh, add debris particles, create opening
   - Bots treat breakable walls as alternative paths

**Subtotal: ~60 min**

---

## 4. BUILDING DESIGN CHECKLIST (per building)

```
[ ] Building has 1-2 windows per room (not more)
[ ] Each room has 1-2 entry/exit points
[ ] Staircase is central, not hidden in corner
[ ] At least 1 breakable wall between rooms (in loot buildings)
[ ] Roof access is possible (ladder, ramp, stairs)
[ ] 3-5 enemy spots identified in/near the building
[ ] Sightline to adjacent building or landmark exists
[ ] Escape route from every room is visible
[ ] Interior feels spacious (min 4x4m per room)
[ ] Loot drops by floor (ground=common, 1st=uncommon, roof=rare)
[ ] No single-camp spots (every high point has 2+ approaches)
[ ] Prop count <30 for interior, <40 for exterior
```

---

## 5. BUILDING TYPE SPECIFICATIONS

| Building Type | Size | Floors | Rooms | Windows/Room | Stairs | Roof | Props/Room |
|---------------|------|--------|-------|-------------|--------|------|------------|
| Small Shack | 4x4m | 1 | 1 | 1-2 | None | Flat (climbable) | 3-5 |
| Single Home | 6x8m | 1-2 | 2-3 | 1-2 | Yes, central | Ladder | 4-6 |
| Two-Story Home | 8x12m | 2 | 4-6 | 1-2 | Yes, central | Stairs + ladder | 5-8 |
| Warehouse | 15x20m | 1-2 | 1-2 open | 3-4 along walls | 1-2 staircases | Crane/ladder | 8-12 |
| Hangar | 32x24m | 1 | Open | N/A | None | Mezzanine + towers | 8-10 |
| Tower (landmark) | 5x5m shaft | 1 | 1 open | 1 per floor | Spiral stairs | Top platform | 6-8 |

---

## 6. CURRENT PROGRESS

### Completed P0 items:
- [x] Interior floors (walkable surface inside buildings)
- [x] Tables (center cover, 2.4x1.6m with legs)
- [x] Wooden crates (scattered, solid cover)
- [x] Barrels (2 per building, cylinder)
- [x] Ammo boxes in hangars (4 per hangar)
- [x] Interior lighting (point light + visible fixture)
- [x] Mezzanine floor for hangars (with support pillars)

### Remaining P0 items:
- [ ] Interior partition walls (2-3 rooms)
- [ ] Staircases for 2-story buildings
- [ ] Roof ladder access for all buildings
- [ ] Sandbag stacks + concrete barriers

---

*Plan based on industrial BR design principles. Sources: Fortnite Devs, The Guardian, Game Wisdom, Level Design Book.*
*Target: 32-player Hunger Games mode, Three.js WebGL*
