import { CCEManager } from '../CCEManager';
import { Panel, PanelManager } from '../PanelManager';
import { ButtonEditor } from './ButtonEditor';

export interface PopupPanelOptions {
    /** 屏幕位置 */
    p: { x: number; y: number };
    /** 关闭回调 */
    onClose?: () => void;
    /** 按钮文本（默认"创建"） */
    buttonLabel?: string;
    /** 按钮回调（按下的位置） */
    onButtonPress?: (pos: { x: number; y: number }) => void;
    onButtonRelease?: (pos: { x: number; y: number }) => void;
}

/** 弹出框布局模板 - 从屏幕点创建，带虚拟按键 */
export class PopupPanel implements Panel {
    el: HTMLDivElement;
    noLayout = true; // 跳过 PanelManager 的右下布局
    private _btn: ButtonEditor;
    private _pressed = false;

    constructor(
        panelId: string,
        private _opts: PopupPanelOptions,
    ) {
        const container = document.querySelector('canvas')?.parentElement;
        if (!container) throw new Error('canvas container not found');

        const el = document.createElement('div');
        el.id = panelId;
        el.style.cssText = `
            position:fixed;z-index:9999;pointer-events:none;
            display:flex;flex-direction:column;gap:4px;
            background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:6px;
        `;

        // 标题
        const header = document.createElement('div');
        header.style.cssText = 'font:12px sans-serif;color:#8cf;user-select:none;background:#2c2c2c;border-radius:6px;padding:4px 10px;display:flex;justify-content:space-between;align-items:center;pointer-events:auto;';
        header.textContent = 'Popup';
        const closeBtn = document.createElement('span');
        closeBtn.style.cssText = 'cursor:pointer;color:#888;font-size:14px;pointer-events:auto;';
        closeBtn.textContent = '✕';
        closeBtn.onclick = () => { PanelManager.destroy(panelId); this._opts?.onClose?.(); };
        header.appendChild(closeBtn);
        el.appendChild(header);

        // 虚拟按键（按钮文字可通过 opts.buttonLabel 覆盖）
        this._btn = new ButtonEditor(this._opts?.buttonLabel ?? '＋ 创建');
        el.appendChild(this._btn.el);

        container.appendChild(el);
        this.el = el;

        // 定位到鼠标点击位置（fixed 相对于视口）
        el.style.left = this._opts.p.x + 'px';
        el.style.top = this._opts.p.y + 'px';

        // CCEManager 事件驱动
        CCEManager.add(panelId + '-evt', (type: string, event: any) => {
            if (!event || !this._btn?.el) return false;
            const bx = event.clientX ?? event.x ?? 0;
            const by = event.clientY ?? event.y ?? 0;
            const r = this._btn.el.getBoundingClientRect();
            const over = bx >= r.left && bx <= r.right && by >= r.top && by <= r.bottom;

            if (type === 'mousedown') {
                if (!over) return false;
                this._pressed = true;
                this._btn.setPressed(true);
                this._opts.onButtonPress?.({ x: bx, y: by });
                event.stopImmediatePropagation?.();
                return true;
            }
            if (type === 'mouseup') {
                if (!this._pressed) return false;
                this._pressed = false;
                this._btn.setPressed(false);
                if (over) this._opts.onButtonRelease?.({ x: bx, y: by });
                return true;
            }
            return false;
        }, 'panel');
    }

    /** 更新面板位置（复用时不重新创建） */
    setPosition(x: number, y: number) {
        this.el.style.left = x + 'px';
        this.el.style.top = y + 'px';
    }

    destroy() {
        CCEManager.remove(this.el.id + '-evt');
        this._btn.destroy();
        this.el?.remove();
    }

    sync(_data: any) {}
}
