/** 下拉框模板 - 纯 UI，通过 CCE 事件交互 */
export class Dropdown {
    el: HTMLDivElement;
    private _open = false;

    constructor(options: { label: string; value: string }[], defaultVal: string, onChange?: (val: string) => void) {
        const defLabel = options.find(o => o.value === defaultVal)?.label || defaultVal;
        const el = document.createElement('div');
        el.style.cssText = 'width:100%;margin-bottom:6px;background:#444;color:#fff;border:1px solid #666;border-radius:3px;font:12px sans-serif;cursor:pointer;position:relative;';
        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;padding:2px 4px;">
                <span class="dd-text">${defLabel}</span>
                <span>▼</span>
            </div>
            <div class="dd-options" style="display:none;position:absolute;top:100%;left:0;right:0;background:#333;border:1px solid #666;border-radius:3px;z-index:10;">
                ${options.map(o => `<div class="dd-opt" data-value="${o.value}" style="padding:2px 4px;cursor:pointer;">${o.label}</div>`).join('')}
            </div>
        `;
        this.el = el as HTMLDivElement;

        this._onChange = onChange || null;
    }

    private _onChange: ((val: string) => void) | null = null;

    destroy() {}

    /** 处理 CCE pointerdown，返回 true 表示消费 */
    onPointerDown(vpX: number, vpY: number): boolean {
        const optBox = this.el.querySelector('.dd-options') as HTMLElement;
        const sr = this.el.getBoundingClientRect();

        // 选项点击
        if (optBox && optBox.style.display !== 'none') {
            const opts = this.el.querySelectorAll('.dd-opt');
            for (const o of opts) {
                const r = o.getBoundingClientRect();
                if (vpX >= r.left && vpX <= r.right && vpY >= r.top && vpY <= r.bottom) {
                    const val = o.getAttribute('data-value') || '';
                    this.el.querySelector('.dd-text')!.textContent = o.textContent;
                    optBox.style.display = 'none';
                    this._open = false;
                    this._onChange?.(val);
                    return true;
                }
            }
            // 点击选项外 → 关闭
            if (!(vpX >= sr.left && vpX <= sr.right && vpY >= sr.top && vpY <= sr.bottom)) {
                optBox.style.display = 'none';
                this._open = false;
            }
        }

        // 点击选择框
        if (vpX >= sr.left && vpX <= sr.right && vpY >= sr.top && vpY <= sr.bottom) {
            if (optBox) {
                optBox.style.display = this._open ? 'none' : 'block';
                this._open = !this._open;
            }
            return true;
        }
        return false;
    }

    close() {
        const optBox = this.el.querySelector('.dd-options') as HTMLElement;
        if (optBox) { optBox.style.display = 'none'; this._open = false; }
    }
}
