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
2.科学上网
3.任意 Coding 能力较强的 AI ，用于解决可能遇到的问题
4.耐心和信心：相信自己能独立完成

## Apple Container 配置

Container 是基于 Swift 原生开发、针对 Apple Silicon 深度优化的 Linux 容器管理工具，简单来说就是 Apple 版 Docker ，用法和 Docker 差不多，性能和方便性更好。
Apple Music 音乐下载这个项目应该是利用了安卓版 Apple Music ，所以需要 Container/Docker 这样的虚拟环境；早期教程用 Mumu 模拟器只是多了无用的图形界面。
全文接下来的代码都需要用到 macOS 终端（Terminal），并且默认你已经配置过 Homebrew （如果还没有请问AI如何在macOS 上配置 Homebrew）

> Reference: <https://applemusic.mintlify.app/amdl/quickstart/macos>
