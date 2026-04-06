export const GAME_CONFIG = {
    bots: {
        desktopCount: 40,
        mobileCount: 32,
        spawnRadius: 16
    },
    round: {
        countdownSeconds: 10,
        preFightInvulnerableSeconds: 20,
        botLootPhaseSeconds: 8
    },
    zone: {
        durationSeconds: 600,
        minRadiusFactor: 0.15,
        minRadiusAbsolute: 24,
        phaseCount: 8,
        waitStartSeconds: 28,
        waitBetweenSeconds: 22,
        shrinkPhaseSeconds: 10
    },
    events: {
        randomTimerMin: 35,
        randomTimerVariance: 25,
        nextEventMin: 45,
        nextEventVariance: 35,
        radiation: {
            durationSeconds: 30,
            graceSeconds: 4.0,
            playerDps: 3.2,
            botDpsNearShelter: 0.16,
            botDpsFarShelter: 0.24
        }
    }
};

export const ROUND_MODES = {
    hybrid: {
        lootDensity: 0.85,
        zombieMultiplier: 1.4,
        footstepVolume: 0.7,
        botVision: 0.9,
        fogDensity: 0.0058
    },
    nightmare: {
        lootDensity: 0.6,
        zombieMultiplier: 2.2,
        footstepVolume: 1,
        botVision: 1.05,
        fogDensity: 0.0068
    },
    stealth: {
        lootDensity: 0.9,
        zombieMultiplier: 1.1,
        footstepVolume: 0.35,
        botVision: 0.7,
        fogDensity: 0.0076
    },
    classic: {
        lootDensity: 1,
        zombieMultiplier: 1,
        footstepVolume: 1,
        botVision: 1,
        fogDensity: 0.0052
    }
};
