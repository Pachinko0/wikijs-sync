# Wikijs-Sync

An Obsidian plugin that allows you to upload your notes to a Wiki.js instance through its GraphQL API. Supports automatic image upload, markdown conversion, bulk uploads, and auto-sync.

**Fork of [luashiping/note-to-wikijs](https://github.com/luashiping/note-to-wikijs)** with enhanced functionality including navigation menu sync, locale support, improved link conversion, and advanced sync options.

---

## Features

- 📤 **Individual Note Upload** – Upload current note or any file via command palette, ribbon icon, or right-click context menu
- 🗂️ **Bulk Folder Upload** – Upload entire folders with configurable conflict resolution (overwrite, skip, ask)
- 🔄 **Auto-Sync Vault** – Automatically sync modified notes to Wiki.js after configurable delay
- 🗑️ **Auto-Sync Deletions** – Delete Wiki.js pages when notes are deleted in Obsidian (optional)
- 🧹 **Cleanup Orphaned Pages** – Command to delete Wiki.js pages without corresponding Obsidian files
- 🖼️ **Automatic Image Upload** – Images referenced in notes are uploaded to Wiki.js assets with proper folder structure
- 🏷️ **Tag & Metadata Support** – Extracts tags from YAML frontmatter and inline hashtags
- 🌐 **Locale Support** – Configurable locale for new pages (default: 'en')
- 🔗 **Smart Link Conversion** – Converts Obsidian wikilinks to Wiki.js paths with locale and full folder structure
- ⚙️ **Configurable Upload Behavior** – Choose what happens when a page already exists (ask, update, create-new)
- 📋 **Rich Upload Modal** – Preview and edit page title, path, description, and tags before uploading
- 🎯 **Navigation Menu Sync** – Automatically syncs navigation tree after successful uploads
- 📊 **Multiple Sync Modes** – Force sync (overwrite all), sync new only (skip existing), or bulk upload with images
- 🔌 **Connection Testing** – Test connection to Wiki.js instance directly from settings

---

## Installation

### Install via BRAT (Recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tester) is the easiest way to install this plugin.

1. Install the **BRAT** plugin from the Obsidian Community Plugins
2. Open BRAT settings and click **"Add Beta plugin"**
3. Enter the repository URL: `https://github.com/Pachinko0/wikijs-sync.git`
4. Click **"Add Plugin"** – BRAT will download and install it automatically
5. Enable **Wikijs-Sync** in Obsidian Settings > Community Plugins

BRAT keeps the plugin up to date automatically whenever a new release is published.

### Manual Installation

1. Download the latest release from the [GitHub releases page](https://github.com/Pachinko0/wikijs-sync/releases)
2. Extract the files to your Obsidian plugins folder: `{vault}/.obsidian/plugins/wikijs-sync/`
3. Enable the plugin in Obsidian Settings > Community Plugins

### Building from Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the plugin
4. Copy `main.js`, `manifest.json`, and `styles.css` to your plugins folder
5. For development, use `npm run dev` with Hot Reload plugin and symlink setup (see [DEVELOPMENT.md](./DEVELOPMENT.md))

---

## Configuration

Open Obsidian Settings > Community Plugins > Wikijs-Sync to configure:

### Required Settings

- **Wiki.js URL** – The base URL of your Wiki.js instance (e.g., `https://wiki.example.com`)
- **API Token** – Your Wiki.js API token (generate in Wiki.js Admin > API Access)

### General Settings

- **Auto Convert Links** – Automatically convert relative links to absolute Wiki.js paths (recommended: enabled)
- **Preserve Obsidian Syntax** – Keep Obsidian-specific syntax unchanged (e.g., `[[links]]`, callouts)
- **Locale** – Locale code for new pages (e.g., `en`, `zh`, `fr`). Default: `en`

### Advanced Settings

- **Upload Behavior** – Choose what happens when uploading a note that already exists:
  - `ask` – Prompt each time (default)
  - `update` – Always update existing page
  - `create-new` – Always create new page

- **Bulk Upload Behavior** – Conflict resolution for bulk uploads:
  - `overwrite` – Overwrite existing pages
  - `skip` – Skip existing pages
  - `ask` – Ask for each page

- **Upload Images in Bulk Upload** – When enabled, images referenced in notes will be uploaded to Wiki.js assets during bulk upload

- **Auto-Sync Vault** – Automatically sync modified notes to Wiki.js
- **Auto-Sync Delay** – Delay in seconds before syncing a modified note (prevents too frequent updates)
- **Auto-Sync Images** – Upload images referenced in notes during auto-sync
- **Auto-Sync Deletions** – Delete Wiki.js pages when notes are deleted in Obsidian (default: disabled)

---

## Usage

### Upload Current Note

1. Open the note you want to upload
2. Use one of these methods:
   - Click the upload icon in the ribbon
   - Use command palette (Ctrl/Cmd + P) → "Upload current note"
   - Right-click the file in file explorer → "Upload to wiki.js"

### Upload Specific File or Folder

1. Right-click any markdown file or folder in the file explorer
2. Select **"Upload to wiki.js"** from the context menu

OR

1. Use command palette → "Upload file"
2. Select the file from the list

### Bulk Upload Folder

1. Use command palette → "Bulk upload folder to Wiki.js"
2. Select a folder from your vault
3. Choose conflict resolution behavior if configured to ask

### Sync Options

- **Force Sync Everything** – Upload all notes, overwriting existing Wiki.js pages
- **Sync New Files Only** – Upload only notes that don't already exist in Wiki.js
- **Auto-Sync** – Automatically sync modified notes after the configured delay
- **Clean Up Deleted Notes** – Delete Wiki.js pages without corresponding Obsidian files

### Upload Modal

When uploading a note, a modal appears with:

- **Wiki.js Path** – Defaults to Obsidian folder structure (e.g., `folder/subfolder` for notes in folders)
- **Page Title** – Extracted from first heading or filename
- **Description** – Optional page description
- **Tags** – Extracted from YAML frontmatter and inline hashtags
- **Upload Button** – Processes the upload with image handling

---

## Markdown Conversion

The plugin automatically converts Obsidian-specific syntax to be compatible with Wiki.js:

### Links

- `[[Internal Link]]` → `[Internal Link](/en/full/path/to/internal-link)` (includes locale and folder structure)
- `[[Internal Link|Display Text]]` → `[Display Text](/en/full/path/to/internal-link)`
- `[[Page#heading]]` → `[Page#heading](/en/path/page#heading)` (anchors preserved)
- Original wikilinks are preserved as HTML comments for bidirectional sync: `[[Page]]` → `[Page](/en/page) <!-- [[Page]] -->`
- Relative markdown links are converted to absolute Wiki.js paths with locale

### Images

- `![[image.png]]` → `![image.png](/path/image.png)` (uploaded to Wiki.js assets)
- Image paths preserve folder structure relative to the note

### Tags

- `#tag` → `` `#tag` ``
- Tags from YAML frontmatter are extracted and added to the Wiki.js page

### Callouts

- Obsidian callouts are converted to blockquotes with bold titles

### YAML Frontmatter

- YAML frontmatter is automatically stripped (tags are preserved)

---

## API Permissions

Ensure your Wiki.js API token has the following permissions:

- `pages:read` – To check if pages exist
- `pages:write` – To create new pages
- `pages:manage` – To update existing pages
- Assets permissions for image upload (if using image upload features)

---

## Troubleshooting

### Connection Issues

1. Verify your Wiki.js URL is correct and accessible
2. Check that your API token is valid and has the required permissions

### Upload Failures

1. Check the Obsidian developer console (Ctrl+Shift+I) for detailed error messages
2. Verify the target path doesn't contain invalid characters
3. Ensure you have proper permissions to create/update pages in Wiki.js
4. Check that the page locale matches your Wiki.js configuration

### Link Conversion Issues

1. Ensure "Auto Convert Links" is enabled in settings
2. Check that wikilinks reference existing notes in your vault
3. Verify locale setting matches your Wiki.js instance

---

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed development setup, including hot reload with symlinks and testing procedures.

### Quick Development Setup

1. Clone repository and run `npm install`
2. Create symlink: `ln -s /path/to/vault/.obsidian/plugins/wikijs-sync dist`
3. Run `npm run dev` for development build with watch mode
4. Install and enable Hot Reload plugin in Obsidian
5. Make changes – ESBuild rebuilds automatically, Hot Reload reloads plugin

---

## Changelog

### 1.2.0
- Added auto-sync deletion feature – delete Wiki.js pages when notes are deleted in Obsidian
- Added cleanup command – delete orphaned Wiki.js pages without corresponding Obsidian files
- New setting: "Auto-sync deletions" (default: disabled) in plugin settings
- Enhanced auto-sync to handle both syncs and deletions in correct order
- Added folder deletion notice (folder sync not yet implemented)
- Fixed handling of renamed/moved notes with improved path computation
- Improved error handling and logging for deletion operations

### 1.1.0
- Added bidirectional wikilink preservation for perfect round-trip sync
- Original Obsidian wikilinks are preserved as HTML comments when uploading to Wiki.js
- When syncing from Wiki.js back to Obsidian, original wikilinks are restored exactly
- Fixes broken links and formatting when syncing complex wikilinks with spaces and paths

### 1.0.2
- Fixed folder sync conflicts and improved path normalization
- Added folder conflict check to prevent file/folder name collisions
- Rewrote resolveFolderPath to find best existing folder prefix
- Updated sanitizeSegment to normalize underscores to hyphens
- Fixed path comparison in findObsidianFileByWikiPath
- Added enhanced debug logging for sync troubleshooting
- Improved sync performance with folder reuse optimization

### 1.0.1
- Added navigation menu sync feature
- Fixed locale foreign key constraint by making locale configurable
- Enhanced link conversion with proper locale and folder structure support
- Added wikilink resolution using Obsidian's metadata cache
- Improved bulk upload with conflict resolution options
- Added auto-sync with configurable delay
- Fixed image upload path handling
- Added debug logging for troubleshooting

### 1.0.0
- Fork of luashiping/note-to-wikijs
- Added bulk folder upload with conflict resolution
- Added auto-sync capabilities
- Improved UI and upload modal
- Added locale support
- Enhanced link conversion
- Preserved all original features

---

## Contributing

Contributions are welcome! Feel free to submit a Pull Request.

If you fork this plugin for your own enhancements, please **credit the original project**: [luashiping/note-to-wikijs](https://github.com/luashiping/note-to-wikijs).

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

Original project © luashiping. Fork enhancements © contributors.

---

## Acknowledgments

- Original plugin by [luashiping](https://github.com/luashiping/note-to-wikijs)
- Wiki.js for their excellent GraphQL API
- Obsidian for their extensible plugin architecture