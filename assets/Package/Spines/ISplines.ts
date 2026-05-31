import { Vec3, Color, Material, Node } from 'cc';
import { BezierKnot } from './BezierKnot';

/** 悬停状态（供渲染读取） */
export interface ISplineHover {
    hoverKnotIdx: number;
    hoverAxisIdx: number;
    hoverAnchorIdx: number;
    hoverTanKnotIdx: number;
    hoverTanDir: number;
    hoverTanAxis: number;
}

/** Splines 组件暴露给渲染器和事件处理器的接口 */
export interface ISplines {
    readonly node: Node;
    points: Vec3[];
    knots: BezierKnot[];
    materials: Material[];
    readonly capacity: number;
    readonly showAxes: boolean;
    readonly showCpAxes: boolean;
    readonly boxWidth: number;
    readonly boxHeight: number;
    readonly boxColor: Color;
    readonly axisShaftLen: number;
    readonly axisHeadLen: number;
    readonly axisShaftWidth: number;
    readonly axisHeadWidth: number;
    readonly cpSize: number;
    readonly cpTangentSize: number;
    readonly cpAnchorColor: Color;
    readonly cpInColor: Color;
    readonly cpOutColor: Color;
    readonly cpAxisShaftLen: number;
    readonly cpAxisHeadLen: number;
    readonly cpAxisShaftWidth: number;
    readonly cpAxisHeadWidth: number;
    readonly hover: ISplineHover;
    selectedKnotIdx: number;
}
