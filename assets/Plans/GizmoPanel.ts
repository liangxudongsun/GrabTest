import { CCEManager } from './CCEManager';
import { Panel, PanelManager } from './PanelManager';
import { ReactiveStore } from './ReactiveStore';
import { Vec3Editor } from './模板/Vec3Editor';
import { FloatEditor } from './模板/FloatEditor';
import { LabelEditor } from './模板/LabelEditor';
import { Dropdown } from './模板/Dropdown';

export interface PanelOptions {
    onClose?: () => void;
}

/** 浮动控制面板 - 根据模式切换 Vec3 / Float 编辑器 */
export class GizmoPanel implements Panel {
    el: HTMLDivElement;
    private _mode = 'box';
    private _vec3Editor: Vec3Editor;
    private _floatEditor: FloatEditor;
    private _currentEditor: { onPointerDown: any; onPointerMove: any; onPointerUp: any; onKeyDown: any; cancelEdit: any; destroy: any };
    private _rotEditor: Vec3Editor;
    private _section: HTMLElement;
    private _panelId: string;

    constructor(panelId: string, private _store: ReactiveStore<any>, private _opts?: PanelOptions) {
        this._panelId = panelId;
        const canvas = document.querySelector('canvas');
        const container = canvas?.parentElement;
        if (!container) throw new Error('canvas container not found');

        // 创建编辑器
        this._vec3Editor = new Vec3Editor(this._store);
        this._floatEditor = new FloatEditor(this._store, 'R');
        const offsetEditor = new Vec3Editor(this._store, undefined, 'offset');
        this._rotEditor = new Vec3Editor(this._store, undefined, 'rot');
        this._currentEditor = this._vec3Editor;

        const el = document.createElement('div');
        el.id = panelId;
        el.style.cssText = 'position:absolute;bottom:10px;right:10px;z-index:9999;pointer-events:none;display:flex;flex-direction:column;gap:4px;background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:6px;';

        // 模式下拉（标题）
        const modeDropdown = new Dropdown([
            { label: '📦 Box', value: 'box' },
            { label: '⚪ Sphere', value: 'sphere' },
        ], 'box', (val) => {
            this._store.set({ mode: val });
            this._switchMode(val);
        });

        const header = document.createElement('div');
        header.style.cssText = 'font:12px sans-serif;color:#fff;user-select:none;background:#2c2c2c;border:1px solid #555;border-radius:6px;padding:2px 10px;display:flex;justify-content:space-between;align-items:center;';
        header.appendChild(modeDropdown.el);
        const spacer = document.createElement('span'); spacer.style.flex = '1'; header.appendChild(spacer);
        const closeBtn = document.createElement('span');
        closeBtn.className = 'gizmo-close';
        closeBtn.style.cssText = 'cursor:pointer;color:#888;font-size:14px;line-height:1;';
        closeBtn.textContent = '✕';
        header.appendChild(closeBtn);
        const ddText = modeDropdown.el.querySelector('.dd-text') as HTMLElement;
        if (ddText) ddText.style.cssText = 'font-weight:bold;color:#8cf;font-size:12px;';

        // 编辑器容器
        const editorBox = document.createElement('div');
        editorBox.appendChild(this._vec3Editor.el);
        editorBox.appendChild(this._floatEditor.el);
        this._floatEditor.el.style.display = 'none';
        const offsetLabel = document.createElement('div');
        offsetLabel.style.cssText = 'font:12px sans-serif;color:#aaa;padding:4px 0 0 0;';
        offsetLabel.textContent = 'offset';
        editorBox.appendChild(offsetLabel);
        editorBox.appendChild(offsetEditor.el);
        const rotLabel = document.createElement('div');
        rotLabel.style.cssText = 'font:12px sans-serif;color:#aaa;padding:4px 0 0 0;';
        rotLabel.textContent = 'rotation';
        editorBox.appendChild(rotLabel);
        editorBox.appendChild(this._rotEditor.el);
        // 分组显示
        const groupEditor = new LabelEditor(this._store, 'groupTag');
        editorBox.appendChild(groupEditor.el);

        container.style.position = 'relative';
        container.appendChild(el);
        this.el = el;
        el.appendChild(header);
        el.appendChild(editorBox);

        // 初始模式
        this._switchMode('box');

        // CCE 事件
        CCEManager.add(panelId + '-p', (type: string, event?: any) => {
            if (type === 'keydown') { this._currentEditor.onKeyDown(event); offsetEditor.onKeyDown(event); this._rotEditor.onKeyDown(event); groupEditor.onKeyDown(event); return false; }
            if (type === 'mousedown') {
                if (!event || (event.button ?? -1) !== 0) return false;
                const vp = CCEManager.cceToViewport(event.x ?? 0, event.y ?? 0);
                if (!vp) return false;
                const btn = el.querySelector('.gizmo-close') as HTMLElement;
                if (btn) {
                    const r = btn.getBoundingClientRect();
                    if (vp.x >= r.left && vp.x <= r.right && vp.y >= r.top && vp.y <= r.bottom) {
                        event.stopImmediatePropagation?.();
                        this._opts?.onClose?.();
                        return true;
                    }
                }
                this._currentEditor.cancelEdit();
                offsetEditor.cancelEdit();
                this._rotEditor.cancelEdit();
                groupEditor.cancelEdit();
                if (modeDropdown.onPointerDown(vp.x, vp.y)) { event.stopImmediatePropagation?.(); return true; }
                if (this._currentEditor.onPointerDown(vp.x, vp.y)) { event.stopImmediatePropagation?.(); return true; }
                if (offsetEditor.onPointerDown(vp.x, vp.y)) { event.stopImmediatePropagation?.(); return true; }
                if (this._rotEditor.el.style.display !== 'none' && this._rotEditor.onPointerDown(vp.x, vp.y)) { event.stopImmediatePropagation?.(); return true; }
                if (groupEditor.onPointerDown(vp.x, vp.y)) { event.stopImmediatePropagation?.(); return true; }
                modeDropdown.close();
                return false;
            }
            if (type === 'mousemove') {
                const vp = CCEManager.cceToViewport(event?.x ?? 0, event?.y ?? 0);
                if (!vp) return false;
                this._currentEditor.onPointerMove(vp.x);
                offsetEditor.onPointerMove(vp.x);
                if (this._rotEditor.el.style.display !== 'none') this._rotEditor.onPointerMove(vp.x);
                groupEditor.onPointerMove(vp.x);
            }
            if (type === 'mouseup') { this._currentEditor.onPointerUp(); offsetEditor.onPointerUp(); this._rotEditor.onPointerUp(); groupEditor.onPointerUp(); }
            return false;
        }, 'panel');
    }

    private _switchMode(mode: string) {
        this._mode = mode;
        if (mode === 'box') {
            this._vec3Editor.el.style.display = '';
            this._floatEditor.el.style.display = 'none';
            this._rotEditor.el.style.display = '';
            this._currentEditor = this._vec3Editor;
        } else {
            this._vec3Editor.el.style.display = 'none';
            this._floatEditor.el.style.display = '';
            this._rotEditor.el.style.display = 'none';
            this._currentEditor = this._floatEditor;
        }
        PanelManager.refreshLayout();
    }

    destroy() {
        CCEManager.remove(this._panelId + '-p');
        this._vec3Editor.destroy();
        this._floatEditor.destroy();
        this.el.remove();
    }

    sync(_data: any) {}
}
