/*
 Copyright (c) 2021-2024 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

import {
    _decorator, Camera, CCBoolean, CCFloat, CCInteger, Component,
    Material, rendering, Texture2D,
} from 'cc';

import { EDITOR } from 'cc/env';

import * as builtinPipelineTypes from './builtin-pipeline-types';
import { CombineGrabPass } from './CombineGrabPass';

const { ccclass, disallowMultiple, executeInEditMode, menu, property, requireComponent, type } = _decorator;

@ccclass('BuiltinPipelineSettings')
@menu('Rendering/BuiltinPipelineSettings')
@requireComponent(Camera)
@disallowMultiple
@executeInEditMode
export class BuiltinPipelineSettings extends Component {
    @property
    private readonly _settings: builtinPipelineTypes.PipelineSettings = builtinPipelineTypes.makePipelineSettings();

    getPipelineSettings(): builtinPipelineTypes.PipelineSettings {
        return this._settings;
    }

    // Enable/Disable
    onEnable(): void {
        builtinPipelineTypes.fillRequiredPipelineSettings(this._settings);
        const cameraComponent = this.getComponent(Camera)!;
        const camera = cameraComponent.camera;
        camera.pipelineSettings = this._settings;

        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    onDisable(): void {
        const cameraComponent = this.getComponent(Camera)!;
        const camera = cameraComponent.camera;
        if (camera) {
            camera.pipelineSettings = null;
        }
        if (EDITOR) {
            this._disableEditorPreview();
        }
    }

    // Editor Preview
    @property(CCBoolean)
    protected _editorPreview = false;

    @property({
        displayName: 'Editor Preview (Experimental)',
        type: CCBoolean,
    })
    get editorPreview(): boolean {
        return this._editorPreview;
    }
    set editorPreview(v: boolean) {
        this._editorPreview = v;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    public _tryEnableEditorPreview(): void {
        if (rendering === undefined) {
            return;
        }
        if (this._editorPreview) {
            rendering.setEditorPipelineSettings(this._settings);
        } else {
            this._disableEditorPreview();
        }
    }
    public _disableEditorPreview(): void {
        if (rendering === undefined) {
            return;
        }
        const current = rendering.getEditorPipelineSettings() as builtinPipelineTypes.PipelineSettings | null;
        if (current === this._settings) {
            rendering.setEditorPipelineSettings(null);
        }
    }

    // MSAA
    @property({
        group: { id: 'MSAA', name: 'Multisample Anti-Aliasing' },
        type: CCBoolean,
    })
    get MsaaEnable(): boolean {
        return this._settings.msaa.enabled;
    }
    set MsaaEnable(value: boolean) {
        this._settings.msaa.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }

    @property({
        group: { id: 'MSAA', name: 'Multisample Anti-Aliasing', style: 'section' },
        type: CCInteger,
        range: [2, 4, 2],
    })
    set msaaSampleCount(value: number) {
        value = 2 ** Math.ceil(Math.log2(Math.max(value, 2)));
        value = Math.min(value, 4);
        this._settings.msaa.sampleCount = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get msaaSampleCount(): number {
        return this._settings.msaa.sampleCount;
    }

    // Shading Scale
    @property({
        group: { id: 'ShadingScale', name: 'ShadingScale', style: 'section' },
        type: CCBoolean,
    })
    set shadingScaleEnable(value: boolean) {
        this._settings.enableShadingScale = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get shadingScaleEnable(): boolean {
        return this._settings.enableShadingScale;
    }

    @property({
        tooltip: 'i18n:postprocess.shadingScale',
        group: { id: 'ShadingScale', name: 'ShadingScale' },
        type: CCFloat,
        range: [0.01, 4, 0.01],
        slide: true,
    })
    set shadingScale(value: number) {
        this._settings.shadingScale = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get shadingScale(): number {
        return this._settings.shadingScale;
    }

    // Bloom
    @property({
        group: { id: 'Bloom', name: 'Bloom (PostProcessing)', style: 'section' },
        type: CCBoolean,
    })
    set bloomEnable(value: boolean) {
        this._settings.bloom.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bloomEnable(): boolean {
        return this._settings.bloom.enabled;
    }

    @type(builtinPipelineTypes.BloomType)
    @property({
        group: { id: 'Bloom', name: 'Bloom (PostProcessing)', style: 'section' },
    })
    set bloomType(value: builtinPipelineTypes.BloomType) {
        this._settings.bloom.type = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }

    get bloomType(): builtinPipelineTypes.BloomType {
        return this._settings.bloom.type;
    }

    @property({
        group: { id: 'Bloom', name: 'Bloom (PostProcessing)', style: 'section' },
        type: Material,
    })
    set kawaseBloomMaterial(value: Material) {
        if (this._settings.bloom.kawaseFilterMaterial === value) {
            return;
        }
        this._settings.bloom.kawaseFilterMaterial = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get kawaseBloomMaterial(): Material {
        return this._settings.bloom.kawaseFilterMaterial!;
    }

    @property({
        group: { id: 'Bloom', name: 'Bloom (PostProcessing)', style: 'section' },
        type: Material,
    })
    set mipmapBloomMaterial(value: Material) {
        if (this._settings.bloom.mipmapFilterMaterial === value) {
            return;
        }
        this._settings.bloom.mipmapFilterMaterial = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get mipmapBloomMaterial(): Material {
        return this._settings.bloom.mipmapFilterMaterial!;
    }

    @property({
        tooltip: 'i18n:bloom.enableAlphaMask',
        group: { id: 'Bloom', name: 'Bloom (PostProcessing)', style: 'section' },
        type: CCBoolean,
    })
    set bloomEnableAlphaMask(value: boolean) {
        this._settings.bloom.enableAlphaMask = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bloomEnableAlphaMask(): boolean {
        return this._settings.bloom.enableAlphaMask;
    }

    @property({
        tooltip: 'i18n:bloom.iterations',
        group: { id: 'Bloom', name: 'Bloom (PostProcessing)', style: 'section' },
        type: CCInteger,
        range: [1, 6, 1],
        slide: true,
    })
    set bloomIterations(value: number) {
        this._settings.bloom.iterations = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bloomIterations(): number {
        return this._settings.bloom.iterations;
    }

    @property({
        tooltip: 'i18n:bloom.threshold',
        group: { id: 'Bloom', name: 'Bloom (PostProcessing)', style: 'section' },
        type: CCFloat,
        min: 0,
    })
    set bloomThreshold(value: number) {
        this._settings.bloom.threshold = value;
    }
    get bloomThreshold(): number {
        return this._settings.bloom.threshold;
    }

    @type(CCFloat)
    @property({
        group: { id: 'Bloom', name: 'Bloom (PostProcessing)', style: 'section' },
    })
    set bloomIntensity(value: number) {
        this._settings.bloom.intensity = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bloomIntensity(): number {
        return this._settings.bloom.intensity;
    }

    // Color Grading (LDR)
    @property({
        group: { id: 'Color Grading', name: 'ColorGrading (LDR) (PostProcessing)', style: 'section' },
        type: CCBoolean,
    })
    set colorGradingEnable(value: boolean) {
        this._settings.colorGrading.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get colorGradingEnable(): boolean {
        return this._settings.colorGrading.enabled;
    }

    @property({
        group: { id: 'Color Grading', name: 'ColorGrading (LDR) (PostProcessing)', style: 'section' },
        type: Material,
    })
    set colorGradingMaterial(value: Material) {
        if (this._settings.colorGrading.material === value) {
            return;
        }
        this._settings.colorGrading.material = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get colorGradingMaterial(): Material {
        return this._settings.colorGrading.material!;
    }

    @property({
        tooltip: 'i18n:color_grading.contribute',
        group: { id: 'Color Grading', name: 'ColorGrading (LDR) (PostProcessing)', style: 'section' },
        type: CCFloat,
        range: [0, 1, 0.01],
        slide: true,
    })
    set colorGradingContribute(value: number) {
        this._settings.colorGrading.contribute = value;
    }
    get colorGradingContribute(): number {
        return this._settings.colorGrading.contribute;
    }

    @property({
        tooltip: 'i18n:color_grading.originalMap',
        group: { id: 'Color Grading', name: 'ColorGrading (LDR) (PostProcessing)', style: 'section' },
        type: Texture2D,
    })
    set colorGradingMap(val: Texture2D) {
        this._settings.colorGrading.colorGradingMap = val;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get colorGradingMap(): Texture2D {
        return this._settings.colorGrading.colorGradingMap!;
    }

    // FXAA
    @property({
        group: { id: 'FXAA', name: 'Fast Approximate Anti-Aliasing (PostProcessing)', style: 'section' },
        type: CCBoolean,
    })
    set fxaaEnable(value: boolean) {
        this._settings.fxaa.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get fxaaEnable(): boolean {
        return this._settings.fxaa.enabled;
    }

    @property({
        group: { id: 'FXAA', name: 'Fast Approximate Anti-Aliasing (PostProcessing)', style: 'section' },
        type: Material,
    })
    set fxaaMaterial(value: Material) {
        if (this._settings.fxaa.material === value) {
            return;
        }
        this._settings.fxaa.material = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get fxaaMaterial(): Material {
        return this._settings.fxaa.material!;
    }

    // FSR
    @property({
        group: { id: 'FSR', name: 'FidelityFX Super Resolution', style: 'section' },
        type: CCBoolean,
    })
    set fsrEnable(value: boolean) {
        this._settings.fsr.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get fsrEnable(): boolean {
        return this._settings.fsr.enabled;
    }

    @property({
        group: { id: 'FSR', name: 'FidelityFX Super Resolution', style: 'section' },
        type: Material,
    })
    set fsrMaterial(value: Material) {
        if (this._settings.fsr.material === value) {
            return;
        }
        this._settings.fsr.material = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get fsrMaterial(): Material {
        return this._settings.fsr.material!;
    }

    @property({
        group: { id: 'FSR', name: 'FidelityFX Super Resolution', style: 'section' },
        type: CCFloat,
        range: [0, 1, 0.01],
        slide: true,
    })
    set fsrSharpness(value: number) {
        this._settings.fsr.sharpness = value;
    }
    get fsrSharpness(): number {
        return this._settings.fsr.sharpness;
    }

    @property({
        group: { id: 'ToneMapping', name: 'ToneMapping', style: 'section' },
        type: Material,
    })
    set toneMappingMaterial(value: Material) {
        if (this._settings.toneMapping.material === value) {
            return;
        }
        this._settings.toneMapping.material = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get toneMappingMaterial(): Material {
        return this._settings.toneMapping.material!;
    }

     // Grab
    @property({
        group: { id: 'Grab', name: 'Grab', style: 'section' },
        type: CCBoolean,
    })
    set grabEnable(value: boolean) {
        this._settings.grab.enable = value;
       
        if(value==true){
            let combineGrabPass=this.node.getComponent(CombineGrabPass);
            if(!combineGrabPass){
                combineGrabPass=this.node.addComponent(CombineGrabPass);
            }
            combineGrabPass.enabled=true;
           
        }else{
             let combineGrabPass=this.node.getComponent(CombineGrabPass);
            if(combineGrabPass){
                combineGrabPass.enabled=false;
            }
        }
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get grabEnable(): boolean {
        return this._settings.grab.enable;
    }

    // BasePass
    @property({
        group: { id: 'BasePass', name: 'Base Pass', style: 'section' },
        type: CCBoolean,
    })
    set basePassEnabled(value: boolean) {
        this._settings.basePass.enabled = value;
        if (EDITOR) this._tryEnableEditorPreview();
    }
    get basePassEnabled(): boolean {
        return this._settings.basePass.enabled;
    }

    @property({
        group: { id: 'BasePass', name: 'Base Pass', style: 'section' },
        type: builtinPipelineTypes.ShadowMapSize,
    })
    set spotShadowAtlasSize(value: builtinPipelineTypes.ShadowMapSize) {
        this._settings.basePass.spotShadowAtlasSize = value;
        if (EDITOR) this._tryEnableEditorPreview();
    }
    get spotShadowAtlasSize(): builtinPipelineTypes.ShadowMapSize {
        return this._settings.basePass.spotShadowAtlasSize;
    }

    @property({
        group: { id: 'BasePass', name: 'Base Pass', style: 'section' },
        type: builtinPipelineTypes.ShadowMapSize,
    })
    set spotShadowMapSize(value: builtinPipelineTypes.ShadowMapSize) {
        this._settings.basePass.spotShadowMapSize = value;
        if (EDITOR) this._tryEnableEditorPreview();
    }
    get spotShadowMapSize(): builtinPipelineTypes.ShadowMapSize {
        return this._settings.basePass.spotShadowMapSize;
    }

    @property({
        group: { id: 'BasePass', name: 'Base Pass', style: 'section' },
        type: builtinPipelineTypes.ShadowMapSize,
    })
    set rangedDirShadowAtlasSize(value: builtinPipelineTypes.ShadowMapSize) {
        this._settings.basePass.rangedDirShadowAtlasSize = value;
        if (EDITOR) this._tryEnableEditorPreview();
    }
    get rangedDirShadowAtlasSize(): builtinPipelineTypes.ShadowMapSize {
        return this._settings.basePass.rangedDirShadowAtlasSize;
    }

    @property({
        group: { id: 'BasePass', name: 'Base Pass', style: 'section' },
        type: builtinPipelineTypes.ShadowMapSize,
    })
    set rangedDirShadowMapSize(value: builtinPipelineTypes.ShadowMapSize) {
        this._settings.basePass.rangedDirShadowMapSize = value;
        if (EDITOR) this._tryEnableEditorPreview();
    }
    get rangedDirShadowMapSize(): builtinPipelineTypes.ShadowMapSize {
        return this._settings.basePass.rangedDirShadowMapSize;
    }

    @property({
        group: { id: 'BasePass', name: 'Base Pass', style: 'section' },
        type: builtinPipelineTypes.ShadowMapSize,
    })
    set sphereShadowAtlasSize(value: builtinPipelineTypes.ShadowMapSize) {
        this._settings.basePass.sphereShadowAtlasSize = value;
        if (EDITOR) this._tryEnableEditorPreview();
    }
    get sphereShadowAtlasSize(): builtinPipelineTypes.ShadowMapSize {
        return this._settings.basePass.sphereShadowAtlasSize;
    }

    @property({
        group: { id: 'BasePass', name: 'Base Pass', style: 'section' },
        type: builtinPipelineTypes.ShadowMapSize,
    })
    set sphereShadowMapSize(value: builtinPipelineTypes.ShadowMapSize) {
        this._settings.basePass.sphereShadowMapSize = value;
        if (EDITOR) this._tryEnableEditorPreview();
    }
    get sphereShadowMapSize(): builtinPipelineTypes.ShadowMapSize {
        return this._settings.basePass.sphereShadowMapSize;
    }

    // Frosted Glass
    @property({
        group: { id: 'FrostedGlass', name: 'Frosted Glass (PostProcessing)', style: 'section' },
        type: CCBoolean,
    })
    set frostedGlassEnable(value: boolean) {
        this._settings.frostedGlass.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get frostedGlassEnable(): boolean {
        return this._settings.frostedGlass.enabled;
    }

    @property({
        tooltip: '高斯模糊材质（需包含水平+垂直两个pass）',
        group: { id: 'FrostedGlass', name: 'Frosted Glass (PostProcessing)', style: 'section' },
        type: Material,
    })
    set frostedGlassBlurMaterial(value: Material) {
        if (this._settings.frostedGlass.blurMaterial === value) {
            return;
        }
        this._settings.frostedGlass.blurMaterial = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get frostedGlassBlurMaterial(): Material {
        return this._settings.frostedGlass.blurMaterial!;
    }

    @property({
        tooltip: '模糊迭代次数（每次=1水平+1垂直），次数越多越模糊',
        group: { id: 'FrostedGlass', name: 'Frosted Glass (PostProcessing)', style: 'section' },
        type: CCInteger,
        range: [1, 6, 1],
        slide: true,
    })
    set frostedGlassBlurIterations(value: number) {
        this._settings.frostedGlass.blurIterations = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get frostedGlassBlurIterations(): number {
        return this._settings.frostedGlass.blurIterations;
    }

    @property({
        tooltip: '降采样倍数（2=半分辨率模糊，性能更好）',
        group: { id: 'FrostedGlass', name: 'Frosted Glass (PostProcessing)', style: 'section' },
        type: CCInteger,
        range: [1, 4, 1],
        slide: true,
    })
    set frostedGlassDownSample(value: number) {
        this._settings.frostedGlass.downSample = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get frostedGlassDownSample(): number {
        return this._settings.frostedGlass.downSample;
    }

    // BlurPass
    @property({
        group: { id: 'BlurPass', name: 'BlurPass', style: 'section' },
        type: CCBoolean,
    })
    set blurPassEnable(value: boolean) {
        this._settings.blurPass.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get blurPassEnable(): boolean {
        return this._settings.blurPass.enabled;
    }

    @property({
        tooltip: '模糊强度',
        group: { id: 'BlurPass', name: 'BlurPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 10.0, 0.1],
        slide: true,
    })
    set blurPassAmount(value: number) {
        this._settings.blurPass.blurAmount = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get blurPassAmount(): number {
        return this._settings.blurPass.blurAmount;
    }

    @property({
        tooltip: '降采样尺寸数组（长度4，值越大分辨率越低）',
        group: { id: 'BlurPass', name: 'BlurPass', style: 'section' },
        type: [CCInteger],
    })
    set blurPassSizes(value: number[]) {
        this._settings.blurPass.sizes = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get blurPassSizes(): number[] {
        return this._settings.blurPass.sizes;
    }

    // BufferBloomPass
    @property({
        group: { id: 'BufferBloomPass', name: 'BufferBloomPass', style: 'section' },
        type: CCBoolean,
    })
    set bufferBloomPassEnable(value: boolean) {
        this._settings.bufferBloomPass.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bufferBloomPassEnable(): boolean {
        return this._settings.bufferBloomPass.enabled;
    }

    @property({
        tooltip: '亮度阈值（超过此值的像素才会发光）',
        group: { id: 'BufferBloomPass', name: 'BufferBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 2.0, 0.01],
        slide: true,
    })
    set bufferBloomThreshold(value: number) {
        this._settings.bufferBloomPass.threshold = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bufferBloomThreshold(): number {
        return this._settings.bufferBloomPass.threshold;
    }

    @property({
        tooltip: '泛光强度',
        group: { id: 'BufferBloomPass', name: 'BufferBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 10.0, 0.1],
        slide: true,
    })
    set bufferBloomIntensity(value: number) {
        this._settings.bufferBloomPass.intensity = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bufferBloomIntensity(): number {
        return this._settings.bufferBloomPass.intensity;
    }

    @property({
        tooltip: '起始 Mipmap 级别',
        group: { id: 'BufferBloomPass', name: 'BufferBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 10.0, 0.1],
        slide: true,
    })
    set bufferBloomLodStart(value: number) {
        this._settings.bufferBloomPass.lodStart = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bufferBloomLodStart(): number {
        return this._settings.bufferBloomPass.lodStart;
    }

    @property({
        tooltip: '模糊级别数量',
        group: { id: 'BufferBloomPass', name: 'BufferBloomPass', style: 'section' },
        type: CCFloat,
        range: [1.0, 10.0, 0.1],
        slide: true,
    })
    set bufferBloomLodCount(value: number) {
        this._settings.bufferBloomPass.lodCount = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bufferBloomLodCount(): number {
        return this._settings.bufferBloomPass.lodCount;
    }

    @property({
        tooltip: '泛光色调 R',
        group: { id: 'BufferBloomPass', name: 'BufferBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 1.0, 0.01],
        slide: true,
    })
    set bufferBloomTintR(value: number) {
        this._settings.bufferBloomPass.bloomTintR = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bufferBloomTintR(): number {
        return this._settings.bufferBloomPass.bloomTintR;
    }

    @property({
        tooltip: '泛光色调 G',
        group: { id: 'BufferBloomPass', name: 'BufferBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 1.0, 0.01],
        slide: true,
    })
    set bufferBloomTintG(value: number) {
        this._settings.bufferBloomPass.bloomTintG = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bufferBloomTintG(): number {
        return this._settings.bufferBloomPass.bloomTintG;
    }

    @property({
        tooltip: '泛光色调 B',
        group: { id: 'BufferBloomPass', name: 'BufferBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 1.0, 0.01],
        slide: true,
    })
    set bufferBloomTintB(value: number) {
        this._settings.bufferBloomPass.bloomTintB = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get bufferBloomTintB(): number {
        return this._settings.bufferBloomPass.bloomTintB;
    }

    @property({
        tooltip: '自定义材质（可选）',
        group: { id: 'BufferBloomPass', name: 'BufferBloomPass', style: 'section' },
        type: Material,
    })
    set bufferBloomMaterial(value: Material) {
        if (this._settings.bufferBloomPass.material === value) return;
        this._settings.bufferBloomPass.material = value;
        if (EDITOR) this._tryEnableEditorPreview();
    }
    get bufferBloomMaterial(): Material {
        return this._settings.bufferBloomPass.material!;
    }

    // SceneBloomPass
    @property({
        group: { id: 'SceneBloomPass', name: 'SceneBloomPass', style: 'section' },
        type: CCBoolean,
    })
    set sceneBloomPassEnable(value: boolean) {
        this._settings.sceneBloomPass.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get sceneBloomPassEnable(): boolean {
        return this._settings.sceneBloomPass.enabled;
    }

    @property({
        tooltip: '亮度阈值（超过此值的像素才会发光）',
        group: { id: 'SceneBloomPass', name: 'SceneBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 2.0, 0.01],
        slide: true,
    })
    set sceneBloomThreshold(value: number) {
        this._settings.sceneBloomPass.threshold = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get sceneBloomThreshold(): number {
        return this._settings.sceneBloomPass.threshold;
    }

    @property({
        tooltip: '泛光强度',
        group: { id: 'SceneBloomPass', name: 'SceneBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 10.0, 0.1],
        slide: true,
    })
    set sceneBloomIntensity(value: number) {
        this._settings.sceneBloomPass.intensity = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get sceneBloomIntensity(): number {
        return this._settings.sceneBloomPass.intensity;
    }

    @property({
        tooltip: '泛光色调 R',
        group: { id: 'SceneBloomPass', name: 'SceneBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 1.0, 0.01],
        slide: true,
    })
    set sceneBloomTintR(value: number) {
        this._settings.sceneBloomPass.bloomTintR = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get sceneBloomTintR(): number {
        return this._settings.sceneBloomPass.bloomTintR;
    }

    @property({
        tooltip: '泛光色调 G',
        group: { id: 'SceneBloomPass', name: 'SceneBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 1.0, 0.01],
        slide: true,
    })
    set sceneBloomTintG(value: number) {
        this._settings.sceneBloomPass.bloomTintG = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get sceneBloomTintG(): number {
        return this._settings.sceneBloomPass.bloomTintG;
    }

    @property({
        tooltip: '泛光色调 B',
        group: { id: 'SceneBloomPass', name: 'SceneBloomPass', style: 'section' },
        type: CCFloat,
        range: [0.0, 1.0, 0.01],
        slide: true,
    })
    set sceneBloomTintB(value: number) {
        this._settings.sceneBloomPass.bloomTintB = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get sceneBloomTintB(): number {
        return this._settings.sceneBloomPass.bloomTintB;
    }

    // BlitPass
    @property({
        tooltip: '启用 Blit Pass',
        group: { id: 'BlitPass', name: 'BlitPass', style: 'section' },
        type: CCBoolean,
    })
    set blitPassEnable(value: boolean) {
        this._settings.blitPass.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get blitPassEnable(): boolean {
        return this._settings.blitPass.enabled;
    }

    @property({
        tooltip: 'Blit Pass 材质',
        group: { id: 'BlitPass', name: 'BlitPass', style: 'section' },
        type: Material,
    })
    set blitPassMaterial(value: Material) {
        this._settings.blitPass.material = value;
    }
    get blitPassMaterial(): Material {
        return this._settings.blitPass.material!;
    }

    @property({
        tooltip: '启用深度复制',
        group: { id: 'CopyDepthPass', name: 'CopyDepthPass', style: 'section' },
        type: CCBoolean,
    })
    set copyDepthPassEnable(value: boolean) {
        this._settings.copyDepthPass.enabled = value;
        if (EDITOR) {
            this._tryEnableEditorPreview();
        }
    }
    get copyDepthPassEnable(): boolean {
        return this._settings.copyDepthPass.enabled;
    }
}
