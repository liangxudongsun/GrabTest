import { _decorator, Component, Vec3, Quat, Color, CurveRange, GradientRange, Material, Mesh, MeshRenderer, gfx, director, geometry, utils, editorExtrasTag } from 'cc';
import { Particle } from './ParticleData';
import { EmitShape } from './EmissionConfig';
import {
    SizeOvertimeModule,
    ColorOvertimeModule,
    VelocityOvertimeModule,
    ForceOvertimeModule,
    LimitVelocityOvertimeModule,
    RotationOvertimeModule,
    NoiseModule,
    CollisionModule,
} from './ParticleModules';
import { EDITOR } from 'cc/env';

const { ccclass, property ,executeInEditMode,playOnFocus } = _decorator;
@ccclass('ParticleSystem')
@executeInEditMode(true)

export class ParticleSystem extends Component {
    // ─── 容量 ───
    @property capacity = 100;

    // ─── 发射 ───
    @property rateOverTime = 10;
    @property duration = -1;        // -1 = 无限循环
    @property loop = true;
    @property playOnAwake = true;

    // ─── 初始值 ───
    @property startSpeed = 1;
    @property startSize = 1;
    @property startLifetime = 1;
    @property startColor = new Color(255, 255, 255, 255);

    // ─── 形状 ───
    @property shape: EmitShape = EmitShape.POINT;
    @property shapeRadius = 1;

    // ─── Modules ───
    @property({ type: SizeOvertimeModule })
    sizeOverLifetime: SizeOvertimeModule = new SizeOvertimeModule();
    @property({ type: ColorOvertimeModule })
    colorOverLifetime: ColorOvertimeModule = new ColorOvertimeModule();
    @property({ type: NoiseModule })
    noiseModule: NoiseModule = new NoiseModule();
    @property({ type: VelocityOvertimeModule })
    velocityOverLifetime: VelocityOvertimeModule = new VelocityOvertimeModule();
    @property({ type: ForceOvertimeModule })
    forceOverLifetime: ForceOvertimeModule = new ForceOvertimeModule();
    @property({ type: LimitVelocityOvertimeModule })
    limitVelOverLifetime: LimitVelocityOvertimeModule = new LimitVelocityOvertimeModule();
    @property({ type: RotationOvertimeModule })
    rotationOverLifetime: RotationOvertimeModule = new RotationOvertimeModule();
    @property({ type: CollisionModule })
    collisionModule: CollisionModule = new CollisionModule();

    // ─── 材质 ───
    @property({ type: [Material] })
    materials: Material[] = [];

    @property({ type: Mesh })
    particleMesh: Mesh | null = null;

    // ─── 内部状态 ───
    private _pool: Particle[] = [];
    private _elapsed = 0;
    private _emitAccum = 0;
    private _lastPos = new Vec3();
    private _hasLastPos = false;
    private _playing = false;
    private _stopped = false;

    // ─── 渲染 ───
    private _meshRenderer: MeshRenderer | null = null;
    private _mesh: Mesh | null = null;
    // 模板 mesh 数据（从 particleMesh 读取）
    private _tPos: Float32Array | null = null;
    private _tUv: Float32Array | null = null;
    private _tIdx: Uint16Array | null = null;
    private _tColor: Float32Array | null = null;
    private _tVerts = 0;
    private _tIdxCount = 0;
    // 模板 mesh 包围盒中心（用于以中心为基准缩放）
    private _tCenter = new Vec3();
    // 临时变量（避免每帧分配）
    private _quat = new Quat();
    private _offset = new Vec3();
    // 合并后的粒子缓冲
    private _posData: Float32Array | null = null;
    private _uvData: Float32Array | null = null;
    private _colData: Float32Array | null = null;
    private _idxData: Uint16Array | null = null;

    /** 活跃粒子数 */
    get aliveCount(): number {
        return this._pool.filter(p => p.alive).length;
    }

    onLoad() {
        this._initPool();
        this._initRenderer();
        this.collisionModule.refresh(this.node.scene,this.node);
        if (this.playOnAwake) this.play();
    }

    play() {
        this._playing = true;
        this._stopped = false;
        this._elapsed = 0;
        this._emitAccum = 0;
    }

    stop() {
        this._playing = false;
        this._stopped = true;
    }

    pause() {
        this._playing = false;
    }

    /** 手动产生 burst */
    burst(count: number) {
        for (let i = 0; i < count; i++) {
            this._emitOne();
        }
    }

    update(dt: number) {
        if (!this._playing) return;

this._elapsed += dt;

        // 时长检查
        if (this.duration > 0 && this._elapsed >= this.duration) {
            if (this.loop) {
                this._elapsed = 0;
            } else {
                this._playing = false;
                return;
            }
        }

        // 发射
        this._emitOverTime(dt);
        this._emitOverDistance();

        // 更新粒子
        this._updateParticles(dt);
        this._updateRenderer(dt);
    }

    // ─── 渲染 ───
    t=0
    private _initRenderer() {
        this._meshRenderer = this.node.getComponent(MeshRenderer);
        if (!this._meshRenderer) {
            this._meshRenderer = this.node.addComponent(MeshRenderer);
        }

        // 从 particleMesh 读取模板数据
        if (this.particleMesh) {
            const posAttr = this.particleMesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);
            if (posAttr) {
                this._tPos = posAttr instanceof Float32Array
                    ? posAttr : new Float32Array(posAttr);
                this._tVerts = this._tPos.length / 3;
                // 计算模板包围盒中心
                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                for (let i = 0; i < this._tVerts; i++) {
                    const ix = i * 3;
                    const x = this._tPos[ix], y = this._tPos[ix + 1], z = this._tPos[ix + 2];
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
                }
                this._tCenter.set(
                    (minX + maxX) / 2,
                    (minY + maxY) / 2,
                    (minZ + maxZ) / 2,
                );
            }
            const uvAttr = this.particleMesh.readAttribute(0, gfx.AttributeName.ATTR_TEX_COORD);
            if (uvAttr) {
                this._tUv = uvAttr instanceof Float32Array
                    ? uvAttr : new Float32Array(uvAttr);
            }
            const idxAttr = this.particleMesh.readIndices(0);
            if (idxAttr) {
                this._tIdx = idxAttr instanceof Uint16Array
                    ? idxAttr : new Uint16Array(idxAttr);
                this._tIdxCount = this._tIdx.length;
            }
            const colorAttr = this.particleMesh.readAttribute(0, gfx.AttributeName.ATTR_COLOR);
            if (colorAttr) {
                this._tColor = colorAttr instanceof Float32Array
                    ? colorAttr : new Float32Array(colorAttr);
            }else{
                this._tColor=new Float32Array([1,1,1,1]);
            }

            // 创建动态 Mesh
            const maxVerts = this._tVerts * this.capacity;
            const maxIdxs = this._tIdxCount * this.capacity;
            this._mesh=utils.MeshUtils.createDynamicMesh(0, {positions:this._tPos,
                                                        indices16:this._tIdx,
                                                        uvs:this._tUv,
                                                        colors:this._tColor
                                                        },  this._mesh, {
            maxSubMeshes: 1,
            maxSubMeshVertices: maxVerts,
            maxSubMeshIndices: maxIdxs
        });
            this._mesh.initialize();
            this._meshRenderer.material = this.materials[0];
            this._meshRenderer.mesh = this._mesh;
            
        }

        if (!this._tPos) {
            console.warn('[ParticleSystem] particleMesh 未设置或格式无效');
            return;
        }

        // 预分配 N 份模板数据的空间
        this._posData = new Float32Array(this.capacity * this._tVerts * 3);
        this._uvData = new Float32Array(this.capacity * this._tVerts * 2);
        this._colData = new Float32Array(this.capacity * this._tVerts * 4);
        this._idxData = new Uint16Array(this.capacity * this._tIdxCount);
    }

    private _updateRenderer(dt: number) {
        if (!this._meshRenderer || !this._mesh || !this._posData || !this._tPos) return;

        const pos = this._posData;
        const uv = this._uvData;
        const col = this._colData;
        const tidx = this._tIdx;
        const iv = this._tVerts;
        const ii = this._tIdxCount;

        let pi = 0; // particle index

        for (const p of this._pool) {
            if (!p.alive) continue;

            const s = p.size;
            const sx = p.position.x;
            const sy = p.position.y;
            const sz = p.position.z;
            const cx = this._tCenter.x;
            const cy = this._tCenter.y;
            const cz = this._tCenter.z;
            const rot = p.rotation;
            const hasRot = rot.x !== 0 || rot.y !== 0 || rot.z !== 0;
            if (hasRot) {
                Quat.fromEuler(this._quat, rot.x, rot.y, rot.z);
            }

            for (let v = 0; v < iv; v++) {
                const dstV = pi * iv + v;
                // offset = (template - center) × size
                this._offset.set(
                    (this._tPos[v * 3]     - cx) * s.x,
                    (this._tPos[v * 3 + 1] - cy) * s.y,
                    (this._tPos[v * 3 + 2] - cz) * s.z,
                );
                if (hasRot) {
                    Vec3.transformQuat(this._offset, this._offset, this._quat);
                }
                // position: offset + 粒子位置
                pos[dstV * 3]     = this._offset.x + sx;
                pos[dstV * 3 + 1] = this._offset.y + sy;
                pos[dstV * 3 + 2] = this._offset.z + sz;
                // uv：直接复制
                uv[dstV * 2]     = this._tUv[v * 2];
                uv[dstV * 2 + 1] = this._tUv[v * 2 + 1];
                // color
                col[dstV * 4]     = p.color4.x;
                col[dstV * 4 + 1] = p.color4.y;
                col[dstV * 4 + 2] = p.color4.z;
                col[dstV * 4 + 3] = p.color4.w;
            }
            // index：每个粒子的索引偏移 = pi × iv
            const idxBase = pi * ii;
            const vBase = pi * iv;
            for (let i = 0; i < ii; i++) {
                this._idxData[idxBase + i] = tidx[i] + vBase;
            }
            pi++;
        }

        if (pi === 0) return;

        const vertCount = pi * iv;
        const idxCount = pi * ii;
        this._mesh.updateSubMesh(0, {
            positions: new Float32Array(pos.buffer, 0, vertCount * 3),
            indices16: new Uint16Array(this._idxData.buffer, 0, idxCount),
            uvs: new Float32Array(uv.buffer, 0, vertCount * 2),
            colors: new Float32Array(col.buffer, 0, vertCount * 4),
        })
        this._meshRenderer.onGeometryChanged();
    }

    // ─── 私有 ───

    private _initPool() {
        for (let i = 0; i < this.capacity; i++) {
            this._pool.push(new Particle());
        }
    }

    private _getInactive(): Particle | null {
        for (const p of this._pool) {
            if (!p.alive) return p;
        }
        return null;
    }

    private _emitOne() {
        const p = this._getInactive();
        if (!p) return;

        p.alive = true;
        p.age = 0;
        p.lifetime = this.startLifetime;
        p.size.set(this.startSize, this.startSize, this.startSize);
        p.rotation.set(0, 0, 0);

        // 从发射形状生成初始位置
        p.position.set(0, 0, 0);
        this._emitPosition(p.position);
        p.rootWorldPos.set(this.node.worldPosition);
        p.rootWorldRot.set(this.node.worldRotation);
        p.rootWorldMat.set(this.node.worldMatrix);
        p.group = this.collisionModule.collisionLayer;

        // 速度方向随机
        const dir = new Vec3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5,
        );
        dir.normalize();
        p.velocity.set(dir.x * this.startSpeed, dir.y * this.startSpeed, dir.z * this.startSpeed);

        // // 颜色 RGBA
        p.color4.set(
            this.startColor.r / 255,
            this.startColor.g / 255,
            this.startColor.b / 255,
            this.startColor.a / 255,
        );
    }

    private _emitPosition(out: Vec3) {
        switch (this.shape) {
            case EmitShape.POINT:
                out.set(0, 0, 0);
                break;
            case EmitShape.BOX:
                out.set(
                    (Math.random() - 0.5) * this.shapeRadius * 2,
                    (Math.random() - 0.5) * this.shapeRadius * 2,
                    (Math.random() - 0.5) * this.shapeRadius * 2,
                );
                break;
            case EmitShape.SPHERE: {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const r = this.shapeRadius * Math.cbrt(Math.random());
                out.set(
                    r * Math.sin(phi) * Math.cos(theta),
                    r * Math.sin(phi) * Math.sin(theta),
                    r * Math.cos(phi),
                );
                break;
            }
            case EmitShape.CIRCLE: {
                const angle = Math.random() * Math.PI * 2;
                const r = this.shapeRadius * Math.sqrt(Math.random());
                out.set(r * Math.cos(angle), 0, r * Math.sin(angle));
                break;
            }
        }
    }

    private _emitOverTime(dt: number) {
        this._emitAccum += this.rateOverTime * dt;
        while (this._emitAccum >= 1) {
            this._emitOne();
            this._emitAccum -= 1;
        }
    }

    private _emitOverDistance() {
        const worldPos = this.node.worldPosition;
        if (!this._hasLastPos) {
            this._lastPos.set(worldPos);
            this._hasLastPos = true;
            return;
        }
        const dist = Vec3.distance(worldPos, this._lastPos);
        this._lastPos.set(worldPos);
        if (dist < 0.001) return;

        // 没有 rateOverDistance 配置，暂用固定 10/dist
        const count = Math.floor(dist * 10);
        for (let i = 0; i < count; i++) {
            this._emitOne();
        }
    }

    private _updateParticles(dt: number) {
        const sizeMod = this.sizeOverLifetime.enable ? this.sizeOverLifetime : null;
        const colorMod = this.colorOverLifetime.enable ? this.colorOverLifetime : null;
        const noiseMod = this.noiseModule.enable ? this.noiseModule : null;
        const velMod = this.velocityOverLifetime.enable ? this.velocityOverLifetime : null;
        const forceMod = this.forceOverLifetime.enable ? this.forceOverLifetime : null;
        const limitMod = this.limitVelOverLifetime.enable ? this.limitVelOverLifetime : null;
        const rotMod = this.rotationOverLifetime.enable ? this.rotationOverLifetime : null;
        const colMod = this.collisionModule.enable ? this.collisionModule : null;
        
        for (const p of this._pool) {
            if (!p.alive) continue;

            p.age += dt;

            // 寿命结束
            if (p.age >= p.lifetime) {
                p.alive = false;
                continue;
            }

            // 位置更新
            p.position.x += p.velocity.x * dt;
            p.position.y += p.velocity.y * dt;
            p.position.z += p.velocity.z * dt;

            // 模块
            sizeMod?.apply(p);
            colorMod?.apply(p);
            velMod?.apply(p);
            forceMod?.apply(p, dt);
            limitMod?.apply(p);
            rotMod?.apply(p);
            noiseMod?.apply(p, dt);
            // 出生帧跳过碰撞，让粒子先出现在节点位置
            if (p.age > dt + 0.0001) {
                colMod?.apply(p);
            }
        }
    }
}


