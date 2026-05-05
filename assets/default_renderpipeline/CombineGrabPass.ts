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
    _decorator, assert, CCBoolean, CCFloat, CCInteger,
    gfx, Material, renderer, rendering, Vec3, Vec4,
} from 'cc';

import { EDITOR } from 'cc/env';

import {
    BuiltinPipelineSettings,
} from './builtin-pipeline-settings';

import {
    BuiltinPipelinePassBuilder,
} from './builtin-pipeline-pass';

import {
    CameraConfigs,
    getPingPongRenderTarget,
    PipelineConfigs,
    PipelineContext,
} from './builtin-pipeline';

const { ccclass, disallowMultiple, executeInEditMode, menu, property, requireComponent, type } = _decorator;

const { Color, LoadOp, StoreOp } = gfx;

export interface GrabPassConfigs {
    grabEnabled: boolean;
}

@ccclass('CombineGrabPass')
@menu('Rendering/CombineGrabPass')
@requireComponent(BuiltinPipelineSettings)
@disallowMultiple
@executeInEditMode
export class CombineGrabPass extends BuiltinPipelinePassBuilder
    implements rendering.PipelinePassBuilder {
    @property({
        group: { id: 'BuiltinPass', name: 'Pass Settings', style: 'section' },
        type: CCInteger,
    })
    configOrder = 0;
    @property({
        group: { id: 'BuiltinPass', name: 'Pass Settings', style: 'section' },
        type: CCInteger,
    })
    renderOrder = 999;

   
    @property(Material)
    private material: Material | null = null;
 

 

 
   

    // PipelinePassBuilder
    getConfigOrder(): number {
        return this.configOrder;
    }
    getRenderOrder(): number {
        return this.renderOrder;
    }
    configCamera(
        camera: Readonly<renderer.scene.Camera>,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & GrabPassConfigs): void {
        cameraConfigs.grabEnabled = pplConfigs.supportDepthSample
            && !!this.material;
        if (cameraConfigs.grabEnabled) {
            // Output scene depth, this is allowed but has performance impact
            cameraConfigs.enableStoreSceneDepth = true;
            ++cameraConfigs.remainingPasses;
        }
    }
    windowResize(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: Readonly<CameraConfigs & GrabPassConfigs>,
        window: renderer.RenderWindow): void {
        const id = window.renderWindowId;
        if (cameraConfigs.grabEnabled) {
            ppl.addRenderTarget(`DofRadiance${id}`,
                cameraConfigs.radianceFormat,
                cameraConfigs.width,
                cameraConfigs.height);
        }
    }
    setup(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & Readonly<GrabPassConfigs>,
        camera: renderer.scene.Camera,
        context: PipelineContext,
        prevRenderPass?: rendering.BasicRenderPassBuilder): rendering.BasicRenderPassBuilder | undefined {
        if (!cameraConfigs.grabEnabled) {
            return prevRenderPass;
        }
        --cameraConfigs.remainingPasses;
        //ppl.setBuiltinCameraConstants

        assert(!!this.material);
        if (cameraConfigs.remainingPasses === 0) {
            return this._addCombineGrabPass(ppl, pplConfigs,
                cameraConfigs, this.material,
                camera, cameraConfigs.width, cameraConfigs.height,
                context.colorName,
                context.depthStencilName,
                cameraConfigs.colorName);
        } else {
            const prefix = cameraConfigs.enableShadingScale
                ? `ScaledRadiance`
                : `Radiance`;
            const outputRadianceName = getPingPongRenderTarget(
                context.colorName, prefix, cameraConfigs.renderWindowId);
            const inputRadianceName = context.colorName;
            context.colorName = outputRadianceName;
            return this._addCombineGrabPass(ppl, pplConfigs,
                cameraConfigs, this.material,
                camera, cameraConfigs.width, cameraConfigs.height,
                inputRadianceName,
                context.depthStencilName,
                outputRadianceName);
        }
    }
    private _addCombineGrabPass(
        ppl: rendering.BasicPipeline,
        pplConfigs: Readonly<PipelineConfigs>,
        cameraConfigs: CameraConfigs & Readonly<GrabPassConfigs>,
        material: Material,
        camera: renderer.scene.Camera,
        width: number,
        height: number,
        inputRadiance: string,
        inputDepthStencil: string,
        outputRadianceName: string,
    ): rendering.BasicRenderPassBuilder {
      
        this._cocTexSize.x = 1.0 / width;
        this._cocTexSize.y = 1.0 / height;
        this._cocTexSize.z = width;
        this._cocTexSize.w = height;
        const id = cameraConfigs.renderWindowId;
        const combineGrabPass = ppl.addRenderPass(width, height, 'combineGrab');
        combineGrabPass.name='combineGrabPass'
        combineGrabPass.addRenderTarget(outputRadianceName, LoadOp.CLEAR, StoreOp.STORE, this._clearColorTransparentBlack);
        combineGrabPass.addTexture(inputRadiance, 'screenTex');
        combineGrabPass
            .addQueue(rendering.QueueHint.OPAQUE)
            .addCameraQuad(camera, material, 0); // addCameraQuad will set camera related UBOs
        
       
            return combineGrabPass;
    }

    // Runtime members
    private readonly _clearColorTransparentBlack = new Color(0, 0, 0, 0);
    private readonly _cocTexSize = new Vec4(0, 0, 0, 0);
}
