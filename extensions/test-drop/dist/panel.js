'use strict';
(function () {
    function init() {
        const cce = window.cce;
        if (!cce?.Asset?.dragDrop?.handlers) {
            setTimeout(init, 100);
            return;
        }
        const handler = {
            acceptedTypes: ['cc.Texture2D', 'cc.SpriteFrame', 'cc.TextureCube', 'cc.Material'],
            excludedTypes: [],
            dragItems: [],
            isDragging: false,
            temporaryNodes: [],
            currentRaycastResultNodes: [],
            editorCanvasNode: null,
            onDragEnter(dragItems, raycastResults) {
                this.dragItems = dragItems;
                this.isDragging = true;
                console.log('[ExtDrop] dragEnter:', dragItems.map(i => i.uuid));
                return true;
            },
            onDragOver(dragItems, raycastResults) { return true; },
            onDrop(dragItems, raycastResults) {
                console.log('[ExtDrop] DROP:', JSON.stringify(dragItems.map(i => ({ uuid: i.uuid, type: i.type, name: i.name }))));
                this.isDragging = false;
                this.dragItems = [];
            },
            onDragLeave() { this.isDragging = false; this.dragItems = []; },
        };
        cce.Asset.dragDrop.handlers.unshift(handler);
        console.log('[ExtDrop] 面板拖放 handler 注册成功');
    }
    exports.style = '';
    exports.template = '<div>Drop Test Panel</div>';
    exports.$ = {};
    exports.ready = function () { init(); };
    exports.close = function () {};
})();
