import { _decorator, Vec3, Enum } from 'cc';
const { ccclass, property, executeInEditMode } = _decorator;
export const TangentMode = Enum({
    Mirrored: 0,   // 两侧长度相等，方向相反
    Aligned: 1,    // 两侧共线但长度独立
    Broken: 2,     // 完全独立
});
@ccclass('BezierKnot')
export class BezierKnot {
    @property
    position: Vec3 = new Vec3();
    @property
    inTangent: Vec3 = new Vec3();
    @property
    outTangent: Vec3 = new Vec3();
    @property({ type: TangentMode })
    mode = TangentMode.Mirrored;

    constructor(pos?: Vec3, inTan?: Vec3, outTan?: Vec3, mode?: number) {
        if (pos) this.position = pos.clone();
        if (inTan) this.inTangent = inTan.clone();
        const hasOutTan = !!outTan;
        if (outTan) this.outTangent = outTan.clone();
        if (mode !== undefined) this.mode = mode;
        // 只在未显式传入 outTangent 时自动同步（Mirrored 由 inTan 推导）
        if (!hasOutTan) this.syncTangents();
    }

    // 设置入切线并同步
    setInTangent(value: Vec3) {
        this.inTangent.set(value);
        this.syncFromIn();
    }

    // 设置出切线并同步
    setOutTangent(value: Vec3) {
        this.outTangent.set(value);
        this.syncFromOut();
    }

    // 根据 mode 同步另一个切线
    private syncTangents() {
        if (this.mode === TangentMode.Mirrored) {
            this.outTangent.set(this.inTangent).multiplyScalar(-1);
        } else if (this.mode === TangentMode.Aligned) {
            // 保持方向共线，长度独立（需要知道长度比？这里简单保持各自长度）
            // 实际只确保方向相反，长度不变
            const inLen = this.inTangent.length();
            const outLen = this.outTangent.length();
            if (inLen > 0.0001 && outLen > 0.0001) {
                const dir = new Vec3(this.inTangent).normalize().multiplyScalar(-1);
                this.outTangent.set(dir.multiplyScalar(outLen));
            }
        }
        // Broken 模式不做同步
    }

    private syncFromIn() {
        if (this.mode === TangentMode.Mirrored) {
            this.outTangent.set(this.inTangent).multiplyScalar(-1);
        } else if (this.mode === TangentMode.Aligned) {
            const outLen = this.outTangent.length();
            const dir = new Vec3(this.inTangent).normalize().multiplyScalar(-1);
            this.outTangent.set(dir.multiplyScalar(outLen));
        }
    }

    private syncFromOut() {
        if (this.mode === TangentMode.Mirrored) {
            this.inTangent.set(this.outTangent).multiplyScalar(-1);
        } else if (this.mode === TangentMode.Aligned) {
            const inLen = this.inTangent.length();
            const dir = new Vec3(this.outTangent).normalize().multiplyScalar(-1);
            this.inTangent.set(dir.multiplyScalar(inLen));
        }
    }
}

