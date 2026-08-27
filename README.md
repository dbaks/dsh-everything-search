<div align="center">

# 🔍 Everything 全盘搜索

**DeepSeek Harness（DSH）插件** —— 基于 [Everything](https://www.voidtools.com/) 的全盘极速文件搜索 · 多选加入上下文 · 设置可自定义

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![platform](https://img.shields.io/badge/platform-DeepSeek%20Harness-8d7ce4.svg)](https://github.com/)
[![version](https://img.shields.io/badge/version-1.0.0-b08427.svg)](https://github.com/)

[✨ 功能](#-功能) · [📥 安装](#-安装) · [🖥 使用](#-使用) · [⚙️ 设置](#️-设置) · [❓ FAQ](#-常见问题)

</div>

---

## ✨ 功能

| 模块 | 能力 |
| --- | --- |
| **全盘极速搜索** | 调用 Everything 索引，瞬间搜遍全部硬盘（C / D / E / F …），比 `grep` / `glob` 更快更全 |
| **Everything 语法** | 支持 `*.pdf`、`ext:png`、`文件夹名\` 等 Everything 原生搜索语法 |
| **类型筛选** | 全部 / 文件夹 / 文件 三种范围，切换即自动重新搜索 |
| **文件夹限定** | 可指定「范围」文件夹路径，只搜该文件夹内（`-path`） |
| **多选加入上下文** | 搜索结果可勾选多个文件/文件夹，一键以 `@引用` 写入输入框，加入对话上下文 |
| **自定义设置** | 默认结果数量、默认类型、搜索引擎路径（es.exe）均可修改，localStorage 落盘 |
| **模型工具** | 注册 `everything_search` 工具，Agent 可直接询问"帮我找某个文件" |
| **es.exe 随包** | 搜索工具 es.exe 随插件打包在 `lib/es.exe`，随包即用，无需手动放置或依赖本机 Everything 安装 |

---

## 📥 安装

### 前置条件

- 已安装并运行 **DeepSeek Harness**
- 本机已安装 **Everything**（用于建立文件索引；es.exe 命令行工具随插件打包）

### 安装（本地 / 源码方式）

在 DSH 环境（或已配置 `DSH_HOME`）中运行：

```bash
dsh plugin --profile web add <本插件包路径>
```

例如（Windows）：

```powershell
dsh plugin --profile web add <本插件包路径>
```

> `link:` 会把插件链接为依赖；`dsh plugin add` 会应用 `cordis.patch.yml` 把插件行插入 web 插件表。

### 安装（发布到 npm / Git 后）

```bash
dsh plugin --profile web add dsh-everything-search
# 或
dsh plugin --profile web add github:yourname/dsh-everything-search
```

### 生效

安装完成后**重启 DeepSeek Harness**，输入框工具栏出现放大镜 🔍 按钮即生效。之后**刷新浏览器，插件始终保持**（正式 web 打包插件，自动加载）。

### 卸载

```bash
dsh plugin --profile web rm dsh-everything-search
```

---

## 🖥 使用

1. 点击输入框工具栏的 **放大镜 🔍** 按钮
2. 输入关键词（支持 Everything 语法），回车或点「搜索」
3. 用「类型」「范围」筛选；勾选想要的文件/文件夹
4. 点「**加入上下文**」→ 选中的路径以 `@引用` 写入输入框，确认发送即可让模型读取

或直接在对话里让 Agent 调用 `everything_search` 工具帮你搜。

---

## ⚙️ 设置

设置 → 侧边栏「**Everything 搜索**」：

- **默认结果数量**：每次搜索最多返回条数（20 / 50 / 100 / 200）
- **默认类型**：打开面板时默认筛选（全部 / 文件夹 / 文件）
- **搜索引擎路径**：es.exe 路径（默认随插件打包位置，可修改）

设置保存在浏览器 localStorage，刷新后保留。

---

## ❓ FAQ

**为什么需要安装 Everything？**
插件用 Everything 的 `es.exe` 命令行工具搜索。Everything 需要先建立全盘索引（首次运行时会自动建）。es.exe 随插件打包，但索引服务（Everything 主程序）建议本机安装。

**可以纯离线使用吗？**
可以 —— es.exe 随插件打包在 `lib/es.exe`，无需联网下载；搜索走本机 Everything 索引。

**支持中文路径吗？**
支持。搜索采用 UTF-8 导出再读取，中文文件名/路径不乱码。

---

## 📄 License

[MIT](LICENSE)
