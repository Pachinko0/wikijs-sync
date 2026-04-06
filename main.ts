import { App, Editor, MarkdownView, Modal, Notice, Plugin, Setting, TFile, TFolder } from 'obsidian';
import { WikiJSSettings, NavigationItemInput } from './src/types';
import { WikiJSSettingTab, DEFAULT_SETTINGS } from './src/settings';
import { UploadModal } from './src/upload-modal';
import { WikiJSAPI } from './src/wikijs-api';
import { MarkdownProcessor } from './src/markdown-processor';
import { ImageTagProcessor } from './src/image-tag-processor';

export default class NoteToWikiJSPlugin extends Plugin {
	settings: WikiJSSettings;

	async onload() {
		await this.loadSettings();

		// Add ribbon icon
		const ribbonIconEl = this.addRibbonIcon('upload', 'Upload current note to wiki.js', (evt: MouseEvent) => {
			void this.uploadCurrentNote();
		});
		ribbonIconEl.addClass('wikijs-ribbon-icon');

		// Add command to upload current note
		this.addCommand({
			id: 'upload-current-note',
			name: 'Upload current note',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				void this.uploadCurrentNote();
			}
		});

		// Add command to upload specific file
		this.addCommand({
			id: 'upload-file-to-wikijs',
			name: 'Upload file',
			callback: () => {
				this.selectAndUploadFile();
			}
		});

		// Add command to bulk upload files
		this.addCommand({
			id: 'bulk-upload-to-wikijs',
			name: 'Bulk upload folder to Wiki.js',
			callback: () => {
				this.bulkUploadFolder();
			}
		});

		// Add context menu item for files
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle('Upload to wiki.js')
							.setIcon('upload')
							.onClick(async () => {
								await this.uploadFile(file);
							});
					});
				} else if (file instanceof TFolder) {
					menu.addItem((item) => {
						item
							.setTitle('Upload folder to wiki.js')
							.setIcon('upload')
							.onClick(async () => {
								await this.uploadFolder(file);
							});
					});
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new WikiJSSettingTab(this.app, this));

		// Add status bar item
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Wiki.js ready');
		statusBarItemEl.addClass('wikijs-status-bar');

		console.debug('Note to Wiki.js plugin loaded');
	}

	onunload() {
		console.debug('Note to Wiki.js plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	showNotice(message: string, duration: number = 5000) {
		new Notice(message, duration);
	}

	private async uploadCurrentNote() {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile) {
			this.showNotice('No active file to upload');
			return;
		}

		if (activeFile.extension !== 'md') {
			this.showNotice('Only markdown files can be uploaded to Wiki.js');
			return;
		}

		await this.uploadFile(activeFile);
	}

	private async uploadFile(file: TFile) {
		// Validate settings
		if (!this.settings.wikiUrl || !this.settings.apiToken) {
			this.showNotice('Please configure Wiki.js settings first (URL and API Token)');
			return;
		}

		// Test connection before uploading
		const api = new WikiJSAPI(this.settings);
		const isConnected = await api.checkConnection();
		
		if (!isConnected) {
			this.showNotice('Cannot connect to Wiki.js. Please check your settings.');
			return;
		}

		// Open upload modal
		const modal = new UploadModal(this.app, this, file);
		modal.open();
	}

	private selectAndUploadFile() {
		const files = this.app.vault.getMarkdownFiles();
		
		if (files.length === 0) {
			this.showNotice('No markdown files found in vault');
			return;
		}

		// Create file selection modal
		const modal = new FileSelectionModal(this.app, files, (file) => {
			void this.uploadFile(file);
		});
		modal.open();
	}

	private async bulkUploadFolder() {
		const folders = this.app.vault.getAllLoadedFiles()
			.filter(file => 'children' in file)
			.map(folder => folder.path);

		if (folders.length === 0) {
			this.showNotice('No folders found in vault');
			return;
		}

		// Create folder selection modal
		const modal = new FolderSelectionModal(this.app, folders, async (folderPath) => {
			await this.uploadFolderContents(folderPath);
		});
		modal.open();
	}

	private async uploadFolderContents(folderPath: string) {
		const files = this.app.vault.getMarkdownFiles()
			.filter(file => file.path.startsWith(folderPath));

		if (files.length === 0) {
			this.showNotice(`No markdown files found in folder: ${folderPath}`);
			return;
		}

		const modal = new BulkUploadModal(this.app, this, files);
		modal.open();
	}

	private async uploadFolder(folder: TFolder) {
		// Validate settings
		if (!this.settings.wikiUrl || !this.settings.apiToken) {
			this.showNotice('Please configure Wiki.js settings first (URL and API Token)');
			return;
		}

		// Test connection before uploading
		const api = new WikiJSAPI(this.settings);
		const isConnected = await api.checkConnection();

		if (!isConnected) {
			this.showNotice('Cannot connect to Wiki.js. Please check your settings.');
			return;
		}

		// Get all markdown files in folder recursively
		const files = this.app.vault.getMarkdownFiles()
			.filter(file => file.path.startsWith(folder.path));

		if (files.length === 0) {
			this.showNotice(`No markdown files found in folder: ${folder.path}`);
			return;
		}

		const modal = new BulkUploadModal(this.app, this, files);
		modal.open();
	}
}

// File Selection Modal
class FileSelectionModal extends Modal {
	files: TFile[];
	onFileSelect: (file: TFile) => void;

	constructor(app: App, files: TFile[], onFileSelect: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onFileSelect = onFileSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Select file to upload' });

		const fileList = contentEl.createDiv('file-list');
		
		this.files.forEach(file => {
			const fileItem = fileList.createDiv('file-item');
			
			fileItem.createEl('div', { text: file.name, cls: 'file-name' });
			fileItem.createEl('div', { text: file.path, cls: 'file-path setting-item-description' });
			
			fileItem.onclick = () => {
				this.close();
				this.onFileSelect(file);
			};
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// TODO: Re-enable after adding image upload support for bulk upload
// Folder Selection Modal
class FolderSelectionModal extends Modal {
	folders: string[];
	onFolderSelect: (folder: string) => void;

	constructor(app: App, folders: string[], onFolderSelect: (folder: string) => void) {
		super(app);
		this.folders = folders;
		this.onFolderSelect = onFolderSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Select folder to upload' });

		const folderList = contentEl.createDiv('folder-list');
		
		this.folders.forEach(folder => {
			const folderItem = folderList.createDiv('folder-item');
			
			folderItem.createEl('div', { text: folder || '(Root)', cls: 'folder-name' });
			
			folderItem.onclick = () => {
				this.close();
				this.onFolderSelect(folder);
			};
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// TODO: Re-enable after adding image upload support for bulk upload
// Bulk Upload Modal
class BulkUploadModal extends Modal {
	plugin: NoteToWikiJSPlugin;
	files: TFile[];
	private conflictResolution: 'overwrite' | 'skip' | 'ask';
	private uploadImages: boolean;
	private uploadProgress: { [key: string]: 'pending' | 'uploading' | 'success' | 'error' | 'skipped' } = {};
	private uploadResults: { [key: string]: string } = {};
	private imageProcessor: ImageTagProcessor;

	constructor(app: App, plugin: NoteToWikiJSPlugin, files: TFile[]) {
		super(app);
		this.plugin = plugin;
		this.files = files;
		this.conflictResolution = this.plugin.settings.bulkUploadBehavior || 'overwrite';
		this.uploadImages = this.plugin.settings.bulkUploadImages ?? true;
		this.imageProcessor = new ImageTagProcessor(app);

		// Initialize progress tracking
		this.files.forEach(file => {
			this.uploadProgress[file.path] = 'pending';
		});
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: `Bulk upload (${this.files.length} files)` });

		// Settings
		const settingsDiv = contentEl.createDiv('bulk-upload-settings');
		new Setting(settingsDiv)
			.setName('If page exists')
			.setDesc('Choose what to do when a page already exists in Wiki.js')
			.addDropdown(dropdown => dropdown
				.addOption('overwrite', 'Overwrite existing page')
				.addOption('skip', 'Skip existing page')
				.addOption('ask', 'Ask for each page')
				.setValue(this.conflictResolution)
				.onChange(value => {
					this.conflictResolution = value as 'overwrite' | 'skip' | 'ask';
				}));

		new Setting(settingsDiv)
			.setName('Upload images')
			.setDesc('Upload images referenced in notes to Wiki.js assets')
			.addToggle(toggle => toggle
				.setValue(this.uploadImages)
				.onChange(value => {
					this.uploadImages = value;
				}));

		// File list
		const fileListDiv = contentEl.createDiv('bulk-upload-list');

		this.files.forEach(file => {
			const fileItem = fileListDiv.createDiv('bulk-upload-item');

			fileItem.createEl('span', { text: file.name });
			const status = fileItem.createEl('span', { cls: 'upload-status' });

			this.updateFileStatus(file.path, status);
		});

		// Progress bar
		const progressDiv = contentEl.createDiv('progress-container');
		const progressBar = progressDiv.createEl('div', { cls: 'progress-bar' });
		
		const progressFill = progressBar.createEl('div', { cls: 'progress-fill' });

		// Buttons
		const buttonDiv = contentEl.createDiv('modal-button-container');
		
		const cancelButton = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelButton.onclick = () => this.close();

		const uploadButton = buttonDiv.createEl('button', { 
			text: 'Start upload',
			cls: 'mod-cta'
		});
		uploadButton.onclick = () => this.startBulkUpload(progressFill, uploadButton);
	}

	private updateFileStatus(filePath: string, statusElement: HTMLElement) {
		const status = this.uploadProgress[filePath];
		const result = this.uploadResults[filePath];
		
		// Remove all status classes
		statusElement.removeClass('pending', 'uploading', 'success', 'error', 'skipped');

		switch (status) {
			case 'pending':
				statusElement.textContent = '⏳ pending';
				statusElement.addClass('pending');
				break;
			case 'uploading':
				statusElement.textContent = '🔄 uploading...';
				statusElement.addClass('uploading');
				break;
			case 'success':
				statusElement.textContent = '✅ success';
				statusElement.addClass('success');
				break;
			case 'error':
				statusElement.textContent = '❌ error';
				statusElement.addClass('error');
				if (result) {
					statusElement.title = result;
				}
				break;
			case 'skipped':
				statusElement.textContent = '⏭️ skipped';
				statusElement.addClass('skipped');
				if (result) {
					statusElement.title = result;
				}
				break;
		}
	}

	private async startBulkUpload(progressFill: HTMLElement, uploadButton: HTMLButtonElement) {
		uploadButton.textContent = 'Uploading...';
		uploadButton.disabled = true;

		const api = new WikiJSAPI(this.plugin.settings);
		const processor = new MarkdownProcessor(this.plugin.settings);

		let completed = 0;
		const total = this.files.length;

		for (const file of this.files) {
			this.uploadProgress[file.path] = 'uploading';
			this.updateFileStatusInModal(file.path);

			try {
				const content = await this.app.vault.read(file);
				const path = processor.generatePath(file.name, file.parent?.path);
				const processed = processor.processMarkdown(content, file.name, path);
				const tags = processor.extractTags(content);

				// Check if page exists
				let existingPage;
				try {
					existingPage = await api.getPageByPath(path);
				} catch (error) {
					existingPage = null;
				}

				// Conflict resolution logic
				if (existingPage) {
					switch (this.conflictResolution) {
						case 'skip':
							this.uploadProgress[file.path] = 'skipped';
							this.uploadResults[file.path] = `Page already exists at "${path}"`;
							completed++;
							const progress = (completed / total) * 100;
							progressFill.style.width = `${progress}%`;
							this.updateFileStatusInModal(file.path);
							continue; // Skip to next file
						case 'ask':
							// For bulk upload, we treat 'ask' as skip with a notice
							this.uploadProgress[file.path] = 'skipped';
							this.uploadResults[file.path] = `Page already exists at "${path}" (ask mode skipped)`;
							completed++;
							const progressAsk = (completed / total) * 100;
							progressFill.style.width = `${progressAsk}%`;
							this.updateFileStatusInModal(file.path);
							continue;
						case 'overwrite':
							// Proceed to update
							break;
					}
				}

				// Upload images if enabled
				if (this.uploadImages && processed.images && processed.images.length > 0) {
					await this.uploadImagesForPage(api, processed.images, path, file);
				}

				let result;
				if (existingPage) {
					const pageId = Number(existingPage.id);
					if (isNaN(pageId)) {
						throw new Error(`Invalid page ID: ${existingPage.id}`);
					}
					result = await api.updatePage(
						pageId,
						path,
						processed.title,
						processed.content,
						undefined,
						tags
					);
				} else {
					result = await api.createPage(
						path,
						processed.title,
						processed.content,
						undefined,
						tags
					);
				}

				if (result.success) {
					this.uploadProgress[file.path] = 'success';
					this.uploadResults[file.path] = result.pageUrl || '';
				} else {
					this.uploadProgress[file.path] = 'error';
					this.uploadResults[file.path] = result.message;
				}

			} catch (error) {
				this.uploadProgress[file.path] = 'error';
				this.uploadResults[file.path] = (error as any).message;
			}

			completed++;
			const progress = (completed / total) * 100;
			progressFill.style.width = `${progress}%`;

			this.updateFileStatusInModal(file.path);
		}

		const successCount = Object.values(this.uploadProgress).filter(status => status === 'success').length;
		const errorCount = Object.values(this.uploadProgress).filter(status => status === 'error').length;
		const skippedCount = Object.values(this.uploadProgress).filter(status => status === 'skipped').length;

		// Sync navigation if enabled and there were successful uploads
		if (this.plugin.settings.syncNavigation && successCount > 0) {
			try {
				await this.syncNavigationTree(api, this.files.filter(file => this.uploadProgress[file.path] === 'success'));
			} catch (error) {
				console.error('Navigation sync failed:', error as any);
				// Don't fail the entire upload if navigation sync fails
			}
		}

		uploadButton.textContent = `Completed (${successCount} success, ${errorCount} errors, ${skippedCount} skipped)`;

		this.plugin.showNotice(`Bulk upload completed: ${successCount} successful, ${errorCount} errors, ${skippedCount} skipped`);
	}

	private async uploadImagesForPage(api: WikiJSAPI, images: Array<{ name: string; path: string }>, pagePath: string, sourceFile: TFile): Promise<void> {
		// Create asset folder structure based on page path
		let targetFolderId = 0;
		try {
			targetFolderId = await api.ensureAssetFolderPath(pagePath.trim());
			console.debug(`Asset folder prepared, folderId: ${targetFolderId}`);
		} catch (error) {
			console.warn('Failed to create asset folder structure:', error as any);
			// Continue with root directory
			targetFolderId = 0;
		}

		// Resolve image files
		const imageFileMap = this.imageProcessor.resolveImageFiles(images, sourceFile);

		for (const image of images) {
			try {
				console.debug('Processing image:', image.name, 'Original path:', image.path);
				const file = imageFileMap.get(image.path);
				if (file instanceof TFile) {
					console.debug('Found file:', file.path, 'File name:', file.name);
					const arrayBuffer = await this.app.vault.readBinary(file);
					// Upload image to Wiki.js, using actual file name (with extension)
					await api.uploadAsset(file.name, arrayBuffer, targetFolderId);
					// Success notice (optional)
					new Notice(`✅ ${file.name} uploaded successfully`);
					console.debug(`✅ Successfully uploaded: ${file.name}`);
				} else {
					console.error(`File not found: ${image.name} (path: ${image.path})`);
					new Notice(`Image file not found: ${image.name}`);
				}
			} catch (error) {
				console.error(`Failed to upload image ${image.name}:`, error as any);
				new Notice(`Failed to upload image ${image.name}: ${(error as any).message}`);
			}
		}
	}

	private async syncNavigationTree(api: WikiJSAPI, files: TFile[]): Promise<void> {
		// Check if navigation sync is enabled
		if (!this.plugin.settings.syncNavigation) {
			console.debug('Navigation sync is disabled');
			return;
		}

		try {
			console.debug('Starting navigation tree sync...');

			// Get current navigation tree
			let currentTree: NavigationItemInput[] = [];
			try {
				const response = await api.getNavigationTree();
				currentTree = response.navigation.tree;
				console.debug('Current navigation tree:', currentTree);
			} catch (error) {
				console.warn('Failed to get current navigation tree:', error as any);
				// Continue with empty tree
			}

			// Build navigation items from uploaded files
			const newNavigationItems = this.buildNavigationFromFiles(files);

			// Merge with existing tree (simple approach: replace items for same paths)
			// For now, we'll just use the new items
			// TODO: Implement proper merging logic
			const mergedTree = this.mergeNavigationTrees(currentTree, newNavigationItems);

			// Update navigation tree
			const result = await api.updateNavigationTree(mergedTree);

			if (result.navigation.updateTree.responseResult.succeeded) {
				console.debug('Navigation tree updated successfully');
				new Notice('Navigation menu synchronized successfully');
			} else {
				console.error('Failed to update navigation tree:', result.navigation.updateTree.responseResult.message);
				new Notice(`Failed to sync navigation: ${result.navigation.updateTree.responseResult.message}`);
			}
		} catch (error) {
			console.error('Error syncing navigation tree:', error as any);
			new Notice(`Error syncing navigation: ${(error as any).message}`);
		}
	}

	private buildNavigationFromFiles(files: TFile[]): NavigationItemInput[] {
		const items: NavigationItemInput[] = [];
		const processor = new MarkdownProcessor(this.plugin.settings);

		// Track folder paths we've already created items for
		const createdFolders = new Set<string>();

		for (const file of files) {
			// Generate Wiki.js path for the file
			const pagePath = processor.generatePath(file.name, file.parent?.path);

			// Create folder items for each level of the path
			const pathSegments = pagePath.split('/');

			// Build folder hierarchy
			let currentPath = '';
			for (let i = 0; i < pathSegments.length - 1; i++) {
				const segment = pathSegments[i];
				currentPath = currentPath ? `${currentPath}/${segment}` : segment;

				if (!createdFolders.has(currentPath)) {
					items.push({
						id: `folder-${currentPath}`,
						kind: 'folder',
						label: this.formatLabel(segment),
						targetType: undefined,
						target: undefined,
						icon: undefined
					});
					createdFolders.add(currentPath);
				}
			}

			// Create page item
			const pageName = pathSegments[pathSegments.length - 1];
			items.push({
				id: `page-${pagePath}`,
				kind: 'page',
				label: this.formatLabel(pageName),
				targetType: 'page',
				target: `/${pagePath}`,
				icon: undefined
			});
		}

		return items;
	}

	private mergeNavigationTrees(currentTree: NavigationItemInput[], newItems: NavigationItemInput[]): NavigationItemInput[] {
		// Simple implementation: replace items with same id
		const merged = [...currentTree];
		const newIds = new Set(newItems.map(item => item.id));

		// Remove existing items that will be replaced
		for (let i = merged.length - 1; i >= 0; i--) {
			if (newIds.has(merged[i].id)) {
				merged.splice(i, 1);
			}
		}

		// Add new items
		merged.push(...newItems);

		return merged;
	}

	private formatLabel(text: string): string {
		// Convert slug to readable label (e.g., "my-page" -> "My Page")
		return text
			.replace(/[-_]/g, ' ')
			.replace(/\b\w/g, char => char.toUpperCase())
			.trim();
	}

	private updateFileStatusInModal(filePath: string) {
		const statusElements = this.contentEl.querySelectorAll('.upload-status');
		const fileIndex = this.files.findIndex(f => f.path === filePath);
		
		if (fileIndex >= 0 && statusElements[fileIndex]) {
			this.updateFileStatus(filePath, statusElements[fileIndex] as HTMLElement);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
