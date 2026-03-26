---
title: Apple Music Download On macOS
description: 获取 ALAC 无损音乐最简单的方式
slug: apple-music-download
date: 2026-03-26 01:00:00+0000
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

1.一台 Apple Silicon (M系列芯片)的 macOS 设备，且系统为 macOS 26+

2.科学上网 & 任意 Coding 能力较强的 AI

3.一个已经购买 Apple Music 任意方案的 Apple ID

4.耐心和信心：相信自己能独立完成

## Apple Container 配置

Container 简单来说就是 Apple 版 Docker ，用法和 Docker 差不多，性能和方便性更好。Apple Music 音乐下载这个项目应该是利用了安卓版 AM ，所以需要 Container/Docker 这样的虚拟环境

全文接下来的代码都需要用到 macOS 终端 (Terminal) ，并且默认你已经配置过 Homebrew （如果还没有，请问 AI 如何在 macOS 上配置 Homebrew ）

```zsh
brew install go gpac git container && git clone https://github.com/zhaarey/apple-music-downloader.git
```

如果卡住，可能是因为需要**科学上网**

```zsh
container system start
container run -v /Users/你的用户名（在finder里看，就是Desktop的上一级）:/app/rootfs/data -e args="-L 你的 Apple ID 邮箱:密码 -F" --rm ghcr-pull.ygxz.in/itouakirai/wrapper:arm
/* 把中文替换为你相应的内容 */
```

## 2FA 验证码登录

有较大可能你的 Apple 设备（不一定是电脑）会弹出一条信息说“你的 Apple ID 在新设备登录”然后显示一个 6 位验证码，此时先不要把验证码弹窗关掉。**新打开一个终端窗口**

```zsh
echo -n 6位验证码 > /Users/你的用户名/2fa.txt
```

当**前一个终端窗口**显示 **response type 6** ，就可以**关闭所有终端窗口**，最核心的一步已经完成。

## 简化流程

新开一个 Terminal 窗口，复制黏贴以下内容

```zsh
container system start
container run --name am-wrapper -v /Users/你的用户名:/app/rootfs/data -p 10020:10020 -p 20020:20020 -e args="-M 20020 -H 0.0.0.0"  ghcr-pull.ygxz.in/itouakirai/wrapper:arm
```

未完待续……

> Reference: <https://applemusic.mintlify.app/amdl/quickstart/macos>
