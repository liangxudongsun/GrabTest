import { Vec3, Mat4, Quat, geometry } from 'cc';
import { CCEManager } from '../../Plans/CCEManager';
import { PanelManager } from '../../Plans/PanelManager';
import { SplinePanel } from '../../Plans/SplinePanel';
import { BezierKnot } from './BezierKnot';
import { Splines } from './Splines';
const { Ray, AABB, intersect } = geometry;

export class SplinesEvent {
    private _dragging = false;
    private _dragKnotIdx = -1;
    private _dragTanDir = -1;
    private _dragAxisDir = new Vec3();
    private _dragWorldOrigin = new Vec3();
    private _dragLastWorld = new Vec3();
    private _ray = new Ray();
    private _pickRadius = 0.08;

    hoverKnotIdx = -1;
    hoverAxisIdx = -1;
    hoverAnchorIdx = -1;
    hoverTanKnotIdx = -1;
    hoverTanDir = -1;
    hoverTanAxis = -1;

    constructor(private _sp: Splines) {}

    onSceneEvent = (type: string, event?: any): boolean => {
        if (!event) return false;

        if (type === 'mousedown') {
            if ((event.button ?? -1) === 0) {
                const cam = CCEManager.cceCam;
                if (!cam) return false;
                const fy = cam.height - (event.y ?? 0);
                cam.screenPointToRay(this._ray, event.x ?? 0, fy);

                const th = this._pickTangentAxis(this._ray);
                if (th) { event.stopImmediatePropagation?.(); this._startDragTan(th.knotIdx, th.dirIdx, th.dir, th.dist); return true; }

                const h = this._pickAxis(this._ray);
                if (h) { event.stopImmediatePropagation?.(); this._startDragAxis(h.knotIdx, h.dir, h.dist); return true; }

                PanelManager.destroy('SplinePanel_'+this._sp.node['_id']);
                PanelManager.destroy('SplineDelete_'+this._sp.node['_id']);
            }
            if ((event.button ?? -1) === 2) {
                const cam = CCEManager.cceCam;
                if (!cam) return false;
                const fy = cam.height - (event.y ?? 0);
                cam.screenPointToRay(this._ray, event.x ?? 0, fy);

                const ki = this._pickKnotAnchor(this._ray);
                if (ki !== null) { event.stopImmediatePropagation?.(); this._showDeletePanel(ki, event.clientX??event.x??0, event.clientY??event.y??0); return true; }

                const c = this._pickBoxCenter(this._ray);
                if (c) { event.stopImmediatePropagation?.(); this._showKnotPanel(0, event.clientX??event.x??0, event.clientY??event.y??0, c); return true; }

                PanelManager.destroy('SplinePanel_'+this._sp.node['_id']);
                PanelManager.destroy('SplineDelete_'+this._sp.node['_id']);
            }
        }

        if (type === 'mousemove') {
            if (!this._dragging) {
                const cam = CCEManager.cceCam;
                if (!cam) return false;
                const fy = cam.height - (event.y ?? 0);
                cam.screenPointToRay(this._ray, event.x ?? 0, fy);

                const ki = this._pickKnotAnchor(this._ray);
                if (ki !== null) {
                    this.hoverAnchorIdx = ki; this.hoverKnotIdx=-1; this.hoverAxisIdx=-1;
                    this.hoverTanKnotIdx=-1; this.hoverTanDir=-1; this.hoverTanAxis=-1;
                } else {
                    this.hoverAnchorIdx = -1;
                    const th = this._pickTangentAxis(this._ray);
                    if (th) {
                        this.hoverTanKnotIdx=th.knotIdx; this.hoverTanDir=th.dirIdx; this.hoverTanAxis=th.axisIdx;
                        this.hoverKnotIdx=-1; this.hoverAxisIdx=-1;
                    } else {
                        this.hoverTanKnotIdx=-1; this.hoverTanDir=-1; this.hoverTanAxis=-1;
                        const h = this._pickAxis(this._ray);
                        if (h) { this.hoverKnotIdx=h.knotIdx; this.hoverAxisIdx=h.axisIdx; }
                        else { this.hoverKnotIdx=-1; this.hoverAxisIdx=-1; }
                    }
                }
            } else {
                this._updateDrag(event);
            }
        }

        if (type === 'mouseup') {
            this._dragging = false; this._dragKnotIdx = -1; this._dragTanDir = -1;
        }
        return false;
    };

    // ─── 拖拽 ───

    private _startDragAxis(knotIdx: number, dir: Vec3, dist: number) {
        this._dragging = true; this._dragKnotIdx = knotIdx; this._dragTanDir = -1; this._dragAxisDir.set(dir);
        const hp = new Vec3(); Vec3.transformMat4(hp, this._sp.knots[knotIdx].position, this._sp.node.worldMatrix);
        this._dragWorldOrigin.set(hp); Vec3.scaleAndAdd(hp, this._ray.o, this._ray.d, dist); this._dragLastWorld.set(hp);
    }

    private _startDragTan(knotIdx: number, dirIdx: number, dir: Vec3, dist: number) {
        this._dragging = true; this._dragKnotIdx = knotIdx; this._dragTanDir = dirIdx; this._dragAxisDir.set(dir);
        const knot = this._sp.knots[knotIdx];
        const tan = dirIdx === 0 ? knot.inTangent : knot.outTangent;
        const wp = new Vec3(); Vec3.transformMat4(wp, new Vec3(knot.position).add(tan), this._sp.node.worldMatrix);
        this._dragWorldOrigin.set(wp); Vec3.scaleAndAdd(wp, this._ray.o, this._ray.d, dist); this._dragLastWorld.set(wp);
    }

    private _updateDrag(event: any) {
        const cam = CCEManager.cceCam; if (!cam) return;
        const fy = cam.height - (event.y ?? 0);
        cam.screenPointToRay(this._ray, event.x ?? 0, fy);
        const pn = new Vec3(); Vec3.subtract(pn, cam.node.worldPosition, this._dragWorldOrigin); pn.normalize();
        const ddn = Vec3.dot(this._ray.d, pn);
        if (Math.abs(ddn) <= 0.001) return;
        const t = Vec3.dot(pn, this._dragWorldOrigin)-Vec3.dot(pn, this._ray.o);
        const hp = new Vec3(); Vec3.scaleAndAdd(hp, this._ray.o, this._ray.d, t/ddn);
        const ir = new Quat(); Quat.invert(ir, this._sp.node.worldRotation);
        const ap = Vec3.dot(this._dragAxisDir, hp)-Vec3.dot(this._dragAxisDir, this._dragLastWorld);
        const wd = new Vec3(this._dragAxisDir.x*ap, this._dragAxisDir.y*ap, this._dragAxisDir.z*ap);
        const ld = new Vec3(); Vec3.transformQuat(ld, wd, ir);
        const knot = this._sp.knots[this._dragKnotIdx];
        if (this._dragTanDir >= 0) (this._dragTanDir===0 ? knot.inTangent : knot.outTangent).add(ld);
        else knot.position.add(ld);
        this._dragLastWorld.set(hp);
    }

    // ─── 拾取 ───

    private _pickKnotAnchor(ray: geometry.Ray): number | null {
        const a = new AABB(); const w = new Vec3(); const m = this._sp.node.worldMatrix; const h = this._sp.cpSize;
        for (let i = 0; i < this._sp.knots.length; i++) {
            Vec3.transformMat4(w, this._sp.knots[i].position, m);
            a.center.set(w); a.halfExtents.set(h,h,h);
            if (intersect.rayAABB(ray, a) > 0) return i;
        }
        return null;
    }

    private _pickAxis(ray: geometry.Ray): any {
        let b: any = null; const d = [new Vec3(1,0,0),new Vec3(0,1,0),new Vec3(0,0,1)];
        const w = new Vec3(); const m = this._sp.node.worldMatrix; const tl = this._sp.cpAxisShaftLen+this._sp.cpAxisHeadLen;
        for (let i = 0; i < this._sp.knots.length; i++) {
            Vec3.transformMat4(w, this._sp.knots[i].position, m);
            for (let a = 0; a < 3; a++) { const r = this._rayVsCyl(ray,w,d[a],tl,this._pickRadius); if (r!==null && (!b||r<b.dist)) b={knotIdx:i,axisIdx:a,dir:d[a],dist:r}; }
        }
        return b;
    }

    private _pickBoxCenter(ray: geometry.Ray): Vec3 | null {
        const a = new AABB(); const w = new Vec3(); const m = this._sp.node.worldMatrix;
        for (let i = 0; i < this._sp.points.length-1; i++) {
            const p1=this._sp.points[i],p2=this._sp.points[i+1]; const l=Vec3.distance(p1,p2); if(l<0.001)continue;
            const cx=(p1.x+p2.x)/2,cy=(p1.y+p2.y)/2,cz=(p1.z+p2.z)/2;
            Vec3.transformMat4(w, new Vec3(cx,cy,cz), m); a.center.set(w); a.halfExtents.set(this._sp.boxWidth+l,this._sp.boxHeight,l);
            if (intersect.rayAABB(ray,a)>0) return w.clone();
        }
        return null;
    }

    private _pickTangentAxis(ray: geometry.Ray): any {
        let b: any = null; const d = [new Vec3(1,0,0),new Vec3(0,1,0),new Vec3(0,0,1)];
        const w = new Vec3(); const m = this._sp.node.worldMatrix;
        const sc = this._sp.cpTangentSize/this._sp.cpSize; const tl=(this._sp.cpAxisShaftLen+this._sp.cpAxisHeadLen)*sc;
        for (let i = 0; i < this._sp.knots.length; i++) {
            for (let di = 0; di < 2; di++) {
                const off = di===0 ? this._sp.knots[i].inTangent : this._sp.knots[i].outTangent;
                Vec3.transformMat4(w, new Vec3(this._sp.knots[i].position).add(off), m);
                for (let a = 0; a < 3; a++) {
                    const r = this._rayVsCyl(ray,w,d[a],tl,this._pickRadius*sc);
                    if (r!==null && (!b||r<b.dist)) b={knotIdx:i,dirIdx:di,axisIdx:a,dir:d[a],dist:r};
                }
            }
        }
        return b;
    }

    private _rayVsCyl(ray: geometry.Ray, o: Vec3, u: Vec3, len: number, rad: number): number | null {
        const V = new Vec3(); Vec3.subtract(V, ray.o, o);
        const VxU = new Vec3(); Vec3.cross(VxU, V, u);
        const DxU = new Vec3(); Vec3.cross(DxU, ray.d, u);
        const a = Vec3.dot(DxU,DxU), b = 2*Vec3.dot(VxU,DxU), c = Vec3.dot(VxU,VxU)-rad*rad*Vec3.dot(u,u);
        const disc = b*b-4*a*c; if (disc<0) return null;
        const sd = Math.sqrt(disc);
        for (const t of [(-b-sd)/(2*a),(-b+sd)/(2*a)]) {
            if (t<0) continue;
            const h = new Vec3(); Vec3.scaleAndAdd(h, ray.o, ray.d, t);
            const s = Vec3.dot(h,u)-Vec3.dot(o,u);
            if (s>=0 && s<=len) return t;
        }
        return null;
    }

    // ─── 面板 ───

    private _showKnotPanel(_knotIdx: number, sx: number, sy: number, center: Vec3) {
        const pid = 'SplinePanel_'+this._sp.node['_id'];
        let p = PanelManager.get(pid) as SplinePanel;
        if (!p) {
            p = new SplinePanel(pid, {
                p: {x:sx,y:sy},
                onButtonPress: () => {
                    const l = new Vec3(); const im = new Mat4();
                    Mat4.invert(im, this._sp.node.worldMatrix); Vec3.transformMat4(l, center, im);
                    let bi=0,bd=Infinity;
                    for (let i=0;i<this._sp.knots.length;i++){const d=Vec3.distance(l,this._sp.knots[i].position);if(d<bd){bd=d;bi=i;}}
                    this._sp.knots.splice(bi+1,0,new BezierKnot(l,new Vec3(-0.5,0,0),new Vec3(0.5,0,0)));
                    PanelManager.destroy(pid);
                },
            });
            PanelManager.register(pid, p);
        } else { p.setPosition(sx,sy); }
    }

    private _showDeletePanel(knotIdx: number, sx: number, sy: number) {
        const pid = 'SplineDelete_'+this._sp.node['_id'];
        PanelManager.destroy(pid);
        PanelManager.register(pid, new SplinePanel(pid, {
            p:{x:sx,y:sy}, buttonLabel:'删除',
            onButtonPress:()=>{this._sp.knots.splice(knotIdx,1);PanelManager.destroy(pid);},
        }));
    }
}
