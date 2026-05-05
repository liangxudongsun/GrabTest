import { _decorator, Component } from 'cc';
import { EDITOR } from 'cc/env';
const { ccclass, executeInEditMode } = _decorator;

@ccclass('TestDrop')
@executeInEditMode(true)
export class TestDrop extends Component {
    start() {
        if (!EDITOR) return;
        const cce = (window as any).cce;

        // 拦截所有 IPC 通道
        const channels = ['Ipc', '_electronIPC', 'Preview'];
        for (const ch of channels) {
            const obj = (cce as any)[ch];
            if (!obj) continue;
            // 找 on 方法
            if (typeof obj.on === 'function') {
                const origOn = obj.on.bind(obj);
                obj.on = (event: string, cb: Function) => {
                    console.log('[TestDrop] register:', ch, event);
                    return origOn(event, (...args: any[]) => {
                        if (event.includes('drop') || event.includes('asset')) {
                            console.log('[TestDrop] event:', ch, event, args);
                        }
                        return cb(...args);
                    });
                };
            }
            // 直接 hook _events
            if (obj._events) {
                for (const evt of Object.keys(obj._events)) {
                    const orig = obj._events[evt];
                    if (typeof orig === 'function') {
                        obj._events[evt] = (...args: any[]) => {
                            const str = JSON.stringify(args).slice(0, 200);
                            console.log('[TestDrop] event:', ch, evt, str);
                            return orig(...args);
                        };
                    }
                }
            }
        }

        console.log('[TestDrop] 已拦截 IPC');
    }
}
