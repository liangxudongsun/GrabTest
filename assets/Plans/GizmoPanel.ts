import { PanelManager } from './Core/PanelManager';
import { ReactiveStore } from './Data/ReactiveStore';
import { PanelBase } from './Core/PanelBase'
import { Vec3Editor } from './Template/Vec3Editor';
import { FloatEditor } from './Template/FloatEditor';
import { LabelEditor } from './Template/LabelEditor';
import { Dropdown } from './Template/Dropdown';
import { ColliderData } from './Data/type';



export interface PanelOptions {
    onClose?: () => void;
}

/** 浮动控制面板 - 泛型 T 由组件传入的 store 自动推导 */
export class GizmoPanel extends PanelBase {
    el: HTMLDivElement;
    private _mode = 'box';
    private _vec3Editor: Vec3Editor;
    private _floatEditor: FloatEditor;
    private _currentEditor: Vec3Editor | FloatEditor;
    private _offsetEditor: Vec3Editor;
    private _rotEditor: Vec3Editor;
    private _groupEditor: LabelEditor;
    private _modeDropdown: Dropdown;

    constructor(panelId: string, private _store: ReactiveStore<ColliderData>, private _opts?: PanelOptions) {
        super(panelId);
        const canvas = document.querySelector('canvas');
        const container = canvas?.parentElement;
        if (!container) throw new Error('canvas container not found');
        const d = this._store.get();
        const onChange = () => this._store.set(d);
        this._vec3Editor = new Vec3Editor(d.size, onChange);
        this._floatEditor = new FloatEditor(d.radius.x, onChange);
        this._offsetEditor = new Vec3Editor(d.offset, onChange);
        this._rotEditor = new Vec3Editor(d.rot, onChange);
        this._groupEditor = new LabelEditor(d.groupTag, onChange);
        this._currentEditor = this._vec3Editor;

        const el = document.createElement('div');
        el.id = panelId;
        el.style.cssText = 'position:absolute;bottom:10px;right:10px;z-index:9999;pointer-events:none;display:flex;flex-direction:column;gap:4px;background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:6px;';

        this._modeDropdown = new Dropdown([
            { label: '📦 Box', value: 'box' },
            { label: '⚪ Sphere', value: 'sphere' },
        ], 'box', (val) => {
            this._store.set({ mode: val } as any);
            this._switchMode(val);
        });

        const header = document.createElement('div');
        header.style.cssText = 'font:12px sans-serif;color:#fff;user-select:none;background:#2c2c2c;border:1px solid #555;border-radius:6px;padding:2px 10px;display:flex;justify-content:space-between;align-items:center;';
        header.appendChild(this._modeDropdown.el);
        const spacer = document.createElement('span'); spacer.style.flex = '1'; header.appendChild(spacer);
        const closeBtn = document.createElement('span');
        closeBtn.style.cssText = 'cursor:pointer;color:#888;font-size:14px;line-height:1;';
        closeBtn.textContent = '✕';
        closeBtn.onclick = () => this._opts?.onClose?.();
        header.appendChild(closeBtn);
        const ddText = this._modeDropdown.el.querySelector('.dd-text') as HTMLElement;
        if (ddText) ddText.style.cssText = 'font-weight:bold;color:#8cf;font-size:12px;';

        const editorBox = document.createElement('div');
        editorBox.appendChild(this._vec3Editor.el);
        editorBox.appendChild(this._floatEditor.el);
        this._floatEditor.el.style.display = 'none';
        const offsetLabel = document.createElement('div');
        offsetLabel.style.cssText = 'font:12px sans-serif;color:#aaa;padding:4px 0 0 0;';
        offsetLabel.textContent = 'offset';
        editorBox.appendChild(offsetLabel);
        editorBox.appendChild(this._offsetEditor.el);
        const rotLabel = document.createElement('div');
        rotLabel.style.cssText = 'font:12px sans-serif;color:#aaa;padding:4px 0 0 0;';
        rotLabel.textContent = 'rotation';
        editorBox.appendChild(rotLabel);
        editorBox.appendChild(this._rotEditor.el);
        editorBox.appendChild(this._groupEditor.el);

        container.style.position = 'relative';
        container.appendChild(el);
        this.el = el;
        el.appendChild(header);
        el.appendChild(editorBox);

        this._rebuildRects();
    }

    protected _rebuildRects() {
        this._rects = [this._modeDropdown, this._currentEditor, this._offsetEditor, this._groupEditor];
        if (this._mode === 'box') this._rects.push(this._rotEditor);
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
        this._rebuildRects();
        PanelManager.refreshLayout();
    }

    destroy() {
        super.destroy();
        this._vec3Editor.destroy();
        this._floatEditor.destroy();
    }
}
