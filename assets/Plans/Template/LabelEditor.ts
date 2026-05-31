import { Rect } from '../Core/Rect';

export interface LabelData {
    name: string;
    data: string;
}

/** 标签编辑器模板 - name 只读 + data 可编辑（CCE 键盘输入） */
export class LabelEditor extends Rect {
    el: HTMLDivElement;
    private _editing = false;
    private _editBuf = '';

    constructor(private data: LabelData, private _onChange?: () => void) {
        super();
        const el = document.createElement('div');
        el.style.cssText = 'background:#2c2c2c;border:1px solid #555;border-radius:6px;padding:8px 12px;min-width:160px;font:12px sans-serif;color:#fff;display:flex;align-items:center;gap:8px;';
        el.innerHTML = '<span class="le-name" style="color:#8cf;flex-shrink:0;"></span>'
            + '<span class="le-val" style="color:#fff;border:1px solid #555;border-radius:3px;padding:2px 6px;cursor:pointer;flex:1;text-align:right;"></span>';
        this.el = el;
        this._refresh();
    }

    destroy() {}

    private _refresh() {
        const nameEl = this.el.querySelector('.le-name')!;
        const valEl = this.el.querySelector('.le-val')! as HTMLElement;
        nameEl.textContent = this.data.name;
        if (this._editing) {
            valEl.textContent = this._editBuf || '|';
            valEl.style.borderColor = '#8cf';
        } else {
            valEl.textContent = this.data.data != null ? String(this.data.data) : '';
            valEl.style.borderColor = '#555';
        }
    }

    onPointerDown(vpX: number, vpY: number): boolean {
        const valEl = this.el.querySelector('.le-val') as HTMLElement;
        if (!valEl) return false;
        const r = valEl.getBoundingClientRect();
        if (vpX >= r.left && vpX <= r.right && vpY >= r.top && vpY <= r.bottom) {
            this._editing = true;
            this._editBuf = this.data.data != null ? String(this.data.data) : '';
            this._refresh();
            return true;
        }
        return false;
    }

    onPointerMove(_vpX: number): boolean { return false; }
    onPointerUp() {}

    cancelEdit() {
        if (this._editing) {
            this._editing = false;
            this._editBuf = '';
            this._refresh();
        }
    }

    onKeyDown(event: any): boolean {
        if (!this._editing) return false;
        const key = event.key ?? '';
        if (key === 'Enter') { this._editing = false; this._editBuf = ''; this._refresh(); return true; }
        if (key === 'Escape') { this._editing = false; this._editBuf = ''; this._refresh(); return true; }
        if (key === 'Backspace') { this._editBuf = this._editBuf.slice(0, -1); }
        else if (this._editBuf.length < 10) { this._editBuf += key; }
        else return true;
        this.data.data = this._editBuf;
        this._onChange?.();
        this._refresh();
        return true;
    }
}
