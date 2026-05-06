import { _decorator, Component } from 'cc';
import { ParticleSystem } from './ParticleSystem/ParticleSystem';

const { ccclass, executeInEditMode } = _decorator;

/** 示例：监听粒子碰撞回调 */
@ccclass('CollisionTest')
@executeInEditMode(true)
export class CollisionTest extends Component {
    start() {
        const ps = this.node.getComponent(ParticleSystem);
        if (!ps) return;

        ps.onParticleCollision = (p1, p2, pos) => {
            // console.log('粒子碰撞', pos);
        };
        ps.onParticleHitCollider = (p, collider, pos) => {
            // console.log('粒子撞到碰撞器', collider.node.name, pos);
        };
    }
}
