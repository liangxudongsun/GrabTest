import { _decorator, Component, Color, Vec3, MeshRenderer, Mesh, utils, Material, Vec2 } from 'cc';
import { EDITOR } from 'cc/env';
import { BezierKnot } from './BezierKnot';
import { SplinePath } from './SplinePath';
import { CCEManager } from '../../Plans/CCEManager';
import { PanelManager } from '../../Plans/PanelManager';
import { UploadJsonPanel } from '../../Plans/UploadJsonPanel';
import { SplinesEvent } from './SplinesEvent';

const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('Splines')
@executeInEditMode(true)
export class Splines extends Component {
    @property
    uploadUrl='';
    @property({ type: [Vec3] })
    points: Vec3[] = [
        new Vec3(0, 0, 0),
        new Vec3(1, 0, 0),
    ];

    @property({ type: [BezierKnot] })
    knots: BezierKnot[] = [];

    @property
    color = new Color(0, 255, 0, 255);

    @property({ type: [Material] })
    materials: Material[] = [];

    @property
    public capacity = 100;

    @property
    showAxes = false;

    @property
    showPlan = true;

    // ─── 样条体参数 ───
    @property({ displayName: 'Box Width' }) boxWidth = 0.2;
    @property({ displayName: 'Box Height' }) boxHeight = 0.4;
    @property({ displayName: 'Box Color' }) boxColor = new Color(255, 255, 255, 255);

    // ─── 坐标轴参数 ───
    @property({ displayName: 'Axis Shaft Len' }) axisShaftLen = 0.35;
    @property({ displayName: 'Axis Head Len' }) axisHeadLen = 0.15;
    @property({ displayName: 'Axis Shaft Width' }) axisShaftWidth = 0.02;
    @property({ displayName: 'Axis Head Width' }) axisHeadWidth = 0.06;

    // ─── 控制点参数 ───
    @property({ displayName: 'CP Anchor Size' }) cpSize = 0.5;
    @property({ displayName: 'CP Tangent Size' }) cpTangentSize = 0.12;
    @property({ displayName: 'CP Anchor Color' }) cpAnchorColor = new Color(255, 255, 255, 255);
    @property({ displayName: 'CP InTangent Color' }) cpInColor = new Color(255, 200, 0, 255);
    @property({ displayName: 'CP OutTangent Color' }) cpOutColor = new Color(0, 200, 255, 255);

    // ─── 控制点坐标轴参数 ───
    @property({ displayName: 'CP Show Axes' }) showCpAxes = false;
    @property({ displayName: 'CP Axis Shaft Len' }) cpAxisShaftLen = 0.35;
    @property({ displayName: 'CP Axis Head Len' }) cpAxisHeadLen = 0.15;
    @property({ displayName: 'CP Axis Shaft Width' }) cpAxisShaftWidth = 0.02;
    @property({ displayName: 'CP Axis Head Width' }) cpAxisHeadWidth = 0.06;

    private _meshRenderer: MeshRenderer;
    private _mesh: Mesh;
    private _pos: Float32Array;
    private _idx: Uint16Array;
    private _evt: SplinesEvent;
    private _uv: Float32Array;
    private _col: Float32Array;

    protected onLoad(): void {
        this._initRender();
        this._evt = new SplinesEvent(this);
        CCEManager.add(this.node['_id'] + '_splines', this._evt.onSceneEvent, 'scene');
    }

    protected onDestroy(): void {
        CCEManager.remove(this.node['_id'] + '_splines');
        PanelManager.destroy('UploadJsonPanel');
    }

    update() {
        if (!EDITOR) return;
        if (this.showPlan) {
            if (!PanelManager.has('UploadJsonPanel')) {
                PanelManager.register('UploadJsonPanel', new UploadJsonPanel('UploadJsonPanel',
                    () =>{
                         const flatArray: number[] = this.points.flatMap(v => [v.x, v.y, v.z]);
                         CCEManager.writeJson(this.uploadUrl, { path: flatArray })
                    },
                    () => { this.showPlan = false; },
                ));
            }
        } else {
            PanelManager.destroy('UploadJsonPanel');
        }
        this._updataRender();
    }

    _initRender() {
        this._meshRenderer = this.node.getComponent(MeshRenderer);
        if (!this._meshRenderer) {
            this._meshRenderer = this.node.addComponent(MeshRenderer);
        }

        const bodyQuads = (this.capacity - 1) * 12;
        const cpQuads = this.capacity * (18 + 12);
        const totalQuads = bodyQuads + cpQuads;
        this._pos = new Float32Array(totalQuads * 12);
        this._idx = new Uint16Array(totalQuads * 6);
        this._uv = new Float32Array(totalQuads * 8);
        this._col = new Float32Array(totalQuads * 16);

        this._mesh = utils.MeshUtils.createDynamicMesh(0, {
            positions: this._pos,
            indices16: this._idx,
            uvs: this._uv,
            colors: this._col,
        }, this._mesh, {
            maxSubMeshes: 3,
            maxSubMeshVertices: this._pos.length,
            maxSubMeshIndices: this._idx.length,
        });
        this._mesh.initialize();
        this._meshRenderer.materials = this.materials;
        this._meshRenderer.mesh = this._mesh;
    }

    generateBoxData(p1: Vec3, p2: Vec3, width: number, height: number) {
        const dir = new Vec3(); Vec3.subtract(dir, p2, p1);
        const length = dir.length(); dir.normalize();
        const worldUp = new Vec3(0, 1, 0);
        const right = new Vec3(); Vec3.cross(right, dir, worldUp);
        if (right.lengthSqr() < 0.0001) Vec3.cross(right, dir, new Vec3(1, 0, 0));
        right.normalize();
        const up = new Vec3(); Vec3.cross(up, right, dir); up.normalize();
        const center = new Vec3(); Vec3.add(center, p1, p2).multiplyScalar(0.5);

        const localCorners = [
            new Vec3(-0.5,-0.5,-0.5), new Vec3(0.5,-0.5,-0.5), new Vec3(0.5,0.5,-0.5), new Vec3(-0.5,0.5,-0.5),
            new Vec3(-0.5,-0.5,0.5), new Vec3(0.5,-0.5,0.5), new Vec3(0.5,0.5,0.5), new Vec3(-0.5,0.5,0.5),
        ];
        const positions = localCorners.map(local => {
            const world = new Vec3(center);
            Vec3.scaleAndAdd(world, world, right, local.x*width);
            Vec3.scaleAndAdd(world, world, up, local.y*height);
            Vec3.scaleAndAdd(world, world, dir, local.z*length);
            return world;
        });
        const indices = [
            [0,3,1,2], [5,6,4,7], [3,7,2,6],
            [1,5,0,4], [4,7,0,3], [1,2,5,6],
        ];
        const uvs = [new Vec2(0,0),new Vec2(0,1),new Vec2(1,0),new Vec2(1,1)];
        const white = new Color(255,255,255,255);
        const colors = Array(8).fill(null).map(()=>white.clone());
        return { positions, indices, uvs, colors };
    }

    _updataRender() {
        const totalSegs = this.points.length - 1;
        let boxIv=0, boxIu=0, boxIc=0, boxIi=0, boxVo=0;

        for (let i = 0; i < totalSegs; i++) {
            const data = this.generateBoxData(this.points[i], this.points[i+1], this.boxWidth, this.boxHeight);
            for (let p = 0; p < 6; p++) {
                if ((p===0&&i>0)||(p===1&&i<totalSegs-1)) continue;
                for (let v = 0; v < 4; v++) {
                    const vert = data.positions[data.indices[p][v]];
                    this._pos[boxIv++]=vert.x; this._pos[boxIv++]=vert.y; this._pos[boxIv++]=vert.z;
                    this._uv[boxIu++]=data.uvs[v].x; this._uv[boxIu++]=data.uvs[v].y;
                    if (i%2===0) {
                        this._col[boxIc++]=this.boxColor.r/255; this._col[boxIc++]=this.boxColor.g/255;
                        this._col[boxIc++]=this.boxColor.b/255; this._col[boxIc++]=this.boxColor.a/255;
                    } else {
                        this._col[boxIc++]=0;this._col[boxIc++]=0;this._col[boxIc++]=0;this._col[boxIc++]=1;
                    }
                }
                this._idx[boxIi++]=boxVo; this._idx[boxIi++]=boxVo+1;
                this._idx[boxIi++]=boxVo+2; this._idx[boxIi++]=boxVo+2;
                this._idx[boxIi++]=boxVo+1; this._idx[boxIi++]=boxVo+3;
                boxVo+=4;
            }
        }

        this._mesh.updateSubMesh(0, {
            positions: new Float32Array(this._pos.buffer,0,boxIv),
            indices16: new Uint16Array(this._idx.buffer,0,boxIi),
            uvs: new Float32Array(this._uv.buffer,0,boxIu),
            colors: new Float32Array(this._col.buffer,0,boxIc),
        });

        // Phase 2: Axis Mesh
        const asIv=boxIv,asIu=boxIu,asIc=boxIc,asIi=boxIi;
        let axisIv=asIv,axisIu=asIu,axisIc=asIc,axisIi=asIi,axisVo=0;

        // Body axes
        if (this.showAxes) {
            const worldDirs = [new Vec3(1,0,0),new Vec3(0,1,0),new Vec3(0,0,1)];
            const sLen=this.axisShaftLen,hLen=this.axisHeadLen,totalLen=sLen+hLen;
            const sW=this.axisShaftWidth,hW=this.axisHeadWidth;

            for (let i = 0; i < totalSegs; i++) {
                const p1=this.points[i],p2=this.points[i+1];
                const center=new Vec3();Vec3.add(center,p1,p2).multiplyScalar(0.5);
                const dir=new Vec3();Vec3.subtract(dir,p2,p1).normalize();
                const right=new Vec3();Vec3.cross(right,dir,new Vec3(0,1,0));
                if(right.lengthSqr()<0.0001)Vec3.cross(right,dir,new Vec3(1,0,0));
                right.normalize();
                const up=new Vec3();Vec3.cross(up,right,dir).normalize();
                const axes=[right,up,dir];
                const ac=[[1,0,0,1],[0,1,0,1],[0,0,1,1]];

                for(let a=0;a<3;a++){
                    const ax=axes[a],[cr,cg,cb,ca]=ac[a];
                    const N=8;
                    const p1v=new Vec3();const tu=new Vec3(0,1,0);
                    if(Math.abs(Vec3.dot(ax,tu))>0.99)tu.set(1,0,0);
                    Vec3.cross(p1v,ax,tu).normalize();
                    const p2v=new Vec3();Vec3.cross(p2v,ax,p1v).normalize();
                    const cx=center.x,cy=center.y,cz=center.z;
                    const sr=sW*0.5;
                    const bR:Vec3[]=[],tR:Vec3[]=[];
                    for(let i=0;i<N;i++){
                        const rad=(i/N)*Math.PI*2,cA=Math.cos(rad),sA=Math.sin(rad);
                        const rx=(p1v.x*cA+p2v.x*sA)*sr,ry=(p1v.y*cA+p2v.y*sA)*sr,rz=(p1v.z*cA+p2v.z*sA)*sr;
                        bR.push(new Vec3(cx+rx,cy+ry,cz+rz));
                        tR.push(new Vec3(cx+rx+ax.x*sLen,cy+ry+ax.y*sLen,cz+rz+ax.z*sLen));
                    }
                    const tip=new Vec3(cx+ax.x*totalLen,cy+ax.y*totalLen,cz+ax.z*totalLen);
                    for(let i=0;i<N;i++){const ni=(i+1)%N,verts=[bR[i],bR[ni],tR[ni],tR[i]];
                        for(const v of verts){this._pos[axisIv++]=v.x;this._pos[axisIv++]=v.y;this._pos[axisIv++]=v.z;this._uv[axisIu++]=0;this._uv[axisIu++]=0;this._col[axisIc++]=cr;this._col[axisIc++]=cg;this._col[axisIc++]=cb;this._col[axisIc++]=ca;}
                        this._idx[axisIi++]=axisVo;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+3;axisVo+=4;
                    }
                    const hr=hW*0.5;const hR:Vec3[]=[];
                    for(let i=0;i<N;i++){const rad=(i/N)*Math.PI*2,cA=Math.cos(rad),sA=Math.sin(rad);const rx=(p1v.x*cA+p2v.x*sA)*hr,ry=(p1v.y*cA+p2v.y*sA)*hr,rz=(p1v.z*cA+p2v.z*sA)*hr;hR.push(new Vec3(cx+rx+ax.x*sLen,cy+ry+ax.y*sLen,cz+rz+ax.z*sLen));}
                    for(let i=0;i<N;i++){const ni=(i+1)%N,verts=[hR[i],hR[ni],tip,tip];for(const v of verts){this._pos[axisIv++]=v.x;this._pos[axisIv++]=v.y;this._pos[axisIv++]=v.z;this._uv[axisIu++]=0;this._uv[axisIu++]=0;this._col[axisIc++]=cr;this._col[axisIc++]=cg;this._col[axisIc++]=cb;this._col[axisIc++]=ca;}this._idx[axisIi++]=axisVo;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+3;axisVo+=4;}
                }
            }
        }

        // CP Axes
        if (this.showCpAxes && this.knots.length > 0) {
            const worldDirs=[new Vec3(1,0,0),new Vec3(0,1,0),new Vec3(0,0,1)];
            const sLen=this.cpAxisShaftLen,hLen=this.cpAxisHeadLen,totalLen=sLen+hLen;
            const sW=this.cpAxisShaftWidth,hW=this.cpAxisHeadWidth;

            for(let ki=0;ki<this.knots.length;ki++){
                const knot=this.knots[ki],cp=knot.position;
                for(let a=0;a<3;a++){
                    const ax=worldDirs[a];
                    const isHover=(ki===this._evt.hoverKnotIdx&&a===this._evt.hoverAxisIdx);
                    const cr=isHover?1:(a===0?1:0),cg=isHover?1:(a===1?1:0),cb=isHover?0:(a===2?1:0),ca=1;
                    const N=8;
                    const p1v=new Vec3(),tu=new Vec3(0,1,0);
                    if(Math.abs(Vec3.dot(ax,tu))>0.99)tu.set(1,0,0);
                    Vec3.cross(p1v,ax,tu).normalize();const p2v=new Vec3();Vec3.cross(p2v,ax,p1v).normalize();
                    const cx=cp.x,cy=cp.y,cz=cp.z,sr=sW*0.5;
                    const bR:Vec3[]=[],tR:Vec3[]=[];
                    for(let i=0;i<N;i++){const rad=(i/N)*Math.PI*2,cA=Math.cos(rad),sA=Math.sin(rad);const rx=(p1v.x*cA+p2v.x*sA)*sr,ry=(p1v.y*cA+p2v.y*sA)*sr,rz=(p1v.z*cA+p2v.z*sA)*sr;bR.push(new Vec3(cx+rx,cy+ry,cz+rz));tR.push(new Vec3(cx+rx+ax.x*sLen,cy+ry+ax.y*sLen,cz+rz+ax.z*sLen));}
                    const tip=new Vec3(cx+ax.x*totalLen,cy+ax.y*totalLen,cz+ax.z*totalLen);
                    for(let i=0;i<N;i++){const ni=(i+1)%N,verts=[bR[i],bR[ni],tR[ni],tR[i]];for(const v of verts){this._pos[axisIv++]=v.x;this._pos[axisIv++]=v.y;this._pos[axisIv++]=v.z;this._uv[axisIu++]=0;this._uv[axisIu++]=0;this._col[axisIc++]=cr;this._col[axisIc++]=cg;this._col[axisIc++]=cb;this._col[axisIc++]=ca;}this._idx[axisIi++]=axisVo;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+3;axisVo+=4;}
                    const hr=hW*0.5;const hR:Vec3[]=[];
                    for(let i=0;i<N;i++){const rad=(i/N)*Math.PI*2,cA=Math.cos(rad),sA=Math.sin(rad);const rx=(p1v.x*cA+p2v.x*sA)*hr,ry=(p1v.y*cA+p2v.y*sA)*hr,rz=(p1v.z*cA+p2v.z*sA)*hr;hR.push(new Vec3(cx+rx+ax.x*sLen,cy+ry+ax.y*sLen,cz+rz+ax.z*sLen));}
                    for(let i=0;i<N;i++){const ni=(i+1)%N,verts=[hR[i],hR[ni],tip,tip];for(const v of verts){this._pos[axisIv++]=v.x;this._pos[axisIv++]=v.y;this._pos[axisIv++]=v.z;this._uv[axisIu++]=0;this._uv[axisIu++]=0;this._col[axisIc++]=cr;this._col[axisIc++]=cg;this._col[axisIc++]=cb;this._col[axisIc++]=ca;}this._idx[axisIi++]=axisVo;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+3;axisVo+=4;}
                }

                // Tangent axes
                const tScale=this.cpTangentSize/this.cpSize;
                const tSLen=this.cpAxisShaftLen*tScale,tHLen=this.cpAxisHeadLen*tScale,tTotal=tSLen+tHLen;
                const tSW=this.cpAxisShaftWidth*tScale,tHW=this.cpAxisHeadWidth*tScale;
                const tanOff=[knot.inTangent,knot.outTangent];
                for(let ti=0;ti<2;ti++){
                    const off=tanOff[ti],tx=cp.x+off.x,ty=cp.y+off.y,tz=cp.z+off.z;
                    for(let a=0;a<3;a++){
                        const ax=worldDirs[a];
                        const isHover=(ki===this._evt.hoverTanKnotIdx&&ti===this._evt.hoverTanDir&&a===this._evt.hoverTanAxis);
                        const cr=isHover?1:(a===0?1:0),cg=isHover?1:(a===1?1:0),cb=isHover?0:(a===2?1:0),ca=1;
                        const N=8;
                        const p1v=new Vec3(),tu1=new Vec3(0,1,0);
                        if(Math.abs(Vec3.dot(ax,tu1))>0.99)tu1.set(1,0,0);
                        Vec3.cross(p1v,ax,tu1).normalize();const p2v=new Vec3();Vec3.cross(p2v,ax,p1v).normalize();
                        const sr=tSW*0.5;const bR:Vec3[]=[],tR:Vec3[]=[];
                        for(let i=0;i<N;i++){const rad=(i/N)*Math.PI*2,cA=Math.cos(rad),sA=Math.sin(rad);const rx=(p1v.x*cA+p2v.x*sA)*sr,ry=(p1v.y*cA+p2v.y*sA)*sr,rz=(p1v.z*cA+p2v.z*sA)*sr;bR.push(new Vec3(tx+rx,ty+ry,tz+rz));tR.push(new Vec3(tx+rx+ax.x*tSLen,ty+ry+ax.y*tSLen,tz+rz+ax.z*tSLen));}
                        const tip=new Vec3(tx+ax.x*tTotal,ty+ax.y*tTotal,tz+ax.z*tTotal);
                        for(let i=0;i<N;i++){const ni=(i+1)%N,verts=[bR[i],bR[ni],tR[ni],tR[i]];for(const v of verts){this._pos[axisIv++]=v.x;this._pos[axisIv++]=v.y;this._pos[axisIv++]=v.z;this._uv[axisIu++]=0;this._uv[axisIu++]=0;this._col[axisIc++]=cr;this._col[axisIc++]=cg;this._col[axisIc++]=cb;this._col[axisIc++]=ca;}this._idx[axisIi++]=axisVo;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+3;axisVo+=4;}
                        const hr=tHW*0.5;const hR:Vec3[]=[];
                        for(let i=0;i<N;i++){const rad=(i/N)*Math.PI*2,cA=Math.cos(rad),sA=Math.sin(rad);const rx=(p1v.x*cA+p2v.x*sA)*hr,ry=(p1v.y*cA+p2v.y*sA)*hr,rz=(p1v.z*cA+p2v.z*sA)*hr;hR.push(new Vec3(tx+rx+ax.x*tSLen,ty+ry+ax.y*tSLen,tz+rz+ax.z*tSLen));}
                        for(let i=0;i<N;i++){const ni=(i+1)%N,verts=[hR[i],hR[ni],tip,tip];for(const v of verts){this._pos[axisIv++]=v.x;this._pos[axisIv++]=v.y;this._pos[axisIv++]=v.z;this._uv[axisIu++]=0;this._uv[axisIu++]=0;this._col[axisIc++]=cr;this._col[axisIc++]=cg;this._col[axisIc++]=cb;this._col[axisIc++]=ca;}this._idx[axisIi++]=axisVo;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+2;this._idx[axisIi++]=axisVo+1;this._idx[axisIi++]=axisVo+3;axisVo+=4;}
                    }
                }
            }
        }

        const af=axisIv-asIv;
        if(af>0){
            this._mesh.updateSubMesh(1,{positions:new Float32Array(this._pos.buffer,asIv*4,af),indices16:new Uint16Array(this._idx.buffer,asIi*2,axisIi-asIi),uvs:new Float32Array(this._uv.buffer,asIu*4,axisIu-asIu),colors:new Float32Array(this._col.buffer,asIc*4,axisIc-asIc)});
            if(this.materials.length>1)this._meshRenderer.setSharedMaterial(this.materials[1],1);
        }else{
            this._mesh.updateSubMesh(1,{positions:new Float32Array(0),indices16:new Uint16Array(0),uvs:new Float32Array(0),colors:new Float32Array(0)});
        }

        // Phase 3: CP Boxes
        const csIv=axisIv,csIc=axisIc,csIu=axisIu,csIi=axisIi;
        let cpIv=csIv,cpIu=csIu,cpIc=csIc,cpIi=csIi,cpVo=0;
        this.knots=this.node.getComponent(SplinePath).knots;

        if(this.knots.length>0){
            const s=this.cpSize,ts=this.cpTangentSize;
            const colors=[
                [this.cpAnchorColor.r/255,this.cpAnchorColor.g/255,this.cpAnchorColor.b/255,this.cpAnchorColor.a/255],
                [this.cpInColor.r/255,this.cpInColor.g/255,this.cpInColor.b/255,this.cpInColor.a/255],
                [this.cpOutColor.r/255,this.cpOutColor.g/255,this.cpOutColor.b/255,this.cpOutColor.a/255],
            ];
            for(let ki=0;ki<this.knots.length;ki++){
                const knot=this.knots[ki];
                const items=[
                    {pos:knot.position,size:new Vec3(s,s,s)},
                    {pos:new Vec3(knot.position).add(knot.inTangent),size:new Vec3(ts,ts,ts)},
                    {pos:new Vec3(knot.position).add(knot.outTangent),size:new Vec3(ts,ts,ts)},
                ];
                for(let idx=0;idx<3;idx++){
                    let [cr,cg,cb,ca]=colors[idx];
                    if(idx===0&&ki===this._evt.hoverAnchorIdx){cr=1;cg=1;cb=0;ca=1;}
                    const {pos,size}=items[idx];
                    const halfD=size.z/2;
                    const p1=new Vec3(pos.x,pos.y,pos.z-halfD),p2=new Vec3(pos.x,pos.y,pos.z+halfD);
                    const data=this.generateBoxData(p1,p2,size.x,size.y);
                    for(let p=0;p<6;p++){
                        for(let v=0;v<4;v++){
                            const vert=data.positions[data.indices[p][v]];
                            this._pos[cpIv++]=vert.x;this._pos[cpIv++]=vert.y;this._pos[cpIv++]=vert.z;
                            this._uv[cpIu++]=data.uvs[v].x;this._uv[cpIu++]=data.uvs[v].y;
                            this._col[cpIc++]=cr;this._col[cpIc++]=cg;this._col[cpIc++]=cb;this._col[cpIc++]=ca;
                        }
                        this._idx[cpIi++]=cpVo;this._idx[cpIi++]=cpVo+1;this._idx[cpIi++]=cpVo+2;
                        this._idx[cpIi++]=cpVo+2;this._idx[cpIi++]=cpVo+1;this._idx[cpIi++]=cpVo+3;
                        cpVo+=4;
                    }
                }
            }
        }

        const cf=cpIv-csIv;
        if(cf>0){
            this._mesh.updateSubMesh(2,{positions:new Float32Array(this._pos.buffer,csIv*4,cf),indices16:new Uint16Array(this._idx.buffer,csIi*2,cpIi-csIi),uvs:new Float32Array(this._uv.buffer,csIu*4,cpIu-csIu),colors:new Float32Array(this._col.buffer,csIc*4,cpIc-csIc)});
            if(this.materials.length>2)this._meshRenderer.setSharedMaterial(this.materials[2],2);
        }else{
            this._mesh.updateSubMesh(2,{positions:new Float32Array(0),indices16:new Uint16Array(0),uvs:new Float32Array(0),colors:new Float32Array(0)});
        }
        this._meshRenderer.onGeometryChanged();
    }

}
