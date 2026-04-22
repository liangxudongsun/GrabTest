import { _decorator, Camera, Component, director, Node, rendering } from 'cc';
const { ccclass, property } = _decorator;
import { renderer } from "cc"; 
const { scene } = renderer; 
const { Skybox } = scene;
@ccclass('skyInfo')
export class skyInfo extends Component {
    start() {
        
        console.log(director.root.scenes)
    }

    update(deltaTime: number) {
        
    }
}


