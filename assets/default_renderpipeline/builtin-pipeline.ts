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
    assert, CCClass, cclegacy, clamp, director, Game, game, geometry, gfx, Layers, Material, pipeline,
    PipelineEventProcessor, PipelineEventType, ReflectionProbeManager, renderer,
    rendering, Root, sys, Vec2, Vec3, Vec4, warn,
} from 'cc';

import { DEBUG, EDITOR } from 'cc/env';

import {
    BloomType,
    makePipelineSettings,
    PipelineSettings,
} from './builtin-pipeline-types';
import { ShadowAtlasManager } from './ShadowAtlasManager';
const { AABB, Sphere, intersect } = geometry;
const { ClearFlagBit, Color, Format, FormatFeatureBit, LoadOp, StoreOp, TextureType, Viewport } = gfx;
const { scene } = renderer;
const { CameraUsage, CSMLevel, LightType } = scene;

function forwardNeedClearColor(camera: renderer.scene.Camera): boolean {
    return !!(camera.clearFlag & (ClearFlagBit.COLOR | (ClearFlagBit.STENCIL << 1)));
}

function getCsmMainLightViewport(
    light: renderer.scene.DirectionalLight,
    w: number,
    h: number,
    level: number,
    vp: gfx.Viewport,
    screenSpaceSignY: number,
): void {
    if (light.shadowFixedArea || light.csmLevel === CSMLevel.LEVEL_1) {
        vp.left = 0;
        vp.top = 0;
        vp.width = Math.trunc(w);
        vp.height = Math.trunc(h);
    } else {
        vp.left = Math.trunc(level % 2 * 0.5 * w);
        if (screenSpaceSignY > 0) {
            vp.top = Math.trunc((1 - Math.floor(level / 2)) * 0.5 * h);
        } else {
            vp.top = Math.trunc(Math.floor(level / 2) * 0.5 * h);
        }
        vp.width = Math.trunc(0.5 * w);
        vp.height = Math.trunc(0.5 * h);
    }
    vp.left = Math.max(0, vp.left);
    vp.top = Math.max(0, vp.top);
    vp.width = Math.max(1, vp.width);
    vp.height = Math.max(1, vp.height);
}

export class PipelineConfigs {
    isWeb = false;
    isWebGL1 = false;
    isWebGPU = false;
    isMobile = false;
    isHDR = false;
    useFloatOutput = false;
    toneMappingType = 0; // 0: ACES, 1: None
    shadowEnabled = false;
    shadowMapFormat = Format.R32F;
    shadowMapSize = new Vec2(1, 1);
    usePlanarShadow = false;
    screenSpaceSignY = 1;
    supportDepthSample = false;
    mobileMaxSpotLightShadowMaps = 1;

    platform = new Vec4(0, 0, 0, 0);
}

function setupPipelineConfigs(
    ppl: rendering.BasicPipeline,
    configs: PipelineConfigs,
): void {
    const sampleFeature = FormatFeatureBit.SAMPLED_TEXTURE | FormatFeatureBit.LINEAR_FILTER;
    const device = ppl.device;
    // Platform
    configs.isWeb = !sys.isNative;
    configs.isWebGL1 = device.gfxAPI === gfx.API.WEBGL;
    configs.isWebGPU = device.gfxAPI === gfx.API.WEBGPU;
    configs.isMobile = sys.isMobile;

    

    // Rendering
    configs.isHDR = ppl.pipelineSceneData.isHDR; // Has tone mapping
    configs.useFloatOutput = ppl.getMacroBool('CC_USE_FLOAT_OUTPUT');
    configs.toneMappingType = ppl.pipelineSceneData.postSettings.toneMappingType;
    // Shadow
    const shadowInfo = ppl.pipelineSceneData.shadows;
    configs.shadowEnabled = shadowInfo.enabled;
    configs.shadowMapFormat = pipeline.supportsR32FloatTexture(ppl.device) ? Format.R32F : Format.RGBA8;
    configs.shadowMapSize.set(shadowInfo.size);
    configs.usePlanarShadow = shadowInfo.enabled && shadowInfo.type === renderer.scene.ShadowType.Planar;
    // Device
    configs.screenSpaceSignY = ppl.device.capabilities.screenSpaceSignY;
    configs.supportDepthSample = (ppl.device.getFormatFeatures(Format.DEPTH_STENCIL) & sampleFeature) === sampleFeature;
    // Constants
    const screenSpaceSignY = device.capabilities.screenSpaceSignY;
    configs.platform.x = configs.isMobile ? 1.0 : 0.0;
    configs.platform.w = (screenSpaceSignY * 0.5 + 0.5) << 1 | (device.capabilities.clipSpaceSignY * 0.5 + 0.5);
}

export interface PipelineSettings2 extends PipelineSettings {
    _passes?: rendering.PipelinePassBuilder[];
}

const defaultSettings = makePipelineSettings();

export class CameraConfigs {
    settings: PipelineSettings = defaultSettings;
    // Window
    isMainGameWindow = false;
    renderWindowId = 0;
    cameraId = '';
    // Camera
    colorName = '';
    depthStencilName = '';
    // Pipeline
    enableFullPipeline = false;
    enableProfiler = false;
    remainingPasses = 0;
    // Shading Scale
    enableShadingScale = false;
    shadingScale = 1.0;
    nativeWidth = 1;
    nativeHeight = 1;
    width = 1; // Scaled width
    height = 1; // Scaled height
    // Radiance
    enableHDR = false;
    radianceFormat = gfx.Format.RGBA8;
    // Tone Mapping
    copyAndTonemapMaterial: Material | null = null;
    // Depth
    /** @en mutable */
    enableStoreSceneDepth = true;
    // Shadow atlas
    spotShadowAtlasSize = 2048;
    spotShadowMapSize = 256;
    rangedDirShadowAtlasSize = 2048;
    rangedDirShadowMapSize = 256;
    sphereShadowAtlasSize = 2048;
    sphereShadowMapSize = 256;
}

const sClearColorTransparentBlack = new Color(0, 0, 0, 0);

function sortPipelinePassBuildersByConfigOrder(passBuilders: rendering.PipelinePassBuilder[]): void {
    passBuilders.sort((a, b) => {
        return a.getConfigOrder() - b.getConfigOrder();
    });
}

function sortPipelinePassBuildersByRenderOrder(passBuilders: rendering.PipelinePassBuilder[]): void {
    passBuilders.sort((a, b) => {
        return a.getRenderOrder() - b.getRenderOrder();
    });
}

function addCopyToScreenPass(
    ppl: rendering.BasicPipeline,
    pplConfigs: Readonly<PipelineConfigs>,
    cameraConfigs: CameraConfigs,
    input: string,
): rendering.BasicRenderPassBuilder {
    assert(!!cameraConfigs.copyAndTonemapMaterial);
    const pass = ppl.addRenderPass(
        cameraConfigs.nativeWidth,
        cameraConfigs.nativeHeight,
        'cc-tone-mapping');
    pass.addRenderTarget(
        cameraConfigs.colorName,
        LoadOp.CLEAR, StoreOp.STORE,
        sClearColorTransparentBlack);
    pass.addTexture(input, 'inputTexture');
    pass.addQueue(rendering.QueueHint.OPAQUE)
        .addFullscreenQuad(cameraConfigs.copyAndTonemapMaterial, 1);
   
    return pass;
}

export function getPingPongRenderTarget(prevName: string, prefix: string, id: number): string {
    if (prevName.startsWith(prefix)) {
        return `${prefix}${1 - Number(prevName.charAt(prefix.length))}_${id}`;
    } else {
        return `${prefix}0_${id}`;
    }
}

export interface PipelineContext {
    colorName: string;
    depthStencilName: string;
}

class ForwardLighting {
    // Active lights
    private readonly lights: renderer.scene.Light[] = [];
    // Active spot lights with shadows (Mutually exclusive with `lights`)
    private readonly shadowEnabledSpotLights: renderer.scene.SpotLight[] = [];

    // Internal cached resources
    private readonly _sphere = Sphere.create(0, 0, 0, 1);
    private readonly _boundingBox = new AABB();
    private readonly _rangedDirLightBoundingBox = new AABB(0.0, 0.0, 0.0, 0.5, 0.5, 0.5);

    // ----------------------------------------------------------------
    // Interface
    // ----------------------------------------------------------------
    public cullLights(scene: renderer.RenderScene, frustum: geometry.Frustum, cameraPos?: Vec3): void {
        // TODO(zhouzhenglong): Make light culling native
        this.lights.length = 0;
        this.shadowEnabledSpotLights.length = 0;
        // spot lights
        for (const light of scene.spotLights) {
            if (light.baked) {
                continue;
            }
            Sphere.set(this._sphere, light.position.x, light.position.y, light.position.z, light.range);
            if (intersect.sphereFrustum(this._sphere, frustum)) {
                if (light.shadowEnabled) {
                    this.shadowEnabledSpotLights.push(light);
                } else {
                    this.lights.push(light);
                }
            }
        }
        // sphere lights
        for (const light of scene.sphereLights) {
            if (light.baked) {
                continue;
            }
            Sphere.set(this._sphere, light.position.x, light.position.y, light.position.z, light.range);
            if (intersect.sphereFrustum(this._sphere, frustum)) {
                this.lights.push(light);
            }
        }
        // point lights
        for (const light of scene.pointLights) {
            if (light.baked) {
                continue;
            }
            Sphere.set(this._sphere, light.position.x, light.position.y, light.position.z, light.range);
            if (intersect.sphereFrustum(this._sphere, frustum)) {
                this.lights.push(light);
            }
        }
        // ranged dir lights
        for (const light of scene.rangedDirLights) {
            AABB.transform(this._boundingBox, this._rangedDirLightBoundingBox, light.node!.getWorldMatrix());
            if (intersect.aabbFrustum(this._boundingBox, frustum)) {
                this.lights.push(light);
            }
        }

        if (cameraPos) {
            this.shadowEnabledSpotLights.sort(
                (lhs, rhs) => Vec3.squaredDistance(cameraPos, lhs.position) - Vec3.squaredDistance(cameraPos, rhs.position),
            );
        }
    }
    private _addLightQueues(camera: renderer.scene.Camera, pass: rendering.BasicRenderPassBuilder): void {
        for (const light of this.lights) {
            const queue = pass.addQueue(rendering.QueueHint.BLEND, 'forward-add');
            switch (light.type) {
                case LightType.SPHERE:
                    queue.name = 'sphere-light';
                    break;
                case LightType.SPOT:
                    queue.name = 'spot-light';
                    break;
                case LightType.POINT:
                    queue.name = 'point-light';
                    break;
                case LightType.RANGED_DIRECTIONAL:
                    queue.name = 'ranged-directional-light';
                    break;
                default:
                    queue.name = 'unknown-light';
            }
            queue.addScene(
                camera,
                rendering.SceneFlags.BLEND,
                light,
            );
        }
    }
    public addSpotlightShadowPasses(
        ppl: rendering.BasicPipeline,
        camera: renderer.scene.Camera,
        maxNumShadowMaps: number,
    ): void {
        let i = 0;
        for (const light of this.shadowEnabledSpotLights) {
            const shadowMapSize = ppl.pipelineSceneData.shadows.size;
            const shadowPass = ppl.addRenderPass(shadowMapSize.x, shadowMapSize.y, 'default');
            shadowPass.name = `SpotLightShadowPass${i}`;
            shadowPass.addRenderTarget(`SpotShadowMap${i}`, LoadOp.CLEAR, StoreOp.STORE, new Color(1, 1, 1, 1));
            shadowPass.addDepthStencil(`SpotShadowDepth${i}`, LoadOp.CLEAR, StoreOp.DISCARD);
            shadowPass.addQueue(rendering.QueueHint.NONE, 'shadow-caster')
                .addScene(camera, rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK | rendering.SceneFlags.SHADOW_CASTER)
                .useLightFrustum(light);
            ++i;
            if (i >= maxNumShadowMaps) {
                break;
            }
        }
    }
    public addLightQueues(pass: rendering.BasicRenderPassBuilder,
        camera: renderer.scene.Camera, maxNumShadowMaps: number): void {
        this._addLightQueues(camera, pass);
        let i = 0;
        for (const light of this.shadowEnabledSpotLights) {
            // Add spot-light pass
            // Save last RenderPass to the `pass` variable
            // TODO(zhouzhenglong): Fix per queue addTexture
            pass.addTexture(`SpotShadowMap${i}`, 'cc_spotShadowMap');
            const queue = pass.addQueue(rendering.QueueHint.BLEND, 'forward-add');
            queue.addScene(camera, rendering.SceneFlags.BLEND, light);
            ++i;
            if (i >= maxNumShadowMaps) {
                break;
            }
        }
    }

    // Notice: ForwardLighting cannot handle a lot of lights.
    // If there are too many lights, the performance will be very poor.
    // If many lights are needed, please implement a forward+ or deferred rendering pipeline.
    public addLightPasses(
        colorName: string,
        depthStencilName: string,
        depthStencilStoreOp: gfx.StoreOp,
        id: number, // window id
        width: number,
        height: number,
        camera: renderer.scene.Camera,
        viewport: gfx.Viewport,
        ppl: rendering.BasicPipeline,
        pass: rendering.BasicRenderPassBuilder,
    ): rendering.BasicRenderPassBuilder {
        this._addLightQueues(camera, pass);

        let count = 0;
        const shadowMapSize = ppl.pipelineSceneData.shadows.size;
        for (const light of this.shadowEnabledSpotLights) {
            const shadowPass = ppl.addRenderPass(shadowMapSize.x, shadowMapSize.y, 'default');
            shadowPass.name = 'SpotlightShadowPass';
            // Reuse csm shadow map
            shadowPass.addRenderTarget(`ShadowMap${id}`, LoadOp.CLEAR, StoreOp.STORE, new Color(1, 1, 1, 1));
            shadowPass.addDepthStencil(`ShadowDepth${id}`, LoadOp.CLEAR, StoreOp.DISCARD);
            shadowPass.addQueue(rendering.QueueHint.NONE, 'shadow-caster')
                .addScene(camera, rendering.SceneFlags.OPAQUE | rendering.SceneFlags.MASK | rendering.SceneFlags.SHADOW_CASTER)
                .useLightFrustum(light);

            // Add spot-light pass
            // Save last RenderPass to the `pass` variable
            ++count;
            const storeOp = count === this.shadowEnabledSpotLights.length
                ? depthStencilStoreOp
                : StoreOp.STORE;

            pass = ppl.addRenderPass(width, height, 'default');
            pass.name = 'SpotlightWithShadowMap';
            pass.setViewport(viewport);
            pass.addRenderTarget(colorName, LoadOp.LOAD);
            pass.addDepthStencil(depthStencilName, LoadOp.LOAD, storeOp);
            pass.addTexture(`ShadowMap${id}`, 'cc_spotShadowMap');
            const queue = pass.addQueue(rendering.QueueHint.BLEND, 'forward-add');
            queue.addScene(
                camera,
                rendering.SceneFlags.BLEND,
                light,
            );
        }
        return pass;
    }

    public isMultipleLightPassesNeeded(): boolean {
        return this.shadowEnabledSpotLights.length > 0;
    }
}

export interface ForwardPassConfigs {
    enableMainLightShadowMap: boolean;
    enableMainLightPlanarShadowMap: boolean;
    enablePlanarReflectionProbe: boolean;
    enableMSAA: boolean;
    enableSingleForwardPass: boolean;

    //DepthMap
    enableDepthMap:boolean;
    
    DepthScale:number;

    enableGrab:boolean

    enableFrostedGlass:boolean;
    
    enableBlurPass:boolean;
    enableSceneBloom:boolean;
    enableBufferBloom:boolean;
    enableCopyDepth:boolean;
    enableBasePass:boolean;

}

const glassConfigs={
    enable:true,
    useCustomDepth:true
}

export class  BuiltinForwardPassBuilder implements rendering.PipelinePassBuilder {
    static ConfigOrder = 100;
    static RenderOrder = 100;
    getConfigOrder(): number {
        return BuiltinForwardPassBuilder.ConfigOrder;
    }
    getRenderOrder(): number {
        return BuiltinForwardPassBuilder.RenderOrder;
    }
    configCamera(
        camera: Readonly<renderer.scene.Camera>,
        pipelineConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & ForwardPassConfigs): void {
        // Shadow
        cameraConfigs.enableMainLightShadowMap = pipelineConfigs.shadowEnabled
            && !pipelineConfigs.usePlanarShadow
            && !!camera.scene
            && !!camera.scene.mainLight
            && camera.scene.mainLight.shadowEnabled;

        cameraConfigs.enableMainLightPlanarShadowMap = pipelineConfigs.shadowEnabled
            && pipelineConfigs.usePlanarShadow
            && !!camera.scene
            && !!camera.scene.mainLight
            && camera.scene.mainLight.shadowEnabled;

        // Reflection Probe
        cameraConfigs.enablePlanarReflectionProbe = cameraConfigs.isMainGameWindow
            || camera.cameraUsage === CameraUsage.SCENE_VIEW
            || camera.cameraUsage === CameraUsage.GAME_VIEW;

        // MSAA
        cameraConfigs.enableMSAA = cameraConfigs.settings.msaa.enabled
            && !cameraConfigs.enableStoreSceneDepth // Cannot store MS depth, resolve depth is also not cross-platform
            && !pipelineConfigs.isWeb // TODO(zhouzhenglong): remove this constraint
            && !pipelineConfigs.isWebGL1;

        // Forward rendering (Depend on MSAA and TBR)
        cameraConfigs.enableSingleForwardPass
            = pipelineConfigs.isMobile || cameraConfigs.enableMSAA;
        cameraConfigs.enableSingleForwardPass=false;

        //Grab
        cameraConfigs.enableGrab=cameraConfigs.settings.grab.enable;

        //FrostedGlass
        cameraConfigs.enableFrostedGlass=cameraConfigs.settings.frostedGlass.enabled;
        //QuadPass
        cameraConfigs.enableBlurPass=cameraConfigs.settings.blurPass.enabled;

        cameraConfigs.enableSceneBloom=cameraConfigs.settings.sceneBloomPass.enabled;
        cameraConfigs.enableBufferBloom=cameraConfigs.settings.bufferBloomPass.enabled;
        cameraConfigs.enableCopyDepth=cameraConfigs.settings.copyDepthPass.enabled;
        cameraConfigs.enableBasePass=cameraConfigs.settings.basePass.enabled;

        if(cameraConfigs.enableBasePass){
            cameraConfigs.spotShadowAtlasSize=cameraConfigs.settings.basePass.spotShadowAtlasSize;
            cameraConfigs.spotShadowMapSize=cameraConfigs.settings.basePass.spotShadowMapSize;
            cameraConfigs.rangedDirShadowAtlasSize=cameraConfigs.settings.basePass.rangedDirShadowAtlasSize;
            cameraConfigs.rangedDirShadowMapSize=cameraConfigs.settings.basePass.rangedDirShadowMapSize;
            cameraConfigs.sphereShadowAtlasSize=cameraConfigs.settings.basePass.sphereShadowAtlasSize;
            cameraConfigs.sphereShadowMapSize=cameraConfigs.settings.basePass.sphereShadowMapSize;
        }

       
      
        ++cameraConfigs.remainingPasses;
    }
    windowResize(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: Readonly<CameraConfigs & ForwardPassConfigs>,
        window: renderer.RenderWindow,
        camera: renderer.scene.Camera,
        nativeWidth: number,
        nativeHeight: number): void {
        const ResourceFlags = rendering.ResourceFlags;
        const ResourceResidency = rendering.ResourceResidency;
        const id = window.renderWindowId;
        const settings = cameraConfigs.settings;

        const width = cameraConfigs.enableShadingScale
            ? Math.max(Math.floor(nativeWidth * cameraConfigs.shadingScale), 1)
            : nativeWidth;
        const height = cameraConfigs.enableShadingScale
            ? Math.max(Math.floor(nativeHeight * cameraConfigs.shadingScale), 1)
            : nativeHeight;

        //:
        if(cameraConfigs.enableGrab){
           ppl.addTexture(
    `FrameMap_${id}`,
    gfx.TextureType.TEX2D,
    Format.RGBA32F,
    width, height,
    1, 1, 1,
    1, // samples
    rendering.ResourceFlags.COLOR_ATTACHMENT | rendering.ResourceFlags.SAMPLED,
    rendering.ResourceResidency.MANAGED
);
            
            //ppl.addDepthStencil(`FrameDepthMap`,Format.DEPTH_STENCIL,width,height,ResourceResidency.PERSISTENT)
            // ppl.addRenderTarget(`Temp${id}`,Format.RGBA32F,size.x,size.y,rendering.ResourceResidency.PERSISTENT);
           
            // ppl.addRenderTarget(`MTest`,Format.RGBA32F,size.x,size.y,rendering.ResourceResidency.PERSISTENT);
          
            // ppl.addRenderWindow(screenWindow.colorName,Format.RGBA32F,1920,1080,screenWindow,window.depthStencilName);
            // ppl.addTexture('test',gfx.TextureType.TEX2D,Format.RGBA32F,1920,1080,0,1920*1080,0,1,rendering.ResourceFlags.COLOR_ATTACHMENT,rendering.ResourceResidency.EXTERNAL);
        }
        if(cameraConfigs.enableBlurPass){

         


           const sizes=cameraConfigs.settings.blurPass.sizes;
            for(let i=0;i<sizes.length;i++){
                   const blurWidth=width/sizes[i];
                   const blurHeight=height/sizes[i];
                   this._blurSizes.push(new Vec2(blurWidth,blurHeight));
                  ppl.addRenderTarget(`TempBlurMap1${i}`,Format.RGBA32F,blurWidth,blurHeight,rendering.ResourceResidency.MANAGED);
                  ppl.addRenderTarget(`BlurMap2${i}`,Format.RGBA32F,blurWidth,blurHeight,rendering.ResourceResidency.MANAGED);
                 
            }
           
            
          
        }

        if(cameraConfigs.enableSceneBloom){
            ppl.addRenderTarget(`SceneBloomMap_${id}`,Format.RGBA32F,width,height,rendering.ResourceResidency.MANAGED)
        }

        if(cameraConfigs.enableBufferBloom){
            ppl.addRenderTarget(`BufferBloomMap_${id}`,Format.RGBA32F,width,height,rendering.ResourceResidency.MANAGED)
            ppl.addRenderTarget(`BufferBloomBlurMap_${id}`,Format.RGBA32F,width,height,rendering.ResourceResidency.MANAGED)
        }

        if(cameraConfigs.enableCopyDepth){
            ppl.addRenderTarget(`DepthCopyMap_${id}`,Format.RGBA32F,width,height,rendering.ResourceResidency.MANAGED);
        }
       
       

        
      

        // MsaaRadiance
        if (cameraConfigs.enableMSAA) {
            // Notice: We never store multisample results.
            // These samples are always resolved and discarded at the end of the render pass.
            // So the ResourceResidency should be MEMORYLESS.
            if (cameraConfigs.enableHDR) {
                ppl.addTexture(`MsaaRadiance${id}`, TextureType.TEX2D, cameraConfigs.radianceFormat, width, height, 1, 1, 1,
                    settings.msaa.sampleCount, ResourceFlags.COLOR_ATTACHMENT, ResourceResidency.MEMORYLESS);
            } else {
                ppl.addTexture(`MsaaRadiance${id}`, TextureType.TEX2D, Format.RGBA8, width, height, 1, 1, 1,
                    settings.msaa.sampleCount, ResourceFlags.COLOR_ATTACHMENT, ResourceResidency.MEMORYLESS);
            }
            ppl.addTexture(`MsaaDepthStencil${id}`, TextureType.TEX2D, Format.DEPTH_STENCIL, width, height, 1, 1, 1,
                settings.msaa.sampleCount, ResourceFlags.DEPTH_STENCIL_ATTACHMENT, ResourceResidency.MEMORYLESS);
        }

        // Mainlight ShadowMap
        ppl.addRenderTarget(
            `ShadowMap${id}`,
            pplConfigs.shadowMapFormat,
            pplConfigs.shadowMapSize.x,
            pplConfigs.shadowMapSize.y,
        );
        ppl.addDepthStencil(
            `ShadowDepth${id}`,
            Format.DEPTH_STENCIL,
            pplConfigs.shadowMapSize.x,
            pplConfigs.shadowMapSize.y,
        );

        // Spot-light shadow maps
        if (cameraConfigs.enableSingleForwardPass) {
            const size=cameraConfigs.spotShadowAtlasSize;
            const count =4;
            for (let i = 0; i !== count; ++i) {
                ppl.addRenderTarget(
                    `SpotShadowMap_${i}_${id}`,
                    pplConfigs.shadowMapFormat,
                    pplConfigs.shadowMapSize.x,
                    pplConfigs.shadowMapSize.y,
                );
                ppl.addDepthStencil(
                    `DepthSpotShadowMap_${i}_${id}`,
                    Format.DEPTH_STENCIL,
                    pplConfigs.shadowMapSize.x,
                    pplConfigs.shadowMapSize.y,
                );
                ShadowAtlasManager.inst.addAtlas('SpotShadowMap',i,id,size);
            }
        }
    }
    setup(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & ForwardPassConfigs,
        camera: renderer.scene.Camera,
        context: PipelineContext): rendering.BasicRenderPassBuilder | undefined {
        // Add global constants
        ppl.setVec4('g_platform', pplConfigs.platform);

        const id = camera.window.renderWindowId;

        const scene = camera.scene!;
        const mainLight = scene.mainLight;

        --cameraConfigs.remainingPasses;
        assert(cameraConfigs.remainingPasses >= 0);
        if(!EDITOR){
           if (sys.isBrowser && !sys.isMobile){
                this._addComputePass(ppl as rendering.Pipeline);
           }
          
        }
    
       

       

      
       
        

        // Forward Lighting (Light Culling)
       this.forwardLighting.cullLights(scene, camera.frustum);
        
        

        // Main Directional light CSM Shadow Map
        if (cameraConfigs.enableMainLightShadowMap) {
            assert(!!mainLight);
            this._addCascadedShadowMapPass(ppl, pplConfigs, id, mainLight, camera);
        }
        
         

        // // Spot light shadow maps (Mobile or MSAA)
        if (cameraConfigs.enableSingleForwardPass) {
            // Currently, only support 1 spot light with shadow map on mobile platform.
            // TODO(zhouzhenglong): Relex this limitation.
            this.forwardLighting.addSpotlightShadowPasses(
                ppl, camera, pplConfigs.mobileMaxSpotLightShadowMaps);
        }
        

        this._tryAddReflectionProbePasses(ppl, cameraConfigs, id, mainLight, camera.scene);

        if (cameraConfigs.remainingPasses > 0 || cameraConfigs.enableShadingScale) {
            context.colorName = cameraConfigs.enableShadingScale
                ? `ScaledRadiance0_${id}`
                : `Radiance0_${id}`;
            context.depthStencilName = cameraConfigs.enableShadingScale
                ? `ScaledSceneDepth_${id}`
                : `SceneDepth_${id}`;
        } else {
            context.colorName = cameraConfigs.colorName;
            context.depthStencilName = cameraConfigs.depthStencilName;
        }

      
       

        

         

        const pass = this._addForwardRadiancePasses(
            ppl, pplConfigs, cameraConfigs, id, camera,
            cameraConfigs.width, cameraConfigs.height, mainLight,
            context.colorName, context.depthStencilName,
            !cameraConfigs.enableMSAA,
            cameraConfigs.enableStoreSceneDepth ? StoreOp.STORE : StoreOp.DISCARD);

       
         if(cameraConfigs.enableBufferBloom){
          
                this._addBufferBloomPass(ppl,cameraConfigs,camera,context);
            
        }


        if(cameraConfigs.enableCopyDepth){
          
                this._addCopyDepthPass(ppl, cameraConfigs, camera, context,id);
            
        }


        
         

        if(cameraConfigs.enableGrab){
          
                if(!cameraConfigs.enableBufferBloom){
                   this._addCopyFrameMapToScenePass(ppl, cameraConfigs, camera, context,id);
                
             
              this._addGrabPass(ppl,cameraConfigs,camera,context);
            }
        }



       

      

        if(cameraConfigs.enableSceneBloom){
           
                this._addSceneBloomPass(ppl,cameraConfigs,camera,context)
            
        }

        
        if(cameraConfigs.enableBlurPass){
         
                this._addBlurPass(ppl,cameraConfigs,camera,context,id);
            
        }


        

       
       
        // //if(!EDITOR)this._addBlurStencilPass(ppl,camera,cameraConfigs.settings.frostedGlass.blurMaterial,0,0);
       
        if(cameraConfigs.enableFrostedGlass){
          
                this._addFrostedGlassPass(ppl,cameraConfigs,camera,context);
            
        }
      
      

        
       
        if (cameraConfigs.remainingPasses === 0 && cameraConfigs.enableShadingScale) {
          
            return addCopyToScreenPass(ppl, pplConfigs, cameraConfigs,context.colorName);
        } else {
           
            return pass;
        }
        
        

      

        
        
        
    }

    public test=false;


    private _addComputePass(ppl:rendering.Pipeline){

    }
    
    private _addSceneBloomPass(
        ppl: rendering.BasicPipeline,
        cameraConfigs:CameraConfigs,
        camera:renderer.scene.Camera,
        contex:PipelineContext 
    ): rendering.BasicRenderPassBuilder {
        const id=camera.window.renderWindowId;
        const size=new Vec2(camera.window.width,
                            camera.window.height)
        const pass=ppl.addRenderPass(size.x,size.y,'default');
        pass.name='SceneBloomThresholdPass';
        pass.addRenderTarget(`SceneBloomMap_${id}`,LoadOp.LOAD,StoreOp.STORE,new Color(0,0,0,1));
        pass.addTexture(`FrameMap_${id}`, 'grabTex');
        pass.setFloat('threshold',cameraConfigs.settings.sceneBloomPass.threshold);
        pass.setFloat('intensity',cameraConfigs.settings.sceneBloomPass.intensity);
         const r=cameraConfigs.settings.sceneBloomPass.bloomTintR
         const g=cameraConfigs.settings.sceneBloomPass.bloomTintG
         const b=cameraConfigs.settings.sceneBloomPass.bloomTintB
        pass.setVec4('bloomTint',new Vec4(r, g, b,1));
        const viewport=this._viewport;
        viewport.left=0;
        viewport.top=0;
        viewport.width=size.x;
        viewport.height=size.y;
        pass.setViewport(viewport);
        pass.addQueue(rendering.QueueHint.NONE,'sceneBloom-caster')
        .addScene(camera,rendering.SceneFlags.OPAQUE);
        return pass;
      
    }
    


    private _addFrostedGlassPass(
        ppl: rendering.BasicPipeline,
        cameraConfigs:CameraConfigs,
        camera:renderer.scene.Camera,
        contex:PipelineContext  
    ): rendering.BasicRenderPassBuilder {
        const id=camera.window.renderWindowId;
        const size=new Vec2(camera.window.width,
                            camera.window.height)
        const pass=ppl.addRenderPass(size.x,size.y,'default');
        pass.name='FrostedGlassPass';
        pass.addRenderTarget(contex.colorName,LoadOp.LOAD,StoreOp.STORE,new Color(0,0,0,1));
        pass.addDepthStencil(contex.depthStencilName,LoadOp.LOAD,StoreOp.STORE)
        pass.addTexture(`BlurMap20`, 'BlurMap20');
        pass.addTexture(`BlurMap21`, 'BlurMap21');
        pass.addTexture(`BlurMap22`, 'BlurMap22');
        pass.addTexture(`BlurMap23`, 'BlurMap23');
        const viewport=this._viewport;
        viewport.left=0;
        viewport.top=0;
        viewport.width=size.x;
        viewport.height=size.y;
        pass.setViewport(viewport);
        pass.addQueue(rendering.QueueHint.NONE,'frostedGlass-caster')
        .addScene(camera,rendering.SceneFlags.BLEND);
        return pass;
        
       


       
       
    }

    private _blurSizes:Vec2[]=[];

   

    private _addBlurPass( ppl: rendering.BasicPipeline,
          cameraConfigs:CameraConfigs&ForwardPassConfigs,
          camera:renderer.scene.Camera,
          contex:PipelineContext,id:number
    ):rendering.BasicRenderPassBuilder|undefined{
        const sizes=cameraConfigs.settings.blurPass.sizes;
        const blurAmount=cameraConfigs.settings.blurPass.blurAmount;
        for(let i=0;i<sizes.length;i++){
            let size=sizes[i];
            const width=camera.window.width/size;
            const height=camera.window.height/size;
            const viewport=this._viewport;
            viewport.left=0;
            viewport.top=0;
            viewport.width=width;
            viewport.height=height;
            let frmaMap= `FrameMap_${id}`;
            if(cameraConfigs.enableSceneBloom){
                frmaMap=`SceneBloomMap_${id}`
            }
            const pass1=ppl.addRenderPass(width,height,'default');
            pass1.addRenderTarget(`TempBlurMap1${i}`,LoadOp.LOAD,StoreOp.STORE);
            pass1.addTexture(frmaMap,'inputTex');
            pass1.setVec4('BlurAmount',new Vec4(blurAmount/this._blurSizes[i].x,0,0,0));
            pass1.setViewport(viewport);
            pass1.addQueue(rendering.QueueHint.NONE,'quad-caster')
            .addScene(camera,rendering.SceneFlags.OPAQUE);

            const pass2=ppl.addRenderPass(width,height,'default');
            pass2.addRenderTarget(`BlurMap2${i}`,LoadOp.LOAD,StoreOp.STORE);
            pass2.addTexture(`TempBlurMap1${i}`,'inputTex');
            pass2.setVec4('BlurAmount',new Vec4(0,blurAmount/this._blurSizes[i].y,0,0));
            pass2.setViewport(viewport);
            pass2.addQueue(rendering.QueueHint.NONE,'quad-caster')
            .addScene(camera,rendering.SceneFlags.OPAQUE);

            const pass3=ppl.addRenderPass(width,height,'default');
            pass3.addRenderTarget(`TempBlurMap1${i}`,LoadOp.LOAD,StoreOp.STORE);
            pass3.addTexture(`BlurMap2${i}`,'inputTex');
            pass3.setVec4('BlurAmount',new Vec4(blurAmount*2/this._blurSizes[i].x,0,0,0));
            pass3.setViewport(viewport);
            pass3.addQueue(rendering.QueueHint.NONE,'quad-caster')
            .addScene(camera,rendering.SceneFlags.OPAQUE);

            const pass4=ppl.addRenderPass(width,height,'default');
            pass4.addRenderTarget(`BlurMap2${i}`,LoadOp.LOAD,StoreOp.STORE);
            pass4.addTexture(`TempBlurMap1${i}`,'inputTex');
            pass4.setVec4('BlurAmount',new Vec4(0,blurAmount*2/this._blurSizes[i].y,0,0));
            pass4.setViewport(viewport);
            pass4.addQueue(rendering.QueueHint.NONE,'quad-caster')
            .addScene(camera,rendering.SceneFlags.OPAQUE);

            
        }


      
        return undefined;
    }

    private _addGrabPass( ppl: rendering.BasicPipeline,
          cameraConfigs:CameraConfigs,
          camera:renderer.scene.Camera,
          contex:PipelineContext
    ):rendering.BasicRenderPassBuilder|undefined{
        const id=camera.window.renderWindowId;
        const size=new Vec2(camera.window.width,
                            camera.window.height)

        const pass=ppl.addRenderPass(size.x,size.y,'default');
        pass.name='GrabPass';
        pass.addRenderTarget(contex.colorName,LoadOp.LOAD,StoreOp.STORE,new Color(0,0,0,1));
        pass.addDepthStencil(contex.depthStencilName,LoadOp.LOAD,StoreOp.STORE)
        pass.addTexture(`FrameMap_${id}`, 'grabTex');
        pass.addTexture(`DepthCopyMap_${id}`,'depthTex');
        const viewport=this._viewport;
        viewport.left=0;
        viewport.top=0;
        viewport.width=size.x;
        viewport.height=size.y;
        //camera.matViewProjInv
        pass.setViewport(viewport);
        pass.addQueue(rendering.QueueHint.NONE,'grab-caster')
        .addScene(camera,rendering.SceneFlags.BLEND);

        
        return pass;
    }

    private _addCopyDepthPass(
        ppl: rendering.BasicPipeline,
        cameraConfigs: CameraConfigs,
        camera: renderer.scene.Camera,
        context: PipelineContext,id:number
    ): rendering.BasicRenderPassBuilder | undefined {
       
        // const size = new Vec2(camera.window.width, camera.window.height);
        // const pass = ppl.addRenderPass(size.x, size.y, 'default');
        // pass.name = 'CopyDepthPass';
        // pass.addRenderTarget(`DepthCopyMap_${id}`, LoadOp.CLEAR, StoreOp.STORE, new Color(1, 1, 1, 1));
        // //pass.addRenderTarget(context.colorName, LoadOp.CLEAR, StoreOp.STORE, new Color(1, 1, 1, 1));
        // pass.addTexture(context.depthStencilName, 'depthTex');
        // const viewport = this._viewport;
        // viewport.left = 0;
        // viewport.top = 0;
        // viewport.width = size.x;
        // viewport.height = size.y;
        // pass.setViewport(viewport);
        // pass.addQueue(rendering.QueueHint.NONE,'depthCopy-caster')
        //     .addScene(camera,rendering.SceneFlags.OPAQUE)
        // return pass;
        ppl.addCopyPass([new rendering.CopyPair(context.depthStencilName,`DepthCopyMap_${id}`)])
        return
    }

    private _addCopyFrameMapToScenePass(
        ppl: rendering.BasicPipeline,
        cameraConfigs: CameraConfigs,
        camera: renderer.scene.Camera,
        context: PipelineContext,id:number
    ): rendering.BasicRenderPassBuilder | undefined {
        // const size = new Vec2(camera.window.width, camera.window.height);
        // const pass = ppl.addRenderPass(size.x, size.y, 'default');                 
        // pass.name = 'CopyFrameMapToScenePass';
        // pass.addRenderTarget(context.colorName, LoadOp.CLEAR, StoreOp.STORE,new Color(1,1,1,1));
        // //pass.addDepthStencil(context.depthStencilName, LoadOp.LOAD, StoreOp.STORE);
        // pass.addTexture(`FrameMap_${id}`, 'grabTex');
        // const viewport = this._viewport;
        // viewport.left = 0;
        // viewport.top = 0;
        // viewport.width = size.x;
        // viewport.height = size.y;
        // pass.setViewport(viewport);
        // pass.addQueue(rendering.QueueHint.OPAQUE,'screenCopy-caster')
        //     .addScene(camera,rendering.SceneFlags.OPAQUE)
        // return pass;

         ppl.addCopyPass([new rendering.CopyPair(`FrameMap_${id}`,context.colorName)])
        return
    }

    private _addCascadedShadowMapPass(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        id: number,
        light: renderer.scene.DirectionalLight,
        camera: renderer.scene.Camera,
    ): void {
        const QueueHint = rendering.QueueHint;
        const SceneFlags = rendering.SceneFlags;
        // ----------------------------------------------------------------
        // Dynamic states
        // ----------------------------------------------------------------
        const shadowSize = ppl.pipelineSceneData.shadows.size;
        const width = shadowSize.x;
        const height = shadowSize.y;

        const viewport = this._viewport;
        viewport.left = viewport.top = 0;
        viewport.width = width;
        viewport.height = height;

        // ----------------------------------------------------------------
        // CSM Shadow Map
        // ----------------------------------------------------------------
        const pass = ppl.addRenderPass(width, height, 'default');
        pass.name = 'CascadedShadowMap';
        pass.addRenderTarget(`ShadowMap${id}`, LoadOp.CLEAR, StoreOp.STORE, new Color(1, 1, 1, 1));
        pass.addDepthStencil(`ShadowDepth${id}`, LoadOp.CLEAR, StoreOp.DISCARD);
        const csmLevel = ppl.pipelineSceneData.csmSupported ? light.csmLevel : 1;

        // Add shadow map viewports
        for (let level = 0; level !== csmLevel; ++level) {
            getCsmMainLightViewport(light, width, height, level, this._viewport, pplConfigs.screenSpaceSignY);
            const queue = pass.addQueue(QueueHint.NONE, 'shadow-caster');
            if (!pplConfigs.isWebGPU) { // Temporary workaround for WebGPU
                queue.setViewport(this._viewport);
            }
            queue
                .addScene(camera, SceneFlags.OPAQUE | SceneFlags.MASK | SceneFlags.SHADOW_CASTER)
                .useLightFrustum(light, level);
        }
    }
    private _tryAddReflectionProbePasses(
        ppl: rendering.BasicPipeline,
        cameraConfigs: Readonly<CameraConfigs & ForwardPassConfigs>,
        id: number,
        mainLight: renderer.scene.DirectionalLight | null,
        scene: renderer.RenderScene | null,
    ): void {
        const reflectionProbeManager = cclegacy.internal.reflectionProbeManager as ReflectionProbeManager | undefined;
        if (!reflectionProbeManager) {
            return;
        }
        const ResourceResidency = rendering.ResourceResidency;
        const probes = reflectionProbeManager.getProbes();
        const maxProbeCount = 4;
        let probeID = 0;
        for (const probe of probes) {
            if (!probe.needRender) {
                continue;
            }
          
            const area = probe.renderArea();
            const width = Math.max(Math.floor(area.x), 1);
            const height = Math.max(Math.floor(area.y), 1);

            if (probe.probeType === renderer.scene.ProbeType.PLANAR) {
                if (!cameraConfigs.enablePlanarReflectionProbe) {
                    continue;
                }
                const window: renderer.RenderWindow = probe.realtimePlanarTexture!.window!;
                const colorName = `PlanarProbeRT${probeID}`;
                const depthStencilName = `PlanarProbeDS${probeID}`;
                // ProbeResource
                ppl.addRenderWindow(colorName,
                    cameraConfigs.radianceFormat, width, height, window);
                ppl.addDepthStencil(depthStencilName,
                    gfx.Format.DEPTH_STENCIL, width, height, ResourceResidency.MEMORYLESS);

                // Rendering
                const probePass = ppl.addRenderPass(width, height, 'default');
                probePass.name = `PlanarReflectionProbe${probeID}`;
                this._buildReflectionProbePass(probePass, cameraConfigs, id, probe.camera,
                    colorName, depthStencilName, mainLight, scene);
            } else if (1) {//魔改
                for (let faceIdx = 0; faceIdx < probe.bakedCubeTextures.length; faceIdx++) {
                    probe.updateCameraDir(faceIdx);
                    const window: renderer.RenderWindow = probe.bakedCubeTextures[faceIdx].window!;
                    const colorName = `CubeProbeRT${probeID}${faceIdx}`;
                    const depthStencilName = `CubeProbeDS${probeID}${faceIdx}`;
                    // ProbeResource
                    ppl.addRenderWindow(colorName,
                        cameraConfigs.radianceFormat, width, height, window);
                    ppl.addDepthStencil(depthStencilName,
                        gfx.Format.DEPTH_STENCIL, width, height, ResourceResidency.MEMORYLESS);

                    // Rendering
                    const probePass = ppl.addRenderPass(width, height, 'default');
                    probePass.name = `CubeProbe${probeID}${faceIdx}`;
                    this._buildReflectionProbePass(probePass, cameraConfigs, id, probe.camera,
                        colorName, depthStencilName, mainLight, scene);
                }
                probe.needRender = false;
            }
            ++probeID;
            if (probeID === maxProbeCount) {
                break;
            }
        }
    }
    
    private _buildReflectionProbePass(
        pass: rendering.BasicRenderPassBuilder,
        cameraConfigs: Readonly<CameraConfigs & ForwardPassConfigs>,
        id: number,
        camera: renderer.scene.Camera,
        colorName: string,
        depthStencilName: string,
        mainLight: renderer.scene.DirectionalLight | null,
        scene: renderer.RenderScene | null = null,
    ): void {
        const QueueHint = rendering.QueueHint;
        const SceneFlags = rendering.SceneFlags;
        // set viewport
        const colorStoreOp = cameraConfigs.enableMSAA ? StoreOp.DISCARD : StoreOp.STORE;

        // bind output render target
        if (forwardNeedClearColor(camera)) {
            this._reflectionProbeClearColor.x = camera.clearColor.x;
            this._reflectionProbeClearColor.y = camera.clearColor.y;
            this._reflectionProbeClearColor.z = camera.clearColor.z;
            const clearColor = rendering.packRGBE(this._reflectionProbeClearColor);
            this._clearColor.x = clearColor.x;
            this._clearColor.y = clearColor.y;
            this._clearColor.z = clearColor.z;
            this._clearColor.w = clearColor.w;
            pass.addRenderTarget(colorName, LoadOp.CLEAR, colorStoreOp, this._clearColor);
        } else {
            pass.addRenderTarget(colorName, LoadOp.LOAD, colorStoreOp);
        }

        // bind depth stencil buffer
        if (camera.clearFlag & ClearFlagBit.DEPTH_STENCIL) {
            pass.addDepthStencil(
                depthStencilName,
                LoadOp.CLEAR,
                StoreOp.DISCARD,
                camera.clearDepth,
                camera.clearStencil,
                camera.clearFlag & ClearFlagBit.DEPTH_STENCIL,
            );
        } else {
            pass.addDepthStencil(depthStencilName, LoadOp.LOAD, StoreOp.DISCARD);
            
        }

        // Set shadow map if enabled
        if (cameraConfigs.enableMainLightShadowMap) {
            pass.addTexture(`ShadowMap${id}`, 'cc_shadowMap');
        }
         //pass.addTexture(`FrameMap${id}`, 'FrameMap');

        
        // TODO(zhouzhenglong): Separate OPAQUE and MASK queue

        // add opaque and mask queue
        pass.addQueue(QueueHint.NONE, 'reflect-map') // Currently we put OPAQUE and MASK into one queue, so QueueHint is NONE
            .addScene(camera,
                SceneFlags.OPAQUE | SceneFlags.MASK | SceneFlags.REFLECTION_PROBE,
                mainLight || undefined,
                scene ? scene : undefined);
    }
    private _addForwardRadiancePasses(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: Readonly<CameraConfigs & ForwardPassConfigs>,
        id: number,
        camera: renderer.scene.Camera,
        width: number,
        height: number,
        mainLight: renderer.scene.DirectionalLight | null,
        colorName: string,
        depthStencilName: string,
        disableMSAA: boolean = false,
        depthStencilStoreOp: gfx.StoreOp = StoreOp.DISCARD,
    ): rendering.BasicRenderPassBuilder {
        const QueueHint = rendering.QueueHint;
        const SceneFlags = rendering.SceneFlags;
        // ----------------------------------------------------------------
        // Dynamic states
        // ----------------------------------------------------------------
        // Prepare camera clear color
        const clearColor = camera.clearColor; // Reduce C++/TS interop
        this._clearColor.x = clearColor.x;
        this._clearColor.y = clearColor.y;
        this._clearColor.z = clearColor.z;
        this._clearColor.w = clearColor.w;

        // Prepare camera viewport
        const viewport = camera.viewport; // Reduce C++/TS interop
        this._viewport.left = Math.round(viewport.x * width);
        this._viewport.top = Math.round(viewport.y * height);
        // Here we must use camera.viewport.width instead of camera.viewport.z, which
        // is undefined on native platform. The same as camera.viewport.height.
        this._viewport.width = Math.max(Math.round(viewport.width * width), 1);
        this._viewport.height = Math.max(Math.round(viewport.height * height), 1);

        // MSAA
        const enableMSAA = !disableMSAA && cameraConfigs.enableMSAA;
        assert(!enableMSAA || cameraConfigs.enableSingleForwardPass);

        // ----------------------------------------------------------------
        // Forward Lighting (Main Directional Light)
        // ----------------------------------------------------------------
        const pass = cameraConfigs.enableSingleForwardPass
            ? this._addForwardSingleRadiancePass(ppl, pplConfigs, cameraConfigs,
                id, camera, enableMSAA, width, height, mainLight,
                colorName, depthStencilName, depthStencilStoreOp)
            : this._addForwardMultipleRadiancePasses(ppl, cameraConfigs,
                id, camera, width, height, mainLight,
                colorName, depthStencilName, depthStencilStoreOp);

        // Planar Shadow
        if (cameraConfigs.enableMainLightPlanarShadowMap) {
            this._addPlanarShadowQueue(camera, mainLight, pass);
        }

        // ----------------------------------------------------------------
        // Forward Lighting (Blend)
        // ----------------------------------------------------------------
        // Add transparent queue

        const sceneFlags = SceneFlags.BLEND |
            (camera.geometryRenderer
                ? SceneFlags.GEOMETRY
                : SceneFlags.NONE);

        pass
            .addQueue(QueueHint.BLEND)
            .addScene(camera, sceneFlags, mainLight || undefined);

        return pass;
    }
    private _addForwardSingleRadiancePass(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: Readonly<CameraConfigs & ForwardPassConfigs>,
        id: number,
        camera: renderer.scene.Camera,
        enableMSAA: boolean,
        width: number,
        height: number,
        mainLight: renderer.scene.DirectionalLight | null,
        colorName: string,
        depthStencilName: string,
        depthStencilStoreOp: gfx.StoreOp
    ): rendering.BasicRenderPassBuilder {
        assert(cameraConfigs.enableSingleForwardPass);
        // ----------------------------------------------------------------
        // Forward Lighting (Main Directional Light)
        // ----------------------------------------------------------------
        let pass: rendering.BasicRenderPassBuilder;
        if (enableMSAA) {
            const msaaRadianceName = `MsaaRadiance${id}`;
            const msaaDepthStencilName = `MsaaDepthStencil${id}`;
            const sampleCount = cameraConfigs.settings.msaa.sampleCount;

            const msPass = ppl.addMultisampleRenderPass(width, height, sampleCount, 0, 'default');
            msPass.name = 'MsaaForwardPass';

            // MSAA always discards depth stencil
            this._buildForwardMainLightPass(msPass, cameraConfigs, id, camera,
                msaaRadianceName, msaaDepthStencilName, StoreOp.DISCARD, mainLight);

            msPass.resolveRenderTarget(msaaRadianceName, colorName);

            pass = msPass;
        } else {
            pass = ppl.addRenderPass(width, height, 'default');
            pass.name = 'ForwardPass';

            this._buildForwardMainLightPass(pass, cameraConfigs, id, camera,
                colorName, depthStencilName, depthStencilStoreOp, mainLight);
        }
        assert(pass !== undefined);

        // Forward Lighting (Additive Lights)
        this.forwardLighting.addLightQueues(
            pass,
            camera,
            pplConfigs.mobileMaxSpotLightShadowMaps,
        );

       

        return pass;
    }
    private _addForwardMultipleRadiancePasses(
        ppl: rendering.BasicPipeline,
        cameraConfigs: Readonly<CameraConfigs & ForwardPassConfigs>,
        id: number,
        camera: renderer.scene.Camera,
        width: number,
        height: number,
        mainLight: renderer.scene.DirectionalLight | null,
        colorName: string,
        depthStencilName: string,
        depthStencilStoreOp: gfx.StoreOp
    ): rendering.BasicRenderPassBuilder {
        assert(!cameraConfigs.enableSingleForwardPass);

        // Forward Lighting (Main Directional Light)
        // let copyPass=ppl.addCopyPass([new rendering.CopyPair()])
       
        let pass = ppl.addRenderPass(width, height, 'default');
        
        //ppl.tryAddRenderWindowDepthStencil
       
        pass.name = 'ForwardPass';

        const firstStoreOp = this.forwardLighting.isMultipleLightPassesNeeded()
            ? StoreOp.STORE
            : depthStencilStoreOp;

        this._buildForwardMainLightPass(pass, cameraConfigs,
            id, camera, colorName, depthStencilName, firstStoreOp, mainLight);

        

        // Forward Lighting (Additive Lights)
        pass = this.forwardLighting
            .addLightPasses(colorName, depthStencilName, depthStencilStoreOp,
                id, width, height, camera, this._viewport, ppl, pass);

        return pass;
    }
    private _buildForwardMainLightPass(
        pass: rendering.BasicRenderPassBuilder,
        cameraConfigs: Readonly<CameraConfigs & ForwardPassConfigs>,
        id: number,
        camera: renderer.scene.Camera,
        colorName: string,
        depthStencilName: string,
        depthStencilStoreOp: gfx.StoreOp,
        mainLight: renderer.scene.DirectionalLight | null,
        scene: renderer.RenderScene | null = null,
    ): void {
        const QueueHint = rendering.QueueHint;
        const SceneFlags = rendering.SceneFlags;
        // set viewport
        pass.setViewport(this._viewport);

        const colorStoreOp = cameraConfigs.enableMSAA ? StoreOp.DISCARD : StoreOp.STORE;

       
        // bind output render target
        let color0Name=''
        let depthStencil0Name=depthStencilName
        if(cameraConfigs.enableGrab){
            color0Name= `FrameMap_${id}`
            //depthStencil0Name='FrameDepthMap'
        }else{
             color0Name=colorName
             depthStencil0Name=depthStencilName
        }
       
       
        if (forwardNeedClearColor(camera)) {
            pass.addRenderTarget(color0Name, LoadOp.CLEAR, colorStoreOp, this._clearColor);
        } else {
            pass.addRenderTarget(color0Name, LoadOp.LOAD, colorStoreOp);
        }

        // bind depth stencil buffer
        if (!DEBUG) {
            if (colorName === cameraConfigs.colorName &&
                depthStencilName !== cameraConfigs.depthStencilName) {
                warn('Default framebuffer cannot use custom depth stencil buffer');
            }
        }

        if (camera.clearFlag & ClearFlagBit.DEPTH_STENCIL) {
            pass.addDepthStencil(
                depthStencil0Name,
                LoadOp.CLEAR,
                depthStencilStoreOp,
                camera.clearDepth,
                camera.clearStencil,
                camera.clearFlag & ClearFlagBit.DEPTH_STENCIL,
            );
        } else {
            pass.addDepthStencil( depthStencil0Name, LoadOp.LOAD, depthStencilStoreOp);
        }

        // Set shadow map if enabled
        if (cameraConfigs.enableMainLightShadowMap) {
            pass.addTexture(`ShadowMap${id}`, 'cc_shadowMap');
        }

        
        

         
    
        

        // TODO(zhouzhenglong): Separate OPAQUE and MASK queue

        // add opaque and mask queue
        pass.addQueue(QueueHint.NONE) // Currently we put OPAQUE and MASK into one queue, so QueueHint is NONE
            .addScene(camera,
                SceneFlags.OPAQUE | SceneFlags.MASK|SceneFlags.UI,
                mainLight || undefined,
                scene ? scene : undefined);
        

        
       
        
     
    }
    private _addPlanarShadowQueue(
        camera: renderer.scene.Camera,
        mainLight: renderer.scene.DirectionalLight | null,
        pass: rendering.BasicRenderPassBuilder,
    ) {
        const QueueHint = rendering.QueueHint;
        const SceneFlags = rendering.SceneFlags;
        pass.addQueue(QueueHint.BLEND, 'planar-shadow')
            .addScene(
                camera,
                SceneFlags.SHADOW_CASTER | SceneFlags.PLANAR_SHADOW | SceneFlags.BLEND,
                mainLight || undefined,
            );
    }
    private readonly forwardLighting = new ForwardLighting();
    private readonly _viewport = new Viewport();
    private readonly _clearColor = new Color(0, 0, 0, 1);
    private readonly _reflectionProbeClearColor = new Vec3(0, 0, 0);


    private _addBufferBloomPass(
        ppl: rendering.BasicPipeline,
        cameraConfigs: CameraConfigs,
        camera: renderer.scene.Camera,
        context: PipelineContext
    ): rendering.BasicRenderPassBuilder {
        const id = camera.window.renderWindowId;
        const size = new Vec2(camera.window.width, camera.window.height);
        const settings = cameraConfigs.settings.bufferBloomPass;

        const pass = ppl.addRenderPass(size.x, size.y, 'default');
        pass.name = 'BufferBloomPass';

        pass.addRenderTarget(`BufferBloomMap_${id}`, LoadOp.LOAD, StoreOp.STORE);
        pass.addDepthStencil(context.depthStencilName, LoadOp.LOAD, StoreOp.STORE);
        const viewport = this._viewport;
        viewport.left = 0;
        viewport.top = 0;
        viewport.width = size.x;
        viewport.height = size.y;
        pass.setViewport(viewport);
        pass.addQueue(rendering.QueueHint.NONE,'bufferBloom-caster')
        .addScene(camera,rendering.SceneFlags.OPAQUE);

        //使用全屏面片
        const pass1 = ppl.addRenderPass(size.x, size.y, 'default');
        pass1.name = 'BufferBloomBlurPass';

        pass1.addRenderTarget(`BufferBloomBlurMap_${id}`, LoadOp.CLEAR, StoreOp.STORE,new Color(1,1,1,1));
        pass1.addTexture(`BufferBloomMap_${id}`,`bloomMap`);
        pass1.setViewport(viewport);
        pass1.addQueue(rendering.QueueHint.NONE,'bufferBloomBlur-caster')
        .addScene(camera,rendering.SceneFlags.OPAQUE);
     

         const pass2 = ppl.addRenderPass(size.x, size.y, 'default');
        pass2.name = 'BufferBloomCombinePass';

        pass2.addRenderTarget(context.colorName, LoadOp.CLEAR, StoreOp.STORE,new Color(1,1,1,1));
        pass2.addTexture(`BufferBloomMap_${id}`,`bloomMap`); 
        pass2.addTexture(`BufferBloomBlurMap_${id}`,`bloomBlurMap`);
        pass2.addTexture(`FrameMap_${id}`,'FrameMap');//一传入就报错
        
        pass2.setViewport(viewport);
        pass2.addQueue(rendering.QueueHint.NONE,'bufferBloomCombine-caster')
        .addScene(camera,rendering.SceneFlags.OPAQUE);
        return pass2;

    
      

      

        //pass.addCameraQuad(camera);

       
    }
}

export interface BloomPassConfigs {
    enableBloom: boolean;
}

function downSize(size: number, scale: number): number {
    return Math.max(Math.floor(size * scale), 1);
}

interface RenderTextureDesc {
    name: string;
    width: number;
    height: number;
}

export class BuiltinBloomPassBuilder implements rendering.PipelinePassBuilder {
    getConfigOrder(): number {
        return 0;
    }
    getRenderOrder(): number {
        return 200;
    }
   
    configCamera(
        camera: Readonly<renderer.scene.Camera>,
        pipelineConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & BloomPassConfigs): void {
        const { bloom } = cameraConfigs.settings;
        const hasValidMaterial = (
            bloom.type === BloomType.KawaseDualFilter && !!bloom.kawaseFilterMaterial ||
            bloom.type === BloomType.MipmapFilter && !!bloom.mipmapFilterMaterial
        );
        cameraConfigs.enableBloom = bloom.enabled && hasValidMaterial;

        if (cameraConfigs.enableBloom) {
            ++cameraConfigs.remainingPasses;
        }
    }
    windowResize(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & BloomPassConfigs,
        window: renderer.RenderWindow): void {
        if (!cameraConfigs.enableBloom) {
            return;
        }

        const { width, height, settings: { bloom } } = cameraConfigs;
        const id = window.renderWindowId;
        const format = cameraConfigs.radianceFormat;

        if (bloom.type === BloomType.KawaseDualFilter) {
            let bloomWidth = cameraConfigs.width;
            let bloomHeight = cameraConfigs.height;
            for (let i = 0; i !== bloom.iterations + 1; ++i) {
                bloomWidth = Math.max(Math.floor(bloomWidth / 2), 1);
                bloomHeight = Math.max(Math.floor(bloomHeight / 2), 1);
                ppl.addRenderTarget(`BloomTex${id}_${i}`, format, bloomWidth, bloomHeight);
            }
        } else if (bloom.type === BloomType.MipmapFilter) {
            const iterations = bloom.iterations;
            for (let i = 0; i !== iterations + 1; ++i) {
                // DownSample
                if (i < iterations) {
                    const scale = Math.pow(0.5, i + 2);
                    this._bloomDownSampleTexDescs[i] = this.createTexture(
                        ppl,
                        `DownSampleColor${id}${i}`,
                        downSize(width, scale),
                        downSize(height, scale),
                        format);
                }
                // UpSample
                if (i < iterations - 1) {
                    const scale = Math.pow(0.5, iterations - i - 1);
                    this._bloomUpSampleTexDescs[i] = this.createTexture(
                        ppl,
                        `UpSampleColor${id}${i}`,
                        downSize(width, scale),
                        downSize(height, scale),
                        format);
                }
            }
            this._originalColorDesc = this.createTexture(ppl, `OriginalColor${id}`, width, height, format);
            this._prefilterTexDesc = this.createTexture(ppl, `PrefilterColor${id}`,
                downSize(width, 0.5), downSize(height, 0.5), format);
        }
    }
    private createTexture(
        ppl: rendering.BasicPipeline,
        name: string, width: number, height: number, format: number): RenderTextureDesc {
        const desc = { name, width, height };
        ppl.addRenderTarget(desc.name, format, desc.width, desc.height);
        return desc;
    }

    setup(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & BloomPassConfigs,
        camera: renderer.scene.Camera,
        context: PipelineContext,
        prevRenderPass?: rendering.BasicRenderPassBuilder)
        : rendering.BasicRenderPassBuilder | undefined {
        if (!cameraConfigs.enableBloom) {
            return prevRenderPass;
        }

        --cameraConfigs.remainingPasses;
        assert(cameraConfigs.remainingPasses >= 0);

        const bloom = cameraConfigs.settings.bloom;
        const id = camera.window.renderWindowId;

        switch (bloom.type) {
            case BloomType.KawaseDualFilter: {
                const material = bloom.kawaseFilterMaterial;
                assert(!!material);
                return this._addKawaseDualFilterBloomPasses(
                    ppl, pplConfigs,
                    cameraConfigs,
                    cameraConfigs.settings,
                    material,
                    id,
                    cameraConfigs.width,
                    cameraConfigs.height,
                    context.colorName);
            }
            case BloomType.MipmapFilter: {
                const material = bloom.mipmapFilterMaterial;
                assert(!!material);
                return this._addMipmapFilterBloomPasses(
                    ppl, pplConfigs,
                    cameraConfigs,
                    cameraConfigs.settings,
                    material,
                    id,
                    cameraConfigs.width,
                    cameraConfigs.height,
                    context.colorName);
            }
            default:
                return prevRenderPass;
        }
    }
    private _addKawaseDualFilterBloomPasses(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & Readonly<BloomPassConfigs>,
        settings: PipelineSettings,
        bloomMaterial: Material,
        id: number,
        width: number,
        height: number,
        radianceName: string,
    ): rendering.BasicRenderPassBuilder {
        const QueueHint = rendering.QueueHint;
        // Based on Kawase Dual Filter Blur. Saves bandwidth on mobile devices.
        // eslint-disable-next-line max-len
        // https://community.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-20-66/siggraph2015_2D00_mmg_2D00_marius_2D00_slides.pdf

        // Size: [prefilter(1/2), downsample(1/4), downsample(1/8), downsample(1/16), ...]
        const iterations = settings.bloom.iterations;
        const sizeCount = iterations + 1;
        this._bloomWidths.length = sizeCount;
        this._bloomHeights.length = sizeCount;
        this._bloomWidths[0] = Math.max(Math.floor(width / 2), 1);
        this._bloomHeights[0] = Math.max(Math.floor(height / 2), 1);
        for (let i = 1; i !== sizeCount; ++i) {
            this._bloomWidths[i] = Math.max(Math.floor(this._bloomWidths[i - 1] / 2), 1);
            this._bloomHeights[i] = Math.max(Math.floor(this._bloomHeights[i - 1] / 2), 1);
        }

        // Bloom texture names
        this._bloomTexNames.length = sizeCount;
        for (let i = 0; i !== sizeCount; ++i) {
            this._bloomTexNames[i] = `BloomTex${id}_${i}`;
        }

        // Setup bloom parameters
        this._bloomParams.x = pplConfigs.useFloatOutput ? 1 : 0;
        this._bloomParams.y = 0; // unused
        this._bloomParams.z = settings.bloom.threshold;
        this._bloomParams.w = settings.bloom.enableAlphaMask ? 1 : 0;

        // Prefilter pass
        const prefilterPass = ppl.addRenderPass(this._bloomWidths[0], this._bloomHeights[0], 'cc-bloom-prefilter');
        prefilterPass.addRenderTarget(
            this._bloomTexNames[0],
            LoadOp.CLEAR,
            StoreOp.STORE,
            this._clearColorTransparentBlack,
        );
        prefilterPass.addTexture(radianceName, 'inputTexture');
        prefilterPass.setVec4('bloomParams', this._bloomParams);
        prefilterPass
            .addQueue(QueueHint.OPAQUE)
            .addFullscreenQuad(bloomMaterial, 0);

        // Downsample passes
        for (let i = 1; i !== sizeCount; ++i) {
            const downPass = ppl.addRenderPass(this._bloomWidths[i], this._bloomHeights[i], 'cc-bloom-downsample');
            downPass.addRenderTarget(this._bloomTexNames[i], LoadOp.CLEAR, StoreOp.STORE, this._clearColorTransparentBlack);
            downPass.addTexture(this._bloomTexNames[i - 1], 'bloomTexture');
            this._bloomTexSize.x = this._bloomWidths[i - 1];
            this._bloomTexSize.y = this._bloomHeights[i - 1];
            downPass.setVec4('bloomTexSize', this._bloomTexSize);
            downPass
                .addQueue(QueueHint.OPAQUE)
                .addFullscreenQuad(bloomMaterial, 1);
        }

        // Upsample passes
        for (let i = iterations; i-- > 0;) {
            const upPass = ppl.addRenderPass(this._bloomWidths[i], this._bloomHeights[i], 'cc-bloom-upsample');
            upPass.addRenderTarget(this._bloomTexNames[i], LoadOp.CLEAR, StoreOp.STORE, this._clearColorTransparentBlack);
            upPass.addTexture(this._bloomTexNames[i + 1], 'bloomTexture');
            this._bloomTexSize.x = this._bloomWidths[i + 1];
            this._bloomTexSize.y = this._bloomHeights[i + 1];
            upPass.setVec4('bloomTexSize', this._bloomTexSize);
            upPass
                .addQueue(QueueHint.OPAQUE)
                .addFullscreenQuad(bloomMaterial, 2);
        }

        // Combine pass
        this._bloomParams.w = settings.bloom.intensity;
        const combinePass = ppl.addRenderPass(width, height, 'cc-bloom-combine');
        combinePass.addRenderTarget(radianceName, LoadOp.LOAD, StoreOp.STORE);
        combinePass.addTexture(this._bloomTexNames[0], 'bloomTexture');
        combinePass.setVec4('bloomParams', this._bloomParams);
        combinePass
            .addQueue(QueueHint.BLEND)
            .addFullscreenQuad(bloomMaterial, 3);

       

        if (cameraConfigs.remainingPasses === 0) {
            return addCopyToScreenPass(ppl, pplConfigs, cameraConfigs, radianceName);
        } else {
            return combinePass;
        }
    }
    private _addPass(
        ppl: rendering.BasicPipeline,
        width: number,
        height: number,
        layout: string,
        colorName: string,
        material: Material,
        passIndex: number,
        loadOp: gfx.LoadOp = LoadOp.CLEAR,
        clearColor: gfx.Color = sClearColorTransparentBlack,
        queueHint: rendering.QueueHint = rendering.QueueHint.OPAQUE): rendering.BasicRenderPassBuilder {
        const pass = ppl.addRenderPass(width, height, layout);
        pass.addRenderTarget(colorName, loadOp, StoreOp.STORE, clearColor);
        pass.addQueue(queueHint)
            .addFullscreenQuad(material, passIndex);
        return pass;
    }
    private _addMipmapFilterBloomPasses(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & Readonly<BloomPassConfigs>,
        settings: PipelineSettings,
        bloomMaterial: Material,
        id: number,
        width: number,
        height: number,
        radianceName: string,
    ): rendering.BasicRenderPassBuilder {
        // Setup bloom parameters
        this._bloomParams.x = pplConfigs.useFloatOutput ? 1 : 0;
        this._bloomParams.x = 0; // unused
        this._bloomParams.z = settings.bloom.threshold;
        this._bloomParams.w = settings.bloom.intensity;
        const prefilterInfo = this._prefilterTexDesc;

        // Prefilter pass
        let currSamplePass = this._addPass(
            ppl,
            prefilterInfo.width,
            prefilterInfo.height,
            'cc-bloom-mipmap-prefilter',
            prefilterInfo.name,
            bloomMaterial,
            0,
        );
        currSamplePass.addTexture(radianceName, 'mainTexture');
        currSamplePass.setVec4('bloomParams', this._bloomParams);

        const downSampleInfos = this._bloomDownSampleTexDescs;
        // Downsample passes
        for (let i = 0; i < downSampleInfos.length; ++i) {
            const currInfo = downSampleInfos[i];
            const samplerSrc = i === 0 ? prefilterInfo : downSampleInfos[i - 1];
            const samplerSrcName = samplerSrc.name;
            this._bloomTexSize.x = 1 / samplerSrc.width;
            this._bloomTexSize.y = 1 / samplerSrc.height;
            currSamplePass = this._addPass(
                ppl,
                currInfo.width,
                currInfo.height,
                'cc-bloom-mipmap-downsample',
                currInfo.name,
                bloomMaterial,
                1,
            );
            currSamplePass.addTexture(samplerSrcName, 'mainTexture');
            currSamplePass.setVec4('bloomParams', this._bloomTexSize);
        }
        const lastIndex = downSampleInfos.length - 1;
        const upSampleInfos = this._bloomUpSampleTexDescs;
        // Upsample passes
        for (let i = 0; i < upSampleInfos.length; i++) {
            const currInfo = upSampleInfos[i];
            const sampleSrc = i === 0 ? downSampleInfos[lastIndex] : upSampleInfos[i - 1];
            const sampleSrcName = sampleSrc.name;
            this._bloomTexSize.x = 1 / sampleSrc.width;
            this._bloomTexSize.y = 1 / sampleSrc.height;
            currSamplePass = this._addPass(
                ppl,
                currInfo.width,
                currInfo.height,
                'cc-bloom-mipmap-upsample',
                currInfo.name,
                bloomMaterial,
                2,
            );
            currSamplePass.addTexture(sampleSrcName, 'mainTexture');
            currSamplePass.addTexture(downSampleInfos[lastIndex - 1 - i].name, 'downsampleTexture');
            currSamplePass.setVec4('bloomParams', this._bloomTexSize);
        }

        // Combine pass
        const combinePass = this._addPass(
            ppl,
            width,
            height,
            'cc-bloom-mipmap-combine',
            radianceName,
            bloomMaterial,
            3,
            LoadOp.LOAD,
        );
        combinePass.addTexture(upSampleInfos[upSampleInfos.length - 1].name, 'bloomTexture');
        combinePass.setVec4('bloomParams', this._bloomParams);
        if (cameraConfigs.remainingPasses === 0) {
            return addCopyToScreenPass(ppl, pplConfigs, cameraConfigs, radianceName);
        } else {
            return combinePass;
        }
    }

    // Bloom
    private readonly _clearColorTransparentBlack = new Color(0, 0, 0, 0);
    private readonly _bloomParams = new Vec4(0, 0, 0, 0);
    private readonly _bloomTexSize = new Vec4(0, 0, 0, 0);
    private readonly _bloomWidths: Array<number> = [];
    private readonly _bloomHeights: Array<number> = [];
    private readonly _bloomTexNames: Array<string> = [];

    // Mipmap Bloom
    private readonly _bloomUpSampleTexDescs: Array<RenderTextureDesc> = [];
    private readonly _bloomDownSampleTexDescs: Array<RenderTextureDesc> = [];
    private _prefilterTexDesc: RenderTextureDesc = { name: '', width: 0, height: 0 };
    private _originalColorDesc: RenderTextureDesc = { name: '', width: 0, height: 0 };
}

export interface ToneMappingPassConfigs {
    enableToneMapping: boolean;
    enableColorGrading: boolean;
}

export class BuiltinToneMappingPassBuilder implements rendering.PipelinePassBuilder {
    getConfigOrder(): number {
        return 0;
    }
    getRenderOrder(): number {
        return 300;
    }
    configCamera(
        camera: Readonly<renderer.scene.Camera>,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & ToneMappingPassConfigs): void {
        const settings = cameraConfigs.settings;

        cameraConfigs.enableColorGrading
            = settings.colorGrading.enabled
            && !!settings.colorGrading.material
            && !!settings.colorGrading.colorGradingMap;

        cameraConfigs.enableToneMapping
            = cameraConfigs.enableHDR // From Half to RGBA8
            || cameraConfigs.enableColorGrading; // Color grading

        if (cameraConfigs.enableToneMapping) {
            ++cameraConfigs.remainingPasses;
        }
    }
    windowResize(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & ToneMappingPassConfigs): void {
        if (cameraConfigs.enableColorGrading) {
            assert(!!cameraConfigs.settings.colorGrading.material);
            cameraConfigs.settings.colorGrading.material.setProperty(
                'colorGradingMap',
                cameraConfigs.settings.colorGrading.colorGradingMap);
        }
    }
    setup(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & ToneMappingPassConfigs,
        camera: renderer.scene.Camera,
        context: PipelineContext,
        prevRenderPass?: rendering.BasicRenderPassBuilder)
        : rendering.BasicRenderPassBuilder | undefined {
        if (!cameraConfigs.enableToneMapping) {
            return prevRenderPass;
        }

        --cameraConfigs.remainingPasses;
        assert(cameraConfigs.remainingPasses >= 0);
        if (cameraConfigs.remainingPasses === 0) {
            return this._addCopyAndTonemapPass(ppl, pplConfigs, cameraConfigs,
                cameraConfigs.width, cameraConfigs.height,
                context.colorName, cameraConfigs.colorName);
        } else {
            const id = cameraConfigs.renderWindowId;
            const ldrColorPrefix = cameraConfigs.enableShadingScale
                ? `ScaledLdrColor`
                : `LdrColor`;

            const ldrColorName = getPingPongRenderTarget(context.colorName, ldrColorPrefix, id);
            const radianceName = context.colorName;
            context.colorName = ldrColorName;

            return this._addCopyAndTonemapPass(ppl, pplConfigs, cameraConfigs,
                cameraConfigs.width, cameraConfigs.height,
                radianceName, ldrColorName);
        }
    }
    private _addCopyAndTonemapPass(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & ToneMappingPassConfigs,
        width: number,
        height: number,
        radianceName: string,
        colorName: string,
    ): rendering.BasicRenderPassBuilder {
        let pass: rendering.BasicRenderPassBuilder;
        const settings = cameraConfigs.settings;
        if (cameraConfigs.enableColorGrading) {
            assert(!!settings.colorGrading.material);
            assert(!!settings.colorGrading.colorGradingMap);
            const lutTex = settings.colorGrading.colorGradingMap;
            this._colorGradingTexSize.x = lutTex.width;
            this._colorGradingTexSize.y = lutTex.height;

            const isSquareMap = lutTex.width === lutTex.height;
            if (isSquareMap) {
                pass = ppl.addRenderPass(width, height, 'cc-color-grading-8x8');
            } else {
                pass = ppl.addRenderPass(width, height, 'cc-color-grading-nx1');
            }
            pass.addRenderTarget(colorName, LoadOp.CLEAR, StoreOp.STORE, sClearColorTransparentBlack);
            pass.addTexture(radianceName, 'sceneColorMap');
            pass.setVec2('lutTextureSize', this._colorGradingTexSize);
            pass.setFloat('contribute', settings.colorGrading.contribute);
            pass.addQueue(rendering.QueueHint.OPAQUE)
                .addFullscreenQuad(settings.colorGrading.material, isSquareMap ? 1 : 0);
        } else {
            pass = ppl.addRenderPass(width, height, 'cc-tone-mapping');
            pass.addRenderTarget(colorName, LoadOp.CLEAR, StoreOp.STORE, sClearColorTransparentBlack);
            pass.addTexture(radianceName, 'inputTexture');
            if (settings.toneMapping.material) {
                pass.addQueue(rendering.QueueHint.OPAQUE)
                    .addFullscreenQuad(settings.toneMapping.material, 0);
            } else {
                assert(!!cameraConfigs.copyAndTonemapMaterial);
                pass.addQueue(rendering.QueueHint.OPAQUE)
                    .addFullscreenQuad(cameraConfigs.copyAndTonemapMaterial, 0);
            }
        }
        return pass;
    }
    private readonly _colorGradingTexSize = new Vec2(0, 0);
}

export interface FXAAPassConfigs {
    enableFXAA: boolean;
}

export class BuiltinFXAAPassBuilder implements rendering.PipelinePassBuilder {
    getConfigOrder(): number {
        return 0;
    }
    getRenderOrder(): number {
        return 400;
    }
    configCamera(
        camera: Readonly<renderer.scene.Camera>,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & FXAAPassConfigs): void {
        cameraConfigs.enableFXAA
            = cameraConfigs.settings.fxaa.enabled
            && !!cameraConfigs.settings.fxaa.material;
        if (cameraConfigs.enableFXAA) {
            ++cameraConfigs.remainingPasses;
        }
    }
    setup(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & FXAAPassConfigs,
        camera: renderer.scene.Camera,
        context: PipelineContext,
        prevRenderPass?: rendering.BasicRenderPassBuilder)
        : rendering.BasicRenderPassBuilder | undefined {
        if (!cameraConfigs.enableFXAA) {
            return prevRenderPass;
        }
        --cameraConfigs.remainingPasses;
        assert(cameraConfigs.remainingPasses >= 0);

        const id = cameraConfigs.renderWindowId;
        const ldrColorPrefix = cameraConfigs.enableShadingScale
            ? `ScaledLdrColor`
            : `LdrColor`;
        const ldrColorName = getPingPongRenderTarget(context.colorName, ldrColorPrefix, id);

        assert(!!cameraConfigs.settings.fxaa.material);
        if (cameraConfigs.remainingPasses === 0) {
            if (cameraConfigs.enableShadingScale) {
                this._addFxaaPass(ppl, pplConfigs,
                    cameraConfigs.settings.fxaa.material,
                    cameraConfigs.width,
                    cameraConfigs.height,
                    context.colorName,
                    ldrColorName);
                return addCopyToScreenPass(ppl, pplConfigs, cameraConfigs, ldrColorName);
            } else {
                assert(cameraConfigs.width === cameraConfigs.nativeWidth);
                assert(cameraConfigs.height === cameraConfigs.nativeHeight);
                return this._addFxaaPass(ppl, pplConfigs,
                    cameraConfigs.settings.fxaa.material,
                    cameraConfigs.width,
                    cameraConfigs.height,
                    context.colorName,
                    cameraConfigs.colorName);
            }
        } else {
            const inputColorName = context.colorName;
            context.colorName = ldrColorName;
            const lastPass = this._addFxaaPass(ppl, pplConfigs,
                cameraConfigs.settings.fxaa.material,
                cameraConfigs.width,
                cameraConfigs.height,
                inputColorName,
                ldrColorName);
            return lastPass;
        }
    }
    private _addFxaaPass(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        fxaaMaterial: Material,
        width: number,
        height: number,
        ldrColorName: string,
        colorName: string,
    ): rendering.BasicRenderPassBuilder {
        this._fxaaParams.x = width;
        this._fxaaParams.y = height;
        this._fxaaParams.z = 1 / width;
        this._fxaaParams.w = 1 / height;

        const pass = ppl.addRenderPass(width, height, 'cc-fxaa');
        pass.addRenderTarget(colorName, LoadOp.CLEAR, StoreOp.STORE, sClearColorTransparentBlack);
        pass.addTexture(ldrColorName, 'sceneColorMap');
        pass.setVec4('texSize', this._fxaaParams);
        pass.addQueue(rendering.QueueHint.OPAQUE)
            .addFullscreenQuad(fxaaMaterial, 0);
        return pass;
    }
    // FXAA
    private readonly _fxaaParams = new Vec4(0, 0, 0, 0);
}

export interface FSRPassConfigs {
    enableFSR: boolean;
}

export class BuiltinFsrPassBuilder implements rendering.PipelinePassBuilder {
    getConfigOrder(): number {
        return 0;
    }
    getRenderOrder(): number {
        return 500;
    }
    configCamera(
        camera: Readonly<renderer.scene.Camera>,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & FSRPassConfigs): void {
        // FSR (Depend on Shading scale)
        cameraConfigs.enableFSR = cameraConfigs.settings.fsr.enabled
            && !!cameraConfigs.settings.fsr.material
            && cameraConfigs.enableShadingScale
            && cameraConfigs.shadingScale < 1.0;

        if (cameraConfigs.enableFSR) {
            ++cameraConfigs.remainingPasses;
        }
    }
    setup(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & FSRPassConfigs,
        camera: renderer.scene.Camera,
        context: PipelineContext,
        prevRenderPass?: rendering.BasicRenderPassBuilder)
        : rendering.BasicRenderPassBuilder | undefined {
        if (!cameraConfigs.enableFSR) {
            return prevRenderPass;
        }
        --cameraConfigs.remainingPasses;

        const inputColorName = context.colorName;
        const outputColorName
            = cameraConfigs.remainingPasses === 0
                ? cameraConfigs.colorName
                : getPingPongRenderTarget(context.colorName, 'UiColor', cameraConfigs.renderWindowId);
        context.colorName = outputColorName;

        assert(!!cameraConfigs.settings.fsr.material);
        return this._addFsrPass(ppl, pplConfigs, cameraConfigs,
            cameraConfigs.settings,
            cameraConfigs.settings.fsr.material,
            cameraConfigs.renderWindowId,
            cameraConfigs.width,
            cameraConfigs.height,
            inputColorName,
            cameraConfigs.nativeWidth,
            cameraConfigs.nativeHeight,
            outputColorName);
    }
    private _addFsrPass(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & FSRPassConfigs,
        settings: PipelineSettings,
        fsrMaterial: Material,
        id: number,
        width: number,
        height: number,
        inputColorName: string,
        nativeWidth: number,
        nativeHeight: number,
        outputColorName: string,
    ): rendering.BasicRenderPassBuilder {
        this._fsrTexSize.x = width;
        this._fsrTexSize.y = height;
        this._fsrTexSize.z = nativeWidth;
        this._fsrTexSize.w = nativeHeight;
        this._fsrParams.x = clamp(1.0 - settings.fsr.sharpness, 0.02, 0.98);

        const uiColorPrefix = 'UiColor';

        const fsrColorName = getPingPongRenderTarget(outputColorName, uiColorPrefix, id);

        const easuPass = ppl.addRenderPass(nativeWidth, nativeHeight, 'cc-fsr-easu');
        easuPass.addRenderTarget(fsrColorName, LoadOp.CLEAR, StoreOp.STORE, sClearColorTransparentBlack);
        easuPass.addTexture(inputColorName, 'outputResultMap');
        easuPass.setVec4('fsrTexSize', this._fsrTexSize);
        easuPass
            .addQueue(rendering.QueueHint.OPAQUE)
            .addFullscreenQuad(fsrMaterial, 0);

        const rcasPass = ppl.addRenderPass(nativeWidth, nativeHeight, 'cc-fsr-rcas');
        rcasPass.addRenderTarget(outputColorName, LoadOp.CLEAR, StoreOp.STORE, sClearColorTransparentBlack);
        rcasPass.addTexture(fsrColorName, 'outputResultMap');
        rcasPass.setVec4('fsrTexSize', this._fsrTexSize);
        rcasPass.setVec4('fsrParams', this._fsrParams);
        rcasPass
            .addQueue(rendering.QueueHint.OPAQUE)
            .addFullscreenQuad(fsrMaterial, 1);

        return rcasPass;
    }
    // FSR
    private readonly _fsrParams = new Vec4(0, 0, 0, 0);
    private readonly _fsrTexSize = new Vec4(0, 0, 0, 0);
}

export class BuiltinUiPassBuilder implements rendering.PipelinePassBuilder {
    getConfigOrder(): number {
        return 0;
    }
    getRenderOrder(): number {
        return 1000;
    }
    t=0;
    setup(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & FSRPassConfigs,
        camera: renderer.scene.Camera,
        context: PipelineContext,
        prevRenderPass?: rendering.BasicRenderPassBuilder)
        : rendering.BasicRenderPassBuilder | undefined {
  
        
    
        assert(!!prevRenderPass); 

  

        let flags = rendering.SceneFlags.UI;
        if (cameraConfigs.enableProfiler) {
            flags |= rendering.SceneFlags.PROFILER;
            prevRenderPass.showStatistics = true;
        }

      
        prevRenderPass
            .addQueue(rendering.QueueHint.BLEND, 'default', 'default')
            .addScene(camera, flags);
        
      
      
        return prevRenderPass;
    }
}

if (rendering) {

    const { QueueHint, SceneFlags } = rendering;
    class BuiltinPipelineBuilder implements rendering.PipelineBuilder {
        private readonly _pipelineEvent: PipelineEventProcessor = cclegacy.director.root.pipelineEvent as PipelineEventProcessor;
        private readonly _forwardPass = new BuiltinForwardPassBuilder();
        private readonly _bloomPass = new BuiltinBloomPassBuilder();
        private readonly _toneMappingPass = new BuiltinToneMappingPassBuilder();
        private readonly _fxaaPass = new BuiltinFXAAPassBuilder();
        private readonly _fsrPass = new BuiltinFsrPassBuilder();
        private readonly _uiPass = new BuiltinUiPassBuilder();
        // Internal cached resources
        private readonly _clearColor = new Color(0, 0, 0, 1);
        private readonly _viewport = new Viewport();
        private readonly _configs = new PipelineConfigs();
        private readonly _cameraConfigsMap = new Map<string, CameraConfigs>();
        private _getCameraConfigs(camera: renderer.scene.Camera): CameraConfigs {
            const key = camera.node.uuid + camera.window.renderWindowId;
            let c = this._cameraConfigsMap.get(key);
            if (!c) { c = new CameraConfigs(); this._cameraConfigsMap.set(key, c); }
            return c;
        }
        // Materials
        private readonly _copyAndTonemapMaterial = new Material();

        // Internal States
        private _initialized = false; // TODO(zhouzhenglong): Make default effect asset loading earlier and remove this flag
        private _passBuilders: rendering.PipelinePassBuilder[] = [];

        private _setupPipelinePreview(
            camera: renderer.scene.Camera,
            cameraConfigs: CameraConfigs) {
            const isEditorView: boolean
                = camera.cameraUsage === CameraUsage.SCENE_VIEW
                || camera.cameraUsage === CameraUsage.PREVIEW;

            if (isEditorView) {
                const editorSettings = rendering.getEditorPipelineSettings() as PipelineSettings | null;
                if (editorSettings) {
                    cameraConfigs.settings = editorSettings;
                } else {
                    cameraConfigs.settings = defaultSettings;
                }
            } else {
                if (camera.pipelineSettings) {
                    cameraConfigs.settings = camera.pipelineSettings as PipelineSettings;
                } else {
                    cameraConfigs.settings = defaultSettings;
                }
            }
        }

        private _preparePipelinePasses(cameraConfigs: CameraConfigs): void {
            const passBuilders = this._passBuilders;
            passBuilders.length = 0;

            const settings = cameraConfigs.settings as PipelineSettings2;
            if (settings._passes) {
                for (const pass of settings._passes) {
                    passBuilders.push(pass);
                }
                assert(passBuilders.length === settings._passes.length);
            }

            passBuilders.push(this._forwardPass);

            if (settings.bloom.enabled) {
                passBuilders.push(this._bloomPass);
            }

            passBuilders.push(this._toneMappingPass);

            if (settings.fxaa.enabled) {
                passBuilders.push(this._fxaaPass);
            }

            if (settings.fsr.enabled) {
                passBuilders.push(this._fsrPass);
            }
            passBuilders.push(this._uiPass);
        }

        private _setupBuiltinCameraConfigs(
            ppl: rendering.BasicPipeline,
            camera: renderer.scene.Camera,
            pipelineConfigs: PipelineConfigs,
            cameraConfigs: CameraConfigs
        ) {
            const window = camera.window;
            const isMainGameWindow: boolean = camera.cameraUsage === CameraUsage.GAME && !!window.swapchain;
            const isGameView = isMainGameWindow || camera.cameraUsage === CameraUsage.GAME_VIEW;
            
            
            // Window
            cameraConfigs.isMainGameWindow = isMainGameWindow;
            cameraConfigs.renderWindowId = window.renderWindowId;

            // Camera
            cameraConfigs.colorName = window.colorName;
            cameraConfigs.depthStencilName = window.depthStencilName;

            // Pipeline
            cameraConfigs.enableFullPipeline = (camera.visibility & (Layers.Enum.DEFAULT)) !== 0;
            cameraConfigs.enableProfiler = ppl.profiler && isGameView;
            cameraConfigs.remainingPasses = 0;

            // Shading scale
            cameraConfigs.shadingScale = cameraConfigs.settings.shadingScale;
            cameraConfigs.enableShadingScale = cameraConfigs.settings.enableShadingScale
                && cameraConfigs.shadingScale !== 1.0;

            cameraConfigs.nativeWidth = Math.max(Math.floor(window.width), 1);
            cameraConfigs.nativeHeight = Math.max(Math.floor(window.height), 1);

            cameraConfigs.width = cameraConfigs.enableShadingScale
                ? Math.max(Math.floor(cameraConfigs.nativeWidth * cameraConfigs.shadingScale), 1)
                : cameraConfigs.nativeWidth;
            cameraConfigs.height = cameraConfigs.enableShadingScale
                ? Math.max(Math.floor(cameraConfigs.nativeHeight * cameraConfigs.shadingScale), 1)
                : cameraConfigs.nativeHeight;

            // Radiance
            cameraConfigs.enableHDR = cameraConfigs.enableFullPipeline
                && pipelineConfigs.useFloatOutput;
            cameraConfigs.radianceFormat = cameraConfigs.enableHDR
                ? gfx.Format.RGBA16F : gfx.Format.RGBA8;

            // Tone Mapping
            cameraConfigs.copyAndTonemapMaterial = this._copyAndTonemapMaterial;

            // Depth
            cameraConfigs.enableStoreSceneDepth = true;
            // Shadow atlas settings
            
        }

        private _setupCameraConfigs(
            ppl: rendering.BasicPipeline,
            camera: renderer.scene.Camera,
            pipelineConfigs: PipelineConfigs,
        ): void {
            const cameraConfigs = this._getCameraConfigs(camera);
            cameraConfigs.cameraId = camera.node.uuid + camera.window.renderWindowId;
            cameraConfigs.renderWindowId = camera.window.renderWindowId;
            this._setupPipelinePreview(camera, cameraConfigs);
            this._preparePipelinePasses(cameraConfigs);
            sortPipelinePassBuildersByConfigOrder(this._passBuilders);
            this._setupBuiltinCameraConfigs(ppl, camera, pipelineConfigs, cameraConfigs);
            for (const builder of this._passBuilders) {
                if (builder.configCamera) {
                    builder.configCamera(camera, pipelineConfigs, cameraConfigs);
                }
            }
        }

        // ----------------------------------------------------------------
        // Interface
        // ----------------------------------------------------------------
        windowResize(
            ppl: rendering.BasicPipeline,
            window: renderer.RenderWindow,
            camera: renderer.scene.Camera,
            nativeWidth: number,
            nativeHeight: number,
        ): void {
            setupPipelineConfigs(ppl, this._configs);

            this._setupCameraConfigs(ppl, camera, this._configs);

            // Render Window (UI)
            const id = window.renderWindowId;

            ppl.addRenderWindow(this._getCameraConfigs(camera).colorName,
                Format.RGBA8, nativeWidth, nativeHeight, window,
                this._getCameraConfigs(camera).depthStencilName);

            const width = this._getCameraConfigs(camera).width;
            const height = this._getCameraConfigs(camera).height;

            if (this._getCameraConfigs(camera).enableShadingScale) {
                ppl.addDepthStencil(`ScaledSceneDepth_${id}`, Format.DEPTH_STENCIL, width, height);
                ppl.addRenderTarget(`ScaledRadiance0_${id}`, this._getCameraConfigs(camera).radianceFormat, width, height);
                ppl.addRenderTarget(`ScaledRadiance1_${id}`, this._getCameraConfigs(camera).radianceFormat, width, height);
                ppl.addRenderTarget(`ScaledLdrColor0_${id}`, Format.RGBA8, width, height);
                ppl.addRenderTarget(`ScaledLdrColor1_${id}`, Format.RGBA8, width, height);
            } else {
                ppl.addDepthStencil(`SceneDepth_${id}`, Format.DEPTH_STENCIL, width, height);
                ppl.addRenderTarget(`Radiance0_${id}`, this._getCameraConfigs(camera).radianceFormat, width, height);
                ppl.addRenderTarget(`Radiance1_${id}`, this._getCameraConfigs(camera).radianceFormat, width, height);
                ppl.addRenderTarget(`LdrColor0_${id}`, Format.RGBA8, width, height);
                ppl.addRenderTarget(`LdrColor1_${id}`, Format.RGBA8, width, height);
                
               
            }
            ppl.addRenderTarget(`UiColor0_${id}`, Format.RGBA8, nativeWidth, nativeHeight);
            ppl.addRenderTarget(`UiColor1_${id}`, Format.RGBA8, nativeWidth, nativeHeight);

            for (const builder of this._passBuilders) {
                if (builder.windowResize) {
                    builder.windowResize(ppl, this._configs, this._getCameraConfigs(camera), window, camera, nativeWidth, nativeHeight);
                }
            }
        }
        tt=0;
        setup(cameras: renderer.scene.Camera[], ppl: rendering.BasicPipeline): void {
            // TODO(zhouzhenglong): Make default effect asset loading earlier and remove _initMaterials
            if (this._initMaterials(ppl)) {
                return;
            }

            // Render cameras
            // log(`==================== One Frame ====================`);
            for (const camera of cameras) {
                // Skip invalid camera
                if (!camera.scene || !camera.window) {
                    continue;
                }
                // Setup camera configs
                this._setupCameraConfigs(ppl, camera, this._configs);
                // log(`Setup camera: ${camera.node!.name}, window: ${camera.window.renderWindowId}, isFull: ${this._getCameraConfigs(camera).enableFullPipeline}, `
                //     + `size: ${camera.window.width}x${camera.window.height}`);

                this._pipelineEvent.emit(PipelineEventType.RENDER_CAMERA_BEGIN, camera);

                if(EDITOR){
                     if(camera.node.name=='Editor Camera'&&this._getCameraConfigs(camera).enableFullPipeline){
                         this._buildForwardPipeline(ppl, camera, camera.scene, this._passBuilders);
                     }else{
                         this._buildSimplePipeline(ppl, camera);
                     }
                }else{
                        // Build pipeline
                    if (this._getCameraConfigs(camera).enableFullPipeline) {
                        this._buildForwardPipeline(ppl, camera, camera.scene, this._passBuilders);
                    } else {
                        this._buildSimplePipeline(ppl, camera);
                    }
                    
                }

                // Build pipeline
              

                this._pipelineEvent.emit(PipelineEventType.RENDER_CAMERA_END, camera);
            }
        }
        // ----------------------------------------------------------------
        // Pipelines
        // ----------------------------------------------------------------
        private _buildSimplePipeline(
            ppl: rendering.BasicPipeline,
            camera: renderer.scene.Camera,
        ): void {
            const width = Math.max(Math.floor(camera.window.width), 1);
            const height = Math.max(Math.floor(camera.window.height), 1);
            const colorName = this._getCameraConfigs(camera).colorName;
            const depthStencilName = this._getCameraConfigs(camera).depthStencilName;

            const viewport = camera.viewport;  // Reduce C++/TS interop
            this._viewport.left = Math.round(viewport.x * width);
            this._viewport.top = Math.round(viewport.y * height);
            // Here we must use camera.viewport.width instead of camera.viewport.z, which
            // is undefined on native platform. The same as camera.viewport.height.
            this._viewport.width = Math.max(Math.round(viewport.width * width), 1);
            this._viewport.height = Math.max(Math.round(viewport.height * height), 1);

            const clearColor = camera.clearColor;  // Reduce C++/TS interop
            this._clearColor.x = clearColor.x;
            this._clearColor.y = clearColor.y;
            this._clearColor.z = clearColor.z;
            this._clearColor.w = clearColor.w;

            const pass = ppl.addRenderPass(width, height, 'default');

            // bind output render target
            if (forwardNeedClearColor(camera)) {
                pass.addRenderTarget(colorName, LoadOp.CLEAR, StoreOp.STORE, this._clearColor);
            } else {
                pass.addRenderTarget(colorName, LoadOp.LOAD, StoreOp.STORE);
            }

            // bind depth stencil buffer
            if (camera.clearFlag & ClearFlagBit.DEPTH_STENCIL) {
                pass.addDepthStencil(
                    depthStencilName,
                    LoadOp.CLEAR,
                    StoreOp.DISCARD,
                    camera.clearDepth,
                    camera.clearStencil,
                    camera.clearFlag & ClearFlagBit.DEPTH_STENCIL,
                );
            } else {
                pass.addDepthStencil(depthStencilName, LoadOp.LOAD, StoreOp.DISCARD);
            }

            pass.setViewport(this._viewport);

            // The opaque queue is used for Reflection probe preview
            pass.addQueue(QueueHint.OPAQUE)
                .addScene(camera, SceneFlags.OPAQUE);

            // The blend queue is used for UI and Gizmos
            let flags = SceneFlags.BLEND | SceneFlags.UI;
            if (this._getCameraConfigs(camera).enableProfiler) {
                flags |= SceneFlags.PROFILER;
                pass.showStatistics = true;
            }

          
            pass.addQueue(QueueHint.BLEND,'default','default',)
                .addScene(camera, flags);

 

            
        }

        private _buildForwardPipeline(
            ppl: rendering.BasicPipeline,
            camera: renderer.scene.Camera,
            scene: renderer.RenderScene,
            passBuilders: rendering.PipelinePassBuilder[],
        ): void {
            sortPipelinePassBuildersByRenderOrder(passBuilders);

            const context: PipelineContext = {
                colorName: '',
                depthStencilName: '',
            };

            let lastPass: rendering.BasicRenderPassBuilder | undefined = undefined;

            for (const builder of passBuilders) {
                if (builder.setup) {
                    lastPass = builder.setup(ppl, this._configs, this._getCameraConfigs(camera),
                        camera, context, lastPass);
                }
            }

            assert(this._getCameraConfigs(camera).remainingPasses === 0);
        }

        private _initMaterials(ppl: rendering.BasicPipeline): number {
           
            if (this._initialized) {
                return 0;
            }

            setupPipelineConfigs(ppl, this._configs);

            // When add new effect asset, please add its uuid to the dependentAssets in cc.config.json.
            this._copyAndTonemapMaterial._uuid = `builtin-pipeline-tone-mapping-material`;
            this._copyAndTonemapMaterial.initialize({ effectName: 'pipeline/post-process/tone-mapping' });

            if (this._copyAndTonemapMaterial.effectAsset) {
                this._initialized = true;
            }

            return this._initialized ? 0 : 1;
        }
    }


 

    rendering.setCustomPipeline('Builtin', new BuiltinPipelineBuilder());
  

} // if (rendering)


