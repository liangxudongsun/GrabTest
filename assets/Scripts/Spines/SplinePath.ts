import { _decorator, Component, Vec3, CCInteger, CCFloat, Enum } from 'cc';
import { Splines } from './Splines';
import { BezierKnot, TangentMode } from './BezierKnot';

const { ccclass, property, executeInEditMode } = _decorator;

enum CurveType {
    Linear = 0,
    CatmullRom = 1,
    Bezier = 2,
}

enum SamplingMode {
    TotalCount = 0,
    PerSegment = 1,
    AutoDensity = 2,
}

@ccclass('SplinePath')
@executeInEditMode(true)
export class SplinePath extends Component {
    // ──── 曲线控制 ────
    @property({ type: [BezierKnot] })
    knots: BezierKnot[] = [
        new BezierKnot(new Vec3(0, 0, 0), new Vec3(-0.5, 0, 0), new Vec3(0.5, 0, 0)),
        new BezierKnot(new Vec3(3, 0, 0), new Vec3(-0.5, 0, 0), new Vec3(0.5, 0, 0)),
        new BezierKnot(new Vec3(6, 0, 0), new Vec3(-0.5, 0, 0), new Vec3(0.5, 0, 0)),
    ];

    @property({ type: Enum(CurveType) })
    curveType: CurveType = CurveType.Bezier;

    @property({ type: Enum(SamplingMode) })
    samplingMode: SamplingMode = SamplingMode.TotalCount;

    @property({ type: CCInteger, visible() { return this.samplingMode === SamplingMode.TotalCount; } })
    totalSampleCount: number = 50;

    @property({ type: CCInteger, visible() { return this.samplingMode === SamplingMode.PerSegment; } })
    segmentsPerCurve: number = 20;

    @property({ type: CCFloat, visible() { return this.samplingMode === SamplingMode.AutoDensity; } })
    pointsPerUnit: number = 4;

    @property({ type: Splines })
    splines: Splines | null = null;

    // 采样后的点集
    private _sampledPoints: Vec3[] = [];

    onLoad() {
        if (!this.splines) {
            this.splines = this.getComponent(Splines);
        }
        this.updatePath();
    }

    /**
     * 主更新函数：重新计算曲线并传给 Splines 组件
     */
    updatePath() {
        if (!this.splines || this.knots.length < 2) return;

        this._sampledPoints = [];
        switch (this.curveType) {
            case CurveType.Bezier:
                this.sampleBezier();
                break;
            case CurveType.CatmullRom:
                this.sampleCatmullRom();
                break;
            default:
                this.sampleLinear();
                break;
        }

        this.splines.points = this._sampledPoints;
        //this.splines.refresh();
    }

    // 根据采样模式计算每一段（相邻 knot 之间）的采样次数
    private getSegmentStepCounts(): number[] {
        const totalSegs = this.knots.length - 1;
        if (this.samplingMode === SamplingMode.PerSegment) {
            return new Array(totalSegs).fill(this.segmentsPerCurve);
        }
        if (this.samplingMode === SamplingMode.TotalCount) {
            const total = Math.max(2, this.totalSampleCount);
            const base = Math.floor(total / totalSegs);
            const rem = total % totalSegs;
            return Array.from({ length: totalSegs }, (_, i) => (i < rem ? base + 1 : base));
        }
        // AutoDensity：估算曲线总长度，按密度分配
        const estLen = this.estimateCurveLength();
        const targetTotal = Math.max(2, Math.ceil(estLen * this.pointsPerUnit));
        const base = Math.floor(targetTotal / totalSegs);
        const rem = targetTotal % totalSegs;
        return Array.from({ length: totalSegs }, (_, i) => (i < rem ? base + 1 : base));
    }

    // 粗略估计曲线总长度（通过大量采样）
    private estimateCurveLength(): number {
        const dense = this.evaluateAtDensity(200);
        let len = 0;
        for (let i = 1; i < dense.length; i++) {
            len += Vec3.distance(dense[i - 1], dense[i]);
        }
        return len;
    }

    // 以固定总点数临时评估曲线（不存入 _sampledPoints）
    private evaluateAtDensity(totalPoints: number): Vec3[] {
        if (this.curveType === CurveType.Linear) {
            return this.sampleLinearInternal(totalPoints);
        } else if (this.curveType === CurveType.CatmullRom) {
            return this.sampleCatmullRomInternal(totalPoints);
        } else {
            return this.sampleBezierInternal(totalPoints);
        }
    }

    // 各采样方法（支持指定总点数）
    private sampleBezier(totalOverride?: number) {
        const total = totalOverride ?? this.getTotalFromMode();
        this._sampledPoints = this.sampleBezierInternal(total);
    }

    private sampleCatmullRom(totalOverride?: number) {
        const total = totalOverride ?? this.getTotalFromMode();
        this._sampledPoints = this.sampleCatmullRomInternal(total);
    }

    private sampleLinear(totalOverride?: number) {
        const total = totalOverride ?? this.getTotalFromMode();
        this._sampledPoints = this.sampleLinearInternal(total);
    }

    private getTotalFromMode(): number {
        const segSteps = this.getSegmentStepCounts();
        // 总采样点数 = sum(segSteps) + 1（最后一个点不会被跳过）
        return segSteps.reduce((a, b) => a + b, 0) + 1;
    }

    // 内部实现：线性
    private sampleLinearInternal(totalPoints: number): Vec3[] {
        const result: Vec3[] = [];
        const pts = this.knots.map(k => k.position);
        const segCount = pts.length - 1;
        if (segCount < 1) return result;
        const segSteps = this.distributeSteps(totalPoints, segCount);

        for (let i = 0; i < segCount; i++) {
            const p0 = pts[i], p1 = pts[i + 1];
            const steps = segSteps[i];
            for (let j = 0; j <= steps; j++) {
                const t = j / steps;
                result.push(new Vec3(
                    p0.x + (p1.x - p0.x) * t,
                    p0.y + (p1.y - p0.y) * t,
                    p0.z + (p1.z - p0.z) * t
                ));
                if (j === steps && i < segCount - 1) result.pop(); // 避免重复点
            }
        }
        return result;
    }

    // 内部实现：CatmullRom
    private sampleCatmullRomInternal(totalPoints: number): Vec3[] {
        const result: Vec3[] = [];
        const pts = this.knots.map(k => k.position);
        if (pts.length < 2) return result;
        if (pts.length < 4) return this.sampleLinearInternal(totalPoints); // 回退线性

        const ext = [pts[0].clone(), ...pts, pts[pts.length - 1].clone()];
        const segCount = ext.length - 3;
        const segSteps = this.distributeSteps(totalPoints, segCount);

        for (let i = 1; i < ext.length - 2; i++) {
            const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
            const steps = segSteps[i - 1];
            for (let j = 0; j <= steps; j++) {
                const t = j / steps;
                const t2 = t * t, t3 = t2 * t;
                const x = 0.5 * (2 * p1.x +
                    (-p0.x + p2.x) * t +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
                const y = 0.5 * (2 * p1.y +
                    (-p0.y + p2.y) * t +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
                const z = 0.5 * (2 * p1.z +
                    (-p0.z + p2.z) * t +
                    (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
                    (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
                result.push(new Vec3(x, y, z));
                if (j === steps && i < ext.length - 3) result.pop();
            }
        }
        return result;
    }

    // 内部实现：贝塞尔曲线（三次贝塞尔）
    private sampleBezierInternal(totalPoints: number): Vec3[] {
        const result: Vec3[] = [];
        const kts = this.knots;
        if (kts.length < 2) return result;
        const segCount = kts.length - 1;
        const segSteps = this.distributeSteps(totalPoints, segCount);

        for (let i = 0; i < segCount; i++) {
            const k0 = kts[i], k1 = kts[i + 1];
            const P0 = k0.position;
            const P1 = k0.position.clone().add(k0.outTangent);
            const P2 = k1.position.clone().add(k1.inTangent);
            const P3 = k1.position;
            const steps = segSteps[i];

            for (let j = 0; j <= steps; j++) {
                const t = j / steps;
                const u = 1 - t;
                const uu = u * u, uuu = uu * u;
                const tt = t * t, ttt = tt * t;
                const x = uuu * P0.x + 3 * uu * t * P1.x + 3 * u * tt * P2.x + ttt * P3.x;
                const y = uuu * P0.y + 3 * uu * t * P1.y + 3 * u * tt * P2.y + ttt * P3.y;
                const z = uuu * P0.z + 3 * uu * t * P1.z + 3 * u * tt * P2.z + ttt * P3.z;
                result.push(new Vec3(x, y, z));
                if (j === steps && i < segCount - 1) result.pop();
            }
        }
        return result;
    }

    // 根据总点数均匀分配到各段
    private distributeSteps(totalPoints: number, segCount: number): number[] {
        totalPoints = Math.max(2, totalPoints);
        // 每段至少分配 1 步（即 2 个端点）
        const minTotalSteps = segCount;
        if (totalPoints < segCount + 1) {
            // 点数少于段数+1，每段只给 1 步（0 步会导致无法生成点，这里用 1 步）
            return new Array(segCount).fill(1);
        }
        const baseSteps = Math.floor((totalPoints - 1) / segCount);
        const rem = (totalPoints - 1) % segCount;
        return Array.from({ length: segCount }, (_, i) =>
            i < rem ? baseSteps + 1 : baseSteps
        );
    }

    update() {
        this.updatePath();
    }
}