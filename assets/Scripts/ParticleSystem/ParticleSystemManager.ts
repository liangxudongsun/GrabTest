import { Vec3, director, DirectorEvent } from 'cc';
import { Particle } from './ParticleData';
import { ParticleCollider } from '../ParticleCollider';

/** ParticleSystem 暴露给管理器的接口（避免循环依赖） */
export interface IParticleSystem {
    getAliveParticles(): Particle[];
    onParticleCollision?: (p1: Particle, p2: Particle, worldPos: Vec3) => void;
    onParticleHitCollider?: (p: Particle, collider: ParticleCollider, worldPos: Vec3) => void;
    enableParticleCollision: boolean;
    enableParticleBounce: boolean;
    particleBounce: number;
}

/** 粒子系统管理器 —— 收集粒子系统 + 跨系统粒子间碰撞检测 */
export class ParticleSystemManager {
    private static _instance: ParticleSystemManager;
    static get instance(): ParticleSystemManager {
        if (!this._instance) {
            this._instance = new ParticleSystemManager();
            this._instance._initCollisionHook();
        }
        return this._instance;
    }

    // ── 碰撞半径倍率（全局）──
    particleRadiusScale = 0.5;

    // ── 注册数据 ──
    private _systems: IParticleSystem[] = [];
    private _colliders: ParticleCollider[] = [];

    // ── 注册 / 注销 ──

    registerSystem(sys: IParticleSystem) {
        if (!this._systems.includes(sys)) this._systems.push(sys);
    }

    unregisterSystem(sys: IParticleSystem) {
        const idx = this._systems.indexOf(sys);
        if (idx >= 0) this._systems.splice(idx, 1);
    }

    get systems(): readonly IParticleSystem[] { return this._systems; }

    registerCollider(c: ParticleCollider) {
        if (!this._colliders.includes(c)) this._colliders.push(c);
    }

    unregisterCollider(c: ParticleCollider) {
        const idx = this._colliders.indexOf(c);
        if (idx >= 0) this._colliders.splice(idx, 1);
    }

    /** 收集所有系统的活跃粒子及所属系统 */
    getAllParticleData(): { particle: Particle; system: IParticleSystem }[] {
        const out: { particle: Particle; system: IParticleSystem }[] = [];
        for (let si = 0; si < this._systems.length; si++) {
            const sys = this._systems[si];
            const particles = sys.getAliveParticles();
            for (let pi = 0; pi < particles.length; pi++) {
                out.push({ particle: particles[pi], system: sys });
            }
        }
        return out;
    }

    // ── 跨系统粒子间碰撞（每帧 AFTER_UPDATE 时自动执行）──

    private _grid = new SpatialGrid(20);

    private _initCollisionHook() {
        director.on(DirectorEvent.AFTER_UPDATE, () => {
            this._resolveParticleParticle();
        });
    }

    private _resolveParticleParticle() {
        // 检查是否有系统启用了粒子间碰撞
        let anyEnabled = false;
        for (let si = 0; si < this._systems.length; si++) {
            if (this._systems[si].enableParticleCollision) { anyEnabled = true; break; }
        }
        if (!anyEnabled) return;

        const data = this.getAllParticleData();
        if (data.length < 2) return;

        // 1. 构建空间哈希
        const grid = this._grid;
        grid.clear();
        const wps: Vec3[] = [];
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            const w = d.particle.getWorldPos();
            wps[i] = new Vec3(w.x, w.y, w.z);
            grid.insert(d.particle, w.x, w.y, w.z);
        }

        const radiusScale = this.particleRadiusScale;

        // 预先计算每个粒子的碰撞半径，并找出最大值（用于查询范围）
        const rs: number[] = [];
        let maxR = 0;
        for (let i = 0; i < data.length; i++) {
            const r = Math.max(data[i].particle.size.x, data[i].particle.size.y, data[i].particle.size.z) * radiusScale;
            rs[i] = r;
            if (r > maxR) maxR = r;
        }
       

        // 2. 碰撞检测
        for (let i = 0; i < data.length; i++) {
            const a = data[i];
            const aw = wps[i];
            const rA = rs[i];
            // 查询范围需覆盖 rA + maxR（最大可能的碰撞距离）
            const candidates = grid.query(aw.x, aw.y, aw.z, rA + maxR);

            for (let ci = 0; ci < candidates.length; ci++) {
                const pb = candidates[ci];
                if (pb === a.particle || !pb.alive) continue;

                // 从 i+1 开始找，避免重复对
                let b: typeof a | null = null;
                let bIdx = -1;
                for (let j = i + 1; j < data.length; j++) {
                    if (data[j].particle === pb) { b = data[j]; bIdx = j; break; }
                }
                if (!b) continue;

                const bw = wps[bIdx];
                const rB = rs[bIdx];
                const dx = aw.x - bw.x, dy = aw.y - bw.y, dz = aw.z - bw.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                const minDist = rA + rB;
                if (distSq >= minDist * minDist || distSq < 0.0001) continue;

                const dist = Math.sqrt(distSq);
                const nx = dx / dist, ny = dy / dist, nz = dz / dist;

                const relVn = (a.particle.velocity.x - b.particle.velocity.x) * nx
                            + (a.particle.velocity.y - b.particle.velocity.y) * ny
                            + (a.particle.velocity.z - b.particle.velocity.z) * nz;
                if (relVn >= 0) continue;

                // 按质量分配冲量（轻的弹飞更远，重的几乎不动）
                const mA = Math.max(a.particle.mass, 0.001);
                const mB = Math.max(b.particle.mass, 0.001);
                if (a.system.enableParticleBounce) {
                    const j = -(1 + a.system.particleBounce) * relVn / (1 / mA + 1 / mB);
                    a.particle.velocity.x += (j / mA) * nx;
                    a.particle.velocity.y += (j / mA) * ny;
                    a.particle.velocity.z += (j / mA) * nz;
                    b.particle.velocity.x -= (j / mB) * nx;
                    b.particle.velocity.y -= (j / mB) * ny;
                    b.particle.velocity.z -= (j / mB) * nz;
                }

                // 回调
                const hpX = (aw.x + bw.x) * 0.5, hpY = (aw.y + bw.y) * 0.5, hpZ = (aw.z + bw.z) * 0.5;
                const hp = new Vec3(hpX, hpY, hpZ);
                a.system.onParticleCollision?.(a.particle, b.particle, hp);
                b.system.onParticleCollision?.(b.particle, a.particle, hp);
            }
        }
    }
}

/** 空间哈希网格 */
class SpatialGrid {
    private _cellSize: number;
    private _cells = new Map<number, Particle[]>();

    constructor(cellSize: number) { this._cellSize = cellSize; }

    clear() { this._cells.clear(); }

    private _key(cx: number, cy: number, cz: number): number {
        return (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791);
    }

    insert(p: Particle, wx: number, wy: number, wz: number) {
        const cx = Math.floor(wx / this._cellSize);
        const cy = Math.floor(wy / this._cellSize);
        const cz = Math.floor(wz / this._cellSize);
        const k = this._key(cx, cy, cz);
        let cell = this._cells.get(k);
        if (!cell) { cell = []; this._cells.set(k, cell); }
        cell.push(p);
    }

    query(wx: number, wy: number, wz: number, radius: number): Particle[] {
        const result: Particle[] = [];
        const minCx = Math.floor((wx - radius) / this._cellSize);
        const maxCx = Math.floor((wx + radius) / this._cellSize);
        const minCy = Math.floor((wy - radius) / this._cellSize);
        const maxCy = Math.floor((wy + radius) / this._cellSize);
        const minCz = Math.floor((wz - radius) / this._cellSize);
        const maxCz = Math.floor((wz + radius) / this._cellSize);

        for (let cx = minCx; cx <= maxCx; cx++) {
            for (let cy = minCy; cy <= maxCy; cy++) {
                for (let cz = minCz; cz <= maxCz; cz++) {
                    const k = this._key(cx, cy, cz);
                    const cell = this._cells.get(k);
                    if (cell) {
                        for (let i = 0; i < cell.length; i++) result.push(cell[i]);
                    }
                }
            }
        }
        return result;
    }
}
