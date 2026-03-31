export class HUD {
    constructor() {
        this.createHUD();
    }

    getSlotDisplayNumber(slotIndex) {
        return ((slotIndex + 1) % 10).toString();
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

        const visionOverlay = document.createElement('div');
        visionOverlay.id = 'visionOverlay';
        visionOverlay.style.cssText = `
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 940;
            opacity: 0;
            transition: opacity 0.3s ease;
            background:
                linear-gradient(180deg, rgba(2,8,14,0.36) 0%, rgba(2,8,14,0.1) 18%, rgba(2,8,14,0.1) 82%, rgba(0,0,0,0.46) 100%),
                linear-gradient(90deg, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.06) 20%, rgba(0,0,0,0.06) 80%, rgba(0,0,0,0.44) 100%);
        `;
        hud.appendChild(visionOverlay);

        const lootFeed = document.createElement('div');
        lootFeed.id = 'lootFeed';
        lootFeed.style.cssText = `
            position: absolute;
            top: ${px(78)}px;
            right: ${px(16)}px;
            display: flex;
            flex-direction: column;
            gap: ${px(8)}px;
            max-width: min(${px(280)}px, 72vw);
            z-index: 1350;
            pointer-events: none;
        `;
        hud.appendChild(lootFeed);

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
            slot.textContent = this.getSlotDisplayNumber(i);

            const slotNumber = document.createElement('div');
            slotNumber.style.cssText = `
                position: absolute;
                bottom: ${px(2)}px;
                right: ${px(4)}px;
                font-size: ${px(10)}px;
                color: rgba(255, 255, 255, 0.7);
            `;
            slotNumber.textContent = this.getSlotDisplayNumber(i);
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

        const pauseButton = document.createElement('div');
        pauseButton.id = 'pauseButton';
        pauseButton.textContent = 'II';
        pauseButton.style.cssText = `
            position: absolute;
            top: ${px(16)}px;
            left: ${px(16)}px;
            width: ${px(38)}px;
            height: ${px(38)}px;
            border-radius: ${px(10)}px;
            background: rgba(14, 26, 36, 0.88);
            border: 2px solid rgba(255, 255, 255, 0.12);
            font-size: ${px(16)}px;
            font-weight: 800;
            display: ${isMobile ? 'flex' : 'none'};
            align-items: center;
            justify-content: center;
            pointer-events: auto;
            cursor: pointer;
            z-index: 1300;
        `;
        pauseButton.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('togglePause'));
        });
        pauseButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent('togglePause'));
        }, { passive: false });
        hud.appendChild(pauseButton);

        const pauseKeyInfo = document.createElement('div');
        pauseKeyInfo.id = 'pauseKeyInfo';
        pauseKeyInfo.textContent = 'M - ПАУЗА';
        pauseKeyInfo.style.cssText = `
            position: absolute;
            top: ${px(18)}px;
            left: ${px(64)}px;
            background: rgba(14, 26, 36, 0.88);
            padding: ${px(7)}px ${px(12)}px;
            border-radius: ${px(10)}px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            font-size: ${px(12)}px;
            font-weight: 800;
            letter-spacing: 0.6px;
            display: ${isMobile ? 'none' : 'block'};
            z-index: 1300;
        `;
        hud.appendChild(pauseKeyInfo);

        const pauseOverlay = document.createElement('div');
        pauseOverlay.id = 'pauseOverlay';
        pauseOverlay.style.cssText = `
            position: absolute;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(4, 8, 14, 0.72);
            z-index: 2000;
            pointer-events: auto;
        `;
                pauseOverlay.innerHTML = `
            <div id="pausePanel" style="
                min-width:${px(260)}px;
                max-width:min(420px, 88vw);
                background: rgba(12, 20, 30, 0.96);
                border: 2px solid rgba(255,255,255,0.12);
                border-radius:${px(12)}px;
                padding:${px(16)}px ${px(18)}px;
                color:#fff;
                font-weight:700;">
                <div style="font-size:${px(20)}px;margin-bottom:${px(10)}px;">Пауза</div>
                <div style="font-size:${px(12)}px;opacity:0.8;margin-bottom:${px(12)}px;">
                    WASD - движение · Мышь - обзор · E - взаимодействие · Space - прыжок · ЛКМ - атака · M - пауза
                </div>
                <div style="display:grid;gap:${px(8)}px;margin-bottom:${px(12)}px;">
                    <label style="display:grid;gap:${px(4)}px;font-size:${px(12)}px;">
                        <span>Музыка</span>
                        <input id="pauseMusicVolume" type="range" min="0" max="0.4" step="0.01" value="0.14">
                    </label>
                    <label style="display:grid;gap:${px(4)}px;font-size:${px(12)}px;">
                        <span>Эффекты</span>
                        <input id="pauseSfxVolume" type="range" min="0" max="0.55" step="0.01" value="0.22">
                    </label>
                    <label style="display:grid;gap:${px(4)}px;font-size:${px(12)}px;">
                        <span>Чувствительность</span>
                        <input id="pauseSensitivity" type="range" min="0.5" max="2.4" step="0.05" value="1">
                    </label>
                </div>
                <div id="keybindSection" style="display:${isMobile ? 'none' : 'block'};margin-bottom:${px(10)}px;">
                    <div style="font-size:${px(12)}px;opacity:0.8;margin-bottom:${px(6)}px;">Управление (кликни, чтобы переназначить)</div>
                    <div id="keybindList" style="display:grid;gap:${px(6)}px;"></div>
                </div>
                <div style="display:flex;gap:${px(8)}px;flex-wrap:wrap;">
                    <button id="pauseResume" class="perk-btn" style="flex:1;">Продолжить</button>
                    <button id="pauseEdit" class="perk-btn" style="flex:1;display:${isMobile ? 'block' : 'none'};">Настроить кнопки</button>
                </div>
                <div id="pauseHint" style="margin-top:${px(10)}px;font-size:${px(11)}px;opacity:0.7;display:${isMobile ? 'block' : 'none'};">
                    Перетащи кнопки управления, чтобы расположить их удобнее.
                </div>
            </div>
        `;
        hud.appendChild(pauseOverlay);

        const ammoInfo = document.createElement('div');
        ammoInfo.id = 'ammoInfo';
        ammoInfo.style.cssText = `
            position: absolute;
            bottom: ${isMobile ? `calc(6vh + ${px(238)}px)` : `${px(90)}px`};
            right: ${isMobile ? 'max(16px, 4vw)' : `${px(16)}px`};
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
        perkButton.textContent = 'ПЕРК ДО СТАРТА';
        perkButton.style.cssText = `
            position: absolute;
            bottom: ${px(isMobile ? 320 : 210)}px;
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
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(14, 26, 36, 0.95);
            padding: ${px(16)}px ${px(18)}px;
            border-radius: ${px(12)}px;
            border: 2px solid rgba(255, 191, 0, 0.2);
            display: none;
            pointer-events: auto;
            min-width: min(${px(290)}px, 82vw);
            max-width: min(${px(340)}px, 86vw);
            max-height: ${isMobile ? '55vh' : '60vh'};
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            touch-action: pan-y;
            z-index: 1500;
            box-shadow: 0 18px 40px rgba(0,0,0,0.42);
        `;
                perkPanel.innerHTML = `
            <div style="font-size:${px(18)}px;font-weight:900;margin-bottom:${px(6)}px;">Выбор перка</div>
            <div style="font-size:${px(11)}px;opacity:0.76;margin-bottom:${px(10)}px;">Перк выбирается один раз перед матчем и действует весь раунд.</div>
            <button class="perk-btn" data-perk="quickHands">Быстрые руки</button>
            <button class="perk-btn" data-perk="silentStep">Тихий шаг</button>
            <button class="perk-btn" data-perk="moreAmmo">Больше патронов</button>
            <button class="perk-btn" data-perk="fastRun">Быстрый бег</button>
            <button class="perk-btn" data-perk="thickSkin">Плотная кожа</button>
            <button class="perk-btn" data-perk="steadyAim">Стабильный прицел</button>
            <button class="perk-btn" data-perk="autoFire">AUTO FIRE</button>
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

        this.bindPauseUI();
        this.bindSettingsUI();
        this.initKeybindUI();
        if (isMobile) {
            this.initTouchLayout();
        }
    }

    bindPauseUI() {
        const resume = document.getElementById('pauseResume');
        const edit = document.getElementById('pauseEdit');
        if (resume) {
            resume.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('togglePause'));
            });
            resume.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.dispatchEvent(new CustomEvent('togglePause'));
            }, { passive: false });
        }
        if (edit) {
            edit.addEventListener('click', () => this.toggleEditControls());
            edit.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleEditControls();
            }, { passive: false });
        }
    }

    bindSettingsUI() {
        const music = document.getElementById('pauseMusicVolume');
        const sfx = document.getElementById('pauseSfxVolume');
        const sensitivity = document.getElementById('pauseSensitivity');
        const emitAudio = () => {
            document.dispatchEvent(new CustomEvent('setAudioSettings', {
                detail: {
                    musicVolume: Number(music?.value || 0.14),
                    sfxVolume: Number(sfx?.value || 0.22)
                }
            }));
        };
        if (music) {
            music.addEventListener('input', emitAudio);
            music.addEventListener('change', emitAudio);
        }
        if (sfx) {
            sfx.addEventListener('input', emitAudio);
            sfx.addEventListener('change', emitAudio);
        }
        if (sensitivity) {
            const emitSensitivity = () => {
                document.dispatchEvent(new CustomEvent('setLookSensitivity', { detail: Number(sensitivity.value || 1) }));
            };
            sensitivity.addEventListener('input', emitSensitivity);
            sensitivity.addEventListener('change', emitSensitivity);
        }
    }

    showPause(show) {
        const overlay = document.getElementById('pauseOverlay');
        if (!overlay) return;
        overlay.style.display = show ? 'flex' : 'none';
        if (!show) this.toggleEditControls(false);
    }

    toggleEditControls(force = null) {
        const root = document.documentElement;
        const enabled = force !== null ? force : !root.classList.contains('edit-controls');
        if (enabled) root.classList.add('edit-controls');
        else root.classList.remove('edit-controls');
        const hint = document.getElementById('pauseHint');
        if (hint) hint.style.display = enabled ? 'block' : 'none';
    }

    initTouchLayout() {
        const ids = ['touchJump', 'touchAttack', 'touchInteract', 'touchStick'];
        const saved = localStorage.getItem('mazearena_touch_layout');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                ids.forEach((id) => {
                    const el = document.getElementById(id);
                    if (!el || !data[id]) return;
                    el.style.left = `${data[id].x}px`;
                    el.style.top = `${data[id].y}px`;
                });
            } catch (_) {}
        }

        let active = null;
        let offset = { x: 0, y: 0 };
        const saveLayout = () => {
            const data = {};
            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                const rect = el.getBoundingClientRect();
                data[id] = { x: rect.left, y: rect.top };
            });
            localStorage.setItem('mazearena_touch_layout', JSON.stringify(data));
        };

        const onDown = (e) => {
            if (!document.documentElement.classList.contains('edit-controls')) return;
            const target = e.target.closest ? e.target.closest('.touch-btn, #touchStick') : null;
            if (!target) return;
            active = target;
            const rect = active.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            offset.x = clientX - rect.left;
            offset.y = clientY - rect.top;
            e.preventDefault();
        };

        const onMove = (e) => {
            if (!active) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            active.style.left = `${clientX - offset.x}px`;
            active.style.top = `${clientY - offset.y}px`;
            active.style.right = 'auto';
            active.style.bottom = 'auto';
            e.preventDefault();
        };

        const onUp = () => {
            if (!active) return;
            active = null;
            saveLayout();
        };

        document.addEventListener('touchstart', onDown, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    initKeybindUI() {
        const list = document.getElementById('keybindList');
        if (!list) return;
                this.keybindActions = [
            { id: 'KeyW', label: 'Вперёд' },
            { id: 'KeyS', label: 'Назад' },
            { id: 'KeyA', label: 'Влево' },
            { id: 'KeyD', label: 'Вправо' },
            { id: 'Space', label: 'Прыжок' },
            { id: 'KeyE', label: 'Взаимодействие' },
            { id: 'MouseLeft', label: 'Атака' },
            { id: 'KeyP', label: 'Меню перков' }
        ];
        this.renderKeybinds();
        this.bindRebindListeners();
    }

    renderKeybinds() {
        const list = document.getElementById('keybindList');
        if (!list || !this.keybindActions) return;
        list.innerHTML = '';
        const binds = this.getStoredKeybinds();
        this.keybindActions.forEach((item) => {
            const row = document.createElement('div');
            row.style.cssText = `
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:${Math.max(6, Math.round(list.clientWidth * 0.02))}px;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.12);
                border-radius: 8px;
                padding: 6px 8px;
                font-size: 12px;
            `;
            const left = document.createElement('div');
            left.textContent = item.label;
            const btn = document.createElement('button');
            btn.className = 'perk-btn';
            btn.dataset.action = item.id;
            btn.textContent = this.formatKeyLabel(binds[item.id] || item.id);
            btn.style.cssText = `
                padding: 4px 8px;
                font-size: 11px;
                border-radius: 8px;
                min-width: 70px;
            `;
            btn.addEventListener('click', () => this.beginRebind(item.id, btn));
            row.appendChild(left);
            row.appendChild(btn);
            list.appendChild(row);
        });
    }

    getStoredKeybinds() {
        try {
            const raw = localStorage.getItem('mazearena_keybinds');
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    formatKeyLabel(code) {
        if (code === 'MouseLeft') return 'LMB';
        if (code === 'MouseRight') return 'RMB';
        if (code === 'Space') return 'SPACE';
        if (code.startsWith('Key')) return code.replace('Key', '');
        if (code.startsWith('Digit')) return code.replace('Digit', '');
        return code;
    }

    bindRebindListeners() {
        document.addEventListener('keydown', (e) => {
            if (!this.rebindAction) return;
            e.preventDefault();
            this.finishRebind(this.rebindAction, e.code);
        });
        document.addEventListener('mousedown', (e) => {
            if (!this.rebindAction) return;
            e.preventDefault();
            const code = e.button === 0 ? 'MouseLeft' : e.button === 2 ? 'MouseRight' : `Mouse${e.button}`;
            this.finishRebind(this.rebindAction, code);
        });
    }

    beginRebind(action, button) {
        this.rebindAction = action;
        if (button) button.textContent = '...';
        this.rebindButton = button || null;
    }

    finishRebind(action, code) {
        this.rebindAction = null;
        if (this.rebindButton) {
            this.rebindButton.textContent = this.formatKeyLabel(code);
            this.rebindButton = null;
        }
        try {
            const binds = this.getStoredKeybinds();
            for (const key in binds) {
                if (binds[key] === code && key !== action) {
                    delete binds[key];
                }
            }
            binds[action] = code;
            localStorage.setItem('mazearena_keybinds', JSON.stringify(binds));
        } catch (_) {}
        document.dispatchEvent(new CustomEvent('rebindKey', { detail: { action, code } }));
        this.renderKeybinds();
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

    setSettingsValues(settings = {}) {
        const music = document.getElementById('pauseMusicVolume');
        const sfx = document.getElementById('pauseSfxVolume');
        const sensitivity = document.getElementById('pauseSensitivity');
        if (music && settings.musicVolume !== undefined) music.value = String(settings.musicVolume);
        if (sfx && settings.sfxVolume !== undefined) sfx.value = String(settings.sfxVolume);
        if (sensitivity && settings.lookSensitivity !== undefined) sensitivity.value = String(settings.lookSensitivity);
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

    showLootNotification(text) {
        const feed = document.getElementById('lootFeed');
        if (!feed || !text) return;

        const item = document.createElement('div');
        item.style.cssText = `
            background: rgba(14, 26, 36, 0.92);
            border: 2px solid rgba(255, 191, 0, 0.24);
            border-radius: 10px;
            padding: 10px 12px;
            color: #f7fbff;
            font-size: 13px;
            font-weight: 700;
            box-shadow: 0 8px 20px rgba(0,0,0,0.28);
            transform: translateX(16px);
            opacity: 0;
            transition: transform 0.2s ease, opacity 0.2s ease;
        `;
        item.textContent = text;
        feed.appendChild(item);

        requestAnimationFrame(() => {
            item.style.transform = 'translateX(0)';
            item.style.opacity = '1';
        });

        setTimeout(() => {
            item.style.transform = 'translateX(18px)';
            item.style.opacity = '0';
            setTimeout(() => item.remove(), 220);
        }, 2400);
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

    setVisionIntensity(intensity = 0) {
        const overlay = document.getElementById('visionOverlay');
        if (!overlay) return;
        overlay.style.opacity = `${Math.max(0, Math.min(0.85, intensity))}`;
    }

    showScoreboard(lines = []) {
        const board = document.getElementById('scoreboard');
        const body = document.getElementById('scoreboardBody');
        if (!board || !body) return;
        body.innerHTML = lines.map(line => `<div>${line}</div>`).join('');
        board.style.display = 'block';
    }

    hideScoreboard() {
        const board = document.getElementById('scoreboard');
        if (board) {
            board.style.display = 'none';
        }
    }

    setPerkSelectionEnabled(enabled) {
        const perkButton = document.getElementById('perkButton');
        const perkPanel = document.getElementById('perkPanel');
        if (perkButton) {
            perkButton.style.display = enabled ? 'block' : 'none';
        }
        if (!enabled && perkPanel) {
            perkPanel.style.display = 'none';
        }
    }

    togglePerkPanel(force) {
        const panel = document.getElementById('perkPanel');
        if (!panel) return;
        if (typeof force === 'boolean') {
            panel.style.display = force ? 'block' : 'none';
            if (force) {
                this.setPerkMenuSelection(this.getPerkMenuSelection());
            }
            return;
        }
        panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        if (panel.style.display === 'block') {
            this.setPerkMenuSelection(this.getPerkMenuSelection());
        }
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
        const panel = document.getElementById('perkPanel');
        const selected = this.perkButtons[safeIndex];
        if (panel && selected) {
            const itemTop = selected.offsetTop;
            const itemBottom = itemTop + selected.offsetHeight;
            if (itemTop < panel.scrollTop) {
                panel.scrollTop = itemTop - 6;
            } else if (itemBottom > panel.scrollTop + panel.clientHeight) {
                panel.scrollTop = itemBottom - panel.clientHeight + 6;
            }
        }
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
            ammoInfo.textContent = `\u041d\u043e\u0436: ${weapon.durability ?? 0}`;
        } else if (weapon.type === 'bow') {
            ammoInfo.textContent = `\u0421\u0442\u0440\u0435\u043b\u044b: ${weapon.ammo ?? 0}`;
        } else if (weapon.type === 'laser') {
            ammoInfo.textContent = `\u041f\u0443\u043b\u044c\u043a\u0438: ${weapon.ammo ?? 0}`;
        } else if (weapon.type === 'shotgun') {
            ammoInfo.textContent = `\u041f\u0430\u0442\u0440\u043e\u043d\u044b: ${weapon.ammo ?? 0}`;
        } else if (weapon.type === 'flamethrower') {
            ammoInfo.textContent = `\u0422\u043e\u043f\u043b\u0438\u0432\u043e: ${weapon.ammo ?? 0}`;
        } else if (weapon.type === 'pistol') {
            ammoInfo.textContent = `\u041f\u0430\u0442\u0440\u043e\u043d\u044b: ${weapon.ammo ?? 0}`;
        } else if (weapon.type === 'rifle') {
            ammoInfo.textContent = `\u041f\u0430\u0442\u0440\u043e\u043d\u044b: ${weapon.ammo ?? 0}`;
        } else {
            ammoInfo.textContent = '';
        }
    }
}




