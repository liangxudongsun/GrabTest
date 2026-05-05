/** 响应式数据存储 */
export class ReactiveStore<T extends object> {
    private _data: T;
    private _subs = new Set<(data: T) => void>();

    constructor(initial: T) {
        this._data = { ...initial };
    }

    /** 获取当前数据 */
    get(): T {
        return this._data;
    }

    /** 更新数据并通知所有订阅者 */
    set(data: Partial<T>): void {
        Object.assign(this._data, data);
        this._subs.forEach(fn => fn(this._data));
    }

    /** 订阅数据变化，立即回调一次，返回取消订阅函数 */
    subscribe(fn: (data: T) => void): () => void {
        this._subs.add(fn);
        fn(this._data);
        return () => this._subs.delete(fn);
    }

    /** 清空所有订阅 */
    unsubscribeAll(): void {
        this._subs.clear();
    }
}
