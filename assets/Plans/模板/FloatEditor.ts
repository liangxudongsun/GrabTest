import { ReactiveStore } from '../ReactiveStore';

export interface FloatData {
    name: string;
    data: { x: { val: number; max: number } };
}

/** 单浮点编辑器模板 - 滑块 + 数值输入 */
export class FloatEditor {
    el: HTMLDivElement;
    private _editing = false;
    private _editBuf = '';
    private _dragging = false;

    constructor(private _store: ReactiveStore<FloatData>, label?: string) {
        const el = document.createElement('div');
        el.style.cssText = 'background:#2c2c2c;border:1px solid #555;border-radius:6px;padding:10px 14px;min-width:180px;';
        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;margin:3px 0;height:20px;cursor:pointer;">
                ${label || 'Float'} <div class="float-track" style="flex:1;height:4px;background:#555;border-radius:2px;position:relative;">
                    <div class="float-thumb" style="position:absolute;top:-4px;width:12px;height:12px;background:#8cf;border-radius:50%;pointer-events:none;"></div>
                </div>
                <span class="float-val" style="width:36px;text-align:center;color:#fff;border:1px solid #555;border-radius:2px;cursor:pointer;">0.0</span>
            </div>
        `;
        this.el = el;

        this._unsub = this._store.subscribe(d => this._sync(d));
    }

    private _unsub: () => void;

    destroy() { this._unsub(); }

    private _sync(d: FloatData) {
        if (!d?.data?.x) return;
        const t = d.data.x;
        const thumb = this.el.querySelector('.float-thumb') as HTMLElement;
        const pct = t.max > 0 ? (t.val / t.max) * 100 : 0;
        if (thumb) thumb.style.left = `calc(${pct}% - 6px)`;
        const valEl = this.el.querySelector('.float-val') as HTMLElement;
        if (valEl) {
            if (this._editing) { valEl.textContent = this._editBuf || '|'; valEl.style.borderColor = '#8cf'; }
            else { valEl.textContent = t.val.toFixed(1); valEl.style.borderColor = '#555'; }
        }
    }

    onPointerDown(vpX: number, vpY: number): boolean {
        const valEl = this.el.querySelector('.float-val') as HTMLElement;
        if (valEl) {
            const vr = valEl.getBoundingClientRect();
            if (vpX >= vr.left && vpX <= vr.right && vpY >= vr.top && vpY <= vr.bottom) {
                this._editing = true; this._editBuf = ''; this._sync(this._store.get()); return true;
            }
        }
        const tr = this.el.querySelector('.float-track') as HTMLElement;
        if (tr) {
            const sr = tr.parentElement!.getBoundingClientRect();
            if (vpY >= sr.top && vpY <= sr.bottom && vpX >= sr.left && vpX <= sr.right) {
                this._dragging = true;
                this._updateValue(vpX, tr); return true;
            }
        }
        return false;
    }

    onPointerMove(vpX: number): boolean {
        if (!this._dragging) return false;
        const track = this.el.querySelector('.float-track') as HTMLElement;
        if (!track) return false;
        this._updateValue(vpX, track);
        return true;
    }

    onPointerUp() { this._dragging = false; }

    cancelEdit() { if (this._editing) { this._editing = false; this._editBuf = ''; this._sync(this._store.get()); } }

    onKeyDown(event: any): boolean {
        if (!this._editing) return false;
        const key = event.key ?? '';
        if (key === 'Enter') { this._confirmEdit(); return true; }
        if (key === 'Escape') { this._cancelEdit(); return true; }
        if (key === 'Backspace') { this._editBuf = this._editBuf.slice(0, -1); }
        else if (/^[\d.]$/.test(key) && this._editBuf.length < 6) { this._editBuf += key; }
        else return true;
        const val = parseFloat(this._editBuf);
        if (!isNaN(val)) { const d = this._store.get(); if (d.data?.x) { d.data.x.val = Math.max(0, Math.min(d.data.x.max, val)); this._store.set({ ...d }); } }
        this._sync(this._store.get());
        return true;
    }

    private _confirmEdit() {
        if (!this._editing) return;
        const val = parseFloat(this._editBuf);
        if (!isNaN(val)) { const d = this._store.get(); if (d.data?.x) { d.data.x.val = Math.max(0, Math.min(d.data.x.max, val)); this._store.set({ ...d }); } }
        this._editing = false; this._editBuf = ''; this._sync(this._store.get());
    }

    private _cancelEdit() { this._editing = false; this._editBuf = ''; this._sync(this._store.get()); }

    private _updateValue(vpX: number, track: HTMLElement) {
        const tr = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (vpX - tr.left) / tr.width));
        const d = this._store.get();
        if (d.data?.x) {
            d.data.x.val = Math.round(pct * d.data.x.max * 10) / 10;
            this._store.set({ ...d });
        }
    }
}
