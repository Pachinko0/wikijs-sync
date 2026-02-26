# Note to Wiki.js

一个 Obsidian 插件，允许你通过 GraphQL API 将笔记上传到 Wiki.js。

[English](README.md) | 简体中文

## 功能特性

- 📤 上传单个笔记到 Wiki.js
- 🖼️ 自动上传图片到 Wiki.js 资源库
- 🔄 自动转换 Obsidian 语法为 Wiki.js 兼容的 Markdown
- 🏷️ 支持标签和元数据
- ⚙️ 可配置的上传行为（创建新页面、更新现有页面或询问）
- 🔗 自动转换链接
- 📋 丰富的上传对话框，带内容预览
- 🎯 右键菜单集成

## 安装

### 通过 BRAT 安装（推荐）

[BRAT](https://github.com/TfTHacker/obsidian42-brat)（Beta Reviewers Auto-update Tester）是在插件上架 Obsidian 社区插件市场之前安装本插件的最简便方式。

1. 在 Obsidian 社区插件中安装 **BRAT** 插件
2. 打开 BRAT 设置，点击 **"Add Beta plugin"**
3. 输入仓库地址：`https://github.com/luashiping/note-to-wikijs`
4. 点击 **"Add Plugin"**，BRAT 会自动下载并安装
5. 在 Obsidian 设置 > 社区插件 中启用 **Note to Wiki.js**

BRAT 还会在新版本发布时自动更新插件。

### 手动安装

1. 从 [GitHub Releases](https://github.com/luashiping/note-to-wikijs/releases) 下载最新版本
2. 解压文件到你的 Obsidian 插件文件夹：`{vault}/.obsidian/plugins/note-to-wikijs/`
3. 在 Obsidian 设置中启用插件

### 从源码构建

1. 克隆此仓库
2. 运行 `npm install` 安装依赖
3. 运行 `npm run build` 构建插件
4. 复制 `main.js`、`manifest.json` 和 `styles.css` 到你的插件文件夹

## 配置

1. 打开 Obsidian 设置
2. 导航到"社区插件" > "Note to Wiki.js"
3. 配置以下设置：

### 必需设置

- **Wiki.js URL**：你的 Wiki.js 实例的基础 URL（例如：`https://wiki.example.com`）
- **API Token**：你的 Wiki.js API 令牌（在 Wiki.js 管理后台 > API 访问中生成）

### 可选设置

- **默认标签**：添加到上传页面的默认标签列表（逗号分隔）
- **自动转换链接**：自动将相对链接转换为绝对 Wiki.js 路径
- **保留 Obsidian 语法**：保持 Obsidian 特定语法不变（例如：`[[链接]]`、标注框）
- **上传行为**：选择上传已存在笔记时的处理方式

## 使用方法

### 上传当前笔记

1. 打开你想要上传的笔记
2. 使用以下任一方法：
   - 点击侧边栏的上传图标
   - 使用命令面板（Ctrl/Cmd + P）并搜索"Upload current note to Wiki.js"
   - 使用键盘快捷键（如果已配置）

### 上传特定文件

1. 在文件浏览器中右键点击任意 Markdown 文件
2. 从上下文菜单中选择"Upload to Wiki.js"

或者

1. 使用命令面板搜索"Upload file to Wiki.js"
2. 从列表中选择文件

## Markdown 转换

插件会自动将 Obsidian 特定语法转换为 Wiki.js 兼容格式：

### 链接

- `[[内部链接]]` → `[内部链接](/internal-link)`
- `[[内部链接|显示文本]]` → `[显示文本](/internal-link)`

### 标签

- `#标签` → `` `#标签` ``

### 标注框（Callouts）

```markdown
> [!info] 信息
> 这是一个信息标注框
```

转换为：

```markdown
> **信息**
>
> 这是一个信息标注框
```

### YAML 前置元数据

YAML 前置元数据会被自动移除，但其中的标签会被提取并添加到 Wiki.js 页面中。

## API 权限

确保你的 Wiki.js API 令牌具有以下权限：

- `pages:read` - 检查页面是否存在
- `pages:write` - 创建新页面
- `pages:manage` - 更新现有页面

## 故障排除

### 连接问题

1. 验证你的 Wiki.js URL 是否正确且可访问
2. 检查你的 API 令牌是否有效且具有所需权限
3. 使用设置中的"测试连接"按钮验证连接性

### 上传失败

1. 检查浏览器控制台的详细错误信息
2. 验证目标路径不包含非法字符
3. 确保你有在 Wiki.js 中创建/更新页面的适当权限

### Markdown 转换问题

1. 如果链接转换不正确，检查"自动转换链接"设置
2. 如果想保留 Obsidian 语法，启用"保留 Obsidian 语法"
3. 在上传前，在上传对话框中预览内容

## 开发路线图

计划开发的未来功能：

- 📁 **批量上传文件夹** - 一次性上传整个文件夹及所有文件和图片

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

本项目采用 MIT 许可证 - 详见 LICENSE 文件。

## 更新日志

### 1.0.0

- 首次发布
- 单文件上传功能
- 自动上传图片到 Wiki.js 资源库
- Markdown 转换
- 页面覆盖确认
- 设置配置
- 右键菜单集成
