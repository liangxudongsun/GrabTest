import { Component } from 'cc';
import { EDITOR } from 'cc/env';

// ── 共享轮询 ──
const _cbs = new Set<() => void>();
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _lastUuid = '';

function _start() {
    if (_intervalId) return;
    _intervalId = setInterval(_poll, 1000);
}

function _stop() {
    if (_intervalId && _cbs.size === 0) {
        clearInterval(_intervalId);
        _intervalId = null;
    }
}

async function _poll() {
    const Editor = (window as any).Editor;
    if (!Editor?.Message) return;
    try {
        const uuid = await Editor.Message.request('scene', 'query-current-scene');
        if (uuid && uuid !== _lastUuid) {
            _lastUuid = uuid;
            _cbs.forEach(cb => cb());
        }
    } catch { }
}

/**
 * 场景切换时自动刷新组件（toggle node.active）。
 * 通过编辑器 IPC 轮询检测当前场景 UUID 变化，
 * 切换后执行 node.active = false / true 触发 onDisable → onEnable。
 *
 * @ccclass('MyComponent')
 * @refreshOnSceneChange
 * @executeInEditMode(true)
 * export class MyComponent extends Component { ... }
 */
export function refreshOnSceneChange(constructor: typeof Component): void {
    const proto = constructor.prototype as any;
    const origOnLoad: (() => void) | undefined = proto.onLoad;
    const origOnDestroy: (() => void) | undefined = proto.onDestroy;

    proto.onLoad = function (this: Component) {//报错
        if (!EDITOR) { origOnLoad?.call(this); return; }

        const handler = () => {
            if (!this.node?.isValid) return;
            this.node.active = false;
            this.node.active = true;
        };
        (this as any).__rs_handler = handler;
        _cbs.add(handler);
        _start();

        origOnLoad?.call(this);
    };

    proto.onDestroy = function (this: Component) {//报错
        const handler = (this as any).__rs_handler;
        if (handler) {
            _cbs.delete(handler);
            _stop();
        }
        origOnDestroy?.call(this);
    };
}
