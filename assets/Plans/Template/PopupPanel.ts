import { PanelManager } from '../Core/PanelManager';
import { PanelBase } from '../Core/PanelBase'
import { ButtonEditor } from './ButtonEditor';

export interface PopupPanelOptions {
    p: { x: number; y: number };
    onClose?: () => void;
    buttonLabel?: string;
    onButtonPress?: () => void;
    onButtonRelease?: () => void;
}

/** 弹出框布局模板 - 持有一个 ButtonRect，路由事件 */
export class PopupPanel extends PanelBase {
    el: HTMLDivElement;
    noLayout = true;

    constructor(
        panelId: string,
        private _opts: PopupPanelOptions,
    ) {
        super(panelId, '-evt');
        const container = document.querySelector('canvas')?.parentElement;
        if (!container) throw new Error('canvas container not found');

        const el = document.createElement('div');
        el.id = panelId;
        el.style.cssText = `
            position:fixed;z-index:9999;pointer-events:none;
            display:flex;flex-direction:column;gap:4px;
            background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:6px;
        `;
        this.el = el;

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

        // 按钮
        const btn = new ButtonEditor(
            this._opts?.buttonLabel ?? '＋ 创建',
            this._opts.onButtonPress,
            this._opts.onButtonRelease,
        );
        el.appendChild(btn.el);
        this._rects.push(btn);

        container.appendChild(el);
        el.style.left = this._opts.p.x + 'px';
        el.style.top = this._opts.p.y + 'px';
    }

    setPosition(x: number, y: number) {
        this.el.style.left = x + 'px';
        this.el.style.top = y + 'px';
    }
}
