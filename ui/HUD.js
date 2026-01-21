export class HUD {
    constructor() {
        this.createHUD();
    }

    createHUD() {
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        const shortSide = Math.min(window.innerWidth, window.innerHeight);
        const scale = isMobile
            ? (shortSide < 420 ? 0.7 : shortSide < 600 ? 0.8 : 0.9)
            : 1;
        const px = (value) => Math.round(value * scale);

        const hud = document.createElement('div');
        hud.id = 'hud';
        hud.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1000;
            font-family: 'Trebuchet MS', Verdana, sans-serif;
            color: #e9f0f6;
            text-shadow: 0 2px 0 rgba(0,0,0,0.35);
        `;
        document.body.appendChild(hud);

        const topBar = document.createElement('div');
        topBar.style.cssText = `
            position: absolute;
            top: ${px(16)}px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: ${px(12)}px;
            align-items: center;
        `;
        hud.appendChild(topBar);

        const playersCount = document.createElement('div');
        playersCount.id = 'playersCount';
        playersCount.style.cssText = `
            background: rgba(14, 26, 36, 0.88);
            padding: ${px(8)}px ${px(18)}px;
            border-radius: ${px(10)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            font-size: ${px(18)}px;
            font-weight: 700;
        `;
        playersCount.textContent = '\u0418\u0433\u0440\u043e\u043a\u043e\u0432: 32';
        topBar.appendChild(playersCount);

        const zoneInfo = document.createElement('div');
        zoneInfo.id = 'zoneInfo';
        zoneInfo.style.cssText = `
            background: rgba(14, 26, 36, 0.88);
            padding: ${px(8)}px ${px(16)}px;
            border-radius: ${px(10)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            font-size: ${px(14)}px;
        `;
        zoneInfo.textContent = '\u0417\u043e\u043d\u0430: \u0411\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u0430\u044f';
        topBar.appendChild(zoneInfo);

        const leftPanel = document.createElement('div');
        leftPanel.style.cssText = `
            position: absolute;
            bottom: ${px(isMobile ? 150 : 120)}px;
            left: ${px(14)}px;
            display: flex;
            flex-direction: column;
            gap: ${px(8)}px;
        `;
        hud.appendChild(leftPanel);

        const barWidth = px(260);
        const barHeight = px(26);

        const healthBar = document.createElement('div');
        healthBar.style.cssText = `
            width: ${barWidth}px;
            height: ${barHeight}px;
            background: rgba(14, 26, 36, 0.88);
            border-radius: ${px(8)}px;
            overflow: hidden;
            border: 2px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 6px 16px rgba(0,0,0,0.3);
        `;
        const healthFill = document.createElement('div');
        healthFill.id = 'healthFill';
        healthFill.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, #ff5252, #ff1744);
            transition: width 0.3s;
        `;
        healthBar.appendChild(healthFill);
        const healthText = document.createElement('div');
        healthText.id = 'healthText';
        healthText.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: ${px(16)}px;
            font-weight: 700;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            display: none;
        `;
        healthBar.appendChild(healthText);
        leftPanel.appendChild(healthBar);

        const armorBar = document.createElement('div');
        armorBar.style.cssText = `
            width: ${barWidth}px;
            height: ${barHeight}px;
            background: rgba(14, 26, 36, 0.88);
            border-radius: ${px(8)}px;
            overflow: hidden;
            border: 2px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 6px 16px rgba(0,0,0,0.3);
        `;
        const armorFill = document.createElement('div');
        armorFill.id = 'armorFill';
        armorFill.style.cssText = `
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #42a5f5, #1976d2);
            transition: width 0.3s;
        `;
        armorBar.appendChild(armorFill);
        const armorText = document.createElement('div');
        armorText.id = 'armorText';
        armorText.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: ${px(16)}px;
            font-weight: 700;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            display: none;
        `;
        armorBar.appendChild(armorText);
        leftPanel.appendChild(armorBar);

        const inventory = document.createElement('div');
        inventory.id = 'inventory';
        inventory.style.cssText = `
            position: absolute;
            bottom: ${px(isMobile ? 30 : 20)}px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: ${px(4)}px;
            background: rgba(14, 26, 36, 0.88);
            padding: ${px(8)}px ${px(10)}px;
            border-radius: ${px(10)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
        `;
        hud.appendChild(inventory);

        const slotSize = px(isMobile ? 44 : 56);
        for (let i = 0; i < 10; i++) {
            const slot = document.createElement('div');
            slot.id = `slot${i}`;
            slot.style.cssText = `
                width: ${slotSize}px;
                height: ${slotSize}px;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.25);
                border-radius: ${px(8)}px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${px(16)}px;
                font-weight: 700;
                position: relative;
            `;
            slot.textContent = i;

            const slotNumber = document.createElement('div');
            slotNumber.style.cssText = `
                position: absolute;
                bottom: ${px(2)}px;
                right: ${px(4)}px;
                font-size: ${px(10)}px;
                color: rgba(255, 255, 255, 0.7);
            `;
            slotNumber.textContent = i;
            slot.appendChild(slotNumber);

            inventory.appendChild(slot);
        }

        const invulnerabilityTimer = document.createElement('div');
        invulnerabilityTimer.id = 'invulnerabilityTimer';
        invulnerabilityTimer.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: ${px(64)}px;
            font-weight: 800;
            color: #ffb300;
            text-shadow: 4px 4px 8px rgba(0,0,0,0.8);
            display: none;
        `;
        hud.appendChild(invulnerabilityTimer);

        const gameOverlay = document.createElement('div');
        gameOverlay.id = 'gameOverlay';
        gameOverlay.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: ${px(40)}px;
            font-weight: 800;
            text-shadow: 4px 4px 8px rgba(0,0,0,0.8);
            display: none;
        `;
        hud.appendChild(gameOverlay);

        const countdown = document.createElement('div');
        countdown.id = 'countdown';
        countdown.style.cssText = `
            position: absolute;
            top: ${px(90)}px;
            left: 50%;
            transform: translateX(-50%);
            font-size: ${px(42)}px;
            font-weight: 800;
            color: #ffb300;
            background: rgba(14, 26, 36, 0.9);
            padding: ${px(12)}px ${px(32)}px;
            border-radius: ${px(10)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            text-shadow: 0 0 10px rgba(255,215,0,0.8);
            display: none;
        `;
        hud.appendChild(countdown);

        const gameMessage = document.createElement('div');
        gameMessage.id = 'gameMessage';
        gameMessage.style.cssText = `
            position: absolute;
            top: 30%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: ${px(30)}px;
            font-weight: 800;
            color: #ffffff;
            text-shadow: 4px 4px 8px rgba(0,0,0,0.9);
            background: rgba(14, 26, 36, 0.9);
            padding: ${px(16)}px ${px(28)}px;
            border-radius: ${px(10)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            display: none;
        `;
        hud.appendChild(gameMessage);

        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { transform: translate(-50%, -50%) scale(1); }
                50% { transform: translate(-50%, -50%) scale(1.1); }
            }
        `;
        document.head.appendChild(style);
    }

    updateHealth(health, maxHealth) {
        const healthFill = document.getElementById('healthFill');
        if (!healthFill) return;
        const percent = (health / maxHealth) * 100;
        healthFill.style.width = `${percent}%`;
    }

    updateArmor(armor, maxArmor) {
        const armorFill = document.getElementById('armorFill');
        if (!armorFill) return;
        const percent = (armor / maxArmor) * 100;
        armorFill.style.width = `${percent}%`;
    }

    updatePlayersCount(count) {
        const playersCount = document.getElementById('playersCount');
        playersCount.textContent = `\u0418\u0433\u0440\u043e\u043a\u043e\u0432: ${count}`;
    }

    updateZoneInfo(text, isDangerous = false) {
        const zoneInfo = document.getElementById('zoneInfo');
        zoneInfo.textContent = `\u0417\u043e\u043d\u0430: ${text}`;
        zoneInfo.style.background = isDangerous
            ? 'rgba(255, 82, 82, 0.85)'
            : 'rgba(14, 26, 36, 0.88)';
    }

    updateInventory(items, selectedSlot) {
        for (let i = 0; i < 10; i++) {
            const slot = document.getElementById(`slot${i}`);
            const item = items[i];

            if (item) {
                slot.style.background = 'rgba(255, 255, 255, 0.2)';
                slot.style.border = '2px solid rgba(255, 255, 255, 0.8)';

                const icon = slot.querySelector('.weapon-icon') || document.createElement('div');
                icon.className = 'weapon-icon';
                icon.style.cssText = `
                    font-size: 12px;
                    font-weight: 800;
                    color: #ffffff;
                `;

                if (item.type === 'knife') icon.textContent = 'KNF';
                else if (item.type === 'bow') icon.textContent = 'BOW';
                else if (item.type === 'laser') icon.textContent = 'LAS';

                if (!slot.querySelector('.weapon-icon')) {
                    slot.appendChild(icon);
                }
            } else {
                slot.style.background = 'rgba(255, 255, 255, 0.1)';
                slot.style.border = '2px solid rgba(255, 255, 255, 0.25)';
                const icon = slot.querySelector('.weapon-icon');
                if (icon) icon.remove();
            }

            if (i === selectedSlot) {
                slot.style.border = '3px solid #ffb300';
                slot.style.boxShadow = '0 0 10px rgba(255, 179, 0, 0.5)';
            } else {
                slot.style.boxShadow = 'none';
            }
        }
    }

    showInvulnerabilityTimer(seconds) {
        const timer = document.getElementById('invulnerabilityTimer');
        timer.textContent = seconds > 0 ? Math.ceil(seconds) : '';
        timer.style.display = seconds > 0 ? 'block' : 'none';
    }

    showGameOver(message) {
        const overlay = document.getElementById('gameOverlay');
        overlay.textContent = message;
        overlay.style.display = 'block';
    }

    hideGameOver() {
        const overlay = document.getElementById('gameOverlay');
        overlay.style.display = 'none';
    }

    showCountdown(seconds) {
        const countdown = document.getElementById('countdown');
        countdown.textContent = seconds;
        countdown.style.display = 'block';
    }

    hideCountdown() {
        const countdown = document.getElementById('countdown');
        countdown.style.display = 'none';
    }

    showGameMessage(message) {
        const gameMessage = document.getElementById('gameMessage');
        gameMessage.textContent = message;
        gameMessage.style.display = 'block';
        gameMessage.style.animation = 'pulse 1.5s infinite';

        setTimeout(() => {
            gameMessage.style.display = 'none';
            gameMessage.style.animation = 'none';
        }, 3000);
    }
}
