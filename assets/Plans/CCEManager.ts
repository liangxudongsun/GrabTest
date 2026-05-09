/**
 * CCE 事件管理器 - 统一管理 cce.Operation 事件 + CCE 坐标工具
 * 回调签名: (type: 'mousedown'|'mousemove'|'mouseup', event: any) => boolean
 * 返回 true 表示已消费事件，后续回调不再执行
 */
import { director, DirectorEvent } from 'cc';

export class CCEManager {
    private static _panelCbs = new Map<string, (type: string, event: any) => boolean>();
    private static _sceneCbs = new Map<string, (type: string, event: any) => boolean>();
    private static _inited = false;
    private static _orig: Array<{ key: string; arr: Function[] | null }> = [];

    /** 初始化（在原始回调前插入分发器） */
    static init(): void {
        if (this._inited) return;
        const op = (window as any).cce?.Operation;
        if (!op?._events) return;

        const keys = ['mousedown', 'mousemove', 'mouseup', 'keydown', 'keyup', 'mousewheel'] as const;
        for (const key of keys) {
            const arr = op._events.get(key);
            if (arr) {
                this._orig.push({ key, arr });
                arr.unshift((event?: any) => {
                    if (this._dispatch(key, event)) {
                        // 已消费 → 阻止同一数组后续回调执行
                        const rest = arr.splice(1);
                        setTimeout(() => { arr.push(...rest); }, 0);
                    }
                });
            }
        }
        this._inited = true;
    }

    /** 还原原始回调 */
    static destroy(): void {
        if (!this._inited) return;
        const op = (window as any).cce?.Operation;
        if (op?._events) {
            for (const { key, arr: orig } of this._orig) {
                const cur = op._events.get(key);
                if (cur) { cur.length = 0; cur.push(...orig!); }
            }
        }
        this._panelCbs.clear();
        this._sceneCbs.clear();
        this._orig.length = 0;
        this._inited = false;
    }

    /** 注册回调，type='panel' 优先执行 */
    static add(id: string, cb: (type: string, event: any) => boolean, type: 'panel' | 'scene'): void {
        const map = type === 'panel' ? this._panelCbs : this._sceneCbs;
        map.set(id, cb);
    }

    /** 移除回调 */
    static remove(id: string): void {
        this._panelCbs.delete(id);
        this._sceneCbs.delete(id);
    }

    /** 是否已初始化 */
    static get ready(): boolean { return this._inited; }

    // ── 坐标工具 ──

    /** 获取 CCE 摄像机（编辑器场景摄像机） */
    static get cceCam(): any {
        const cce = (window as any).cce;
        return cce?.Camera?.camera?.camera ?? null;
    }

    /** CCE 坐标 → viewport 像素坐标 */
    static cceToViewport(cceX: number, cceY: number): { x: number; y: number } | null {
        const cam = this.cceCam;
        const canvas = document.querySelector('canvas');
        if (!cam || !canvas) return null;
        const cr = canvas.getBoundingClientRect();
        return {
            x: cr.left + (cceX / cam.width) * cr.width,
            y: cr.top + (cceY / cam.height) * cr.height,
        };
    }


    static async writeJson<T extends object>(JSON_URL: string, data: T) {
        const Editor = (window as any).Editor;
        if (!Editor?.Message?.request) return;

        const jsonStr = JSON.stringify(data, null, 2);
        try {
            await Editor.Message.request('asset-db', 'create-asset', JSON_URL, jsonStr);
        } catch {
            await Editor.Message.request('asset-db', 'save-asset', JSON_URL, jsonStr);
        }
        console.log('[writeJson] 写入成功', JSON_URL);
    }


    /** 统一分发：panel → scene，遇 true 停止 */
    private static _dispatch(type: string, event: any): boolean {
        for (const cb of this._panelCbs.values()) {
            if (cb(type, event)) return true;
        }
        for (const cb of this._sceneCbs.values()) {
            if (cb(type, event)) return true;
        }
        return false;
    }
}

// 立即尝试一次（模块加载时可能已就绪），否则等导演事件
CCEManager.init();
director.once(DirectorEvent.AFTER_SCENE_LAUNCH, () => CCEManager.init());
