import { Vec3, Mat4, Quat, geometry } from 'cc';
import { CCEManager, PanelManager, SplinePanel } from '../../Plans/index';
import { BezierKnot } from './BezierKnot';
import { ISplines } from './ISplines';
const { Ray, AABB, intersect } = geometry;

export class SplinesEvent {
    private _pid = (s: string) => PanelManager.id(this._sp.node, s);
    private _dragging = false;
    private _dragKnotIdx = -1;
    private _dragTanDir = -1;
    private _dragAxisDir = new Vec3();
    private _dragWorldOrigin = new Vec3();
    private _dragLastWorld = new Vec3();
    private _ray = new Ray();
    private _pickRadius = 0.08;
    private _clickTarget: {
        type: 'knot' | 'segment';
        idx: number;
        sx: number;
        sy: number;
        center?: Vec3;
    } | null = null;

    hoverKnotIdx = -1;
    hoverAxisIdx = -1;
    hoverAnchorIdx = -1;
    hoverTanKnotIdx = -1;
    hoverTanDir = -1;
    hoverTanAxis = -1;

    constructor(private _sp: ISplines) {}

    // ─── 事件分发 ───

    onSceneEvent = (type: string, event?: any): boolean => {
        if (!event) return false;

        if (type === 'mousedown') return this._onMouseDown(event);
        if (type === 'mousemove') return this._onMouseMove(event);
        if (type === 'mouseup') return this._onMouseUp(event);
        return false;
    };

    private _onMouseDown(event: any): boolean {
        const cam = CCEManager.cceCam;
        if (!cam) return false;

        const fy = cam.height - (event.y ?? 0);
        cam.screenPointToRay(this._ray, event.x ?? 0, fy);

        // 中键 → 选中/取消选中控制点（只消费命中节点的，否则让编辑器拖场景）
        if ((event.button ?? -1) === 1) {
            const ki = this._pickKnotAnchor(this._ray);
            if (ki !== null && ki < this._sp.knots.length) {
                this._sp.selectedKnotIdx = ki;
                event.stopImmediatePropagation?.();
                return true;
            }
            this._sp.selectedKnotIdx = -1;
            return false;
        }

        if ((event.button ?? -1) !== 0) {
            PanelManager.destroy(this._pid('SplinePanel'));
            PanelManager.destroy(this._pid('SplineDelete'));
            this._sp.selectedKnotIdx = -1;
            return false;
        }

        //const sx = event.clientX ?? event.x ?? 0;

        const sx = event.clientX ?? event.x ?? 0;
        const sy = event.clientY ?? event.y ?? 0;

        // 切线轴 → 立即拖拽
        const th = this._pickTangentAxis(this._ray);
        if (th) {
            event.stopImmediatePropagation?.();
            this._startDragTan(th.knotIdx, th.dirIdx, th.dir, th.dist);
            return true;
        }

        // 节点轴 → 启动拖拽，同时检测同节点锚点（用于点击不拖拽时弹面板）
        const h = this._pickAxis(this._ray);
        const ki = this._pickKnotAnchor(this._ray);
        if (h) {
            event.stopImmediatePropagation?.();
            this._startDragAxis(h.knotIdx, h.dir, h.dist);
            if (ki !== null && ki === h.knotIdx) {
                this._clickTarget = { type: 'knot', idx: ki, sx, sy };
            }
            return true;
        }

        // 无轴 → 锚点/线段候选，mouseup 时弹面板
        if (ki !== null) {
            event.stopImmediatePropagation?.();
            this._clickTarget = { type: 'knot', idx: ki, sx, sy };
            return true;
        }
        const c = this._pickBoxCenter(this._ray);
        if (c) {
            event.stopImmediatePropagation?.();
            this._clickTarget = { type: 'segment', idx: 0, sx, sy, center: c };
            return true;
        }

        PanelManager.destroy(this._pid('SplinePanel'));
        PanelManager.destroy(this._pid('SplineDelete'));
        this._sp.selectedKnotIdx = -1;
        return false;
    }

    private _onMouseMove(event: any): boolean {
        // 候选点击 → 移远则取消
        if (this._clickTarget) {
            const cx = event.clientX ?? event.x ?? 0;
            const cy = event.clientY ?? event.y ?? 0;
            const dx = cx - this._clickTarget.sx;
            const dy = cy - this._clickTarget.sy;
            if (dx * dx + dy * dy > 25) this._clickTarget = null;
        }
        if (this._dragging) {
            this._updateDrag(event);
            return false;
        }

        // 悬停检测
        const cam = CCEManager.cceCam;
        if (!cam) return false;
        const fy = cam.height - (event.y ?? 0);
        cam.screenPointToRay(this._ray, event.x ?? 0, fy);

        const ki = this._pickKnotAnchor(this._ray);
        if (ki !== null) {
            this.hoverAnchorIdx = ki;
            this.hoverKnotIdx = -1;
            this.hoverAxisIdx = -1;
            this.hoverTanKnotIdx = -1;
            this.hoverTanDir = -1;
            this.hoverTanAxis = -1;
            return false;
        }
        this.hoverAnchorIdx = -1;

        const th = this._pickTangentAxis(this._ray);
        if (th) {
            this.hoverTanKnotIdx = th.knotIdx;
            this.hoverTanDir = th.dirIdx;
            this.hoverTanAxis = th.axisIdx;
            this.hoverKnotIdx = -1;
            this.hoverAxisIdx = -1;
            return false;
        }
        this.hoverTanKnotIdx = -1;
        this.hoverTanDir = -1;
        this.hoverTanAxis = -1;

        const h = this._pickAxis(this._ray);
        if (h) {
            this.hoverKnotIdx = h.knotIdx;
            this.hoverAxisIdx = h.axisIdx;
        } else {
            this.hoverKnotIdx = -1;
            this.hoverAxisIdx = -1;
        }
        return false;
    }

    private _onMouseUp(event: any): boolean {
        if (this._clickTarget) {
            const t = this._clickTarget;
            this._clickTarget = null;
            this._dragging = false;
            this._dragKnotIdx = -1;
            this._dragTanDir = -1;

            event.stopImmediatePropagation?.();
            if (t.type === 'knot') {
                this._showDeletePanel(t.idx, t.sx, t.sy);
                return true;
            }
            if (t.type === 'segment' && t.center) {
                this._showKnotPanel(t.idx, t.sx, t.sy, t.center);
                return true;
            }
        }
        this._clickTarget = null;
        this._dragging = false;
        this._dragKnotIdx = -1;
        this._dragTanDir = -1;
        return false;
    }

    // ─── 拖拽 ───

    private _startDragAxis(knotIdx: number, dir: Vec3, dist: number) {
        this._dragging = true;
        this._dragKnotIdx = knotIdx;
        this._dragTanDir = -1;
        this._dragAxisDir.set(dir);

        const hp = new Vec3();
        Vec3.transformMat4(hp, this._sp.knots[knotIdx].position, this._sp.node.worldMatrix);
        this._dragWorldOrigin.set(hp);
        Vec3.scaleAndAdd(hp, this._ray.o, this._ray.d, dist);
        this._dragLastWorld.set(hp);
    }

    private _startDragTan(knotIdx: number, dirIdx: number, dir: Vec3, dist: number) {
        this._dragging = true;
        this._dragKnotIdx = knotIdx;
        this._dragTanDir = dirIdx;
        this._dragAxisDir.set(dir);
        const knot = this._sp.knots[knotIdx];
        const tan = dirIdx === 0 ? knot.inTangent : knot.outTangent;

        const wp = new Vec3();
        Vec3.transformMat4(wp, new Vec3(knot.position).add(tan), this._sp.node.worldMatrix);
        this._dragWorldOrigin.set(wp);
        Vec3.scaleAndAdd(wp, this._ray.o, this._ray.d, dist);
        this._dragLastWorld.set(wp);
    }

    private _updateDrag(event: any) {
        const cam = CCEManager.cceCam;
        if (!cam) return;

        const fy = cam.height - (event.y ?? 0);
        cam.screenPointToRay(this._ray, event.x ?? 0, fy);

        const pn = new Vec3();
        Vec3.subtract(pn, cam.node.worldPosition, this._dragWorldOrigin);
        pn.normalize();
        const ddn = Vec3.dot(this._ray.d, pn);
        if (Math.abs(ddn) <= 0.001) return;

        const t = Vec3.dot(pn, this._dragWorldOrigin) - Vec3.dot(pn, this._ray.o);
        const hp = new Vec3();
        Vec3.scaleAndAdd(hp, this._ray.o, this._ray.d, t / ddn);

        const ir = new Quat();
        Quat.invert(ir, this._sp.node.worldRotation);
        const ap = Vec3.dot(this._dragAxisDir, hp) - Vec3.dot(this._dragAxisDir, this._dragLastWorld);
        const wd = new Vec3(
            this._dragAxisDir.x * ap,
            this._dragAxisDir.y * ap,
            this._dragAxisDir.z * ap,
        );
        const ld = new Vec3();
        Vec3.transformQuat(ld, wd, ir);

        const knot = this._sp.knots[this._dragKnotIdx];
        if (this._dragTanDir >= 0) {
            (this._dragTanDir === 0 ? knot.inTangent : knot.outTangent).add(ld);
        } else {
            knot.position.add(ld);
        }
        this._dragLastWorld.set(hp);
    }

    // ─── 拾取 ───

    private _pickKnotAnchor(ray: geometry.Ray): number | null {
        const a = new AABB();
        const w = new Vec3();
        const m = this._sp.node.worldMatrix;
        const h = this._sp.cpSize;

        for (let i = 0; i < this._sp.knots.length; i++) {
            Vec3.transformMat4(w, this._sp.knots[i].position, m);
            a.center.set(w);
            a.halfExtents.set(h, h, h);
            if (intersect.rayAABB(ray, a) > 0) return i;
        }
        return null;
    }

    private _pickAxis(ray: geometry.Ray): any {
        const dirs = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)];
        const w = new Vec3();
        const m = this._sp.node.worldMatrix;
        const tl = this._sp.cpAxisShaftLen + this._sp.cpAxisHeadLen;
        let best: any = null;

        for (let i = 0; i < this._sp.knots.length; i++) {
            Vec3.transformMat4(w, this._sp.knots[i].position, m);
            for (let a = 0; a < 3; a++) {
                const r = this._rayVsCyl(ray, w, dirs[a], tl, this._pickRadius);
                if (r !== null && (!best || r < best.dist)) {
                    best = { knotIdx: i, axisIdx: a, dir: dirs[a], dist: r };
                }
            }
        }
        return best;
    }

    private _pickBoxCenter(ray: geometry.Ray): Vec3 | null {
        const a = new AABB();
        const w = new Vec3();
        const m = this._sp.node.worldMatrix;

        for (let i = 0; i < this._sp.points.length - 1; i++) {
            const p1 = this._sp.points[i];
            const p2 = this._sp.points[i + 1];
            const l = Vec3.distance(p1, p2);
            if (l < 0.001) continue;

            const cx = (p1.x + p2.x) / 2;
            const cy = (p1.y + p2.y) / 2;
            const cz = (p1.z + p2.z) / 2;
            Vec3.transformMat4(w, new Vec3(cx, cy, cz), m);
            a.center.set(w);
            a.halfExtents.set(this._sp.boxWidth + l, this._sp.boxHeight, l);
            if (intersect.rayAABB(ray, a) > 0) return w.clone();
        }
        return null;
    }

    private _pickTangentAxis(ray: geometry.Ray): any {
        const dirs = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)];
        const w = new Vec3();
        const m = this._sp.node.worldMatrix;
        const sc = this._sp.cpTangentSize / this._sp.cpSize;
        const tl = (this._sp.cpAxisShaftLen + this._sp.cpAxisHeadLen) * sc;
        let best: any = null;

        for (let i = 0; i < this._sp.knots.length; i++) {
            for (let di = 0; di < 2; di++) {
                const off = di === 0
                    ? this._sp.knots[i].inTangent
                    : this._sp.knots[i].outTangent;
                Vec3.transformMat4(w, new Vec3(this._sp.knots[i].position).add(off), m);
                for (let a = 0; a < 3; a++) {
                    const r = this._rayVsCyl(ray, w, dirs[a], tl, this._pickRadius * sc);
                    if (r !== null && (!best || r < best.dist)) {
                        best = {
                            knotIdx: i,
                            dirIdx: di,
                            axisIdx: a,
                            dir: dirs[a],
                            dist: r,
                        };
                    }
                }
            }
        }
        return best;
    }

    private _rayVsCyl(
        ray: geometry.Ray,
        o: Vec3,
        u: Vec3,
        len: number,
        rad: number,
    ): number | null {
        const V = new Vec3();
        Vec3.subtract(V, ray.o, o);
        const VxU = new Vec3();
        Vec3.cross(VxU, V, u);
        const DxU = new Vec3();
        Vec3.cross(DxU, ray.d, u);

        const a = Vec3.dot(DxU, DxU);
        const b = 2 * Vec3.dot(VxU, DxU);
        const c = Vec3.dot(VxU, VxU) - rad * rad * Vec3.dot(u, u);
        const disc = b * b - 4 * a * c;
        if (disc < 0) return null;

        const sd = Math.sqrt(disc);
        for (const t of [(-b - sd) / (2 * a), (-b + sd) / (2 * a)]) {
            if (t < 0) continue;
            const h = new Vec3();
            Vec3.scaleAndAdd(h, ray.o, ray.d, t);
            const s = Vec3.dot(h, u) - Vec3.dot(o, u);
            if (s >= 0 && s <= len) return t;
        }
        return null;
    }

    // ─── 面板 ───

    private _showKnotPanel(_knotIdx: number, sx: number, sy: number, center: Vec3) {
        const pid = this._pid('SplinePanel');
        let p = PanelManager.get(pid) as SplinePanel;
        if (p) {
            p.setPosition(sx, sy);
            return;
        }
        p = new SplinePanel(pid, {
            p: { x: sx, y: sy },
            onButtonPress: () => {
                const l = new Vec3();
                const im = new Mat4();
                Mat4.invert(im, this._sp.node.worldMatrix);
                Vec3.transformMat4(l, center, im);

                let bi = 0;
                let bd = Infinity;
                for (let i = 0; i < this._sp.knots.length; i++) {
                    const d = Vec3.distance(l, this._sp.knots[i].position);
                    if (d < bd) { bd = d; bi = i; }
                }
                this._sp.knots.splice(bi + 1, 0,
                    new BezierKnot(l, new Vec3(-0.5, 0, 0), new Vec3(0.5, 0, 0)));
                PanelManager.destroy(pid);
            },
        });
        PanelManager.register(pid, p);
    }

    private _showDeletePanel(knotIdx: number, sx: number, sy: number) {
        const pid = this._pid('SplineDelete');
        PanelManager.destroy(pid);
        PanelManager.register(pid, new SplinePanel(pid, {
            p: { x: sx, y: sy },
            buttonLabel: '删除',
            onButtonPress: () => {
                this._sp.knots.splice(knotIdx, 1);
                this._sp.selectedKnotIdx = -1;
                PanelManager.destroy(pid);
            },
        }));
    }
}
