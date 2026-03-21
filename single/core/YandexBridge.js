const STRINGS = {
    ru: {
        title: 'Rubo Arena: Голодные игры',
        badge1: 'Официальный релиз',
        badge2: 'Выживание',
        desktopDesc: 'Выживание до последнего игрока. Рандомная карта, лут из сундуков и перки прямо во время боя.',
        mobileDesc: 'Полноэкранный матч на телефоне. Нажми старт и сразу в бой.',
        start: 'Начать игру',
        footerDesktop: 'Быстрый матч · Рандомная карта · Перки в бою',
        footerMobile: 'Левый стик: движение · Правая часть: обзор · Кнопки: Прыжок / Удар / E',
        loading: 'Загрузка...',
        rotate: 'Поверните телефон в альбомную ориентацию',
        controls: [
            '<strong>WASD</strong> - движение',
            '<strong>Мышь</strong> - обзор',
            '<strong>Пробел</strong> - прыжок',
            '<strong>ЛКМ</strong> - атака',
            '<strong>E</strong> - взаимодействие',
            '<strong>1-0</strong> - инвентарь',
            '<strong>P</strong> - меню перков',
            '<strong>W/S</strong> - выбор перка',
            '<strong>E</strong> - подтвердить перк',
            '<strong>M</strong> - пауза',
            '<strong>Mobile</strong> - левый стик: движение, правая сторона: обзор',
            '<strong>Mobile</strong> - кнопки: Прыжок / Атака / Действие'
        ],
        touchJump: 'Прыжок',
        touchAttack: 'Удар'
    },
    en: {
        title: 'Rubo Arena: Голодные игры',
        badge1: 'Official Release',
        badge2: 'Survival',
        desktopDesc: 'Fight to be the last survivor. Random map, chest loot and perks during combat.',
        mobileDesc: 'Fullscreen mobile match. Tap Start and jump right into battle.',
        start: 'Start Game',
        footerDesktop: 'Quick match - Random map - In-match perks',
        footerMobile: 'Left stick: move - Right side: look - Buttons: Jump / Hit / E',
        loading: 'Loading...',
        rotate: 'Rotate your phone to landscape',
        controls: [
            '<strong>WASD</strong> - move',
            '<strong>Mouse</strong> - look',
            '<strong>Space</strong> - jump',
            '<strong>LMB</strong> - attack',
            '<strong>E</strong> - interact',
            '<strong>1-0</strong> - inventory',
            '<strong>P</strong> - perk menu',
            '<strong>W/S</strong> - perk select',
            '<strong>E</strong> - confirm perk',
            '<strong>M</strong> - pause',
            '<strong>Mobile</strong> - left stick: move, right side: look',
            '<strong>Mobile</strong> - buttons: Jump / Hit / E'
        ],
        touchJump: 'Jump',
        touchAttack: 'Hit'
    }
};

export class YandexBridge {
    constructor() {
        this.ysdk = null;
        this.lang = 'ru';
        this.initialized = false;
        this.readySent = false;
    }

    normalizeLang(raw) {
        const lang = String(raw || 'ru').toLowerCase();
        if (lang.startsWith('ru')) return 'ru';
        return 'en';
    }

    getLangFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const fromUrl = params.get('lang') || params.get('language') || params.get('hl');
            return this.normalizeLang(fromUrl || '');
        } catch (_) {
            return 'ru';
        }
    }

    applyDomSafety() {
        const prevent = (e) => e.preventDefault();
        const preventScroll = (e) => {
            const target = e.target;
            if (target?.closest?.('[data-allow-scroll]')) return;
            if (e.cancelable) e.preventDefault();
        };

        window.addEventListener('contextmenu', prevent, { capture: true });
        document.addEventListener('contextmenu', prevent, { capture: true });
        document.addEventListener('selectstart', prevent, { capture: true });
        document.addEventListener('dragstart', prevent, { capture: true });
        document.addEventListener('touchmove', preventScroll, { capture: true, passive: false });
        document.addEventListener('wheel', preventScroll, { capture: true, passive: false });

        if (document.documentElement) {
            document.documentElement.style.overscrollBehavior = 'none';
            document.documentElement.style.touchAction = 'none';
        }
        if (document.body) {
            document.body.style.overscrollBehavior = 'none';
            document.body.style.touchAction = 'none';
        }
    }

    signalReady() {
        if (this.readySent) return;
        try {
            const readyFn = this.ysdk
                && this.ysdk.features
                && this.ysdk.features.LoadingAPI
                && this.ysdk.features.LoadingAPI.ready;
            if (typeof readyFn === 'function') {
                readyFn.call(this.ysdk.features.LoadingAPI);
                this.readySent = true;
            }
        } catch (err) {
            console.warn('Yandex LoadingAPI.ready failed:', err);
        }
    }

    applyLocalization() {
        const t = STRINGS[this.lang] || STRINGS.ru;
        document.documentElement.lang = this.lang;
        document.title = t.title;

        document.querySelectorAll('.start-title').forEach((el) => {
            el.textContent = t.title;
        });

        const badges = document.querySelectorAll('.start-badges .start-badge');
        if (badges[0]) badges[0].textContent = t.badge1;
        if (badges[1]) badges[1].textContent = t.badge2;

        const desktopDesc = document.querySelector('.start-layout.desktop .start-panel p');
        if (desktopDesc) desktopDesc.textContent = t.desktopDesc;
        const mobileDesc = document.querySelector('.start-layout.mobile .start-panel p');
        if (mobileDesc) mobileDesc.textContent = t.mobileDesc;

        const startDesktop = document.getElementById('startButtonDesktop');
        if (startDesktop) startDesktop.textContent = t.start;
        const startMobile = document.getElementById('startButtonMobile');
        if (startMobile) startMobile.textContent = t.start;
        const startDefault = document.getElementById('startButton');
        if (startDefault) startDefault.textContent = t.start;

        const footers = document.querySelectorAll('.start-footer');
        if (footers[0]) footers[0].textContent = t.footerDesktop;
        if (footers[1]) footers[1].textContent = t.footerMobile;

        const controlsInfo = document.querySelector('.controls-info');
        if (controlsInfo) {
            controlsInfo.innerHTML = t.controls.map((line) => `<div>${line}</div>`).join('');
        }

        const rotate = document.querySelector('#rotateOverlay .rotate-card');
        if (rotate) rotate.textContent = t.rotate;
        const loadingTitle = document.querySelector('.loading-title');
        if (loadingTitle) loadingTitle.textContent = t.loading;

        const jumpBtn = document.getElementById('touchJump');
        if (jumpBtn) jumpBtn.textContent = t.touchJump;
        const attackBtn = document.getElementById('touchAttack');
        if (attackBtn) attackBtn.textContent = t.touchAttack;
    }

    async init() {
        if (this.initialized) return this;
        this.applyDomSafety();
        this.lang = this.getLangFromUrl();

        try {
            if (window.YaGames?.init) {
                this.ysdk = await window.YaGames.init();
                this.lang = this.normalizeLang(
                    this.ysdk?.environment?.i18n?.lang
                    || this.getLangFromUrl()
                    || navigator.language
                );
            } else {
                this.lang = this.normalizeLang(this.getLangFromUrl() || navigator.language || 'ru');
            }
        } catch (err) {
            console.warn('Yandex SDK init failed:', err);
            this.lang = this.normalizeLang(this.getLangFromUrl() || 'ru');
        }

        this.applyLocalization();
        this.signalReady();
        this.initialized = true;
        return this;
    }

    gameplayStart() {
        try {
            this.ysdk?.features?.GameplayAPI?.start?.();
        } catch (_) {}
    }

    gameplayStop() {
        try {
            this.ysdk?.features?.GameplayAPI?.stop?.();
        } catch (_) {}
    }
}
