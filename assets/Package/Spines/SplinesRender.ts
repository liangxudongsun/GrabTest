import { Vec3, Vec2, MeshRenderer, Mesh, utils } from 'cc';
import { ISplines } from './ISplines';

/** 样条渲染器 - 非组件类，封装 mesh 构建 */
export class SplinesRender {
    private _mr: MeshRenderer;
    private _mesh: Mesh;
    private _pos: Float32Array;
    private _idx: Uint16Array;
    private _uv: Float32Array;
    private _col: Float32Array;

    constructor(private _sp: ISplines) {
        this._mr = _sp.node.getComponent(MeshRenderer)!;
        if (!this._mr) this._mr = _sp.node.addComponent(MeshRenderer);

        const bq = (_sp.capacity - 1) * 12;
        const cq = _sp.capacity * (18 + 12);
        const total = bq + cq;

        this._pos = new Float32Array(total * 12);
        this._idx = new Uint16Array(total * 6);
        this._uv = new Float32Array(total * 8);
        this._col = new Float32Array(total * 16);

        this._mesh = utils.MeshUtils.createDynamicMesh(0, {
            positions: this._pos, indices16: this._idx, uvs: this._uv, colors: this._col,
        }, undefined, {
            maxSubMeshes: 3,
            maxSubMeshVertices: this._pos.length,
            maxSubMeshIndices: this._idx.length,
        });
        this._mesh.initialize();
        this._mr.materials = _sp.materials;
        this._mr.mesh = this._mesh;
    }

    get meshRenderer() { return this._mr; }

    /** 每帧更新 mesh 数据 */
    render() {
        const sp = this._sp;
        const pts = sp.points;
        const segs = pts.length - 1;

        // ──────── Phase 1: 样条体 ────────
        let iv = 0, iu = 0, ic = 0, ii = 0, vo = 0;

        for (let i = 0; i < segs; i++) {
            const d = this._box(pts[i], pts[i + 1], sp.boxWidth, sp.boxHeight);
            for (let p = 0; p < 6; p++) {
                if ((p === 0 && i > 0) || (p === 1 && i < segs - 1)) continue;
                for (let v = 0; v < 4; v++) {
                    const vt = d.pos[d.idx[p][v]];
                    this._pos[iv++] = vt.x; this._pos[iv++] = vt.y; this._pos[iv++] = vt.z;
                    this._uv[iu++] = d.uv[v].x; this._uv[iu++] = d.uv[v].y;
                    if (i % 2 === 0) {
                        this._col[ic++] = sp.boxColor.r / 255;
                        this._col[ic++] = sp.boxColor.g / 255;
                        this._col[ic++] = sp.boxColor.b / 255;
                        this._col[ic++] = sp.boxColor.a / 255;
                    } else {
                        this._col[ic++] = 0; this._col[ic++] = 0;
                        this._col[ic++] = 0; this._col[ic++] = 1;
                    }
                }
                this._idx[ii++] = vo;   this._idx[ii++] = vo + 1;
                this._idx[ii++] = vo + 2; this._idx[ii++] = vo + 2;
                this._idx[ii++] = vo + 1; this._idx[ii++] = vo + 3;
                vo += 4;
            }
        }

        this._mesh.updateSubMesh(0, {
            positions: new Float32Array(this._pos.buffer, 0, iv),
            indices16: new Uint16Array(this._idx.buffer, 0, ii),
            uvs:       new Float32Array(this._uv.buffer, 0, iu),
            colors:    new Float32Array(this._col.buffer, 0, ic),
        });

        // ──────── Phase 2: 坐标轴 ────────
        const aIv = iv, aIu = iu, aIc = ic, aIi = ii;
        const s = { iv: aIv, iu: aIu, ic: aIc, ii: aIi, vo: 0 };
        const wd = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)];

        if (sp.showAxes) {
            const sl = sp.axisShaftLen, hl = sp.axisHeadLen, tl = sl + hl;
            const sw = sp.axisShaftWidth, hw = sp.axisHeadWidth;

            for (let i = 0; i < segs; i++) {
                const ctr = new Vec3();
                Vec3.add(ctr, pts[i], pts[i + 1]).multiplyScalar(0.5);

                const dir = new Vec3();
                Vec3.subtract(dir, pts[i + 1], pts[i]).normalize();

                const r2 = new Vec3();
                Vec3.cross(r2, dir, new Vec3(0, 1, 0));
                if (r2.lengthSqr() < 0.0001) Vec3.cross(r2, dir, new Vec3(1, 0, 0));
                r2.normalize();

                const u2 = new Vec3();
                Vec3.cross(u2, r2, dir).normalize();

                const axs = [r2, u2, dir];
                const clr = [[1, 0, 0, 1], [0, 1, 0, 1], [0, 0, 1, 1]];

                for (let a = 0; a < 3; a++) {
                    const ax = axs[a];
                    const [cr, cg, cb, ca] = clr[a];
                    this._cyl(ax, ctr.x, ctr.y, ctr.z, sl, tl, sw, hw, cr, cg, cb, ca, s);
                }
            }
        }

        const ski = sp.selectedKnotIdx;
        if (ski >= 0 && ski < sp.knots.length) {
            const cp = sp.knots[ski].position;
            const sl = sp.cpAxisShaftLen, hl = sp.cpAxisHeadLen, tl = sl + hl;
            const sw = sp.cpAxisShaftWidth, hw = sp.cpAxisHeadWidth;

            for (let a = 0; a < 3; a++) {
                const ax = wd[a];
                const isH = (ski === sp.hover.hoverKnotIdx && a === sp.hover.hoverAxisIdx);
                const cr = isH ? 1 : (a === 0 ? 1 : 0);
                const cg = isH ? 1 : (a === 1 ? 1 : 0);
                const cb = isH ? 0 : (a === 2 ? 1 : 0);
                const ca = 1;
                this._cyl(ax, cp.x, cp.y, cp.z, sl, tl, sw, hw, cr, cg, cb, ca, s);
            }

            const ts = sp.cpTangentSize / sp.cpSize;
            const tsl = sl * ts, thl = hl * ts, ttl = tsl + thl;
            const tsw = sw * ts, thw = hw * ts;
            const to = [sp.knots[ski].inTangent, sp.knots[ski].outTangent];

            for (let ti = 0; ti < 2; ti++) {
                const o = to[ti];
                const tx = cp.x + o.x, ty = cp.y + o.y, tz = cp.z + o.z;

                for (let a = 0; a < 3; a++) {
                    const ax = wd[a];
                    const isH = (ski === sp.hover.hoverTanKnotIdx && ti === sp.hover.hoverTanDir && a === sp.hover.hoverTanAxis);
                    const cr = isH ? 1 : (a === 0 ? 1 : 0);
                    const cg = isH ? 1 : (a === 1 ? 1 : 0);
                    const cb = isH ? 0 : (a === 2 ? 1 : 0);
                    const ca = 1;
                    this._cyl(ax, tx, ty, tz, tsl, ttl, tsw, thw, cr, cg, cb, ca, s);
                }
            }
        }

        const af = s.iv - aIv;
        if (af > 0) {
            this._mesh.updateSubMesh(1, {
                positions: new Float32Array(this._pos.buffer, aIv * 4, af),
                indices16: new Uint16Array(this._idx.buffer, aIi * 2, s.ii - aIi),
                uvs:       new Float32Array(this._uv.buffer, aIu * 4, s.iu - aIu),
                colors:    new Float32Array(this._col.buffer, aIc * 4, s.ic - aIc),
            });
            if (sp.materials.length > 1) this._mr.setSharedMaterial(sp.materials[1], 1);
        } else {
            this._mesh.updateSubMesh(1, {
                positions: new Float32Array(0), indices16: new Uint16Array(0),
                uvs: new Float32Array(0), colors: new Float32Array(0),
            });
        }

        // ──────── Phase 3: 控制点盒子 ────────
        const cIv = s.iv, cIu = s.iu, cIc = s.ic, cIi = s.ii;
        let cpIv = cIv, cpIu = cIu, cpIc = cIc, cpIi = cIi, cpVo = 0;

        if (sp.knots.length > 0) {
            const sz = sp.cpSize, t = sp.cpTangentSize;
            const clr = [
                [sp.cpAnchorColor.r / 255, sp.cpAnchorColor.g / 255, sp.cpAnchorColor.b / 255, sp.cpAnchorColor.a / 255],
                [sp.cpInColor.r / 255,     sp.cpInColor.g / 255,     sp.cpInColor.b / 255,     sp.cpInColor.a / 255],
                [sp.cpOutColor.r / 255,    sp.cpOutColor.g / 255,    sp.cpOutColor.b / 255,    sp.cpOutColor.a / 255],
            ];

            for (let ki = 0; ki < sp.knots.length; ki++) {
                const kn = sp.knots[ki];
                const items = [
                    { p: kn.position,                                 sz },
                    { p: new Vec3(kn.position).add(kn.inTangent),      sz: t },
                    { p: new Vec3(kn.position).add(kn.outTangent),     sz: t },
                ];

                for (let idx = 0; idx < 3; idx++) {
                    // 锚点全部渲染，切线只渲染选中节点的
                    if (idx > 0 && ki !== sp.selectedKnotIdx) continue;
                    let [cr, cg, cb, ca] = clr[idx];
                    if (idx === 0 && ki === sp.hover.hoverAnchorIdx) { cr = 1; cg = 1; cb = 0; ca = 1; }

                    const hs = items[idx].sz;
                    const hd = hs / 2;
                    const p1 = new Vec3(items[idx].p.x, items[idx].p.y, items[idx].p.z - hd);
                    const p2 = new Vec3(items[idx].p.x, items[idx].p.y, items[idx].p.z + hd);
                    const d = this._box(p1, p2, hs, hs);

                    for (let p = 0; p < 6; p++) {
                        for (let v = 0; v < 4; v++) {
                            const vt = d.pos[d.idx[p][v]];
                            this._pos[cpIv++] = vt.x; this._pos[cpIv++] = vt.y; this._pos[cpIv++] = vt.z;
                            this._uv[cpIu++] = d.uv[v].x; this._uv[cpIu++] = d.uv[v].y;
                            this._col[cpIc++] = cr; this._col[cpIc++] = cg;
                            this._col[cpIc++] = cb; this._col[cpIc++] = ca;
                        }
                        this._idx[cpIi++] = cpVo;     this._idx[cpIi++] = cpVo + 1;
                        this._idx[cpIi++] = cpVo + 2; this._idx[cpIi++] = cpVo + 2;
                        this._idx[cpIi++] = cpVo + 1; this._idx[cpIi++] = cpVo + 3;
                        cpVo += 4;
                    }
                }
            }
        }

        const cf = cpIv - cIv;
        if (cf > 0) {
            this._mesh.updateSubMesh(2, {
                positions: new Float32Array(this._pos.buffer, cIv * 4, cf),
                indices16: new Uint16Array(this._idx.buffer, cIi * 2, cpIi - cIi),
                uvs:       new Float32Array(this._uv.buffer, cIu * 4, cpIu - cIu),
                colors:    new Float32Array(this._col.buffer, cIc * 4, cpIc - cIc),
            });
            if (sp.materials.length > 2) this._mr.setSharedMaterial(sp.materials[2], 2);
        } else {
            this._mesh.updateSubMesh(2, {
                positions: new Float32Array(0), indices16: new Uint16Array(0),
                uvs: new Float32Array(0), colors: new Float32Array(0),
            });
        }
        this._mr.onGeometryChanged();
    }

    // ─── 几何体生成 ───

    private _box(p1: Vec3, p2: Vec3, w: number, h: number) {
        const d = new Vec3(); Vec3.subtract(d, p2, p1);
        const len = d.length(); d.normalize();

        const r = new Vec3(); Vec3.cross(r, d, new Vec3(0, 1, 0));
        if (r.lengthSqr() < 0.0001) Vec3.cross(r, d, new Vec3(1, 0, 0));
        r.normalize();

        const u = new Vec3(); Vec3.cross(u, r, d).normalize();
        const c = new Vec3(); Vec3.add(c, p1, p2).multiplyScalar(0.5);

        const lc = [
            [-0.5, -0.5, -0.5], [ 0.5, -0.5, -0.5], [ 0.5,  0.5, -0.5], [-0.5,  0.5, -0.5],
            [-0.5, -0.5,  0.5], [ 0.5, -0.5,  0.5], [ 0.5,  0.5,  0.5], [-0.5,  0.5,  0.5],
        ];
        const pos = lc.map(l => {
            const v = new Vec3(c);
            Vec3.scaleAndAdd(v, v, r, l[0] * w);
            Vec3.scaleAndAdd(v, v, u, l[1] * h);
            Vec3.scaleAndAdd(v, v, d, l[2] * len);
            return v;
        });
        const idx = [[0, 3, 1, 2], [5, 6, 4, 7], [3, 7, 2, 6],
                     [1, 5, 0, 4], [4, 7, 0, 3], [1, 2, 5, 6]];
        const uv = [new Vec2(0, 0), new Vec2(0, 1), new Vec2(1, 0), new Vec2(1, 1)];
        return { pos, idx, uv };
    }

    /** 圆柱 + 圆锥（公告牌坐标轴） */
    private _cyl(ax: Vec3, cx: number, cy: number, cz: number,
                 sl: number, tl: number, sw: number, hw: number,
                 cr: number, cg: number, cb: number, ca: number,
                 s: { iv: number; iu: number; ic: number; ii: number; vo: number }) {
        const N = 8;
        const p1 = new Vec3();
        const tu = new Vec3(0, 1, 0);
        if (Math.abs(Vec3.dot(ax, tu)) > 0.99) tu.set(1, 0, 0);
        Vec3.cross(p1, ax, tu).normalize();
        const p2 = new Vec3(); Vec3.cross(p2, ax, p1).normalize();

        // 圆柱
        const sr = sw * 0.5;
        const bR: Vec3[] = [];
        const tR: Vec3[] = [];
        for (let i = 0; i < N; i++) {
            const rad = (i / N) * Math.PI * 2;
            const cA = Math.cos(rad), sA = Math.sin(rad);
            const rx = (p1.x * cA + p2.x * sA) * sr;
            const ry = (p1.y * cA + p2.y * sA) * sr;
            const rz = (p1.z * cA + p2.z * sA) * sr;
            bR.push(new Vec3(cx + rx, cy + ry, cz + rz));
            tR.push(new Vec3(cx + rx + ax.x * sl, cy + ry + ax.y * sl, cz + rz + ax.z * sl));
        }
        const tip = new Vec3(cx + ax.x * tl, cy + ax.y * tl, cz + ax.z * tl);

        for (let i = 0; i < N; i++) {
            const ni = (i + 1) % N;
            const verts = [bR[i], bR[ni], tR[ni], tR[i]];
            for (const v of verts) {
                this._pos[s.iv++] = v.x; this._pos[s.iv++] = v.y; this._pos[s.iv++] = v.z;
                this._uv[s.iu++] = 0; this._uv[s.iu++] = 0;
                this._col[s.ic++] = cr; this._col[s.ic++] = cg;
                this._col[s.ic++] = cb; this._col[s.ic++] = ca;
            }
            this._idx[s.ii++] = s.vo;     this._idx[s.ii++] = s.vo + 1;
            this._idx[s.ii++] = s.vo + 2; this._idx[s.ii++] = s.vo + 2;
            this._idx[s.ii++] = s.vo + 1; this._idx[s.ii++] = s.vo + 3;
            s.vo += 4;
        }

        // 圆锥头
        const hr = hw * 0.5;
        const hR: Vec3[] = [];
        for (let i = 0; i < N; i++) {
            const rad = (i / N) * Math.PI * 2;
            const cA = Math.cos(rad), sA = Math.sin(rad);
            const rx = (p1.x * cA + p2.x * sA) * hr;
            const ry = (p1.y * cA + p2.y * sA) * hr;
            const rz = (p1.z * cA + p2.z * sA) * hr;
            hR.push(new Vec3(cx + rx + ax.x * sl, cy + ry + ax.y * sl, cz + rz + ax.z * sl));
        }

        for (let i = 0; i < N; i++) {
            const ni = (i + 1) % N;
            const verts = [hR[i], hR[ni], tip, tip];
            for (const v of verts) {
                this._pos[s.iv++] = v.x; this._pos[s.iv++] = v.y; this._pos[s.iv++] = v.z;
                this._uv[s.iu++] = 0; this._uv[s.iu++] = 0;
                this._col[s.ic++] = cr; this._col[s.ic++] = cg;
                this._col[s.ic++] = cb; this._col[s.ic++] = ca;
            }
            this._idx[s.ii++] = s.vo;     this._idx[s.ii++] = s.vo + 1;
            this._idx[s.ii++] = s.vo + 2; this._idx[s.ii++] = s.vo + 2;
            this._idx[s.ii++] = s.vo + 1; this._idx[s.ii++] = s.vo + 3;
            s.vo += 4;
        }
    }
}
