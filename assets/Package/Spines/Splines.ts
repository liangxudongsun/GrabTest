import { _decorator, Component, Color, Vec3, Material, Enum } from 'cc';
import { EDITOR } from 'cc/env';
import { BezierKnot } from './BezierKnot';
import { CCEManager, PanelManager, UploadJsonPanel } from '../../Plans/index';
import { SplinesEvent } from './SplinesEvent';
import { SplinePath, CurveType, SamplingMode } from './SplinePath';
import { SplinesRender } from './SplinesRender';
import { ISplines, ISplineHover } from './ISplines';

const { ccclass, property, executeInEditMode,menu } = _decorator;

@ccclass('Splines')
@menu('Package/Splines')
@executeInEditMode(true)
export class Splines extends Component implements ISplines {
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

    @property({ displayName: 'Box Width' }) boxWidth = 0.2;
    @property({ displayName: 'Box Height' }) boxHeight = 0.4;
    @property({ displayName: 'Box Color' }) boxColor = new Color(255, 255, 255, 255);

    @property({ displayName: 'Axis Shaft Len' }) axisShaftLen = 0.35;
    @property({ displayName: 'Axis Head Len' }) axisHeadLen = 0.15;
    @property({ displayName: 'Axis Shaft Width' }) axisShaftWidth = 0.02;
    @property({ displayName: 'Axis Head Width' }) axisHeadWidth = 0.06;

    @property({ displayName: 'CP Anchor Size' }) cpSize = 0.5;
    @property({ displayName: 'CP Tangent Size' }) cpTangentSize = 0.12;
    @property({ displayName: 'CP Anchor Color' }) cpAnchorColor = new Color(255, 255, 255, 255);
    @property({ displayName: 'CP InTangent Color' }) cpInColor = new Color(255, 200, 0, 255);
    @property({ displayName: 'CP OutTangent Color' }) cpOutColor = new Color(0, 200, 255, 255);

    @property({ displayName: 'CP Show Axes' }) showCpAxes = false;
    @property({ displayName: 'CP Axis Shaft Len' }) cpAxisShaftLen = 0.35;
    @property({ displayName: 'CP Axis Head Len' }) cpAxisHeadLen = 0.15;
    @property({ displayName: 'CP Axis Shaft Width' }) cpAxisShaftWidth = 0.02;
    @property({ displayName: 'CP Axis Head Width' }) cpAxisHeadWidth = 0.06;
    
    @property({type:SplinePath})
    path:SplinePath|null;

    _evt: SplinesEvent;
    private _render: SplinesRender;
    selectedKnotIdx = -1;

    get hover(): ISplineHover { return this._evt; }

    protected onEnable(): void {
        if (!EDITOR || !this._evt) return;
        CCEManager.add(this.node['_id'] + '_splines', this._evt.onSceneEvent, 'scene');
    }

    protected onDisable(): void {
        if (!EDITOR) return;
        PanelManager.destroy(PanelManager.id(this.node, 'UploadJsonPanel'));
        PanelManager.destroy(PanelManager.id(this.node, 'SplinePanel'));
        PanelManager.destroy(PanelManager.id(this.node, 'SplineDelete'));
        CCEManager.remove(this.node['_id'] + '_splines');
    }

    protected onLoad(): void {
        if (!EDITOR) return;
        PanelManager.registerNode(this.node);
        this.path = new SplinePath();
        this._render = new SplinesRender(this);
        this._evt = new SplinesEvent(this);
        CCEManager.add(this.node['_id'] + '_splines', this._evt.onSceneEvent, 'scene');
    }

    protected onDestroy(): void {
        if (!EDITOR) return;
        PanelManager.unregisterNode(this.node);
        CCEManager.remove(this.node['_id'] + '_splines');
    }

    update() {
        if (!EDITOR) return;

        // 曲线采样
        this.points = this.path.sample(this.knots);

        if (this.showPlan) {
            if (!PanelManager.has(PanelManager.id(this.node, 'UploadJsonPanel'))) {
                PanelManager.register(PanelManager.id(this.node, 'UploadJsonPanel'), new UploadJsonPanel(PanelManager.id(this.node, 'UploadJsonPanel'),
                    () =>{
                         const flatArray: number[] = this.points.flatMap(v => [v.x, v.y, v.z]);
                         CCEManager.writeJson(this.uploadUrl, { path: flatArray })
                    },
                    () => { this.showPlan = false; },
                ));
            }
        } else {
            PanelManager.destroy(PanelManager.id(this.node, 'UploadJsonPanel'));
        }
        this._render.render();
    }
}
