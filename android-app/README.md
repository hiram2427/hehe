# 安卓安装包

这是“哼哼的拼豆图纸”的原生安卓封装项目，应用内完整包含网页工具，可离线使用。照片处理仍只发生在手机本地。

兼容 Android 10 及以上系统。构建要求：JDK 17+、Android SDK 35、Gradle 8.9+。

```bash
gradlew.bat :app:assembleDebug
```

生成的 APK 位于 `app/build/outputs/apk/debug/`。
