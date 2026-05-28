import { _decorator, CCFloat, CCBoolean, Component, director, renderer, SpotLight, DirectionalLight, Light, rendering, Enum } from 'cc';
import { DynamicShadowSettings } from './DynamicShadowSettings';
const { ccclass, property ,executeInEditMode ,disallowMultiple,requireComponent} = _decorator;
// ShadowMapSize.ts
export enum ShadowMapSize {
    _64 = 64,
    /** 256 x 256 */
    _256 = 256,
    /** 512 x 512 */
    _512 = 512,
    /** 1024 x 1024 */
    _1024 = 1024,
    /** 2048 x 2048 */
    _2048 = 2048,
    /** 4096 x 4096 */
    _4096 = 4096,
}

@ccclass('LightSettings')
@executeInEditMode(true)
@requireComponent(DynamicShadowSettings)
@disallowMultiple(true)
export class LightSettings extends Component {
    // 阴影贴图尺寸（使用枚举挡位）
    @property({
        type: Enum(ShadowMapSize), // 关键：通过 Enum() 包裹枚举
        tooltip: '阴影贴图分辨率',
    })
    shadowMapSize: ShadowMapSize = ShadowMapSize._256;
    
    // 其他阴影参数 ...
}






