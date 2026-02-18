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
        const root = document.getElementById('gameRoot') || document.body;
        root.appendChild(hud);

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

        const modeInfo = document.createElement('div');
        modeInfo.id = 'modeInfo';
        modeInfo.style.cssText = `
            background: rgba(255, 255, 255, 0.12);
            padding: ${px(6)}px ${px(14)}px;
            border-radius: ${px(10)}px;
            border: 2px solid rgba(255, 255, 255, 0.08);
            font-size: ${px(12)}px;
            font-weight: 700;
        `;
        modeInfo.textContent = '\u0420\u0435\u0436\u0438\u043c: Classic';
        topBar.appendChild(modeInfo);

        const perkInfo = document.createElement('div');
        perkInfo.id = 'perkInfo';
        perkInfo.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            padding: ${px(6)}px ${px(12)}px;
            border-radius: ${px(10)}px;
            border: 2px solid rgba(255, 255, 255, 0.08);
            font-size: ${px(12)}px;
            font-weight: 700;
        `;
        perkInfo.textContent = '\u041f\u0435\u0440\u043a: -';
        topBar.appendChild(perkInfo);

        const leftPanel = document.createElement('div');
        leftPanel.style.cssText = `
            position: absolute;
            bottom: ${px(isMobile ? 120 : 120)}px;
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
            bottom: ${px(isMobile ? 12 : 20)}px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: ${px(4)}px;
            background: rgba(14, 26, 36, 0.88);
            padding: ${px(8)}px ${px(10)}px;
            border-radius: ${px(10)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            pointer-events: auto;
        `;
        hud.appendChild(inventory);

        const slotSize = px(isMobile ? 40 : 56);
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
                pointer-events: auto;
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

            slot.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('selectSlot', { detail: i }));
            });
            slot.addEventListener('touchstart', (e) => {
                e.preventDefault();
                document.dispatchEvent(new CustomEvent('selectSlot', { detail: i }));
            }, { passive: false });

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

        const stormOverlay = document.createElement('div');
        stormOverlay.id = 'stormOverlay';
        stormOverlay.style.cssText = `
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at 30% 30%, rgba(120, 140, 255, 0.2), rgba(20, 30, 40, 0.55));
            mix-blend-mode: screen;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.4s ease;
            z-index: 900;
        `;
        hud.appendChild(stormOverlay);

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

        const crosshair = document.createElement('div');
        crosshair.id = 'crosshair';
        crosshair.style.cssText = `
            position: absolute;
            left: 50%;
            top: 50%;
            width: ${px(18)}px;
            height: ${px(18)}px;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 1100;
        `;
        const crossVert = document.createElement('div');
        crossVert.style.cssText = `
            position: absolute;
            left: 50%;
            top: 0;
            width: ${px(2)}px;
            height: 100%;
            transform: translateX(-50%);
            background: rgba(255, 255, 255, 0.9);
            box-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
        `;
        const crossHorz = document.createElement('div');
        crossHorz.style.cssText = `
            position: absolute;
            top: 50%;
            left: 0;
            width: 100%;
            height: ${px(2)}px;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.9);
            box-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
        `;
        crosshair.appendChild(crossVert);
        crosshair.appendChild(crossHorz);
        hud.appendChild(crosshair);

        const hitMarker = document.createElement('div');
        hitMarker.id = 'hitMarker';
        hitMarker.style.cssText = `
            position: absolute;
            left: 50%;
            top: 50%;
            width: ${px(30)}px;
            height: ${px(30)}px;
            transform: translate(-50%, -50%) rotate(45deg);
            border: ${px(3)}px solid rgba(255, 255, 255, 0.9);
            border-radius: ${px(4)}px;
            opacity: 0;
            transition: opacity 0.12s ease;
            pointer-events: none;
            z-index: 1101;
        `;
        hud.appendChild(hitMarker);

        const gameMessage = document.createElement('div');
        gameMessage.id = 'gameMessage';
        const messageTop = isMobile ? 18 : 30;
        const messageFont = isMobile ? Math.max(10, Math.round(px(30) / 3)) : px(30);
        gameMessage.style.cssText = `
            position: absolute;
            top: ${messageTop}%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: ${messageFont}px;
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

        const quickCommand = document.createElement('div');
        quickCommand.id = 'quickCommand';
        quickCommand.style.cssText = `
            position: absolute;
            top: ${px(18)}px;
            right: ${px(16)}px;
            background: rgba(14, 26, 36, 0.92);
            padding: ${px(8)}px ${px(14)}px;
            border-radius: ${px(10)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            font-size: ${px(14)}px;
            font-weight: 800;
            display: none;
        `;
        hud.appendChild(quickCommand);

        const loreNote = document.createElement('div');
        loreNote.id = 'loreNote';
        loreNote.style.cssText = `
            position: absolute;
            bottom: ${px(180)}px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(14, 26, 36, 0.92);
            padding: ${px(10)}px ${px(18)}px;
            border-radius: ${px(12)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            font-size: ${px(14)}px;
            font-weight: 700;
            max-width: min(520px, 88vw);
            text-align: center;
            display: none;
        `;
        hud.appendChild(loreNote);

        const ammoInfo = document.createElement('div');
        ammoInfo.id = 'ammoInfo';
        ammoInfo.style.cssText = `
            position: absolute;
            bottom: ${px(isMobile ? 70 : 90)}px;
            right: ${px(16)}px;
            background: rgba(14, 26, 36, 0.88);
            padding: ${px(8)}px ${px(14)}px;
            border-radius: ${px(8)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            font-size: ${px(14)}px;
            font-weight: 700;
            text-shadow: 0 2px 4px rgba(0,0,0,0.6);
        `;
        ammoInfo.textContent = '';
        hud.appendChild(ammoInfo);

        const perkButton = document.createElement('div');
        perkButton.id = 'perkButton';
        perkButton.textContent = 'ПЕРК';
        perkButton.style.cssText = `
            position: absolute;
            bottom: ${px(isMobile ? 210 : 150)}px;
            left: ${px(16)}px;
            background: rgba(14, 26, 36, 0.88);
            padding: ${px(8)}px ${px(14)}px;
            border-radius: ${px(8)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            font-size: ${px(12)}px;
            font-weight: 800;
            pointer-events: auto;
            cursor: pointer;
        `;
        perkButton.addEventListener('click', () => this.togglePerkPanel());
        perkButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.togglePerkPanel();
        }, { passive: false });
        hud.appendChild(perkButton);

        const perkPanel = document.createElement('div');
        perkPanel.id = 'perkPanel';
        perkPanel.style.cssText = `
            position: absolute;
            bottom: ${px(isMobile ? 190 : 210)}px;
            left: ${px(16)}px;
            background: rgba(14, 26, 36, 0.95);
            padding: ${px(12)}px ${px(14)}px;
            border-radius: ${px(12)}px;
            border: 2px solid rgba(255, 255, 255, 0.14);
            display: none;
            pointer-events: auto;
            min-width: ${px(210)}px;
            z-index: 1200;
        `;
        perkPanel.innerHTML = `
            <div style="font-size:${px(12)}px;font-weight:800;margin-bottom:${px(8)}px;">Выбор перка</div>
            <button class="perk-btn" data-perk="quickHands">Быстрые руки</button>
            <button class="perk-btn" data-perk="silentStep">Тихий шаг</button>
            <button class="perk-btn" data-perk="moreAmmo">Больше патронов</button>
            <button class="perk-btn" data-perk="fastRun">Быстрый бег</button>
            <button class="perk-btn" data-perk="thickSkin">Плотная кожа</button>
            <button class="perk-btn" data-perk="steadyAim">Стабильный прицел</button>
        `;
        this.perkButtons = Array.from(perkPanel.querySelectorAll('.perk-btn'));
        this.perkButtons.forEach(btn => {
            btn.style.cssText = `
                width: 100%;
                margin: ${px(4)}px 0;
                padding: ${px(8)}px ${px(10)}px;
                border-radius: ${px(8)}px;
                border: 1px solid rgba(255, 255, 255, 0.12);
                background: rgba(255, 255, 255, 0.08);
                color: #e9f0f6;
                font-weight: 700;
                cursor: pointer;
            `;
            btn.addEventListener('click', (e) => {
                const perk = e.currentTarget.getAttribute('data-perk');
                document.dispatchEvent(new CustomEvent('selectPerk', { detail: perk }));
                this.togglePerkPanel(false);
            });
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const perk = e.currentTarget.getAttribute('data-perk');
                document.dispatchEvent(new CustomEvent('selectPerk', { detail: perk }));
                this.togglePerkPanel(false);
            }, { passive: false });
        });
        hud.appendChild(perkPanel);

        const scoreboard = document.createElement('div');
        scoreboard.id = 'scoreboard';
        scoreboard.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            min-width: min(520px, 88vw);
            background: rgba(14, 26, 36, 0.95);
            padding: ${px(18)}px ${px(22)}px;
            border-radius: ${px(14)}px;
            border: 2px solid rgba(255, 255, 255, 0.15);
            box-shadow: 0 12px 30px rgba(0,0,0,0.35);
            display: none;
            text-align: center;
            z-index: 1200;
        `;
        scoreboard.innerHTML = `
            <div style="font-size:${px(22)}px;font-weight:800;margin-bottom:${px(8)}px;">Итоги раунда</div>
            <div id="scoreboardBody" style="display:grid;gap:${px(6)}px;font-size:${px(14)}px;"></div>
        `;
        hud.appendChild(scoreboard);

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

    setRoundMode(label) {
        const modeInfo = document.getElementById('modeInfo');
        if (modeInfo) modeInfo.textContent = `\u0420\u0435\u0436\u0438\u043c: ${label}`;
    }

    setPerk(label) {
        const perkInfo = document.getElementById('perkInfo');
        if (perkInfo) perkInfo.textContent = `\u041f\u0435\u0440\u043a: ${label}`;
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
                else if (item.type === 'shotgun') icon.textContent = 'SG';
                else if (item.type === 'flamethrower') icon.textContent = 'FIRE';
                else if (item.type === 'axe') icon.textContent = 'AXE';
                else if (item.type === 'spear') icon.textContent = 'SPR';
                else if (item.type === 'pistol') icon.textContent = 'PST';
                else if (item.type === 'rifle') icon.textContent = 'RIF';

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

    showQuickCommand(message) {
        const quick = document.getElementById('quickCommand');
        if (!quick) return;
        quick.textContent = message;
        quick.style.display = 'block';
        clearTimeout(this.quickTimer);
        this.quickTimer = setTimeout(() => {
            quick.style.display = 'none';
        }, 1600);
    }

    showLoreNote(text) {
        const note = document.getElementById('loreNote');
        if (!note) return;
        note.textContent = text;
        note.style.display = 'block';
        clearTimeout(this.noteTimer);
        this.noteTimer = setTimeout(() => {
            note.style.display = 'none';
        }, 3200);
    }

    showHitMarker() {
        const hit = document.getElementById('hitMarker');
        if (!hit) return;
        hit.style.opacity = '1';
        clearTimeout(this.hitTimer);
        this.hitTimer = setTimeout(() => {
            hit.style.opacity = '0';
        }, 120);
    }

    setStormActive(active) {
        const storm = document.getElementById('stormOverlay');
        if (!storm) return;
        storm.style.opacity = active ? '1' : '0';
    }

    showScoreboard(lines = []) {
        const board = document.getElementById('scoreboard');
        const body = document.getElementById('scoreboardBody');
        if (!board || !body) return;
        body.innerHTML = lines.map(line => `<div>${line}</div>`).join('');
        board.style.display = 'block';
    }

    togglePerkPanel(force) {
        const panel = document.getElementById('perkPanel');
        if (!panel) return;
        if (typeof force === 'boolean') {
            panel.style.display = force ? 'block' : 'none';
            return;
        }
        panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    }

    setPerkMenuSelection(index) {
        if (!this.perkButtons || !this.perkButtons.length) return;
        const safeIndex = ((index % this.perkButtons.length) + this.perkButtons.length) % this.perkButtons.length;
        this.perkButtons.forEach((btn, i) => {
            if (i === safeIndex) {
                btn.style.background = 'rgba(255, 179, 0, 0.3)';
                btn.style.border = '1px solid rgba(255, 179, 0, 0.8)';
            } else {
                btn.style.background = 'rgba(255, 255, 255, 0.08)';
                btn.style.border = '1px solid rgba(255, 255, 255, 0.12)';
            }
        });
        this.perkMenuIndex = safeIndex;
    }

    getPerkMenuSelection() {
        return this.perkMenuIndex ?? 0;
    }

    getPerkMenuValue() {
        if (!this.perkButtons || !this.perkButtons.length) return null;
        const idx = this.perkMenuIndex ?? 0;
        return this.perkButtons[idx]?.getAttribute('data-perk') || null;
    }

    updateAmmo(weapon) {
        const ammoInfo = document.getElementById('ammoInfo');
        if (!ammoInfo) return;
        if (!weapon || weapon.type === 'fists') {
            ammoInfo.textContent = '';
            return;
        }
        if (weapon.type === 'knife') {
            ammoInfo.textContent = `\u041d\u043e\u0436: ${weapon.durability ?? 0}/${weapon.maxDurability ?? 0}`;
        } else if (weapon.type === 'bow') {
            ammoInfo.textContent = `\u0421\u0442\u0440\u0435\u043b\u044b: ${weapon.ammo ?? 0}/${weapon.maxAmmo ?? 0}`;
        } else if (weapon.type === 'laser') {
            ammoInfo.textContent = `\u041f\u0443\u043b\u044c\u043a\u0438: ${weapon.ammo ?? 0}/${weapon.maxAmmo ?? 0}`;
        } else if (weapon.type === 'shotgun') {
            ammoInfo.textContent = `\u041f\u0430\u0442\u0440\u043e\u043d\u044b: ${weapon.ammo ?? 0}/${weapon.maxAmmo ?? 0}`;
        } else if (weapon.type === 'flamethrower') {
            ammoInfo.textContent = `\u0422\u043e\u043f\u043b\u0438\u0432\u043e: ${weapon.ammo ?? 0}/${weapon.maxAmmo ?? 0}`;
        } else if (weapon.type === 'pistol') {
            ammoInfo.textContent = `\u041f\u0430\u0442\u0440\u043e\u043d\u044b: ${weapon.ammo ?? 0}/${weapon.maxAmmo ?? 0}`;
        } else if (weapon.type === 'rifle') {
            ammoInfo.textContent = `\u041f\u0430\u0442\u0440\u043e\u043d\u044b: ${weapon.ammo ?? 0}/${weapon.maxAmmo ?? 0}`;
        } else {
            ammoInfo.textContent = '';
        }
    }
}
