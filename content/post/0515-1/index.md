---
title: Roon + HQPlayer 配置经验
description: $830+350 的天价软件对 PC-HiFi 有多大提升？
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

## Roon to HQPlayer 设置

Roon: Settings -> Setup -> Add HQPlayer ，然后底部 `Select an audio zone` 选择 HQPlayer 

HQPlayer: 单击主界面左侧边栏最下面一个按钮（形似两方块用一曲线连接），使其保持选中状态

## HQPlayer 推荐配置

> 如果时间充足，请务必认真阅读 `hqplayer5desktop-manual.pdf` 。作者针对每个配置选项有详尽介绍，可喂给 AI 辅助理解，一定会有所收获。

![Outputs](Outputs.png)

`Backend` PC-Hifi 不用网播（ NAA ）的话选择 `Coreaudio｜macOS` / `WASAPI、ASIO（更推荐）｜Windows`

`Device` 选择你的解码/界面名称

`SDM pack` 如果选择 SDM 升频（DSD）就选择 `DoP` ，否则 `none` 

`48k DSD` 解码支持的话可以开

`Default mode` 有三种：`PCM` 只输出 PCM （会把 DSD 转 PCM ），`DSD` 只输出 DSD （会把 PCM 转 DSD ），`source` 则是 PCM 升 PCM ，DSD 升 DSD 

`Adaptive rate` 意思是对 44.1khz 基频选择整数或非整数倍（如 44.1khz -> 768khz ）升频，推荐 PCM 升频时打勾，DSD 升频时关闭（因为大部分解码不支持 48k DSD ）

`Fixed Volume` 推荐打勾，相当于 -3dB gain ，提供一定 headroom 动态余量，防止 clipping 削波以及一些渣录混音源在升频后可能发生的爆音

`PCM gain compensation` 用于降低 PCM 音量从而和 DSD 达到一致，建议设 0 ，有需要可以根据 `hqplayer5desktop-manual.pdf` 中的表格设置

![Advanced](Advanced.png)

这一页如图设置即可，若有性能压力可以把 GPU 部分 `CUDA Offload` 打勾；`Idle time` 不要设置为 0 ，否则可能卡顿/爆音，30s 是比较合适的。 

![PCM](PCM.png)

PCM 和 SDM 的`Filter` 滤波设置统一在文末介绍。

`Sample rate (/ Limit)` 推荐设置为 DAC 支持的最高规格，若遇性能瓶颈或者觉得高频太多可以向下调整。

`Dither` 在采样率为 384khz 及以上时，推荐设为 LNS15 ；在 192khz 及以下时建议查阅 `hqplayer5desktop-manual.pdf` 

`Bits` 同样推荐设为 DAC 支持的最高规格；特别地，R2R DAC 可以设为有效 Bits 减少过零失真， `hqplayer5desktop-manual.pdf` 中给出了部分 R2R 的设置供参考。低 Bits 主观听感上会超高频少一点，瞬态慢点，结像更厚

![SDM](SDM.png)

