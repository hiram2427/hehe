# 哼哼的拼豆图纸

哼哼为程程制作的、完全在浏览器本地运行的拼豆图纸生成工具。上传照片后，可以调整横向豆数和最多用色数，自动匹配国内常用的 MARD 221 标准色号，并导出图纸 PNG 与用料表 CSV。

## 功能

- 手机与电脑均可使用，支持拖放和相册选图
- 图片只在本机浏览器内处理，不上传服务器
- 横向豆数 12–160 颗，纵向按原图比例自动计算
- MARD 221 标准色卡感知色差匹配
- 最多用色数 6–60 色，自动统计每个色号用量
- 图纸带坐标、十格辅助线和格内色号
- 可导出高清 PNG 图纸及 CSV 备料清单
- 支持添加到手机主屏幕，首次打开后可离线使用

## 本地运行

这是一个无依赖的静态网站。进入 `dist` 目录后，用任意静态文件服务器打开即可：

```bash
python -m http.server 8080 -d dist
```

然后访问 `http://localhost:8080`。

## 色卡说明

内置色卡采用 MARD 221 色（Alfonse + 豆豆工坊核对版）。RGB/HEX 仅用于屏幕近似匹配，实体豆子会受批次、光线与显示设备影响。

色卡数据整理来源：[HansBug/pindou-color-data](https://github.com/HansBug/pindou-color-data)。

## 安卓 App

适用于安卓手机的独立安装包已放在 [`downloads/hengheng-pindou-v1.0.0.apk`](downloads/hengheng-pindou-v1.0.0.apk)。App 内完整包含网页工具，可以离线使用；源码位于 `android-app`。
