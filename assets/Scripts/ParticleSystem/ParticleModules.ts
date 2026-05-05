import { _decorator, CurveRange, GradientRange, Enum, Vec3, Mat4, Node, Quat } from 'cc';
import { ParticleCollider } from '../ParticleCollider';
import { Particle } from './ParticleData';

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
    @property enable = false;

    @property({
        type: AxisMode,
        displayName: 'Mode',
    })
    mode = AxisMode.Overall;

    @property({
        type: CurveRange,
        displayName: 'Overall',
        visible: function () { return (this as SizeOvertimeModule).mode === AxisMode.Overall; },
    })
    overall: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'X',
        visible: function () { return (this as SizeOvertimeModule).mode === AxisMode.Separate; },
    })
    x: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Y',
        visible: function () { return (this as SizeOvertimeModule).mode === AxisMode.Separate; },
    })
    y: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Z',
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
    @property enable = false;
    @property({ type: GradientRange })
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
    @property enable = false;
 

    @property({
        type: AxisMode,
        displayName: 'Mode',
    })
    mode = AxisMode.Overall;

    @property({
        type: CurveRange,
        displayName: 'Overall',
        visible: function () { return (this as VelocityOvertimeModule).mode === AxisMode.Overall; },
    })
    overall: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'X',
        visible: function () { return (this as VelocityOvertimeModule).mode === AxisMode.Separate; },
    })
    x: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Y',
        visible: function () { return (this as VelocityOvertimeModule).mode === AxisMode.Separate; },
    })
    y: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Z',
        visible: function () { return (this as VelocityOvertimeModule).mode === AxisMode.Separate; },
    })
    z: CurveRange = new CurveRange();

    @property({ type: CurveRange })
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
    @property enable = false;
   

    @property({
        type: AxisMode,
        displayName: 'Mode',
    })
    mode = AxisMode.Overall;

    @property({
        type: CurveRange,
        displayName: 'Overall',
        visible: function () { return (this as ForceOvertimeModule).mode === AxisMode.Overall; },
    })
    overall: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'X',
        visible: function () { return (this as ForceOvertimeModule).mode === AxisMode.Separate; },
    })
    x: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Y',
        visible: function () { return (this as ForceOvertimeModule).mode === AxisMode.Separate; },
    })
    y: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Z',
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
    @property enable = false;
    @property({ type: CurveRange })
    limit: CurveRange = new CurveRange();
    @property dampen = 1;

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
    @property enable = false;

    @property({
        type: RotationMode,
        displayName: 'Mode',
    })
    
    mode = RotationMode.Overall;

    @property({
        type: CurveRange,
        displayName: 'Overall',
        visible: function () { return (this as RotationOvertimeModule).mode === RotationMode.Overall; },
    })
    overall: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'X',
        visible: function () { return (this as RotationOvertimeModule).mode === RotationMode.Separate; },
    })
    x: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Y',
        visible: function () { return (this as RotationOvertimeModule).mode === RotationMode.Separate; },
    })
    y: CurveRange = new CurveRange();

    @property({
        type: CurveRange,
        displayName: 'Z',
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
    @property enable = false;
    @property strengthX = 1;
    @property strengthY = 1;
    @property strengthZ = 1;
    @property frequency = 1;
    @property octaves = 1;

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
    rotation:Quat
}

function _findParticleColliders(root: Node, out: ParticleCollider[]) {
    const comp = root.getComponent(ParticleCollider);
    if (comp) out.push(comp);
    for (const child of root.children) _findParticleColliders(child, out);
}

@ccclass('CollisionModule')
export class CollisionModule {
    @property enable = false;
    @property({ displayName: 'Bounce', slide: true, range: [0, 1, 0.01] }) bounce = 0.5;
    @property collisionLayer = 1 << 1;
    @property({ displayName: 'Collision Mask', tooltip: '粒子碰撞掩码' }) collisionMask = -1;

    private _colliders: ColliderData[] = [];
    private _invMat = new Mat4();

    refresh(sceneRoot: Node, sysNode?: Node) {
        this._colliders.length = 0;
        const sysWorldMat = sysNode?.worldMatrix;

        const pcs: ParticleCollider[] = [];
        _findParticleColliders(sceneRoot, pcs);

        for (const pc of pcs) {
            // ----- 分组过滤（可在收集阶段过滤，也可在 apply 中做） -----
            //if ((pc.group & this.collisionMask) === 0) continue;

            // 1. 世界中心位置
            const worldPos = new Vec3(pc.node.worldPosition);
            if (pc.offset) worldPos.add(pc.offset);

            // 2. 世界半尺寸（size 已经是世界空间尺寸，无需缩放）
            const halfExt = new Vec3(pc.size.x / 2, pc.size.y / 2, pc.size.z / 2);

            // 3. 世界旋转（欧拉角 -> 四元数，YZX 顺序）
            const worldRot = new Quat();
            Quat.fromEuler(worldRot, pc.rotation.x, pc.rotation.y, pc.rotation.z);

            let localCenter: Vec3;
            let localRot: Quat;

            if (sysWorldMat) {
                Mat4.invert(this._invMat, sysWorldMat);

                // 位置转换
                localCenter = new Vec3();
                Vec3.transformMat4(localCenter, worldPos, this._invMat);

                // 旋转转换
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
                group: pc.group
            });
        }
    }
    apply(p: Particle) {
    if (!this.enable) return;

    const localPos = new Vec3();
    const localVel = new Vec3();
    const invBoxRot = new Quat();

    for (const c of this._colliders) {
        // 1. 获取盒子的旋转的逆
        Quat.invert(invBoxRot, c.rotation);

        // 2. 世界 → 盒子局部坐标
        Vec3.subtract(localPos, p.position, c.center);
        Vec3.transformQuat(localPos, localPos, invBoxRot);   // 位置
        Vec3.transformQuat(localVel, p.velocity, invBoxRot); // 速度

        const hx = c.halfExt.x, hy = c.halfExt.y, hz = c.halfExt.z;
        const minX = -hx, maxX = hx;
        const minY = -hy, maxY = hy;
        const minZ = -hz, maxZ = hz;

        const nearL = localPos.x - minX, nearR = maxX - localPos.x;
        const nearB = localPos.y - minY, nearT = maxY - localPos.y;
        const nearF = localPos.z - minZ, nearBk = maxZ - localPos.z;

        const th = Math.max(
            1,
            Math.abs(localVel.x) * 0.035,
            Math.abs(localVel.y) * 0.035,
            Math.abs(localVel.z) * 0.035
        );

        // 3. 在盒子本地坐标系内反弹（与你原始逻辑一致）
        if (Math.abs(nearL) < th && nearL * localVel.x < 0) {
            localVel.x *= -this.bounce;
        } else if (Math.abs(nearR) < th && nearR * localVel.x > 0) {
            localVel.x *= -this.bounce;
        }
        if (Math.abs(nearB) < th && nearB * localVel.y < 0) {
            localVel.y *= -this.bounce;
        } else if (Math.abs(nearT) < th && nearT * localVel.y > 0) {
            localVel.y *= -this.bounce;
        }
        if (Math.abs(nearF) < th && nearF * localVel.z < 0) {
            localVel.z *= -this.bounce;
        } else if (Math.abs(nearBk) < th && nearBk * localVel.z > 0) {
            localVel.z *= -this.bounce;
        }

        // 4. 盒子本地速度 → 世界速度
        Vec3.transformQuat(p.velocity, localVel, c.rotation);
    }
}
}
