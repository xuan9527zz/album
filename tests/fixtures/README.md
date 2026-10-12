# 合成测试素材

`landscape-*.png` 和应用图标由 `generate.py` 直接绘制，没有使用私人照片。`synthetic.heic` 由 Pillow HEIF 将合成图片编码；`synthetic.mp4` 是同一合成图片用 FFmpeg 7.1 编码的约一秒 H.264 视频，不是从 iPhone 导出的真实 Live Photo 素材。

视频的生成命令（在本目录执行）：

```sh
ffmpeg -loop 1 -i landscape-0.png -t 1 -vf scale=96:96,format=yuv420p -r 5 -c:v libx264 -movflags +faststart -y synthetic.mp4
```

真实 EXIF、GPS、旋转、广色域与 Live Photo 配对行为必须用得到授权的设备素材在线下验证，不应提交到本仓库。
