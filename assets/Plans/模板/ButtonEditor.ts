/** 虚拟按键模板 - 纯 UI 组件，事件由外层通过 CCEManager 驱动 */
export class ButtonEditor {
    el: HTMLElement;

    constructor(label: string) {
        const el = document.createElement('div');
        el.textContent = label;
        el.style.cssText = `
            font:12px sans-serif;color:#fff;cursor:pointer;user-select:none;
            background:#3a3a3a;border:1px solid #666;border-radius:6px;
            padding:4px 12px;text-align:center;
        `;
        this.el = el;
    }

    setPressed(pressed: boolean) {
        this.el.style.background = pressed ? '#555' : '#3a3a3a';
    }

    destroy() { this.el?.remove(); }
}
