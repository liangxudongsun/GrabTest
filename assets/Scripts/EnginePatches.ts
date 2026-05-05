import { _decorator, Component, director, Game, game, Node, rendering } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('EnginePatches')
export class NewComponent extends Component {

    patchAddScene(){


    }
    onLoad() {
       game.on(Game.EVENT_GAME_INITED,()=>{
            this.patchAddScene();
       })
    }

    update(deltaTime: number) {
        
    }
}


