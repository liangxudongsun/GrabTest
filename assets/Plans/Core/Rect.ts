/** 矩形 UI 基类 - 每个可交互元素都有 hitTest + 事件方法 */
export abstract class Rect {
    abstract get el(): HTMLElement;

    /** 视口坐标下的边界矩形 */
    get rect(): DOMRect {
        return this.el.getBoundingClientRect();
    }

    /** 检测视口坐标是否落在矩形内 */
    hitTest(x: number, y: number): boolean {
        const r = this.rect;
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    // 事件回调 — 返回 true 表示已消费
    onPointerDown?(x: number, y: number): boolean;
    onPointerMove?(x: number, y: number): boolean;
    onPointerUp?(): void;
    onKeyDown?(event: any): boolean;
    /** 取消编辑态（mousedown 在 rect 外时调用） */
    cancelEdit?(): void;

    destroy() {}
}
