import { Rect } from '../Core/Rect';

export interface AxisData {
    val: number;
    max: number;
    min: number;
    name: string;
}

export interface Vec3Data {
    x: AxisData;
    y: AxisData;
    z: AxisData;
}

/** Vec3 编辑器模板 - 三个轴的滑块 + 数值输入 */
export class Vec3Editor extends Rect {
    el: HTMLDivElement;
    private _sliderAxis: 'x' | 'y' | 'z' | null = null;
    private _editing: 'x' | 'y' | 'z' | null = null;
    private _editBuf = '';

    constructor(private data: Vec3Data, private _onChange?: () => void) {
        super();
        const el = document.createElement('div');
        el.style.cssText = 'background:#2c2c2c;border:1px solid #555;border-radius:6px;padding:10px 14px;min-width:180px;';
        el.innerHTML = this._buildHTML(data);
        this.el = el;
        this._sync();
    }

    destroy() {}

    private _buildHTML(d: Vec3Data): string {
        return `
            <div style="display:flex;align-items:center;gap:6px;margin:3px 0;height:20px;cursor:pointer;" data-axis="x">
                ${d.x.name} <div class="gizmo-track" style="flex:1;height:4px;background:#555;border-radius:2px;position:relative;">
                    <div class="gizmo-thumb" style="position:absolute;top:-4px;width:12px;height:12px;background:#8cf;border-radius:50%;pointer-events:none;"></div>
                </div>
                <span class="gizmo-val" data-axis="x" style="width:36px;text-align:center;color:#fff;border:1px solid #555;border-radius:2px;cursor:pointer;">0.0</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin:3px 0;height:20px;cursor:pointer;" data-axis="y">
                ${d.y.name} <div class="gizmo-track" style="flex:1;height:4px;background:#555;border-radius:2px;position:relative;">
                    <div class="gizmo-thumb" style="position:absolute;top:-4px;width:12px;height:12px;background:#8cf;border-radius:50%;pointer-events:none;"></div>
                </div>
                <span class="gizmo-val" data-axis="y" style="width:36px;text-align:center;color:#fff;border:1px solid #555;border-radius:2px;cursor:pointer;">0.0</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin:3px 0;height:20px;cursor:pointer;" data-axis="z">
                ${d.z.name} <div class="gizmo-track" style="flex:1;height:4px;background:#555;border-radius:2px;position:relative;">
                    <div class="gizmo-thumb" style="position:absolute;top:-4px;width:12px;height:12px;background:#8cf;border-radius:50%;pointer-events:none;"></div>
                </div>
                <span class="gizmo-val" data-axis="z" style="width:36px;text-align:center;color:#fff;border:1px solid #555;border-radius:2px;cursor:pointer;">0.0</span>
            </div>
        `;
    }

    private _sync() {
        for (const axis of ['x', 'y', 'z'] as const) {
            const a = this.data[axis];
            const slider = this.el.querySelector(`[data-axis="${axis}"]`) as HTMLElement;
            const thumb = slider?.querySelector('.gizmo-thumb') as HTMLElement;
            const pct = a.max > a.min ? ((a.val - a.min) / (a.max - a.min)) * 100 : 0;
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
            this._sync();
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
            const a = this.data[this._editing];
            a.val = Math.max(a.min, Math.min(a.max, val));
            this._onChange?.();
        }
        this._sync();
        return true;
    }

    private _startEdit(axis: 'x' | 'y' | 'z') {
        this._editing = axis;
        this._editBuf = this.data[axis].val != null ? String(this.data[axis].val) : '';
        this._sync();
    }

    private _confirmEdit() {
        if (!this._editing) return;
        const val = parseFloat(this._editBuf);
        if (!isNaN(val) && this._editing) {
            const a = this.data[this._editing];
            a.val = Math.max(a.min, Math.min(a.max, val));
            this._onChange?.();
        }
        this._editing = null;
        this._editBuf = '';
        this._sync();
    }

    private _cancelEdit() {
        this._editing = null;
        this._editBuf = '';
        this._sync();
    }

    private _updateValue(axis: 'x' | 'y' | 'z', vpX: number) {
        const sl = this.el.querySelector(`[data-axis="${axis}"]`) as HTMLElement;
        const track = sl?.querySelector('.gizmo-track') as HTMLElement;
        if (!track) return;
        const a = this.data[axis];
        const trackRect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (vpX - trackRect.left) / trackRect.width));
        a.val = Math.round((a.min + pct * (a.max - a.min)) * 10) / 10;
        this._onChange?.();
        this._sync();
    }
}
