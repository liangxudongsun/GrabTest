import { PopupPanel, PopupPanelOptions } from './模板/PopupPanel';

/** 样条控制点弹出框 - 基于 PopupPanel 模板 */
export class SplinePanel extends PopupPanel {
    constructor(panelId: string, opts: PopupPanelOptions) {
        super(panelId, opts);
        // 改标题
        const header = this.el.querySelector('div:first-child') as HTMLElement;
        if (header) header.textContent = 'Spline';
    }
}
