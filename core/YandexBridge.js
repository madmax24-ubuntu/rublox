const STRINGS = {
    ru: {
        title: 'Rubo Arena: Голодные игры',
        badge1: 'Официальный релиз',
        badge2: 'Выживание',
        desktopDesc: 'Выживание до последнего. Рандомная карта, лут из сундуков и перки прямо в бою.',
        mobileDesc: 'Полноэкранный матч на телефоне. Нажми старт и сразу в бой.',
        start: 'Начать игру',
        footerDesktop: 'Быстрый матч · Рандомная карта · Перки в бою',
        footerMobile: 'Левый стик: движение · Правая часть: обзор · Кнопки: Прыжок / Удар / E',
        loading: 'Загрузка...',
        rotate: 'Поверните телефон в альбомную ориентацию',
        controls: [
            '<div class="control-row"><span class="control-key">WASD</span><span class="control-desc">движение</span></div>',
            '<div class="control-row"><span class="control-key">Мышь</span><span class="control-desc">обзор</span></div>',
            '<div class="control-row"><span class="control-key">Пробел</span><span class="control-desc">прыжок</span></div>',
            '<div class="control-row"><span class="control-key">ЛКМ</span><span class="control-desc">атака</span></div>',
            '<div class="control-row"><span class="control-key">E</span><span class="control-desc">взаимодействие</span></div>',
            '<div class="control-row"><span class="control-key">1-0</span><span class="control-desc">инвентарь</span></div>',
            '<div class="control-row"><span class="control-key">P</span><span class="control-desc">меню перков</span></div>',
            '<div class="control-row"><span class="control-key">W/S</span><span class="control-desc">выбор перка</span></div>',
            '<div class="control-row"><span class="control-key">M</span><span class="control-desc">пауза</span></div>'
        ],
        touchJump: 'Прыжок',
        touchAttack: 'Удар'
    },
    en: {
        title: 'Rubo Arena: Hunger Games',
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
            '<div class="control-row"><span class="control-key">WASD</span><span class="control-desc">move</span></div>',
            '<div class="control-row"><span class="control-key">Mouse</span><span class="control-desc">look</span></div>',
            '<div class="control-row"><span class="control-key">Space</span><span class="control-desc">jump</span></div>',
            '<div class="control-row"><span class="control-key">LMB</span><span class="control-desc">attack</span></div>',
            '<div class="control-row"><span class="control-key">E</span><span class="control-desc">interact</span></div>',
            '<div class="control-row"><span class="control-key">1-0</span><span class="control-desc">inventory</span></div>',
            '<div class="control-row"><span class="control-key">P</span><span class="control-desc">perk menu</span></div>',
            '<div class="control-row"><span class="control-key">W/S</span><span class="control-desc">perk select</span></div>',
            '<div class="control-row"><span class="control-key">M</span><span class="control-desc">pause</span></div>'
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
        // Callbacks wired by the game (see main.js)
        this.onPlatformPause = null;
        this.onPlatformResume = null;
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

    loadSdkScript() {
        if (window.YaGames?.init) return Promise.resolve(true);
        return new Promise((resolve) => {
            try {
                let settled = false;
                const done = (value) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    resolve(value);
                };
                const timeout = setTimeout(() => done(Boolean(window.YaGames?.init)), 5000);
                const existing = document.querySelector('script[data-yg-sdk="1"]');
                if (existing) {
                    if (existing.dataset.loaded === '1') return done(Boolean(window.YaGames?.init));
                    if (existing.dataset.failed === '1') return done(false);
                    existing.addEventListener('load', () => done(Boolean(window.YaGames?.init)), { once: true });
                    existing.addEventListener('error', () => done(false), { once: true });
                    return;
                }
                const script = document.createElement('script');
                script.src = '/sdk.js';
                script.async = true;
                script.defer = true;
                script.dataset.ygSdk = '1';
                script.onload = () => {
                    script.dataset.loaded = '1';
                    done(Boolean(window.YaGames?.init));
                };
                script.onerror = () => {
                    script.dataset.failed = '1';
                    done(false);
                };
                document.head.appendChild(script);
            } catch (_) {
                resolve(false);
            }
        });
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

        document.querySelectorAll('.start-badges').forEach((group) => {
            const badges = group.querySelectorAll('.start-badge');
            if (badges[0]) badges[0].textContent = t.badge1;
            if (badges[1]) badges[1].textContent = t.badge2;
        });

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
            controlsInfo.innerHTML = t.controls.join('');
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
            if (window.yandexGamesSdkPromise) {
                this.ysdk = await window.yandexGamesSdkPromise;
            } else {
                await this.loadSdkScript();
                if (window.YaGames?.init) this.ysdk = await window.YaGames.init();
            }
            if (this.ysdk) {
                this.lang = this.normalizeLang(
                    this.ysdk?.environment?.i18n?.lang
                    || this.getLangFromUrl()
                    || navigator.language
                );
                this.bindPlatformEvents();
            } else {
                this.lang = this.normalizeLang(this.getLangFromUrl() || navigator.language || 'ru');
            }
        } catch (err) {
            console.warn('Yandex SDK init failed:', err);
            this.lang = this.normalizeLang(this.getLangFromUrl() || 'ru');
        }

        this.applyLocalization();
        this.initialized = true;
        return this;
    }

    // Requirement 1.19: handle ysdk.on('game_api_pause' / 'game_api_resume')
    bindPlatformEvents() {
        const ysdk = this.ysdk;
        if (!ysdk || typeof ysdk.on !== 'function') return;
        try {
            ysdk.on('game_api_pause', () => {
                try {
                    this.onPlatformPause?.();
                } catch (_) {}
            });
            ysdk.on('game_api_resume', () => {
                try {
                    this.onPlatformResume?.();
                } catch (_) {}
            });
        } catch (_) {}
    }

    // Requirement 1.12 / 4.6.1: monetization via sticky banner.
    // Current SDK API: ysdk.adv.showBannerAdv()/hideBannerAdv()
    // (fallback to legacy ysdk.features.BannerAPI for older SDK builds).
    showBanner() {
        const ysdk = this.ysdk;
        if (!ysdk) return;
        try {
            if (typeof ysdk.adv?.showBannerAdv === 'function') {
                ysdk.adv.showBannerAdv();
                return;
            }
        } catch (_) {}
        try {
            ysdk.features?.BannerAPI?.showBanner?.();
        } catch (_) {}
    }

    hideBanner() {
        const ysdk = this.ysdk;
        if (!ysdk) return;
        try {
            if (typeof ysdk.adv?.hideBannerAdv === 'function') {
                ysdk.adv.hideBannerAdv();
                return;
            }
        } catch (_) {}
        try {
            ysdk.features?.BannerAPI?.hideBanner?.();
        } catch (_) {}
    }

    canShowRewarded() {
        return typeof this.ysdk?.adv?.showRewardedVideo === 'function';
    }

    showRewardedVideo() {
        const adv = this.ysdk?.adv;
        if (typeof adv?.showRewardedVideo !== 'function') {
            return Promise.resolve({ shown: false, rewarded: false });
        }
        return new Promise((resolve) => {
            let rewarded = false;
            let settled = false;
            const finish = (shown) => {
                if (settled) return;
                settled = true;
                resolve({ shown: Boolean(shown), rewarded });
            };
            try {
                adv.showRewardedVideo({
                    callbacks: {
                        onRewarded: () => { rewarded = true; },
                        onClose: (shown) => finish(shown),
                        onError: () => finish(false),
                    },
                });
            } catch (_) {
                finish(false);
            }
        });
    }

    showFullscreenAdv() {
        const adv = this.ysdk?.adv;
        if (typeof adv?.showFullscreenAdv !== 'function') return Promise.resolve(false);
        return new Promise((resolve) => {
            let settled = false;
            const finish = (shown) => {
                if (settled) return;
                settled = true;
                resolve(Boolean(shown));
            };
            try {
                adv.showFullscreenAdv({
                    callbacks: {
                        onClose: (shown) => finish(shown),
                        onError: () => finish(false),
                    },
                });
            } catch (_) {
                finish(false);
            }
        });
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
