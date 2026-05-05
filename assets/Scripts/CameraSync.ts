import { _decorator, Component, Camera } from 'cc';
const { ccclass, property, executeInEditMode, playOnFocus } = _decorator;

/**
 * 编辑器场景相机（CCE） → 本节点 transform 同步。
 * 挂在任意节点上，运行时自动将编辑器场景相机的 transform 复制过来。
 */
@ccclass('CameraSync')
@executeInEditMode(true)
@playOnFocus(true)
export class CameraSync extends Component {

    @property({ displayName: 'Sync Every Frame' })
    syncEveryFrame = false;

 

    onLoad() {
        this._sync();
    }

    update() {
        if (this.syncEveryFrame ) {
            this._sync();
        }
    }

    private _sync() {
        // cce 是 Cocos Creator Editor 的全局对象，仅在编辑器中存在
        const cce = (window as any).cce;
        if (!cce?.Camera?.camera) return;

        const editorCamera: Camera = cce.Camera.camera;
        if (!editorCamera?.node) return;

        this.node.setWorldPosition(editorCamera.node.worldPosition);
        this.node.setWorldRotation(editorCamera.node.worldRotation);
       
    }
}
