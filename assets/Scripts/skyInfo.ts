import { _decorator, Camera, Component, director, gfx, Node, rendering } from 'cc';
const { ccclass, property } = _decorator;
import { renderer } from "cc"; 
const { scene } = renderer; 
const { Skybox } = scene;
@ccclass('skyInfo')
export class skyInfo extends Component {
    async start() {
         const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
            console.log( 'WebGPU 可用！');
        } else {
            // 可能由于硬件被屏蔽、驱动问题或实验性功能未开启导致
            console.log('浏览器支持 WebGPU，但请求适配器失败。');
        }
        console.log('computerShader',director.root.device.hasFeature(gfx.Feature.COMPUTE_SHADER) )
    }

    update(deltaTime: number) {
        
    }
}


