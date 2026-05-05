import { ReactiveStore } from '../ReactiveStore';

export interface AxisData {
    val: number;
    max: number;
}

export interface Vec3Data {
    name: string;
    x: AxisData;
    y: AxisData;
    z: AxisData;
}

/** Vec3 编辑器模板 - 三个轴的滑块 + 数值输入 */
export class Vec3Editor {
    el: HTMLDivElement;
    private _sliderAxis: 'x' | 'y' | 'z' | null = null;
    private _editing: 'x' | 'y' | 'z' | null = null;
    private _editBuf = '';

    constructor(private _store: ReactiveStore<Vec3Data>, labels?: { x?: string; y?: string; z?: string }, private _prefix?: string) {
        const el = document.createElement('div');
        el.style.cssText = 'background:#2c2c2c;border:1px solid #555;border-radius:6px;padding:10px 14px;min-width:180px;';
        el.innerHTML = '<div class="vec3-name" style="font:12px sans-serif;color:#aaa;margin-bottom:4px;"></div>' + this._buildHTML(labels);
        this.el = el;

        this._unsub = this._store.subscribe(d => this._sync(d));
    }

    private _unsub: () => void;

    destroy() {
        this._unsub();
    }

    private _buildHTML(labels?: { x?: string; y?: string; z?: string }): string {
        const L = (a: string) => labels?.[a as 'x' | 'y' | 'z'] || a.toUpperCase();
        return `
            <div style="display:flex;align-items:center;gap:6px;margin:3px 0;height:20px;cursor:pointer;" data-axis="x">
                ${L('x')} <div class="gizmo-track" style="flex:1;height:4px;background:#555;border-radius:2px;position:relative;">
                    <div class="gizmo-thumb" style="position:absolute;top:-4px;width:12px;height:12px;background:#8cf;border-radius:50%;pointer-events:none;"></div>
                </div>
                <span class="gizmo-val" data-axis="x" style="width:36px;text-align:center;color:#fff;border:1px solid #555;border-radius:2px;cursor:pointer;">0.0</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin:3px 0;height:20px;cursor:pointer;" data-axis="y">
                ${L('y')} <div class="gizmo-track" style="flex:1;height:4px;background:#555;border-radius:2px;position:relative;">
                    <div class="gizmo-thumb" style="position:absolute;top:-4px;width:12px;height:12px;background:#8cf;border-radius:50%;pointer-events:none;"></div>
                </div>
                <span class="gizmo-val" data-axis="y" style="width:36px;text-align:center;color:#fff;border:1px solid #555;border-radius:2px;cursor:pointer;">0.0</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin:3px 0;height:20px;cursor:pointer;" data-axis="z">
                ${L('z')} <div class="gizmo-track" style="flex:1;height:4px;background:#555;border-radius:2px;position:relative;">
                    <div class="gizmo-thumb" style="position:absolute;top:-4px;width:12px;height:12px;background:#8cf;border-radius:50%;pointer-events:none;"></div>
                </div>
                <span class="gizmo-val" data-axis="z" style="width:36px;text-align:center;color:#fff;border:1px solid #555;border-radius:2px;cursor:pointer;">0.0</span>
            </div>
        `;
    }

    private _src(d: any) { return this._prefix ? d[this._prefix] : d; }

    private _sync(d: Vec3Data) {
        const src = this._src(d);
        if (!src) return;
        const nameEl = this.el.querySelector('.vec3-name') as HTMLElement;
        if (nameEl) nameEl.textContent = this._prefix || d.name;
        for (const axis of ['x', 'y', 'z'] as const) {
            const a = src[axis];
            const slider = this.el.querySelector(`[data-axis="${axis}"]`) as HTMLElement;
            const thumb = slider?.querySelector('.gizmo-thumb') as HTMLElement;
            const pct = a.max > 0 ? (a.val / a.max) * 100 : 0;
            if (thumb) thumb.style.left = `calc(${pct}% - 6px)`;

            const valEl = this.el.querySelector(`.gizmo-val[data-axis="${axis}"]`) as HTMLElement;
            if (valEl) {
                if (this._editing === axis) {
                    valEl.textContent = this._editBuf || '|';
                    valEl.style.borderColor = '#8cf';
                } else {
                    valEl.textContent = a.val.toFixed(1);
                    valEl.style.borderColor = '#555';
                }
            }
        }
    }

    // ── 鼠标交互 ──

    onPointerDown(vpX: number, vpY: number): boolean {
        const vals = this.el.querySelectorAll('.gizmo-val');
        for (const v of vals) {
            const vr = v.getBoundingClientRect();
            if (vpX >= vr.left && vpX <= vr.right && vpY >= vr.top && vpY <= vr.bottom) {
                this._startEdit(v.getAttribute('data-axis') as 'x' | 'y' | 'z');
                return true;
            }
        }
        const sliders = this.el.querySelectorAll('[data-axis]');
        for (const s of sliders) {
            const sr = s.getBoundingClientRect();
            if (vpY >= sr.top && vpY <= sr.bottom && vpX >= sr.left && vpX <= sr.right) {
                this._sliderAxis = s.getAttribute('data-axis') as 'x' | 'y' | 'z';
                this._updateValue(this._sliderAxis, vpX);
                return true;
            }
        }
        return false;
    }

    onPointerMove(vpX: number): boolean {
        if (!this._sliderAxis) return false;
        this._updateValue(this._sliderAxis, vpX);
        return true;
    }

    onPointerUp() {
        this._sliderAxis = null;
    }

    cancelEdit() {
        if (this._editing) {
            this._editing = null;
            this._editBuf = '';
            this._sync(this._store.get());
        }
    }

    // ── 键盘编辑 ──

    onKeyDown(event: any): boolean {
        if (!this._editing) return false;
        const key = event.key ?? '';
        if (key === 'Enter') { this._confirmEdit(); return true; }
        if (key === 'Escape') { this._cancelEdit(); return true; }
        if (key === 'Backspace') {
            this._editBuf = this._editBuf.slice(0, -1);
        } else if (/^[\d.]$/.test(key) && this._editBuf.length < 6) {
            this._editBuf += key;
        } else {
            return true;
        }
        const val = parseFloat(this._editBuf);
        if (!isNaN(val) && this._editing) {
            const d = this._store.get();
            const src = this._src(d);
            if (src) { src[this._editing].val = Math.max(0, Math.min(src[this._editing].max, val)); this._store.set({ ...d }); }
        }
        this._sync(this._store.get());
        return true;
    }

    private _startEdit(axis: 'x' | 'y' | 'z') {
        this._editing = axis;
        const src = this._src(this._store.get());
        this._editBuf = src?.[axis]?.val != null ? String(src[axis].val) : '';
        this._sync(this._store.get());
    }

    private _confirmEdit() {
        if (!this._editing) return;
        const val = parseFloat(this._editBuf);
        if (!isNaN(val) && this._editing) {
            const d = this._store.get();
            const src = this._src(d);
            if (src) { src[this._editing].val = Math.max(0, Math.min(src[this._editing].max, val)); this._store.set({ ...d }); }
        }
        this._editing = null;
        this._editBuf = '';
        this._sync(this._store.get());
    }

    private _cancelEdit() {
        this._editing = null;
        this._editBuf = '';
        this._sync(this._store.get());
    }

    private _updateValue(axis: 'x' | 'y' | 'z', vpX: number) {
        const sl = this.el.querySelector(`[data-axis="${axis}"]`) as HTMLElement;
        const track = sl?.querySelector('.gizmo-track') as HTMLElement;
        if (!track) return;
        const d = this._store.get();
        const src = this._src(d);
        if (!src) return;
        const trackRect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (vpX - trackRect.left) / trackRect.width));
        src[axis].val = Math.round(pct * src[axis].max * 10) / 10;
        this._store.set({ ...d });
    }
}
