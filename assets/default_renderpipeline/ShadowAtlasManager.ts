// ShadowAtlasManager.ts
import { Vec4 } from 'cc';

class Atlas {
    readonly size: number;
    readonly freeRects: Vec4[] = [new Vec4(0, 0, 1, 1)];
    readonly entries = new Map<string, Vec4>();

    constructor(size: number) {
        this.size = size;
    }

    alloc(key: string, shadowSize: number): Vec4 | null {
        const exist = this.entries.get(key);
        if (exist) return exist;

        const uvW = shadowSize / this.size;
        const uvH = shadowSize / this.size;

        for (let i = 0; i < this.freeRects.length; i++) {
            const fr = this.freeRects[i];
            if (fr.z < uvW || fr.w < uvH) continue;

            const uv = new Vec4(fr.x, fr.y, fr.x + uvW, fr.y + uvH);
            this.freeRects.splice(i, 1);

            const rw = fr.z - uvW;
            const rh = fr.w - uvH;
            if (rw > 0) this.freeRects.push(new Vec4(fr.x + uvW, fr.y, rw, uvH));
            if (rh > 0) this.freeRects.push(new Vec4(fr.x, fr.y + uvH, uvW, rh));
            if (rw > 0 && rh > 0) this.freeRects.push(new Vec4(fr.x + uvW, fr.y + uvH, rw, rh));

            this.entries.set(key, uv);
            return uv;
        }
        return null;
    }

    release(key: string): void {
        const v = this.entries.get(key);
        if (!v) return;
        this.freeRects.push(new Vec4(v.x, v.y, v.z - v.x, v.w - v.y));
        this.entries.delete(key);
        this.mergeFreeRects();
    }

    private mergeFreeRects(): void {
        let merged = true;
        while (merged) {
            merged = false;
            outer:
            for (let i = 0; i < this.freeRects.length; i++) {
                const a = this.freeRects[i];
                for (let j = i + 1; j < this.freeRects.length; j++) {
                    const b = this.freeRects[j];
                    if (a.z === b.z && a.x === b.x && Math.abs(a.y + a.w - b.y) < 0.0001) {
                        const newH = a.w + b.w;
                        this.freeRects.splice(j, 1);
                        this.freeRects.splice(i, 1);
                        this.freeRects.push(new Vec4(a.x, Math.min(a.y, b.y), a.z, newH));
                        merged = true;
                        break outer;
                    }
                    if (a.w === b.w && a.y === b.y && Math.abs(a.x + a.z - b.x) < 0.0001) {
                        const newW = a.z + b.z;
                        this.freeRects.splice(j, 1);
                        this.freeRects.splice(i, 1);
                        this.freeRects.push(new Vec4(Math.min(a.x, b.x), a.y, newW, a.w));
                        merged = true;
                        break outer;
                    }
                }
            }
        }
    }
}

export interface AtlasView {
    /** 图集名称，例如 "ShadowMap_0_1" */
    atlasName: string;
    /** UV 范围 (u1, v1, u2, v2)，用于 Shader 采样 */
    uv: Vec4;
    /** 像素视口 { x, y, width, height }，用于设置渲染 Pass 的视口 */
    view: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export class ShadowAtlasManager {
    private static _inst: ShadowAtlasManager | null = null;
    static get inst(): ShadowAtlasManager {
        if (!this._inst) this._inst = new ShadowAtlasManager();
        return this._inst;
    }
    static destroyInst(): void {
        this._inst?.destroy();
        this._inst = null;
    }

    private _atlases = new Map<string, Atlas>();
    private _lightViewMap = new Map<string, AtlasView>();
    private _lightOrderMap = new Map<string, number>();
    private _nextOrder = 0;

    private constructor() {}

    destroy(): void {
        this._atlases.clear();
        this._lightViewMap.clear();
        this._lightOrderMap.clear();
        this._nextOrder = 0;
    }

    getLightShowOrder(lightUuid: string): number {
        return this._lightOrderMap.get(lightUuid) ?? -1;
    }

    addAtlas(prefix: string, i: number, id: number, size: number = 2048): string {
        const name = `${prefix}_${i}_${id}`;
        if (!this._atlases.has(name)) {
            this._atlases.set(name, new Atlas(size));
        }
        return name;
    }

    getShadowView(lightUuid: string, prefix: string, shadowSize: number): AtlasView | null {
        const cached = this._lightViewMap.get(lightUuid);
        if (cached) {
            const atlas = this._atlases.get(cached.atlasName);
            if (atlas) {
                const uvSize = cached.uv.z - cached.uv.x;
                const currentSize = uvSize * atlas.size;
                if (Math.abs(currentSize - shadowSize) < 0.5) {
                    return cached;
                }
            }
            this.removeShadow(lightUuid);
        }

        for (const [name, atlas] of this._atlases) {
            if (!name.startsWith(prefix)) continue;

            const uv = atlas.alloc(lightUuid, shadowSize);
            if (uv) {
                const view = {
                    x: Math.round(uv.x * atlas.size),
                    y: Math.round(uv.y * atlas.size),
                    width: Math.round((uv.z - uv.x) * atlas.size),
                    height: Math.round((uv.w - uv.y) * atlas.size),
                };
                const info: AtlasView = {
                    atlasName: name,
                    uv,
                    view,
                };
                this._lightViewMap.set(lightUuid, info);
                this._lightOrderMap.set(lightUuid, this._nextOrder++);
                return info;
            }
        }
        return null;
    }

    allocBatch(keys: string[], prefix: string, shadowSize: number): AtlasView[] | null {
        for (const [name, atlas] of this._atlases) {
            if (!name.startsWith(prefix)) continue;
            const views: AtlasView[] = [];
            let ok = true;
            const tempKeys: string[] = [];
            for (const key of keys) {
                const uv = atlas.alloc(key, shadowSize);
                if (!uv) { ok = false; break; }
                tempKeys.push(key);
                views.push({
                    atlasName: name,
                    uv,
                    view: {
                        x: Math.round(uv.x * atlas.size),
                        y: Math.round(uv.y * atlas.size),
                        width: Math.round((uv.z - uv.x) * atlas.size),
                        height: Math.round((uv.w - uv.y) * atlas.size),
                    },
                });
            }
            if (ok) {
                for (let i = 0; i < keys.length; i++) {
                    this._lightViewMap.set(keys[i], views[i]);
                    this._lightOrderMap.set(keys[i], this._nextOrder++);
                }
                return views;
            }
            // Rollback
            for (const k of tempKeys) atlas.release(k);
        }
        return null;
    }

    removeShadow(lightUuid: string): void {
        const info = this._lightViewMap.get(lightUuid);
        if (info) {
            const atlas = this._atlases.get(info.atlasName);
            if (atlas) atlas.release(lightUuid);
            this._lightViewMap.delete(lightUuid);
        }
        this._lightOrderMap.delete(lightUuid);
    }

    removeAtlas(prefix: string, i: number, id: number): void {
        const name = `${prefix}_${i}_${id}`;
        this._atlases.delete(name);
        for (const [uuid, info] of this._lightViewMap) {
            if (info.atlasName === name) this._lightViewMap.delete(uuid);
        }
    }
}
const mgr = ShadowAtlasManager.inst;

// 1. 预先创建图集（通常在自定义管线初始化时）
// mgr.addAtlas('ShadowMap', 0, 0, 2048);
// mgr.addAtlas('ShadowMap', 1, 0, 2048); // 如果第一个满了可备用

// mgr.getShadowView('light0', 'ShadowMap', 512);

// mgr.getShadowView('light0', 'ShadowMap', 2048);
// mgr.getShadowView('light1', 'ShadowMap', 64);
// console.log('mgr',mgr);

//   atlasUV.x = mix(u_shadowAtlasView.x, u_shadowAtlasView.z, ndc.x);
//     atlasUV.y = mix(u_shadowAtlasView.y, u_shadowAtlasView.w, ndc.y);