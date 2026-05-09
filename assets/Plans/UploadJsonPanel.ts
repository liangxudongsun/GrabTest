import { Panel, PanelManager } from './PanelManager';
import { CCEManager } from './CCEManager';
import { ButtonEditor } from './模板/ButtonEditor';

export class UploadJsonPanel implements Panel {
    el: HTMLDivElement;
    private _btn: ButtonEditor;
    private _closeBtn: HTMLElement;

    constructor(panelId: string, onClick?: () => void, onClose?: () => void) {
        const canvas = document.querySelector('canvas');
        const container = canvas?.parentElement;
        if (!container) throw new Error('canvas container not found');

        const el = document.createElement('div');
        el.id = panelId;
        el.style.cssText = 'position:absolute;display:flex;gap:4px;align-items:center;background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:6px;pointer-events:none;';

        this._closeBtn = document.createElement('span');
        this._closeBtn.textContent = '✕';
        this._closeBtn.style.cssText = 'cursor:pointer;color:#888;font-size:14px;padding:0 2px;pointer-events:auto;';
        el.appendChild(this._closeBtn);

        this._btn = new ButtonEditor('上传 JSON');
        el.appendChild(this._btn.el);

        container.appendChild(el);
        this.el = el;

        const cb = onClick ?? (() => console.log('[UploadJsonPanel] 上传 JSON'));
        const closeCb = onClose ?? (() => PanelManager.destroy(panelId));
        CCEManager.add(panelId + '-evt', (type: string, event: any) => {
            if (!event) return false;
            const bx = event.clientX ?? event.x ?? 0;
            const by = event.clientY ?? event.y ?? 0;

            const btnR = this._btn?.el?.getBoundingClientRect();
            const closeR = this._closeBtn?.getBoundingClientRect();
            const overBtn = btnR && bx >= btnR.left && bx <= btnR.right && by >= btnR.top && by <= btnR.bottom;
            const overClose = closeR && bx >= closeR.left && bx <= closeR.right && by >= closeR.top && by <= closeR.bottom;

            if (type === 'mousedown') {
                if (overBtn) {
                    event.stopImmediatePropagation?.();
                    this._btn.setPressed(true);
                    cb();
                    return true;
                }
                if (overClose) {
                    event.stopImmediatePropagation?.();
                    PanelManager.destroy(panelId);
                    closeCb();
                    return true;
                }
            }
            if (type === 'mouseup' && overBtn) {
                this._btn.setPressed(false);
                return true;
            }
            return false;
        }, 'panel');
    }

    destroy() {
        CCEManager.remove(this.el.id + '-evt');
        this._btn.destroy();
        this.el?.remove();
    }

    sync(_data: any) {}
}
