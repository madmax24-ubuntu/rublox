# Battle Royale / Hunger Games Map Design Principles

> Target: Three.js-based game, ~32 players, browser rendering performance critical.

---

## 1. TOP 7 CRITICAL DESIGN PRINCIPLES

### 1.1 Vertical Gameplay Layers

**What it means:** Every meaningful area must offer at least 3 vertical layers (ground, elevated, high) that each provide tactical value.

**Why it matters:** BR combat is decided by who controls elevation. A flat map forces boring, predictable engagements. Verticality creates multiple engagement paths per area.

**Implementation in practice:**
- Buildings: ground floor + mezzanine/loft + roof access (via ladder/stairs/rampeable walls)
- Outdoor zones: ground terrain + raised platforms/mounds + watchtowers/cranes
- Interiors: second-floor balconies that overlook main rooms
- Every loot-rich building must have a roof or high vantage point

**Props/elements:** Staircases, ladders, ramps, watchtowers, cranes, mezzanine floors, sandbag stacks, pallet stacks, shipping containers on crates

---

### 1.2 Cover Systems (Not Obstacles)

**What it means:** Cover objects must serve clear tactical purposes — blocking line of sight, providing breakable shields, or enabling repositioning. Not every object should be cover.

**Why it matters:** Without clear cover, combat is either too lethal (no protection) or too boring (everywhere is cover). Players need to make meaningful decisions about when to break cover and reposition.

**Implementation in practice:**
- **Solid cover** (bullet-blocking): crates, car doors, sandbags, brick walls, barrels — use sparingly in open areas
- **Breakable cover** (shields that destroy): wooden walls, drywall, thin pillars — placed along natural sightlines, creates dynamic combat
- **Soft cover** (blocks view only, not bullets): bushes, grass clumps, hanging vines — for stealth approach
- **Partial cover:** low walls, half-fences, window sills — allows peeking without full exposure

**Props/elements:** Sandbags, ammo crates, wooden crates, barrels, cars (door = cover, hood = partial cover), brick walls (solid), wooden partitions (breakable), boulders, concrete barriers, pallets, furniture clusters

**Quantity rule:** In any 30x30m area, place no more than 4-6 meaningful cover points. Over-cover kills aggression.

---

### 1.3 Sightline Engineering

**What it means:** Every area must have at least 2-3 intentional sightlines (long-range choke points) and 1-2 ambush corridors (short-range engagement paths) connecting to adjacent zones.

**Why it matters:** Sightlines dictate the pace of engagement. Too many long sightlines = snper fest. Too few = only CQB matters. Balanced sightlines create varied combat styles.

**Implementation in practice:**
- Place tall buildings or hills at ~60m intervals along major routes
- Every building corridor should lead the eye toward a window, door, or opening toward another zone
- Windows should align across streets to create cross-street sightlines
- Stairwells should offer a clear upward sightline (rewarding aggressive play)
- Avoid 90-degree walls that block all sightlines — use angled walls or open concepts

**Props/elements:** Windows (aligned across streets), doorways, stairwells, open corridors, balcony openings, gap-trees in forests, road intersections, hilltops

---

### 1.4 Engaging Interior Design

**What it means:** Indoor spaces must feel spacious enough for building (if applicable) while limiting visibility with controlled openings. Per Epic: "limiting the number of windows and broken areas can help control visibility."

**Why it matters:** Indoors is where players feel most vulnerable. If every wall is a window, there's no cover indoors. If rooms are tiny, there's no movement room for building or positioning.

**Implementation in practice:**
- **Room sizing:** Minimum 4x4m for single-room buildings, 6x8m for two-story homes, 8x12m+ for public buildings
- **Window placement:** Every room gets 1-2 windows max (not more). Place them to create sightlines OUTWARD, not inward.
- **Door placement:** 1 door per room is ideal. Multiple doors create confusion (good for ambush but bad for clarity).
- **Floor height:** 3m per floor minimum (allows players to stand/interact). Two-story buildings should feel taller inside.
- **Breakable walls:** Place 1-2 breakable walls between rooms in loot-heavy buildings — creates dynamic repositioning
- **Stair placement:** Central staircase (not hidden in corners) so players know where enemies might come from

**Props/elements:** Windows (controlled count), doors (1 per room), staircases (central), breakable partitions, furniture (sofas, tables — low cover indoors), barrels (loose, not stacked), ladders to roof

---

### 1.5 Hot Zone / Safe Zone Hierarchy

**What it means:** The map must have a clear gradient from intense (drop zones) to quiet (edge areas). Loot density decreases with distance from the center.

**Why it matters:** Without hierarchy, players have no reason to engage early vs late. A flat distribution means the first 60 seconds are identical everywhere.

**Implementation in practice:**
- **Hot zone (center):** 2-3 unique buildings, 50-100% loot density, 5-8 enemies per building, multiple sightlines, complex interiors
- **Mid zone:** 3-5 buildings per structure, 30-60% loot density, 3-4 enemies per building, some sightlines
- **Cool zone:** 1-2 buildings per structure, 15-30% loot density, 1-2 enemies per building, minimal sightlines
- **Edge zone:** No buildings or 1-2 simple shacks, <15% loot, 0-1 enemies

**Loot density by tier:**
| Tier | Hot Zone | Mid Zone | Cool Zone | Edge |
|------|----------|----------|-----------|------|
| Common (basic weapons) | 100% | 70% | 40% | 10% |
| Uncommon | 70% | 40% | 20% | 0% |
| Rare | 40% | 15% | 5% | 0% |
| Epic+ | 15% | 3% | 0% | 0% |

**Props/elements:** Unique landmarks in hot zones (tower, crane, warehouse, gas station), sparse props in edges, simple sheds

---

### 1.6 Spawn-to-Contact Timing

**What it means:** Map areas should be designed so that optimal players, running at a constant speed, reach each other in 30-90 seconds. Not less, not more.

**Why it matters:** Too short = early game is pure chaos, no time to gather gear. Too long = early game is slow walking, no tension. 30-90s is the sweet spot for player retention.

**Implementation in practice:**
- Calculate spawn points at map edges, each ~100-200m from nearest hot building
- Place 2-3 intermediate loot buildings along the path from spawn to hot zone (the "runway")
- These runway buildings should have minimal cover and common-only loot
- Design paths that force players to choose: take a slightly longer route with more loot, or rush hot?
- Place natural barriers (rivers, walls, dense forest) as optional slow-downs — not blockers

**Props/elements:** Linear building clusters along roads, scattered single buildings, natural barriers, fences, dense tree lines, small outbuildings, power poles (climbable for speed)

---

### 1.7 Controlled Openness

**What it means:** Per Epic: "try not to overfill open areas with props." Open spaces should feel open but contain enough cover to prevent instant kills. The balance is intentional emptiness.

**Why it matters:** Overfilled open areas feel cluttered and confusing. Empty open areas feel dead. The correct balance creates tension — players feel exposed but have options to approach cover.

**Implementation in practice:**
- **Open area definition:** Any space > 15m in any dimension without walls
- **Cover in open areas:** 1-3 cover points per 50m wide open space. Place them in the APPROACH path, not in the center (giving players cover TO move toward, not hide in)
- **Prop density rule:** Max 5-10 small props (barrels, crates) per 30x30m open area
- **Vertical cover in open:** Place 1-2 elevated positions (hill, water tower, crane) visible from all sides — these become "must-control" points
- **No single-camp spots:** Every elevated position should have at least 2 approach paths, preventing one player from dominating

**Props/elements:** Scattered barrels (not stacked), lone crates, low rock formations, small mounds, distant tree clusters, broken vehicles (positioned to give cover on approach, not in center), power line towers (climbable)

---

## 2. INTERNAL BUILDING DESIGN SPECIFICATIONS

### 2.1 Floor Plans by Building Type

| Building Type | Size | Floors | Rooms | Windows/Room | Stairs | Roof Access |
|---------------|------|--------|-------|-------------|--------|-------------|
| Small Shack | 4x4m | 1 | 1 | 1-2 | None | N/A (flat) |
| Single Home | 6x8m | 1-2 | 2-3 | 1-2 | Yes, central | Ladder from 2nd floor |
| Two-Story Home | 8x12m | 2 | 4-6 | 1-2 | Yes, central | Stairs + roof ladder |
| Warehouse | 15x20m | 1-2 | 1-2 open | 3-4 along walls | 1-2 staircases | Crane/roof hatch |
| Gas Station | 10x8m + forecourt | 1 | 1-2 | 2-3 | None | Flat roof (climbable) |
| Apartment Block | 10x15m | 3-4 | 1 per floor | 2 per floor | Stairwell core | Stairs + ladder |
| Tower | 5x5m shaft | 1 | 1 open | 1 per floor | Spiral stairs | Top platform |
| Garage | 8x6m | 1 | 1 | 1 (door) | None | Flat roof |

### 2.2 Room Design Rules

1. **Every room has 1 entry point minimum, max 2** — prevents confusion about where enemies come from
2. **Window placement creates outward sightlines** — windows should face roads, other buildings, or loot zones, NOT into the room from another room
3. **Door widths should be consistent** — 1m standard, 1.5m for main entrances
4. **Ceiling height = 3m** — minimum, 4m for public buildings (allows looking up)
5. **Breakable wall ratio:** 15-25% of indoor wall area should be breakable (wood/drywall)
6. **Floor surface differentiation:** Each floor has different visual treatment (ground = concrete, 1st = wood, 2nd = carpet) so players can orient themselves

---

## 3. LOOT DISTRIBUTION SYSTEM

### 3.1 Loot Layers

```
Layer 1 — Guaranteed (every building):
  - 1 common weapon (pistol/shotgun)
  - 2-3 ammo boxes
  - 1 health item
  - 1 basic gear piece (vest/helmet)

Layer 2 — Probabilistic (60% chance, mid-tier buildings):
  - 1 uncommon weapon (SMG/AR)
  - 1-2 medkits
  - 1 weapon attachment (scope/magazine)
  - 1 grenade

Layer 3 — Rare (30% chance, hot zone buildings):
  - 1 rare weapon (sniper/LMG)
  - 1 full medkit
  - 2 attachments (2x-8x scope)
  - 1 throw grenade + 1 smokescreen

Layer 4 — Epic+ (15% chance, landmark buildings only):
  - 1 epic weapon
  - 3+ attachments
  - 2 grenades
  - 1 special item (cloaked, rapid-fire, etc.)
```

### 3.2 Vertical Loot Placement

- **Ground floor:** Common items only (ammo, basic weapons) — rewards entering the building
- **Second floor/mezzanine:** Uncommon items — rewards climbing, creates mid-tier combat
- **Roof/attic:** Rare to Epic items — rewards high-ground control, creates top-of-ladder fights
- **Basement/cellar (if present):** Mixed rarity — rewards risk-taking, often guarded by "camp" NPC

### 3.3 Hot Zone vs Safe Zone Loot

| Aspect | Hot Zone | Safe Zone |
|--------|----------|-----------|
| Primary loot | All rarities available | Common to uncommon |
| Epic items | 1-2 per building | 0 |
| Enemy density | 5-8 per building | 0-2 per building |
| Combat type | Multi-directional | Linear / 1-2 angles |
| Player incentive | Risk everything | Safe progression |

---

## 4. ENGAGEMENT ZONE SPECIFICATIONS

### 4.1 Per-Area Enemy Spot Limits

Per Epic: "Limit spots that can house enemies to roughly three to five points per area."

**Definition of an enemy spot:** Any position where an enemy player can see at least one other engagement point AND has cover from at least one direction.

**Implementation:**
- For each building/area, identify 3-5 enemy spots on the design canvas
- Each spot must have: cover on one side, sightline to another spot, and an escape route
- Map these spots as a network, not isolated positions
- Between 2-3 of these spots, place breakable walls (creates repositioning opportunities)

### 4.2 Sightline Types per Zone

| Sightline Type | Length | Quantity per Area | Purpose |
|---------------|--------|-------------------|---------|
| Long-range (50m+) | 50-120m | 1-2 per area | Sniper/AR engagements, zone pressure |
| Mid-range (15-50m) | 15-50m | 2-3 per area | Primary combat engagements |
| Close-range (5-15m) | 5-15m | 1-2 per area | CQB, ambush, repositioning |
| Vertical (up/down 10m+) | Vertical | 1 per area | Roof-to-ground fights |

### 4.3 Cover Distribution in Engagement Zones

- **Primary cover:** Bullet-blocking, placed at natural stopping points along sightlines (3-5 per sightline)
- **Secondary cover:** Breakable, placed behind primary cover (creates two-layer defense)
- **Approach cover:** Soft cover in front of engagement positions (lets players close distance)
- **Escape route cover:** Cover along paths away from engagement zones (prevents being trapped)

---

## 5. VERTICALITY ACHIEVEMENT METHODS

### 5.1 Primary Vertical Elements

| Element | Height | Player Cost | Tactical Value | Recommended Placement |
|---------|--------|-------------|----------------|----------------------|
| Staircase | 3-4m per floor | Low movement cost | Reliable, predictable | Central in buildings |
| Ramp/Rampageable wall | 3-6m | Medium cost | Buildable, flexible | Hot zone buildings |
| Ladder | 2-3m | High (exposed climb) | Quick access, vulnerable | Roof access only |
| Elevator shaft | 3-12m | Low | Fast, but trap-prone | Large buildings/landmarks |
| Tree climb (if applicable) | 5-10m | Medium | Natural, no build cost | Sparse in forest areas |
| Hill/mound | 3-8m | Low (free) | Free high ground | Open areas, zone edges |
| Watchtower/crane | 8-15m | Medium | Dominates large area | Landmark buildings |

### 5.2 Vertical Building Design Patterns

```
Pattern A — Two-Story Home:
  Ground: entrance door + 1 window per wall = 4 windows, 1 room
  1st floor: 2-3 rooms, 2-3 windows, central staircase
  Roof: ladder access, 1-2 rare loot items, sniper vantage

Pattern B — Warehouse:
  Ground: massive open space (15x20m), 1 door, 4-6 windows high on walls
  Mezzanine: 1-2 walkways along walls, 3-4 breakable walls, uncommon loot
  Roof: crane structure, ladder access, rare loot, long-range sightlines

Pattern C — Apartment Block:
  Ground: entrance + 1 room = storage, common loot
  1st-3rd floors: 1 room per floor, 1 staircase, uncommon loot
  Roof: ladder access, rare loot, city-wide sightlines

Pattern D — Tower (Landmark):
  Shaft: spiral staircase, 5-10m total height
  Platform: 360-degree views, 2-3 rare loot items
  Attack path: only 2 approaches = ambush potential
```

### 5.3 Verticality Balance Rule

> For every high point (roof/tower/crane) on the map, there must be at least 2 approach paths. If there's only 1 approach path, the high point is a "camp spot" and should be redesigned.

---

## 6. THREE.JS-SPECIFIC OPTIMIZATION GUIDELINES

### 6.1 Prop Budget per Area

| Area Type | Max Props | Max Draw Calls | Texture Sheets |
|-----------|-----------|----------------|----------------|
| Hot zone building interior | 30 props | <15 | 2-3 merged |
| Hot zone building exterior | 40 props | <20 | 3-4 merged |
| Mid zone building | 20 props | <10 | 1-2 merged |
| Open field (30x30m) | 15 props | <8 | 1-2 merged |
| Forest patch (20x20m) | 20 trees | <10 | 1 merged (instanced) |

### 6.2 LOD Strategy

- **LOD0 (0-20m):** Full detail, individual props
- **LOD1 (20-60m):** Merged geometry for buildings, reduced prop count
- **LOD2 (60-150m):** Billboard/flat planes for building facades
- **LOD3 (150m+):** Simple boxes or culled entirely

### 6.3 Occlusion Culling

- Use bounding boxes per room in buildings
- Split building interiors by floor (each floor is a separate scene graph branch)
- Use a simple grid-based occlusion system: if the camera is on floor 1, floor 2 geometry is not rendered

### 6.4 Texture Budget

- Use 1024x1024 or 512x512 texture atlases (not individual textures)
- Max 4 material instances per building interior, 8 per exterior
- Use normal maps sparingly (CPU cost in Three.js is high for multiple normal maps)

---

## 7. QUICK REFERENCE: CHECKLIST PER BUILDING

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

*Document generated for Three.js BR game implementation (~32 player capacity).*
