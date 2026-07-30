/**
 * YieldScheduler — система разделения тяжёлых операций на чанки
 * для предотвращения фризов (>1ms) в игровом цикле
 *
 * Использует requestIdleCallback или setTimeout для yield-operations
 */

/** @type {Map<string, any>} */
const taskRegistry = new Map();

export class YieldScheduler {
	constructor() {
		this._yieldBudget = 4; // ms per frame for yield operations
		this._yieldAccumulator = 0;
		this._isRunning = false;
		this._yieldQueue = [];
		this._currentTask = null;
		this._frameTime = 0;
		this._maxYieldsPerFrame = 3;
		this._currentYieldsThisFrame = 0;
	}

	/**
	 * Установить бюджет yield-операций на кадр (мс)
	 */
	setYieldBudget(ms) {
		this._yieldBudget = ms;
	}

	/**
	 * Зарегистрировать задачу для yield-выполнения
	 * @param {string} id - ID задачи
	 * @param {Function} task - Функция { index, yieldCheck, continue }
	 * @param {object} options - Опции задачи
	 */
	registerTask(id, task, options = {}) {
		const config = {
			priority: options.priority || "MEDIUM", // HIGH, MEDIUM, LOW
			chunkSize: options.chunkSize || 5, // элементов на yield
			delay: options.delay || 0, // задержка в мс
			onProgress: options.onProgress || null,
			onComplete: options.onComplete || null,
			_task: task,
		};

		taskRegistry.set(id, config);
		this._addYieldable(id);
	}

	/**
	 * Запустить задачу с yield-контролем
	 * @param {string} id - ID задачи
	 * @param {Array} items - Элементы для обработки
	 * @param {object} context - Контекст для передачи
	 */
	startTask(id, items, context = {}) {
		const config = taskRegistry.get(id);
		if (!config) {
			console.warn(`[YieldScheduler] Task "${id}" not registered`);
			return;
		}

		this._currentTask = {
			id,
			items,
			context,
			index: 0,
			paused: false,
			completed: false,
			yieldCount: 0,
			startTime: performance.now(),
		};

		this._executeYieldable();
	}

	/**
	 * Yield-контрольная точка — вернуть true если нужно сделать yield
	 */
	yieldPoint() {
		this._currentYieldsThisFrame++;

		if (this._currentYieldsThisFrame >= this._maxYieldsPerFrame) {
			return true; // yield на следующий кадр
		}

		const elapsed = performance.now() - this._frameStartTime;
		return elapsed > this._yieldBudget;
	}

	/**
	 * Проверить нужно ли yield-остановиться
	 */
	shouldYield() {
		return this._currentYieldsThisFrame >= this._maxYieldsPerFrame;
	}

	/**
	 * Сбросить счётчик yield для нового кадра
	 */
	resetFrame() {
		this._frameStartTime = performance.now();
		this._currentYieldsThisFrame = 0;
		this._yieldAccumulator = 0;
		this._currentYieldsThisFrame = 0;
	}

	/**
	 * Добавить yieldable задачу в очередь
	 */
	_addYieldable(id) {
		this._yieldQueue.push(id);
	}

	/**
	 * Выполнить yieldable задачу
	 */
	async _executeYieldable() {
		if (!this._currentTask || this._currentTask.completed) {
			this._currentTask = null;
			return;
		}

		const config = taskRegistry.get(this._currentTask.id);
		if (!config) {
			this._currentTask.completed = true;
			return;
		}

		const task = config._task;
		const chunkSize = config.chunkSize;
		const startIndex = this._currentTask.index;
		const endIndex = Math.min(
			startIndex + chunkSize,
			this._currentTask.items.length,
		);

		for (let i = startIndex; i < endIndex; i++) {
			const item = this._currentTask.items[i];
			const result = task(item, i, this._currentTask);

			if (result === false) {
				// Task returned false → yield
				this._currentTask.paused = true;
				this._currentTask.index = i;
				this._currentTask.yieldCount++;
				this._currentYieldsThisFrame++;
				this._yieldAccumulator += performance.now() - this._frameStartTime;

				if (this._currentYieldsThisFrame >= this._maxYieldsPerFrame) {
					// Yield на следующий кадр
					setTimeout(() => this._resumeYieldable(), 0);
					return;
				}

				// Yield на след. кадр
				setTimeout(() => this._resumeYieldable(), 0);
				return;
			}
		}

		// Task completed
		this._currentTask.index = endIndex;
		this._currentTask.completed = true;

		if (config.onComplete) {
			config.onComplete(this._currentTask);
		}

		this._currentTask = null;
	}

	/**
	 * Возобновить yieldable задачу
	 */
	_resumeYieldable() {
		if (!this._currentTask || this._currentTask.completed) {
			this._currentTask = null;
			return;
		}

		this._executeYieldable();
	}

	/**
	 * Отменить задачу
	 */
	cancelTask(id) {
		const config = taskRegistry.get(id);
		if (config?.onComplete) {
			config.onComplete({ cancelled: true });
		}
	}
}

// Глобальный экземпляр
export const yieldScheduler = new YieldScheduler();
