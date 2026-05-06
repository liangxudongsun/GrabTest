import { CCEManager } from './CCEManager';

/** 面板接口 - 所有面板必须实现 */
export interface Panel {
    destroy(): void;
    sync(data: any): void;
    el: HTMLElement;
}

/** 通用面板管理器 - 注册/获取/销毁 + 自动布局 */
export class PanelManager {
    private static _panels = new Map<string, Panel>();
    private static _order: string[] = [];
    private static _scrollOffset = 0;
    private static _gap = 0;
    private static _onWheel: ((type:string,e: any) => boolean) | null = null;

    static register(id: string, panel: Panel): void {
        this._panels.get(id)?.destroy();
        this._panels.set(id, panel);
        if (!this._order.includes(id)) this._order.push(id);
        this._scrollOffset = 0;
        this._layout();
        setTimeout(() => this._layout(), 50);

        if (!this._onWheel) {
            this._onWheel = (type: string, e: any) => {
                if (type !== 'mousewheel') return false;
                const overPanel = this._order.some(id => {
                    const p = this._panels.get(id);
                    if (!p?.el) return false;
                    const r = p.el.getBoundingClientRect();
                    const mx = e.clientX ?? e.x ?? 0;
                    const my = e.clientY ?? e.y ?? 0;
                    return mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
                });
                if (!overPanel) return false;

                const container = this._panels.get(this._order[0])?.el?.parentElement;
                if (!container) return false;

                                const step = Math.max(4, Math.min(40, Math.abs(e.deltaY ?? 0) / 3));
                const dir = (e.deltaY ?? 0) > 0 ? 1 : -1;
                this._scrollOffset = this._scrollOffset + dir * step;
                this._clampScroll();
                this._layout();
                return true; // 消费事件
            };
            CCEManager.remove('__panel_scroll__');
            CCEManager.add('__panel_scroll__', this._onWheel, 'panel');
        }
    }

    static get(id: string): Panel | undefined {
        return this._panels.get(id);
    }

    static destroy(id: string): void {
        this._panels.get(id)?.destroy();
        this._panels.delete(id);
        const idx = this._order.indexOf(id);
        if (idx >= 0) this._order.splice(idx, 1);
        // 限制 scrollOffset 保证底部面板可见
        this._clampScroll();
        this._layout();
        setTimeout(() => this._layout(), 16);
    }

    private static _clampScroll(): void {
        const first = this._order.length > 0 ? this._panels.get(this._order[0]) : null;
        if (!first?.el) { this._scrollOffset = 0; return; }
        const container = first.el.parentElement;
        if (!container) { this._scrollOffset = 0; return; }
        const totalH = this._order.reduce((s, id) => {
            const p = this._panels.get(id);
            return s + (p?.el?.offsetHeight || 240) + this._gap;
        }, 0) - this._gap;
        const maxH = container.offsetHeight;
        const maxUp = Math.max(totalH - maxH, 0);
        // 允许向下滚动，但不让底部面板完全消失（留至少一个面板高度）
        const maxDown = totalH > maxH ? maxUp + 200 : 0;
        this._scrollOffset = Math.max(-maxDown, Math.min(maxUp + 200, this._scrollOffset));
    }

    static destroyAll(): void {
        for (const p of this._panels.values()) p.destroy();
        this._panels.clear();
        this._order.length = 0;
        this._scrollOffset = 0;
    }

    static has(id: string): boolean {
        return this._panels.has(id);
    }

    static sync(id: string, data: any): void {
        this._panels.get(id)?.sync(data);
    }

    static refreshLayout(): void {
        setTimeout(() => this._layout(), 0);
    }

    private static _layout(): void {
        if (this._order.length === 0) return;
        const first = this._panels.get(this._order[0]);
        if (!first) return;
        const container = first.el.parentElement;
        if (!container) return;

        const colors = ['#8cf', '#f88', '#8f8', '#ff8', '#f8f', '#88f'];
        let bottom = 10 + this._scrollOffset;
        for (let i = this._order.length - 1; i >= 0; i--) {
            const p = this._panels.get(this._order[i]);
            if (!p) continue;
            p.el.style.bottom = bottom + 'px';
            p.el.style.right = '10px';
            p.el.style.top = 'auto';
            p.el.style.left = 'auto';
            p.el.style.borderLeft = `3px solid ${colors[i % colors.length]}`;
            const h = p.el.offsetHeight || 240;
            bottom += h + this._gap;
        }
    }
}
