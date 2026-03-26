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

Container 简单来说就是 Apple 版 Docker ，用法和 Docker 差不多，性能和方便性更好。Apple Music 音乐下载这个项目应该是利用了安卓版 AM ，所以需要 Container/Docker 这样的虚拟环境.

全文接下来的代码都需要用到 macOS 终端 (Terminal) ，并且默认你已经配置过 Homebrew （如果还没有请问 AI 如何在 macOS 上配置 Homebrew ）

> Reference: <https://applemusic.mintlify.app/amdl/quickstart/macos>
