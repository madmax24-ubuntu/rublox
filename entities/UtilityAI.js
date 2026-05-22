export class UtilityAI {
    constructor() {
        this.actions = ['loot', 'attack', 'run_to_safe_zone', 'heal', 'regroup', 'ambush', 'patrol'];
    }

    clamp01(value) {
        return Math.max(0, Math.min(1, value));
    }

    invLerp(min, max, value) {
        if (Math.abs(max - min) < 1e-6) return 0;
        return this.clamp01((value - min) / (max - min));
    }

    scoreAction(action, context) {
        const healthNeed = this.clamp01(1 - context.healthRatio);
        const enemyPressure = this.clamp01(
            context.nearbyEnemiesCount * 0.25 + (1 - context.closestEnemyDistanceNorm) * 0.5
        );
        const lootOpportunity = this.clamp01(
            context.nearbyLootCount * 0.22 + (1 - context.closestLootDistanceNorm) * 0.55
        );
        const poiOpportunity = this.clamp01(
            (context.hasHangarOpportunity ? 0.38 : 0) +
            (context.hasHouseOpportunity ? 0.24 : 0) +
            (context.poiUrgency || 0)
        );
        const zoneUrgency = this.clamp01(
            (context.outsideZone ? 0.8 : 0) +
            this.clamp01(context.zoneDistance / 18) * 0.55 +
            this.clamp01((context.zonePressure - 0.72) / 0.28) * 0.45
        );
        const combatReadiness = this.clamp01(
            (context.hasWeapon ? 0.45 : 0.08) +
            context.healthRatio * 0.35 +
            (1 - context.lowResources) * 0.2
        );
        const teamworkNeed = this.clamp01(
            context.teamwork * 0.45 +
            (1 - Math.min(1, context.allyCount / 2)) * 0.3 +
            healthNeed * 0.15 +
            enemyPressure * 0.1
        );
        const ambushPotential = this.clamp01(
            context.hasWeapon * 0.32 +
            context.sneakiness * 0.28 +
            this.clamp01(1 - Math.abs(context.closestEnemyDistanceNorm - 0.55) / 0.55) * 0.25 +
            (1 - zoneUrgency) * 0.15
        );
        const patrolValue = this.clamp01(
            (1 - enemyPressure) * 0.35 +
            (1 - lootOpportunity) * 0.2 +
            (1 - zoneUrgency) * 0.2 +
            context.courage * 0.15 +
            context.intelligence * 0.1
        );

        switch (action) {
            case 'heal':
                return this.clamp01(
                    healthNeed * 0.72 +
                    enemyPressure * 0.16 +
                    (1 - zoneUrgency) * 0.12
                );
            case 'run_to_safe_zone':
                return this.clamp01(
                    zoneUrgency * 0.82 +
                    healthNeed * 0.12 +
                    enemyPressure * 0.06
                );
            case 'attack':
                return this.clamp01(
                    enemyPressure * 0.5 +
                    combatReadiness * 0.4 +
                    (1 - zoneUrgency) * 0.08 +
                    healthNeed * 0.25
                );
            case 'loot':
                return this.clamp01(
                    lootOpportunity * 0.42 +
                    poiOpportunity * 0.22 +
                    (context.lowResources ? 0.25 : 0.05) +
                    (1 - enemyPressure) * 0.12 +
                    (1 - zoneUrgency) * 0.08 +
                    healthNeed * 0.08
                );
            case 'regroup':
                return this.clamp01(
                    teamworkNeed * 0.72 +
                    (1 - zoneUrgency) * 0.12 +
                    (1 - context.hasWeapon) * 0.08 +
                    (context.allyCandidateNearby ? 0.12 : 0)
                );
            case 'ambush':
                return this.clamp01(
                    ambushPotential * 0.78 +
                    (context.closestEnemyDistance < 10 ? -0.16 : 0)
                );
            case 'patrol':
                return this.clamp01(
                    patrolValue * 0.74 +
                    poiOpportunity * 0.14
                );
            default:
                return 0;
        }
    }

    evaluate(context) {
        const scores = {};
        for (const action of this.actions) {
            scores[action] = this.scoreAction(action, context);
        }
        return scores;
    }

    chooseBestAction(context) {
        const scores = this.evaluate(context);
        let bestAction = this.actions[0];
        let bestScore = scores[bestAction] ?? 0;

        for (const action of this.actions) {
            const score = scores[action] ?? 0;
            if (score > bestScore) {
                bestScore = score;
                bestAction = action;
            }
        }

        return {
            action: bestAction,
            score: this.clamp01(bestScore),
            scores
        };
    }
}
