# Note to Wiki.js Plus

A fork of [luashiping/note-to-wikijs](https://github.com/luashiping/note-to-wikijs) with **enhanced functionality**, including bidirectional sync, bulk uploads, and a more intuitive UI.

---

## Features

- 🔄 **TODO: Bidirectional Sync** – Keep your Obsidian notes and Wiki.js pages in sync automatically  
- 🗂️ **Bulk Upload** – Upload entire folders with notes and images in one go  
- 📤 Upload individual notes to Wiki.js  
- 🖼️ Automatic image upload to Wiki.js assets  
- 🏷️ Support for tags and metadata  
- ⚙️ Configurable upload behavior (create new, update existing, or ask)  
- 🔗 Automatic link conversion  
- 📋 Rich upload modal with content preview  
- 🎯 Right-click context menu integration  
- ✨ Improved UI for easier navigation and configuration  

---

## Installation

### Install via BRAT (Recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tester) is the easiest way to install this plugin before it's available in the official Obsidian community plugins list.

1. Install the **BRAT** plugin from the Obsidian Community Plugins  
2. Open BRAT settings and click **"Add Beta plugin"**  
3. Enter the repository URL: [Wikijs-sync](https://github.com/Pachinko0/wikijs-sync.git)
4. Click **"Add Plugin"** — BRAT will download and install it automatically  
5. Enable **Note to Wiki.js** in Obsidian Settings > Community Plugins  

BRAT also keeps the plugin up to date automatically whenever a new release is published.

---

### Manual Installation

1. Download the Zip.
2. Extract the files to your Obsidian plugins folder: `{vault}/.obsidian/plugins/note-to-wikijs-plus/`  
3. Enable the plugin in Obsidian settings  

---

### Building from Source

1. Clone this repository  
2. Run `npm install` to install dependencies  
3. Run `npm run build` to build the plugin  
4. Copy `main.js`, `manifest.json`, and `styles.css` to your plugins folder
5. You can use Hot Reload plugin and symlinks for faster testing. 

---

## Configuration

1. Open Obsidian Settings  
2. Navigate to "Community Plugins" > "Note to Wiki.js Plus"  
3. Configure the following settings:

### Required Settings

- **Wiki.js URL**: The base URL of your Wiki.js instance (e.g., `https://wiki.example.com`)  
- **API Token**: Your Wiki.js API token (generate this in Wiki.js Admin > API Access)  

### Optional Settings

- **Default Tags**: Comma-separated list of default tags to add to uploaded pages  
- **Auto Convert Links**: Automatically convert relative links to absolute Wiki.js paths  
- **Preserve Obsidian Syntax**: Keep Obsidian-specific syntax unchanged (e.g., `[[links]]`, callouts)  
- **Upload Behavior**: Choose what happens when uploading a note that already exists  

---

## Usage

### Bidirectional Sync

WIP

### Upload Current Note

1. Open the note you want to upload  
2. Use one of these methods:  
   - Click the upload icon in the ribbon  
   - Use the command palette (Ctrl/Cmd + P) and search for "Upload current note to Wiki.js"  
   - Use the keyboard shortcut (if configured)  

---

### Upload Specific File or Folder

1. Right-click any markdown file or folder in the file explorer  
2. Select **"Upload to Wiki.js"** from the context menu  

OR

1. Use the command palette and search for "Upload file/folder to Wiki.js"  
2. Select the file(s) or folder from the list  

---

## Markdown Conversion

The plugin automatically converts Obsidian-specific syntax to be compatible with Wiki.js:

### Links

- `[[Internal Link]]` → `[Internal Link](/internal-link)`  
- `[[Internal Link|Display Text]]` → `[Display Text](/internal-link)`  

### Tags

- `#tag` → `` `#tag` ``  

### YAML Frontmatter

YAML frontmatter is automatically stripped, but tags from frontmatter are extracted and added to the Wiki.js page.

---

## API Permissions

Ensure your Wiki.js API token has the following permissions:

- `pages:read` - To check if pages exist  
- `pages:write` - To create new pages  
- `pages:manage` - To update existing pages  

---

## Troubleshooting

### Connection Issues

1. Verify your Wiki.js URL is correct and accessible  
2. Check that your API token is valid and has the required permissions  
3. Use the "Test Connection" button in settings to verify connectivity  

### Upload Failures

1. Check the browser console for detailed error messages  
2. Verify the target path doesn't contain invalid characters  
3. Ensure you have proper permissions to create/update pages in Wiki.js  

### Markdown Conversion Issues

1. If links aren't converting properly, check the "Auto Convert Links" setting  
2. If you want to preserve Obsidian syntax, enable "Preserve Obsidian Syntax"  
3. Review the content preview in the upload modal before uploading  

---

## Roadmap

Future features planned for development:

- 🔄 **Enhanced Sync Settings** – Customize conflict resolution  
- 📁 **Bulk Upload Folder** – Upload entire folders with all files and images at once  
- ✨ Additional UI improvements  

---

## Contributing

Contributions are welcome! Feel free to submit a Pull Request.  

If you fork this plugin for your own enhancements, please **credit the original project**: [luashiping/note-to-wikijs](https://github.com/luashiping/note-to-wikijs).  

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.  
Original project © luashiping. Fork enhancements © YOUR NAME.

---

## Changelog

### 1.0.0

- Fork release  
- Added bidirectional sync  
- Added bulk upload for files and folders  
- Improved UI and upload modal  
- Preserved all original features
