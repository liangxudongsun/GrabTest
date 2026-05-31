import { Rect } from '../Core/Rect';

/** 虚拟按键 - 封装 visual + press 状态 */
export class ButtonEditor extends Rect {
    el: HTMLElement;

    constructor(
        label: string,
        private _onPress?: () => void,
        private _onRelease?: () => void,
    ) {
        super();
        const el = document.createElement('div');
        el.textContent = label;
        el.style.cssText = `
            font:12px sans-serif;color:#fff;cursor:pointer;user-select:none;
            background:#3a3a3a;border:1px solid #666;border-radius:6px;
            padding:4px 12px;text-align:center;
        `;
        this.el = el;
    }

    onPointerDown(x: number, y: number): boolean {
        if (!this.hitTest(x, y)) return false;
        this.el.style.background = '#555';
        this._onPress?.();
        return true;
    }

    onPointerUp(): boolean {
        this.el.style.background = '#3a3a3a';
        this._onRelease?.();
        return true;
    }

    destroy() { this.el?.remove(); }
}
