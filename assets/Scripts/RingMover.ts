import { _decorator, Component, Vec3, input, Input, KeyCode, EventKeyboard } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('RingMover')
export class RingMover extends Component {
    @property({ displayName: '移动速度' })
    speed = 3;

    private _dir = new Vec3();

    onLoad() {
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    onDestroy() {
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    private onKeyDown(e: EventKeyboard) {
        switch (e.keyCode) {
            case KeyCode.KEY_W: this._dir.z = -1; break;
            case KeyCode.KEY_S: this._dir.z =  1; break;
            case KeyCode.KEY_A: this._dir.x = -1; break;
            case KeyCode.KEY_D: this._dir.x =  1; break;
        }
    }

    private onKeyUp(e: EventKeyboard) {
        switch (e.keyCode) {
            case KeyCode.KEY_W:
            case KeyCode.KEY_S: this._dir.z = 0; break;
            case KeyCode.KEY_A:
            case KeyCode.KEY_D: this._dir.x = 0; break;
        }
    }

    update(dt: number) {
        if (this._dir.x === 0 && this._dir.z === 0) return;
        const pos = this.node.position;
        this.node.setPosition(
            pos.x + this._dir.x * this.speed * dt,
            pos.y,
            pos.z + this._dir.z * this.speed * dt,
        );
    }
}
