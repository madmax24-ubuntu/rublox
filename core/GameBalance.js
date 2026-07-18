export const GAME_CONFIG = {
    bots: {
        desktopCount: 99,
        mobileCount: 99,
        spawnRadius: 16
    },
    round: {
        countdownSeconds: 15,
        preFightInvulnerableSeconds: 30,
        botLootPhaseSeconds: 90
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
        randomTimerMin: 55,
        randomTimerVariance: 45,
        nextEventMin: 65,
        nextEventVariance: 50,
        gracePeriodSeconds: 45,
        waveIntervalSeconds: 120,
        waveDurationSeconds: 45,
        radiation: {
            durationSeconds: 35,
            graceSeconds: 4.0,
            playerDps: 3.2,
            botDpsNearShelter: 0.16,
            botDpsFarShelter: 0.24
        },
        supplyDrop: {
            intervalSeconds: 60,
            varianceSeconds: 30,
            beamDuration: 4.5,
            lootRadius: 8,
            maxDrops: 3
        },
        storm: {
            durationSeconds: 40,
            graceSeconds: 5.0,
            damagePerSecond: 2.8,
            visualIntensity: 0.75,
            maxStorms: 2
        },
        zombieRush: {
            durationSeconds: 45,
            spawnInterval: 3.5,
            zombieCount: 6,
            spawnRadius: 120,
            cooldownSeconds: 60
        }
    }
};

export const ROUND_MODES = {
    hybrid: {
        lootDensity: 1,
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
