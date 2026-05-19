---
title: Roon + HQPlayer 配置经验
description: $830+350 的天价软件对 PC-Hifi 有多大提升？
slug: roon-hqplayer
date: 2026-05-15 01:00:00+0000
image: cover.png
categories:
    - HiFi
    - Mac
tags:
    - HiFi
    - Skill
weight: 1       # You can add weight to some posts to override the default sorting (date descending)
---

## 准备工具

1. 一台 PC ，macOS 12+ 或 Windows ，CPU 性能越高越好

2. BT 下载器，推荐 **qBittorrent**

3. AI ，辅助理解

## 软件介绍

**Roon** 自身有网播、多设备管理等丰富功能，但配合 **HQPlayer** 在 PC-HiFi 本地环境下使用时，基本只作为一个**外观现代、易于操作**的图形界面（你不会想用 HQPlayer 找专辑或者切歌的）

**HQPlayer** 简单来说是一款强大的**升频器**，提供丰富的 **滤波/抖动/调制** 选择，能有针对性地提升解码性能

## 下载

Roon 2.65(1653)：

```bash
magnet:?xt=urn:btih:650FB22C46EDF10E151AF60860340FC2FA8116F6&dn=Roon 2.65.1653
```

HQPlayer Desktop 5.17.1:

```bash
magnet:?xt=urn:btih:02285FC7F175AEDEAA5066AFDC43248B79631129&dn=HQPlayer Desktop 5.17.1
```



> 注意：只需保留 `Album/Song ID` ，如 <https://music.apple.com/cn/album/オリジナルサウンドトラック-英雄伝説vi-空の軌跡/502445161> 中间日文应当全部删除再复制，只需保留 <https://music.apple.com/cn/album/502445161> 否则可能报错。
>
> 日文歌曲可以尝试将 `music.apple.com/**cn**` 改为 `music.apple.com/**jp**` 可能可以避免显示罗马音，前提是 `Storefronts` 中有 Japan
>
> 推荐 `Chrome` 通过 `Tampermonkey/Violentmonkey` 安装 `Ame` 插件 <https://gitlab.com/SuperSaltyGamer/ame/-/raw/main/dist/applemusic.user.js> 从而在 AM 网页端查看 `Storefronts` 和音乐规格（如 24bit 48khz）

## 下载设置

建议使用 `VScode` 等软件打开 `/Users/你的用户名/

![Image 1](image1.png)

追求最高音质，有几条内容是需要注意的：



> Reference: <https://applemusic.mintlify.app/amdl/quickstart/macos>
>
> Windows 使用 `WSL`| 推荐 Reference: <https://blog.karune.icu/2025/06/04/am_linux/>
