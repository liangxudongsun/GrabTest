import { _decorator, CurveRange, GradientRange, Enum, Vec3, Mat4, Node, Quat } from 'cc';
import { ParticleCollider } from './ParticleCollider';
import { Particle } from './ParticleData';
import { IParticleSystem } from './IParticleSystem';

const { ccclass, property } = _decorator;

const RotationMode = Enum({
    Overall: 0,
    Separate: 1,
});

const AxisMode = Enum({
    Overall: 0,
    Separate: 1,
});

@ccclass('SizeOvertimeModule')
export class SizeOvertimeModule {
    @property({ tooltip: '启用' }) enable = false;

    @property({
        type: AxisMode,
        displayName: 'Mode',
        tooltip: 'Overall：三轴统一；Separate：各轴独立',
    })
    mode = AxisMode.Overall;

    @property({
        type: CurveRange,
        displayName: 'Overall',
        tooltip: '整体缩放过期曲线',
        visible: function () { return (this as SizeOvertimeModule).mode === AxisMode.Overall; },
    })
    overall: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'X',
        tooltip: 'X轴缩放',
        visible: function () { return (this as SizeOvertimeModule).mode === AxisMode.Separate; },
    })
    x: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Y',
        tooltip: 'Y轴缩放',
        visible: function () { return (this as SizeOvertimeModule).mode === AxisMode.Separate; },
    })
    y: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Z',
        tooltip: 'Z轴缩放',
        visible: function () { return (this as SizeOvertimeModule).mode === AxisMode.Separate; },
    })
    z: CurveRange = new CurveRange();

    apply(p: Particle) {
        if (!this.enable) return;
        const t = p.normalizedAge;
        if (this.mode === AxisMode.Overall) {
            const v = this.overall.evaluate(t, p.randomSeed);
            p.size.x *= v;
            p.size.y *= v;
            p.size.z *= v;
        } else {
            p.size.x *= this.x.evaluate(t, p.randomSeed);
            p.size.y *= this.y.evaluate(t, p.randomSeed);
            p.size.z *= this.z.evaluate(t, p.randomSeed);
        }
    }
}

@ccclass('ColorOvertimeModule')
export class ColorOvertimeModule {
    @property({ tooltip: '启用' }) enable = false;
    @property({ type: GradientRange, tooltip: '颜色渐变（随时间变化）' })
    gradient: GradientRange = new GradientRange();

    apply(p: Particle) {
        if (!this.enable) return;
        const t = p.normalizedAge;
        const c = this.gradient.evaluate(t, p.randomSeed);
        p.color4.x = c.x;
        p.color4.y = c.y;
        p.color4.z = c.z;
        p.color4.w = c.w;
    }
}

@ccclass('VelocityOvertimeModule')
export class VelocityOvertimeModule {
    @property({ tooltip: '启用' }) enable = false;

    @property({
        type: AxisMode,
        displayName: 'Mode',
        tooltip: 'Overall：三轴统一；Separate：各轴独立',
    })
    mode = AxisMode.Overall;

    @property({
        type: CurveRange,
        displayName: 'Overall',
        tooltip: '整体速度增量',
        visible: function () { return (this as VelocityOvertimeModule).mode === AxisMode.Overall; },
    })
    overall: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'X',
        tooltip: 'X轴速度增量',
        visible: function () { return (this as VelocityOvertimeModule).mode === AxisMode.Separate; },
    })
    x: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Y',
        tooltip: 'Y轴速度增量',
        visible: function () { return (this as VelocityOvertimeModule).mode === AxisMode.Separate; },
    })
    y: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Z',
        tooltip: 'Z轴速度增量',
        visible: function () { return (this as VelocityOvertimeModule).mode === AxisMode.Separate; },
    })
    z: CurveRange = new CurveRange();

    @property({ type: CurveRange, tooltip: '速度倍率（乘算）' })
    speedModifier: CurveRange = new CurveRange();

    apply(p: Particle) {
        if (!this.enable) return;
        const t = p.normalizedAge;
        const mod = this.speedModifier.evaluate(t, p.randomSeed);
        if (this.mode === AxisMode.Overall) {
            const v = this.overall.evaluate(t, p.randomSeed) * mod;
            p.velocity.x += v;
            p.velocity.y += v;
            p.velocity.z += v;
        } else {
            p.velocity.x += this.x.evaluate(t, p.randomSeed) * mod;
            p.velocity.y += this.y.evaluate(t, p.randomSeed) * mod;
            p.velocity.z += this.z.evaluate(t, p.randomSeed) * mod;
        }
    }
}

@ccclass('ForceOvertimeModule')
export class ForceOvertimeModule {
    @property({ tooltip: '启用' }) enable = false;

    @property({
        type: AxisMode,
        displayName: 'Mode',
        tooltip: 'Overall：三轴统一；Separate：各轴独立',
    })
    mode = AxisMode.Overall;

    @property({
        type: CurveRange,
        displayName: 'Overall',
        tooltip: '整体加速度',
        visible: function () { return (this as ForceOvertimeModule).mode === AxisMode.Overall; },
    })
    overall: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'X',
        tooltip: 'X轴加速度',
        visible: function () { return (this as ForceOvertimeModule).mode === AxisMode.Separate; },
    })
    x: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Y',
        tooltip: 'Y轴加速度',
        visible: function () { return (this as ForceOvertimeModule).mode === AxisMode.Separate; },
    })
    y: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Z',
        tooltip: 'Z轴加速度',
        visible: function () { return (this as ForceOvertimeModule).mode === AxisMode.Separate; },
    })
    z: CurveRange = new CurveRange();

    apply(p: Particle, dt: number) {
        if (!this.enable) return;
        const t = p.normalizedAge;
        if (this.mode === AxisMode.Overall) {
            const v = this.overall.evaluate(t, p.randomSeed) * dt;
            p.velocity.x += v;
            p.velocity.y += v;
            p.velocity.z += v;
        } else {
            p.velocity.x += this.x.evaluate(t, p.randomSeed) * dt;
            p.velocity.y += this.y.evaluate(t, p.randomSeed) * dt;
            p.velocity.z += this.z.evaluate(t, p.randomSeed) * dt;
        }
    }
}

@ccclass('LimitVelocityOvertimeModule')
export class LimitVelocityOvertimeModule {
    @property({ tooltip: '启用' }) enable = false;
    @property({ type: CurveRange, tooltip: '速度上限曲线' })
    limit: CurveRange = new CurveRange();
    @property({ tooltip: '阻尼系数（0=急停，1=不减速）' })
    dampen = 1;

    apply(p: Particle) {
        if (!this.enable) return;
        const t = p.normalizedAge;
        const maxSpeed = this.limit.evaluate(t, p.randomSeed);
        const speed = p.velocity.length();
        if (speed > maxSpeed) {
            const ratio = 1 - (1 - maxSpeed / speed) * this.dampen;
            p.velocity.multiplyScalar(ratio);
        }
    }
}

@ccclass('RotationOvertimeModule')
export class RotationOvertimeModule {
    @property({ tooltip: '启用' }) enable = false;

    @property({
        type: RotationMode,
        displayName: 'Mode',
        tooltip: 'Overall：三轴统一；Separate：各轴独立',
    })
    mode = RotationMode.Overall;

    @property({
        type: CurveRange,
        displayName: 'Overall',
        tooltip: '整体旋转速度',
        visible: function () { return (this as RotationOvertimeModule).mode === RotationMode.Overall; },
    })
    overall: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'X',
        tooltip: 'X轴旋转速度',
        visible: function () { return (this as RotationOvertimeModule).mode === RotationMode.Separate; },
    })
    x: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Y',
        tooltip: 'Y轴旋转速度',
        visible: function () { return (this as RotationOvertimeModule).mode === RotationMode.Separate; },
    })
    y: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Z',
        tooltip: 'Z轴旋转速度',
        visible: function () { return (this as RotationOvertimeModule).mode === RotationMode.Separate; },
    })
    z: CurveRange = new CurveRange();

    apply(p: Particle) {
        if (!this.enable) return;
        const t = p.normalizedAge;
        if (this.mode === RotationMode.Overall) {
            const v = this.overall.evaluate(t, p.randomSeed);
            p.rotation.x += v;
            p.rotation.y += v;
            p.rotation.z += v;
        } else {
            p.rotation.x += this.x.evaluate(t, p.randomSeed);
            p.rotation.y += this.y.evaluate(t, p.randomSeed);
            p.rotation.z += this.z.evaluate(t, p.randomSeed);
        }
    }
}

@ccclass('NoiseModule')
export class NoiseModule {
    @property({ tooltip: '启用' }) enable = false;
    @property({ tooltip: 'X轴随机扰动力度' }) strengthX = 1;
    @property({ tooltip: 'Y轴随机扰动力度' }) strengthY = 1;
    @property({ tooltip: 'Z轴随机扰动力度' }) strengthZ = 1;
    @property({ tooltip: '扰动频率（越高越细碎）' }) frequency = 1;
    @property({ tooltip: '八度音层数（越大越丰富）' }) octaves = 1;

    apply(p: Particle, dt: number) {
        if (!this.enable) return;
        const noiseX = Math.sin(p.position.x * this.frequency + p.age) * this.strengthX;
        const noiseY = Math.cos(p.position.y * this.frequency + p.age) * this.strengthY;
        const noiseZ = Math.sin(p.position.z * this.frequency + p.age * 1.3) * this.strengthZ;
        p.position.x += noiseX * dt;
        p.position.y += noiseY * dt;
        p.position.z += noiseZ * dt;
    }
}

interface ColliderData {
    center: Vec3;
    halfExt: Vec3;
    group: number;
    rotation: Quat;
    component: ParticleCollider;
}

function _findParticleColliders(root: Node, out: ParticleCollider[]) {
    const comp = root.getComponent(ParticleCollider);
    if (comp) out.push(comp);
    for (const child of root.children) _findParticleColliders(child, out);
}

@ccclass('CollisionModule')
export class CollisionModule {
    @property({ displayName: 'Enable', tooltip: '启用' }) enable = false;
    @property({ displayName: 'Collider Bounce', tooltip: '碰撞碰撞器时自动反弹' }) enableBounce = true;
    @property({ displayName: 'Bounce', slide: true, range: [0, 1, 0.01], tooltip: '碰撞器反弹系数' }) bounce = 0.5;
    @property({ tooltip: '碰撞层级' }) collisionLayer = 1 << 1;
    @property({ displayName: 'Collision Mask', tooltip: '粒子碰撞掩码' }) collisionMask = -1;
    @property({ displayName: 'Particle Collision', tooltip: '启用粒子间碰撞' }) enableParticleCollision = true;
    @property({ displayName: 'Particle Bounce Enable', tooltip: '粒子间碰撞时自动反弹' }) enableParticleBounce = true;
    @property({ displayName: 'Particle Bounce', slide: true, range: [0, 1, 0.01], tooltip: '粒子间反弹系数' }) particleBounce = 0.5;

    private _colliders: ColliderData[] = [];
    private _invMat = new Mat4();

    _owner: IParticleSystem | null;

    constructor(owner?: IParticleSystem) {
        this._owner = owner ?? null;
    }

    refresh(sceneRoot: Node, sysNode?: Node) {
        this._colliders.length = 0;
        const sysWorldMat = sysNode?.worldMatrix;

        const pcs: ParticleCollider[] = [];
        _findParticleColliders(sceneRoot, pcs);

        for (const pc of pcs) {
            const worldPos = new Vec3(pc.node.worldPosition);
            if (pc.offset) worldPos.add(pc.offset);
            const halfExt = new Vec3(pc.size.x / 2, pc.size.y / 2, pc.size.z / 2);
            const worldRot = new Quat();
            Quat.fromEuler(worldRot, pc.rotation.x, pc.rotation.y, pc.rotation.z);

            let localCenter: Vec3;
            let localRot: Quat;

            if (sysWorldMat) {
                Mat4.invert(this._invMat, sysWorldMat);
                localCenter = new Vec3();
                Vec3.transformMat4(localCenter, worldPos, this._invMat);
                const invRot = new Quat();
                Mat4.getRotation(invRot, this._invMat);
                localRot = new Quat();
                Quat.multiply(localRot, invRot, worldRot);
            } else {
                localCenter = worldPos.clone();
                localRot = worldRot.clone();
            }

            this._colliders.push({
                center: localCenter,
                halfExt: halfExt,
                rotation: localRot,
                group: pc.group,
                component: pc
            });
        }
    }

    apply(p: Particle) {
        if (!this.enable) return;

        const localPos = new Vec3();
        const localVel = new Vec3();
        const invBoxRot = new Quat();
        const hitPos = new Vec3();

        for (const c of this._colliders) {
            Quat.invert(invBoxRot, c.rotation);
            Vec3.subtract(localPos, p.position, c.center);
            Vec3.transformQuat(localPos, localPos, invBoxRot);
            Vec3.transformQuat(localVel, p.velocity, invBoxRot);

            const hx = c.halfExt.x, hy = c.halfExt.y, hz = c.halfExt.z;

            let bounced = false;
            const bounceMul = this.enableBounce ? -this.bounce : 0;

            // X 轴面
            if (Math.abs(localPos.y) <= hy && Math.abs(localPos.z) <= hz) {
                const thx = Math.abs(localVel.x) * 0.03 + 0.1;
                if (localPos.x > hx && localPos.x < hx + thx && localVel.x < 0) {
                    localPos.x = hx; localVel.x *= bounceMul; bounced = true;
                } else if (localPos.x > hx - thx && localPos.x <= hx && localVel.x > 0) {
                    localPos.x = hx; localVel.x *= bounceMul; bounced = true;
                } else if (localPos.x < -hx && localPos.x > -hx - thx && localVel.x > 0) {
                    localPos.x = -hx; localVel.x *= bounceMul; bounced = true;
                } else if (localPos.x < -hx + thx && localPos.x >= -hx && localVel.x < 0) {
                    localPos.x = -hx; localVel.x *= bounceMul; bounced = true;
                }
            }

            // Y 轴面
            if (Math.abs(localPos.x) <= hx && Math.abs(localPos.z) <= hz) {
                const thy = Math.abs(localVel.y) * 0.03 + 0.1;
                if (localPos.y > hy && localPos.y < hy + thy && localVel.y < 0) {
                    localPos.y = hy; localVel.y *= bounceMul; bounced = true;
                } else if (localPos.y > hy - thy && localPos.y <= hy && localVel.y > 0) {
                    localPos.y = hy; localVel.y *= bounceMul; bounced = true;
                } else if (localPos.y < -hy && localPos.y > -hy - thy && localVel.y > 0) {
                    localPos.y = -hy; localVel.y *= bounceMul; bounced = true;
                } else if (localPos.y < -hy + thy && localPos.y >= -hy && localVel.y < 0) {
                    localPos.y = -hy; localVel.y *= bounceMul; bounced = true;
                }
            }

            // Z 轴面
            if (Math.abs(localPos.x) <= hx && Math.abs(localPos.y) <= hy) {
                const thz = Math.abs(localVel.z) * 0.03 + 0.1;
                if (localPos.z > hz && localPos.z < hz + thz && localVel.z < 0) {
                    localPos.z = hz; localVel.z *= bounceMul; bounced = true;
                } else if (localPos.z > hz - thz && localPos.z <= hz && localVel.z > 0) {
                    localPos.z = hz; localVel.z *= bounceMul; bounced = true;
                } else if (localPos.z < -hz && localPos.z > -hz - thz && localVel.z > 0) {
                    localPos.z = -hz; localVel.z *= bounceMul; bounced = true;
                } else if (localPos.z < -hz + thz && localPos.z >= -hz && localVel.z < 0) {
                    localPos.z = -hz; localVel.z *= bounceMul; bounced = true;
                }
            }

            if (!bounced) continue;

            Vec3.transformQuat(p.velocity, localVel, c.rotation);
            Vec3.transformQuat(p.position, localPos, c.rotation);
            p.position.add(c.center);

            hitPos.set(p.position);
            this._owner?.onParticleHitCollider?.(p, c.component, hitPos);
        }
    }
}
