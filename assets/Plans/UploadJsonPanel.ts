import { PanelBase } from './Core/PanelBase'
import { Rect } from './Core/Rect';
import { ButtonEditor } from './Template/ButtonEditor';

class CloseRect extends Rect {
    el: HTMLElement;
    constructor(onClose?: () => void) {
        super();
        const el = document.createElement('span');
        el.textContent = '✕';
        el.style.cssText = 'cursor:pointer;color:#888;font-size:14px;padding:0 2px;pointer-events:auto;';
        this.el = el;
        this._onClose = onClose;
    }
    private _onClose?: () => void;
    onPointerDown(x: number, y: number): boolean {
        if (!this.hitTest(x, y)) return false;
        this._onClose?.();
        return true;
    }
}

export class UploadJsonPanel extends PanelBase {
    el: HTMLDivElement;

    constructor(panelId: string, onClick?: () => void, onClose?: () => void) {
        super(panelId, '-evt');
        const canvas = document.querySelector('canvas');
        const container = canvas?.parentElement;
        if (!container) throw new Error('canvas container not found');

        const el = document.createElement('div');
        el.id = panelId;
        el.style.cssText = 'position:absolute;display:flex;gap:4px;align-items:center;background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:6px;pointer-events:none;';

        this._rects.push(new CloseRect(onClose));
        el.appendChild(this._rects[0].el);

        this._rects.push(new ButtonEditor('上传 JSON', onClick));
        el.appendChild(this._rects[1].el);

        container.appendChild(el);
        this.el = el;
    }
}
