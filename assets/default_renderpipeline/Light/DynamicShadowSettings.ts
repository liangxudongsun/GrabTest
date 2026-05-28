import { _decorator, CCFloat, CCBoolean, Component, director, renderer, SpotLight, DirectionalLight, Light, rendering, gfx } from 'cc';
const { ccclass, property ,executeInEditMode ,icon } = _decorator;
const { PCFType, ShadowType  } = renderer.scene;

function shadowVisible(): boolean {
    return (director.root as any).pipeline.pipelineSceneData.shadows.type === ShadowType.ShadowMap;
}

@ccclass('DynamicShadowSettings')
export class DynamicShadowSettings extends Component{
    @property 
    private _shadowEnabled = true;
    @property 
    private _shadowPcf = PCFType.HARD;
    @property 
    private _shadowBias = 0.00001;
    @property 
    private _shadowNormalBias = 0.0;


    protected onLoad(): void {
      
    }

    

    @property({
        tooltip: '是否启用动态阴影',
         visible: shadowVisible,
    })
    get shadowEnabled(): boolean { return this._shadowEnabled; }
    set shadowEnabled(val: boolean) {
        this._shadowEnabled = val;
    }

    @property({
        tooltip: '阴影 PCF 等级',
        visible: shadowVisible,
      
        type: PCFType,
    })
    get shadowPcf(): number { return this._shadowPcf; }
    set shadowPcf(val: number) {
        this._shadowPcf = val;
        
    }

    @property({
        tooltip: '阴影深度偏移',
        visible: shadowVisible,
      
        type: CCFloat,
    })
    get shadowBias(): number { return this._shadowBias; }
    set shadowBias(val: number) {
        this._shadowBias = val;
       
    }

    @property({
        tooltip: '阴影法线偏移',
        visible: shadowVisible,
    
        type: CCFloat,
    })
    get shadowNormalBias(): number { return this._shadowNormalBias; }
    set shadowNormalBias(val: number) {
        this._shadowNormalBias = val;
       
    }

   
}






