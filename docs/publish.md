# 发布

注册开发者：https://chrome.google.com/webstore/devconsole?hl=zh-cn
第一次执行此操作时，系统会显示以下注册屏幕。请先同意开发者协议和政策，然后支付注册费。


支付注册费时，填写的名称、地址要和后续google要求验证，上传的文件地址保持一致

否则申请不会通过。

如果没有填写一致，后续在 https://payments.google.com/gp/w/home/settings 可以看到自己有哪些 用于 Google Pay 的支付资料，重新修改。

manifest.json 要求：

```json
"name": "**MSG_extName**",
"version": "0.0.1", // google 推荐一开始使用 0.0.1， 
"manifest_version": 3,
"description": "**MSG_extDescription**",
"icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
}
```
图片资源：

图标格式：16x16 32x32 48x48 128x128（商店图标） 像素 png 格式
屏幕截图： 1280x800 或 640x400 像素
小宣传图块：440x280 像素 在首页、类别页面和搜索结果中展示。
滚动图片：1400x560 像素，项目被选为商店首页顶部的轮播轮播界面
一个 YouTube 视频链接，其中展示了您的扩展程序功能。

控制台：https://chrome.google.com/webstore/devconsole

有内容，上传 压缩包
账号：配置 账号相关信息