demo来了链接：[demo](https://github.com/lizhihao999/GrabTest.git)

注意：

1. ForwardPass 里面的 blit 节点渲染都是指 Quad 模拟的 blit 节点，貌似引擎都是渲染：场景节点 - blit 节点，不可以场景节点 - blit 节点 - 场景节点。

2. 天空盒在多个 phase 存在时会触发多次渲染的 bug。

ForwardPass 主要执行流程：

    普通物体绘制
    ---> ForwardRadiancePass (前向光照，主绘制)
    | 输入: ShadowMap_id, SceneDepth_id
    | 输出: FrameMap 

    发光物体绘制
    ---> BufferBloomPass 
    |   |---> BufferBloomThresholdPass (提取自发光区域) blit 节点渲染
    |   |     输出: BufferBloomMap
    |   |---> BufferBloomBlurPass (模糊) blit 节点渲染
    |   |     输入: BufferBloomMap
    |   |     输出: BufferBloomBlurMap
    |   |---> BufferBloomCombinePass (与 FrameMap 混合) blit 节点渲染
    |   |     输入: BufferBloomMap, BufferBloomBlurMap, FrameMap
    |   |     输出: Radiance0_id

    深度图绘制
    ---> CopyDepthPass
    | 输入: SceneDepth
    | 输出: DepthCopyMap

    渲染 FrameMap 到场景
    ---> CopyFrameMapToScenePass (若启用 Grab 但未启用 BufferBloom)
    | 输入: FrameMap
    | 输出: Radiance0_id
   
    渲染毛玻璃
    ---> BlurPass blit 节点
    |   |---> TempBlur1 (水平)
    |   |---> Blur2 (垂直)
    |   |---> TempBlur1 (水平×2)
    |   |---> Blur2 (垂直×2)
    | 最终输出: BlurMap2_i 系列
    ---> FrostedGlassPass
    | 输入: BlurMap20-23
    | 输出: 写入当前 Radiance0_id

    渲染玻璃、水 
    ---> GrabPass 
    | 输入: FrameMap, DepthCopyMap
    | 输出: 写入当前 Radiance0_id

    ---> CombineGrabPass 后效占位 pass，把 Radiance0_id 贴图内容复制到屏幕，同时用来注册 Radiance0_id 和 SceneDepth_id。
    如果开启原内置后效 pass，可以取消这个 pass。

水体渲染：

参考：[链接](https://zhuanlan.zhihu.com/p/447311831)

水体渲染通过采样 grabTex [管线资源]（屏幕折射）、depthTex [管线资源]（场景深度）、normalMap（法线贴图）、ringMap [相机 RT，由粒子系统产生]（波纹交互图）和 envMap（环境反射）实现折射、反射、深度颜色混合与动态波纹。

粒子系统 shader：

利用双 smoothstep 生成圆环形渐变渲染到 quad 上，再设置粒子的 size、color 生命周期来产生水波贴图。
```
CCEffect %{
  techniques:
  - name: waterRing
    passes:
    - vert: builtin/internal/particle-vs-legacy:lpvs_main
      frag: waterRing-fs:frag
      properties:
        mainTiling_Offset:  { value: [1, 1, 0, 0] }//粒子的uv
        bumpPower:      { value: 2.0, editor: { slide: true, range: [0, 50, 0.1] } }
        ringWidth:      { value: 0.0, editor: { slide: true, range: [0, 0.5, 0.001] } }
        ringRange:      { value: 0.0, editor: { slide: true, range: [0, 1, 0.01] } }
        ringSmoothness: { value: 0.0, editor: { slide: true, range: [0, 0.05, 0.001] } }
  }%

CCProgram waterRing-fs %{
  precision mediump float;
  #include <legacy/output>
  #include <builtin/internal/embedded-alpha>

  uniform waterRingUBO {
    float bumpPower;
    float ringWidth;
    float ringRange;
    float ringSmoothness;
  };

  in vec2 uv;//由mainTiling_Offset确定
  in vec4 color;//由编辑器Color Over Lifetime Module确定

  float doubleSmoothstep(vec2 uv) {
    float dis = distance(vec4(uv, 0.0, 0.0), vec4(0.5));
    float halfWidth = ringWidth * 0.5;

    float threshold1 = ringRange - halfWidth;
    float threshold2 = ringRange + halfWidth;

    float value  = smoothstep(threshold1, threshold1 + ringSmoothness, dis);
    float value2 = smoothstep(threshold2, threshold2 + ringSmoothness, dis);

    return value - value2;
  }


  vec4 frag () {
    float normalCenter = doubleSmoothstep(uv);
    float height = normalCenter * color.a;
    return vec4(vec3(height), height);
  }

}%


```
吐槽一下不过它好卡！(也不掉帧)




