import { _decorator, Enum, Vec3 } from 'cc';
import { BezierKnot } from './BezierKnot';

export enum CurveType { Linear, CatmullRom, Bezier }
export enum SamplingMode { TotalCount, PerSegment, AutoDensity }
const { ccclass, property } = _decorator;
/** 曲线采样器 - 非组件，由 Splines 直接使用 */
@ccclass('SplinePath')
export class SplinePath {
    @property({ type: Enum(CurveType) }) curveType: CurveType = CurveType.Bezier;
    @property({ type: Enum(SamplingMode) }) samplingMode: SamplingMode = SamplingMode.TotalCount;
    @property totalSampleCount = 50;
    @property segmentsPerCurve = 20;
    @property pointsPerUnit = 4;
   

    /** 采样：knots → points */
    sample(knots: BezierKnot[]): Vec3[] {
        if (knots.length < 2) return knots.map(k => k.position.clone());

        switch (this.curveType) {
            case CurveType.Bezier:     return this._sampleBezier(knots);
            case CurveType.CatmullRom: return this._sampleCatmullRom(knots);
            default:                   return this._sampleLinear(knots);
        }
    }

    // ─── 采样入口 ───

    private _sampleLinear(knots: BezierKnot[]): Vec3[] {
        const total = this._getTotal(knots.length);
        return this._linear(knots.map(k => k.position), total);
    }

    private _sampleCatmullRom(knots: BezierKnot[]): Vec3[] {
        const pts = knots.map(k => k.position);
        if (pts.length < 4) return this._sampleLinear(knots);
        const total = this._getTotal(pts.length);
        const ext = [pts[0].clone(), ...pts, pts[pts.length - 1].clone()];
        return this._catmullRom(ext, total);
    }

    private _sampleBezier(knots: BezierKnot[]): Vec3[] {
        const total = this._getTotal(knots.length);
        return this._bezier(knots, total);
    }

    // ─── 总点数计算 ───

    private _getTotal(segCount: number): number {
        const segSteps = this._steps(segCount);
        return segSteps.reduce((a, b) => a + b, 0) + 1;
    }

    private _steps(segCount: number): number[] {
        if (this.samplingMode === SamplingMode.PerSegment) return new Array(segCount).fill(this.segmentsPerCurve);
        const total = this.samplingMode === SamplingMode.TotalCount ? this.totalSampleCount : Math.max(2, Math.ceil(this._estimateLen() * this.pointsPerUnit));
        return this._distribute(total, segCount);
    }

    private _estimateLen(): number {
        // 用 200 点粗略估计
        const dummy = [new Vec3(0,0,0), new Vec3(1,0,0), new Vec3(2,0,0), new Vec3(3,0,0)];
        const pts = this._bezier(dummy.map(p => new BezierKnot(p, new Vec3(-0.5,0,0), new Vec3(0.5,0,0))), 200);
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Vec3.distance(pts[i - 1], pts[i]);
        return len || 100;
    }

    // ─── 内部算法 ───

    private _distribute(total: number, segCount: number): number[] {
        total = Math.max(2, total);
        if (total < segCount + 1) return new Array(segCount).fill(1);
        const base = Math.floor((total - 1) / segCount);
        const rem = (total - 1) % segCount;
        return Array.from({ length: segCount }, (_, i) => (i < rem ? base + 1 : base));
    }

    private _linear(pts: Vec3[], total: number): Vec3[] {
        const result: Vec3[] = [];
        const segCount = pts.length - 1;
        if (segCount < 1) return result;
        const steps = this._distribute(total, segCount);
        for (let i = 0; i < segCount; i++) {
            const p0 = pts[i], p1 = pts[i + 1];
            const s = steps[i];
            for (let j = 0; j <= s; j++) {
                const t = j / s;
                result.push(new Vec3(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, p0.z + (p1.z - p0.z) * t));
                if (j === s && i < segCount - 1) result.pop();
            }
        }
        return result;
    }

    private _catmullRom(ext: Vec3[], total: number): Vec3[] {
        const result: Vec3[] = [];
        const segCount = ext.length - 3;
        const steps = this._distribute(total, segCount);
        for (let i = 1; i < ext.length - 2; i++) {
            const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
            const s = steps[i - 1];
            for (let j = 0; j <= s; j++) {
                const t = j / s, t2 = t * t, t3 = t2 * t;
                const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
                const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
                const z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
                result.push(new Vec3(x, y, z));
                if (j === s && i < ext.length - 3) result.pop();
            }
        }
        return result;
    }

    private _bezier(knots: BezierKnot[], total: number): Vec3[] {
        const result: Vec3[] = [];
        const segCount = knots.length - 1;
        if (segCount < 1) return result;
        const steps = this._distribute(total, segCount);
        for (let i = 0; i < segCount; i++) {
            const k0 = knots[i], k1 = knots[i + 1];
            const P0 = k0.position, P1 = new Vec3(k0.position).add(k0.outTangent);
            const P2 = new Vec3(k1.position).add(k1.inTangent), P3 = k1.position;
            const s = steps[i];
            for (let j = 0; j <= s; j++) {
                const t = j / s, u = 1 - t;
                const uu = u * u, uuu = uu * u, tt = t * t, ttt = tt * t;
                const x = uuu * P0.x + 3 * uu * t * P1.x + 3 * u * tt * P2.x + ttt * P3.x;
                const y = uuu * P0.y + 3 * uu * t * P1.y + 3 * u * tt * P2.y + ttt * P3.y;
                const z = uuu * P0.z + 3 * uu * t * P1.z + 3 * u * tt * P2.z + ttt * P3.z;
                result.push(new Vec3(x, y, z));
                if (j === s && i < segCount - 1) result.pop();
            }
        }
        return result;
    }
}
