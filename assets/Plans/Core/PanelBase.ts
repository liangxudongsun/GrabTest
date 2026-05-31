import { CCEManager } from './CCEManager';
import { Panel, PanelManager } from './PanelManager';
import { Rect } from '../Core/Rect';

/** 面板基类 - 统一 CCE 事件注册 + 坐标转换 + rect 路由 */
export abstract class PanelBase implements Panel {
    abstract el: HTMLDivElement;
    protected _rects: Rect[] = [];
    protected _panelId: string;
    noLayout?: boolean;
    private _suffix: string;

    constructor(panelId: string, suffix = '-p') {
        this._panelId = panelId;
        this._suffix = suffix;
        CCEManager.add(panelId + suffix, (type: string, event?: any) => {
            if (!event) return false;
            if (type === 'keydown') return this._routeEvent(type, 0, 0, event);
            if ((event.button ?? -1) !== 0) return false;
            const vp = CCEManager.cceToViewport(event.x ?? 0, event.y ?? 0);
            if (!vp) return false;
            return this._routeEvent(type, vp.x, vp.y, event);
        }, 'panel');
    }

    protected _rebuildRects() {}

    protected _routeEvent(type: string, x: number, y: number, event?: any): boolean {
        if (type === 'keydown') {
            for (const r of this._rects) {
                if (r.onKeyDown?.(event)) return true;
            }
            return false;
        }
        if (type === 'mousedown') {
            for (const r of this._rects) r.cancelEdit?.();
            for (const r of this._rects) {
                if (r.onPointerDown?.(x, y)) {
                    event?.stopImmediatePropagation?.();
                    return true;
                }
            }
            return false;
        }
        if (type === 'mousemove') {
            for (const r of this._rects) r.onPointerMove?.(x, y);
            return false;
        }
        if (type === 'mouseup') {
            for (const r of this._rects) r.onPointerUp?.();
            return false;
        }
        return false;
    }

    destroy() {
        CCEManager.remove(this._panelId + this._suffix);
        for (const r of this._rects) r.destroy();
        this.el?.remove();
    }

    sync(_data: any) {}
}
