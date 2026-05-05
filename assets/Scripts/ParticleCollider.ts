import { _decorator, Component, Color, geometry, Vec3, Mat4, Mat3, Quat } from 'cc';
import { EDITOR } from 'cc/env';
import { CCEManager } from '../Plans/CCEManager';
import { PanelManager } from '../Plans/PanelManager';
import { GizmoPanel } from '../Plans/GizmoPanel';
import { ReactiveStore } from '../Plans/ReactiveStore';
const { ccclass, property, executeInEditMode } = _decorator;

const { Ray, AABB, OBB, intersect } = geometry;

function panelId(self: any) { return 'ParticleColliderPanel_' + (self.node._id || 'default'); }

@ccclass('ParticleCollider')
@executeInEditMode(true)
export class ParticleCollider extends Component {
    @property
    size = new Vec3(1, 1, 1);

    @property
    showPanel = true;

    @property
    R = 1;

    @property
    offset = new Vec3(0, 0, 0);

    @property
    rotation = new Vec3(0, 0, 0);

    @property
    group = 1 << 1;

    private _color = new Color(0, 255, 0, 255);
    private _inited = false;
    private _cceMoveX = 0;
    private _cceMoveY = 0;
    private _dragging = false;
    private _dragAxis: 'x' | 'y' | 'z' | null = null;
    private _dragStartX = 0;
    private _dragStartY = 0;
    private _dragStartSize = new Vec3();
    private _ray = new Ray();
    private _store = new ReactiveStore({ mode: 'box', name: 'size', x: { val: this.size.x, max: 50 }, y: { val: this.size.y, max: 50 }, z: { val: this.size.z, max: 50 }, data: { x: { val: this.R, max: 50 } }, offset: { x: { val: this.offset.x, max: 50 }, y: { val: this.offset.y, max: 50 }, z: { val: this.offset.z, max: 50 } }, rot: { x: { val: this.rotation.x, max: 360 }, y: { val: this.rotation.y, max: 360 }, z: { val: this.rotation.z, max: 360 } }, groupTag: { name: 'test2', data: String(this.group) } });
    private _unsubStore: (() => void) | null = null;
    private _lastGroup = this.group;

    start() {
        if (!EDITOR) return;
        // 清除当前节点残留面板
        document.getElementById(panelId(this))?.remove();
        PanelManager.destroy(panelId(this));
        CCEManager.remove(panelId(this) + '-s');
        CCEManager.add(panelId(this) + '-s', this._onSceneEvent, 'scene');

        // 用序列化值初始化 store
        this._store.set({ mode: 'box', name: 'size', x: { val: this.size.x, max: 50 }, y: { val: this.size.y, max: 50 }, z: { val: this.size.z, max: 50 }, data: { x: { val: this.R, max: 50 } }, offset: { x: { val: this.offset.x, max: 50 }, y: { val: this.offset.y, max: 50 }, z: { val: this.offset.z, max: 50 } }, rot: { x: { val: this.rotation.x, max: 360 }, y: { val: this.rotation.y, max: 360 }, z: { val: this.rotation.z, max: 360 } }, groupTag: { name: 'test2', data: String(this.group) } });

        // 响应式数据变化 → 更新组件
        this._unsubStore = this._store.subscribe(d => {
            if (d.x) this.size.set(d.x.val, d.y.val, d.z.val);
            if (d.data?.x) this.R = d.data.x.val;
            if (d.offset) this.offset.set(d.offset.x.val, d.offset.y.val, d.offset.z.val);
            if (d.rot) this.rotation.set(d.rot.x.val, d.rot.y.val, d.rot.z.val);
            if (d.groupTag) {
                const parsed = parseInt(d.groupTag.data);
                if (!isNaN(parsed)) { this.group = parsed; this._lastGroup = parsed; }
            }
        });
      
    }

    onDisable() {
        if (!EDITOR) return;
        CCEManager.remove(panelId(this) + '-s');
        PanelManager.destroy(panelId(this));
        this._unsubStore?.();
        this._store.unsubscribeAll();
    }

    onDestroy() {
        // 确保热重载时面板被清除
        PanelManager.destroy(panelId(this));
    }

    // ── 场景事件（盒子拖拽）──

    private _onSceneEvent = (type: string, event?: any): boolean => {
        if (!event) return false;

        if (type === 'mousedown') {
            if ((event.button ?? -1) !== 0) return false;
            const cam = CCEManager.cceCam;
            if (!cam) return false;
            const flippedY = cam.height - (event.y ?? 0);
            cam.screenPointToRay(this._ray, event.x ?? 0, flippedY);
            const hit = this._raycastBox(this._ray);
            if (hit) {
                event.stopImmediatePropagation?.();
                this._dragging = true;
                this._dragAxis = hit.axis;
                this._cceMoveX = event.x ?? 0;
                this._cceMoveY = event.y ?? 0;
                this._dragStartX = event.x ?? 0;
                this._dragStartY = event.y ?? 0;
                this._dragStartSize.set(this.size);
                return true;
            }
        }

        if (type === 'mousemove') {
            this._cceMoveX = event.x ?? 0;
            this._cceMoveY = event.y ?? 0;
        }

        if (type === 'mouseup') {
            this._dragging = false;
            this._dragAxis = null;
        }

        return false;
    };

    private _raycastBox(ray: geometry.Ray): { axis: 'x' | 'y' | 'z' } | null {
        const d = this._store.get();
        const pos = this.node.worldPosition;
        const off = d.offset;
        const cx = pos.x + (off?.x?.val || 0);
        const cy = pos.y + (off?.y?.val || 0);
        const cz = pos.z + (off?.z?.val || 0);
        const h = new Vec3(this.size.x / 2, this.size.y / 2, this.size.z / 2);
        const r = d.rot;
        const hasRot = r && (r.x.val || r.y.val || r.z.val);
        if (hasRot) {
            const q = new Quat();
            Quat.fromEuler(q, r.x.val, r.y.val, r.z.val);
            const mat3 = new Mat3();
            Mat3.fromQuat(mat3, q);
            const obb = new OBB(cx, cy, cz, h.x, h.y, h.z);
            obb.orientation = mat3;
            const dist = intersect.rayOBB(ray, obb);
            if (dist > 0) {
                const hp = new Vec3();
                Vec3.scaleAndAdd(hp, ray.o, ray.d, dist);
                const l = new Vec3();
                Vec3.subtract(l, hp, new Vec3(cx, cy, cz));
                const invQ = new Quat();
                Quat.conjugate(invQ, q);
                Vec3.transformQuat(l, l, invQ);
                const dx = h.x - Math.abs(l.x), dy = h.y - Math.abs(l.y), dz = h.z - Math.abs(l.z);
                if (dx <= dy && dx <= dz) return { axis: 'x' };
                if (dy <= dx && dy <= dz) return { axis: 'y' };
                return { axis: 'z' };
            }
        } else {
            const aabb = new AABB(cx, cy, cz, h.x, h.y, h.z);
            const dist = intersect.rayAABB(ray, aabb);
            if (dist > 0) {
                const hp = new Vec3();
                Vec3.scaleAndAdd(hp, ray.o, ray.d, dist);
                const l = new Vec3();
                Vec3.subtract(l, hp, new Vec3(cx, cy, cz));
                const dx = h.x - Math.abs(l.x), dy = h.y - Math.abs(l.y), dz = h.z - Math.abs(l.z);
                if (dx <= dy && dx <= dz) return { axis: 'x' };
                if (dy <= dx && dy <= dz) return { axis: 'y' };
                return { axis: 'z' };
            }
        }
        return null;
    }

    lateUpdate() {
        if (!EDITOR) return;
        const cam = CCEManager.cceCam;
        if (!cam) return;

        if (!this._inited) {
            if (!cam.geometryRenderer) cam.initGeometryRenderer();
            this._inited = true;
        }

        // 面板创建
        if (this.showPanel) {
            if (!PanelManager.has(panelId(this))) {
                const panel = new GizmoPanel(panelId(this), this._store, {
                    onClose: () => { this.showPanel = false; },
                });
                PanelManager.register(panelId(this), panel);
            }
        } else {
            PanelManager.destroy(panelId(this));
        }

        // 拖拽通过 store 更新数据
        if (this._dragging) {
            const s = 0.005;
            const ns = new Vec3(this._dragStartSize);
            switch (this._dragAxis) {
                case 'x': { const d = this._cceMoveX - this._dragStartX; ns.x = Math.max(0.1, this._dragStartSize.x + d * s); break; }
                case 'y': { const d = -(this._cceMoveY - this._dragStartY); ns.y = Math.max(0.1, this._dragStartSize.y + d * s); break; }
                case 'z': { const d = this._cceMoveX - this._dragStartX; ns.z = Math.max(0.1, this._dragStartSize.z + d * s); break; }
            }
            this._store.set({ x: { val: ns.x, max: 50 }, y: { val: ns.y, max: 50 }, z: { val: ns.z, max: 50 } });
        }

        // 同步 Inspector 手动修改 → store
        const d = this._store.get();
        if (d.x && (this.size.x !== d.x.val || this.size.y !== d.y.val || this.size.z !== d.z.val)) {
            this._store.set({ x: { val: this.size.x, max: 50 }, y: { val: this.size.y, max: 50 }, z: { val: this.size.z, max: 50 } });
        }
        if (d.data?.x && this.R !== d.data.x.val) {
            this._store.set({ data: { x: { val: this.R, max: 50 } } });
        }
        if (d.offset && (this.offset.x !== d.offset.x.val || this.offset.y !== d.offset.y.val || this.offset.z !== d.offset.z.val)) {
            this._store.set({ offset: { x: { val: this.offset.x, max: 50 }, y: { val: this.offset.y, max: 50 }, z: { val: this.offset.z, max: 50 } } });
        }
        if (d.rot && (this.rotation.x !== d.rot.x.val || this.rotation.y !== d.rot.y.val || this.rotation.z !== d.rot.z.val)) {
            this._store.set({ rot: { x: { val: Math.min(360, Math.max(0, this.rotation.x)), max: 360 }, y: { val: Math.min(360, Math.max(0, this.rotation.y)), max: 360 }, z: { val: Math.min(360, Math.max(0, this.rotation.z)), max: 360 } } });
        }
        if (d.groupTag && this.group !== this._lastGroup) {
            this._lastGroup = this.group;
            this._store.set({ groupTag: { name: 'test2', data: String(this.group) } });
        }

        // 绘制（按模式）
        const gr = cam.geometryRenderer;
        if (!gr) return;
        const base = this.node.worldPosition;
        const off = this._store.get().offset;
        const pos = off ? new Vec3(base.x + off.x.val, base.y + off.y.val, base.z + off.z.val) : base;
        const mode = this._store.get().mode;
        if (mode === 'sphere') {
            const radius = this._store.get().data?.x?.val ?? 1;
            gr.addSphere(pos, radius, new Color(0, 255, 0, 64), 24, true, false);
            gr.addSphere(pos, radius, this._color, 24);
        } else {
            const h = new Vec3(this.size.x / 2, this.size.y / 2, this.size.z / 2);
            const r = this._store.get().rot;
            const hasRot = r && (r.x.val || r.y.val || r.z.val);
            if (hasRot) {
                const aabb = new AABB(0, 0, 0, h.x, h.y, h.z);
                const q = new Quat();
                Quat.fromEuler(q, r.x.val, r.y.val, r.z.val);
                const m = new Mat4();
                Mat4.fromRT(m, q, pos);
                gr.addBoundingBox(aabb, new Color(0, 255, 0, 64), false, true, false, true, m);
                gr.addBoundingBox(aabb, this._color, true, true, false, true, m);
            } else {
                const aabb = new AABB(pos.x, pos.y, pos.z, h.x, h.y, h.z);
                gr.addBoundingBox(aabb, new Color(0, 255, 0, 64), false);
                gr.addBoundingBox(aabb, this._color, true);
            }
        }
    }
}
