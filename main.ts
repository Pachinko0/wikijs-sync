import { App, Editor, MarkdownView, Modal, Notice, Plugin, Setting, TFile, TFolder } from 'obsidian';
import { WikiJSSettings } from './src/types';
import { WikiJSSettingTab, DEFAULT_SETTINGS } from './src/settings';
import { UploadModal } from './src/upload-modal';
import { WikiJSAPI } from './src/wikijs-api';
import { MarkdownProcessor } from './src/markdown-processor';
import { ImageTagProcessor } from './src/image-tag-processor';

export default class NoteToWikiJSPlugin extends Plugin {
	settings: WikiJSSettings;
	private autoSyncTimeout: number | null = null;
	private filesToSync: Map<TFile, string | null> = new Map();
	private filesToDelete: Set<string> = new Set(); // Obsidian paths of deleted files
	private autoSyncEventListeners: Array<() => void> = [];

	async onload() {
		await this.loadSettings();

		// Add ribbon icon
		const ribbonIconEl = this.addRibbonIcon('sync', 'Sync all notes to Wiki.js', (evt: MouseEvent) => {
			void this.forceSyncEverything();
		});
		ribbonIconEl.addClass('wikijs-ribbon-icon');

		// Add sync ribbon icon
		const syncRibbonIconEl = this.addRibbonIcon('download', 'Sync current note from wiki.js', (evt: MouseEvent) => {
			void this.syncCurrentNoteFromWikiJS();
		});
		syncRibbonIconEl.addClass('wikijs-ribbon-icon');

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

		// Add command to force sync everything
		this.addCommand({
			id: 'force-sync-everything',
			name: 'Force sync everything (overwrite all)',
			callback: () => {
				void this.forceSyncEverything();
			}
		});

		// Add command to sync new files only
		this.addCommand({
			id: 'sync-new-only',
			name: 'Sync new files only (skip existing)',
			callback: () => {
				void this.syncNewOnly();
			}
		});

		// Add command to sync current note from Wiki.js
		this.addCommand({
			id: 'sync-current-note-from-wikijs',
			name: 'Sync current note from Wiki.js',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				void this.syncCurrentNoteFromWikiJS();
			}
		});

		// Add command to sync all notes from Wiki.js
		this.addCommand({
			id: 'sync-all-from-wikijs',
			name: 'Sync all notes from Wiki.js',
			callback: () => {
				void this.syncAllFromWikiJS();
			}
		});

		// Add command to clean up deleted notes in Wiki.js
		this.addCommand({
			id: 'cleanup-deleted-notes',
			name: 'Clean up deleted notes in Wiki.js',
			callback: () => {
				void this.cleanupDeletedNotes();
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
					menu.addItem((item) => {
						item
							.setTitle('Sync from wiki.js')
							.setIcon('download')
							.onClick(async () => {
								await this.syncFileFromWikiJS(file);
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

		// Initialize auto-sync
		this.initializeAutoSync();

		console.debug('Wikijs-Sync plugin loaded');
	}

	onunload() {
		// Clean up auto-sync
		this.cleanupAutoSync();
		console.debug('Wikijs-Sync plugin unloaded');
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

	/**
	 * Initialize or re-initialize auto-sync based on settings
	 */
	initializeAutoSync() {
		// Clear existing auto-sync setup
		this.cleanupAutoSync();

		// Check if auto-sync is enabled
		if (!this.settings.autoSyncEnabled) {
			console.debug('Auto-sync is disabled');
			return;
		}

		const delay = (this.settings.autoSyncDelay || 5) * 1000; // Convert to milliseconds
		console.debug(`Initializing auto-sync with ${delay}ms delay`);

		// Listen for file modifications
		const modifyListener = this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				console.debug('Auto-sync: file modified', file.path);
				this.scheduleFileSync(file, delay);
			}
		});

		// Listen for file creations
		const createListener = this.app.vault.on('create', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				console.debug('Auto-sync: file created', file.path);
				this.scheduleFileSync(file, delay);
			}
		});

		// Listen for file renames
		const renameListener = this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'md') {
				console.debug('Auto-sync: file renamed', oldPath, '->', file.path);
				this.scheduleFileSync(file, delay, oldPath);
			}
		});

		// Listen for file deletions (only if autoSyncDelete is enabled)
		const deleteListener = this.app.vault.on('delete', (file) => {
			if (!(this.settings.autoSyncDelete ?? false)) return;
			if (file instanceof TFile && file.extension === 'md') {
				console.debug('Auto-sync: file deleted', file.path);
				this.scheduleFileDelete(file.path, delay);
			} else if (file instanceof TFolder) {
				console.debug('Auto-sync: folder deleted', file.path);
				// TODO: handle folder deletions (delete all pages under that path)
				this.showNotice(`Folder deletion sync not yet implemented for ${file.path}. Wiki.js pages may remain.`);
			}
		});

		// Store listeners for cleanup
		this.autoSyncEventListeners.push(() => this.app.vault.offref(modifyListener));
		this.autoSyncEventListeners.push(() => this.app.vault.offref(createListener));
		this.autoSyncEventListeners.push(() => this.app.vault.offref(renameListener));
		this.autoSyncEventListeners.push(() => this.app.vault.offref(deleteListener));
	}

	/**
	 * Clean up auto-sync event listeners and timeouts
	 */
	private cleanupAutoSync() {
		// Clear any pending timeout
		if (this.autoSyncTimeout !== null) {
			window.clearTimeout(this.autoSyncTimeout);
			this.autoSyncTimeout = null;
		}

		// Clear files to sync
		this.filesToSync.clear();
		this.filesToDelete.clear();

		// Remove all event listeners
		for (const cleanup of this.autoSyncEventListeners) {
			cleanup();
		}
		this.autoSyncEventListeners = [];
	}

	/**
	 * Schedule a file for sync after delay
	 */
	private scheduleFileSync(file: TFile, delay: number, oldPath: string | null = null) {
		// Add file to sync set with oldPath (if rename)
		this.filesToSync.set(file, oldPath);
		this.scheduleAutoSyncProcessing(delay);
	}

	/**
	 * Schedule a file deletion after delay
	 */
	private scheduleFileDelete(oldPath: string, delay: number) {
		// Add path to delete set
		this.filesToDelete.add(oldPath);
		this.scheduleAutoSyncProcessing(delay);
	}

	/**
	 * Schedule auto-sync processing after delay (creates timeout if not already set)
	 */
	private scheduleAutoSyncProcessing(delay: number) {
		// Clear existing timeout
		if (this.autoSyncTimeout !== null) {
			window.clearTimeout(this.autoSyncTimeout);
		}

		// Set new timeout
		this.autoSyncTimeout = window.setTimeout(() => {
			this.processAutoSync();
		}, delay);
	}

	/**
	 * Process all files scheduled for sync and deletion
	 */
	private async processAutoSync() {
		const hasSyncs = this.filesToSync.size > 0;
		const hasDeletions = this.filesToDelete.size > 0;

		if (!hasSyncs && !hasDeletions) {
			return;
		}

		// Validate settings
		if (!this.settings.wikiUrl || !this.settings.apiToken) {
			this.showNotice('Cannot auto-sync: Wiki.js settings not configured');
			this.clearQueues();
			return;
		}

		// Test connection
		const api = new WikiJSAPI(this.settings);
		try {
			const isConnected = await api.checkConnection();
			if (!isConnected) {
				this.showNotice('Cannot auto-sync: Unable to connect to Wiki.js');
				this.clearQueues();
				return;
			}
		} catch (error) {
			console.error('Auto-sync connection check failed:', error);
			this.showNotice('Auto-sync failed: Connection error');
			this.clearQueues();
			return;
		}

		let deleteSuccessCount = 0;
		let deleteErrorCount = 0;
		let syncSuccessCount = 0;
		let syncErrorCount = 0;

		// Process deletions first
		if (hasDeletions && (this.settings.autoSyncDelete ?? false)) {
			const deletions = Array.from(this.filesToDelete);
			this.filesToDelete.clear();
			console.debug(`Auto-sync: processing ${deletions.length} deletion(s)`);

			for (const oldPath of deletions) {
				try {
					await this.autoSyncDeleteFile(oldPath, api);
					deleteSuccessCount++;
				} catch (error) {
					console.error(`Auto-sync deletion failed for ${oldPath}:`, error);
					deleteErrorCount++;
				}
			}
		} else if (hasDeletions) {
			// autoSyncDelete is disabled, just clear the queue
			this.filesToDelete.clear();
		}

		// Process syncs
		if (hasSyncs) {
			const entries = Array.from(this.filesToSync.entries());
			this.filesToSync.clear();
			console.debug(`Auto-syncing ${entries.length} modified file(s)`);

			for (const [file, oldPath] of entries) {
				try {
					await this.autoSyncFile(file, api, oldPath);
					syncSuccessCount++;
				} catch (error) {
					console.error(`Auto-sync failed for ${file.path}:`, error);
					syncErrorCount++;
				}
			}
		}

		// Clear timeout
		this.autoSyncTimeout = null;

		// Show notices
		const notices = [];
		if (deleteSuccessCount > 0 || deleteErrorCount > 0) {
			notices.push(`deletions: ${deleteSuccessCount} successful, ${deleteErrorCount} failed`);
		}
		if (syncSuccessCount > 0 || syncErrorCount > 0) {
			notices.push(`syncs: ${syncSuccessCount} successful, ${syncErrorCount} failed`);
		}
		if (notices.length > 0) {
			this.showNotice(`Auto-sync completed: ${notices.join('; ')}`);
		}
	}

	/**
	 * Clear both sync and delete queues
	 */
	private clearQueues() {
		this.filesToSync.clear();
		this.filesToDelete.clear();
		this.autoSyncTimeout = null;
	}

	/**
	 * Sync a single file to Wiki.js
	 */
	private async autoSyncFile(file: TFile, api: WikiJSAPI, oldPath: string | null = null) {
		console.debug(`Auto-syncing file: ${file.path}`);

		// Read file content
		const content = await this.app.vault.read(file);
		const wikilinkResolver = this.createWikilinkResolver(file);
		const processor = new MarkdownProcessor(this.settings, wikilinkResolver);
		const newWikiPath = processor.generatePath(file.name, file.parent?.path);
		console.debug('Auto-sync: generated path:', newWikiPath, 'for file:', file.path);
		const processed = processor.processMarkdown(content, file.name, newWikiPath);
		const tags = processor.extractTags(content);

		// Compute old Wiki.js path if rename
		let oldWikiPath: string | null = null;
		if (oldPath) {
			// Extract folder and filename from oldPath (Obsidian vault path)
			const oldSegments = oldPath.split('/').filter(s => s.length > 0);
			if (oldSegments.length > 0) {
				const oldFileName = oldSegments.pop()!;
				const oldFolderPath = oldSegments.join('/');
				oldWikiPath = processor.generatePath(oldFileName, oldFolderPath || undefined);
				console.debug('Auto-sync: old Wiki.js path:', oldWikiPath, 'from oldPath:', oldPath);
			}
		}

		// Delete old page if path changed and old page exists
		if (oldWikiPath && oldWikiPath !== newWikiPath) {
			try {
				const oldPage = await api.getPageByPath(oldWikiPath);
				if (oldPage) {
					const oldPageId = Number(oldPage.id);
					if (!isNaN(oldPageId)) {
						console.debug(`Auto-sync: deleting old page at ${oldWikiPath} (ID: ${oldPageId})`);
						const deleteResult = await api.deletePage(oldPageId);
						if (deleteResult.success) {
							console.debug(`Auto-sync: successfully deleted old page at ${oldWikiPath}`);
						} else {
							console.warn(`Auto-sync: failed to delete old page at ${oldWikiPath}: ${deleteResult.message}`);
						}
					}
				}
			} catch (error) {
				console.warn(`Auto-sync: error while checking/deleting old page at ${oldWikiPath}:`, error);
			}
		}

		// Check if page exists at new path
		let existingPage;
		try {
			console.debug('Auto-sync: checking if page exists at path:', newWikiPath);
			existingPage = await api.getPageByPath(newWikiPath);
			if (existingPage) {
				console.debug('Auto-sync: page exists, ID:', existingPage.id);
			} else {
				console.debug('Auto-sync: page does not exist, will create new');
			}
		} catch (error) {
			console.debug('Auto-sync: error checking page existence:', error);
			existingPage = null;
		}

		// Upload images if enabled
		if (this.settings.autoSyncImages && processed.images && processed.images.length > 0) {
			console.debug('Auto-sync: uploading', processed.images.length, 'images');
			const imageProcessor = new ImageTagProcessor(this.app);
			const imageFileMap = imageProcessor.resolveImageFiles(processed.images, file);

			// Create asset folder structure
			let targetFolderId = 0;
			try {
				targetFolderId = await api.ensureAssetFolderPath(newWikiPath.trim());
				console.debug('Auto-sync: asset folder ID:', targetFolderId);
			} catch (error) {
				console.warn('Failed to create asset folder structure:', error as any);
			}

			// Upload each image
			for (const image of processed.images) {
				try {
					const imageFile = imageFileMap.get(image.path);
					if (imageFile instanceof TFile) {
						const arrayBuffer = await this.app.vault.readBinary(imageFile);
						console.debug('Auto-sync: uploading image:', imageFile.name);
						await api.uploadAsset(imageFile.name, arrayBuffer, targetFolderId);
					}
				} catch (error) {
					console.warn(`Failed to upload image ${image.name}:`, error as any);
				}
			}
		}

		// Update or create page
		let result;
		if (existingPage) {
			console.debug('Auto-sync: updating existing page');
			const pageId = Number(existingPage.id);
			if (isNaN(pageId)) {
				throw new Error(`Invalid page ID: ${existingPage.id}`);
			}
			result = await api.updatePage(
				pageId,
				newWikiPath,
				processed.title,
				processed.content,
				undefined,
				tags
			);
		} else {
			console.debug('Auto-sync: creating new page');
			result = await api.createPage(
				newWikiPath,
				processed.title,
				processed.content,
				undefined,
				tags
			);
		}

		if (!result.success) {
			console.error('Auto-sync: page operation failed:', result.message);
			throw new Error(`Failed to sync page: ${result.message}`);
		}

		console.debug(`Auto-sync successful for ${file.path}`);
	}

	/**
	 * Compute Wiki.js path from an Obsidian file path (e.g., "folder/note.md")
	 */
	private computeWikiPathFromObsidianPath(obsidianPath: string): string {
		const processor = new MarkdownProcessor(this.settings);
		const segments = obsidianPath.split('/').filter(s => s.length > 0);
		if (segments.length === 0) {
			return '';
		}
		const fileName = segments.pop()!;
		const folderPath = segments.join('/');
		return processor.generatePath(fileName, folderPath || undefined);
	}

	/**
	 * Delete a Wiki.js page corresponding to a deleted Obsidian file
	 */
	private async autoSyncDeleteFile(oldPath: string, api: WikiJSAPI): Promise<void> {
		console.debug(`Auto-sync deleting file: ${oldPath}`);
		const wikiPath = this.computeWikiPathFromObsidianPath(oldPath);
		if (!wikiPath) {
			console.warn(`Cannot compute Wiki.js path from ${oldPath}`);
			return;
		}

		try {
			const page = await api.getPageByPath(wikiPath);
			if (page) {
				const pageId = Number(page.id);
				if (!isNaN(pageId)) {
					console.debug(`Auto-sync: deleting page at ${wikiPath} (ID: ${pageId})`);
					const deleteResult = await api.deletePage(pageId);
					if (deleteResult.success) {
						console.debug(`Auto-sync: successfully deleted page at ${wikiPath}`);
					} else {
						console.warn(`Auto-sync: failed to delete page at ${wikiPath}: ${deleteResult.message}`);
						throw new Error(`Failed to delete page: ${deleteResult.message}`);
					}
				} else {
					console.warn(`Auto-sync: invalid page ID ${page.id} for path ${wikiPath}`);
				}
			} else {
				console.debug(`Auto-sync: page not found at ${wikiPath}, nothing to delete`);
			}
		} catch (error) {
			console.error(`Auto-sync: error while deleting page at ${wikiPath}:`, error);
			throw error;
		}
	}

	/**
	 * Create a wikilink resolver function for a given source file.
	 * The resolver uses Obsidian's metadata cache to find the target file
	 * and computes its Wiki.js path.
	 */
	public createWikilinkResolver(sourceFile: TFile): (link: string, sourceFileName?: string) => string | undefined {
		const processor = new MarkdownProcessor(this.settings);
		return (link: string, sourceFileName?: string) => {
			console.debug('wikilinkResolver CALLED: link=', link, 'sourceFileName=', sourceFileName, 'sourceFile.path=', sourceFile.path);
			try {
				const cleanLink = link.replace(/\.md$/i, '');
				console.debug('wikilinkResolver: attempting to resolve', link, 'clean:', cleanLink, 'from source:', sourceFile.path);
				const targetFile = this.app.metadataCache.getFirstLinkpathDest(cleanLink, sourceFile.path);
				if (targetFile instanceof TFile) {
					const targetFolderPath = processor.generateFolderPath(targetFile.parent?.path);
					const targetSlug = processor.generatePath(targetFile.name, '');
					const targetPath = targetFolderPath ? `${targetFolderPath}/${targetSlug}` : targetSlug;
					console.debug('wikilinkResolver: resolved', link, 'to', targetPath, 'target file:', targetFile.path);
					return targetPath;
				} else {
					console.debug('wikilinkResolver: target file not found for link', link);
				}
			} catch (error) {
				console.debug('wikilinkResolver failed for', link, ':', error);
			}
			return undefined;
		};
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

	/**
	 * Force sync all markdown files in the vault (overwrite existing pages)
	 */
	async forceSyncEverything(): Promise<void> {
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

		// Get all markdown files in vault
		const files = this.app.vault.getMarkdownFiles();

		if (files.length === 0) {
			this.showNotice('No markdown files found in vault');
			return;
		}

		this.showNotice(`Starting force sync of ${files.length} files...`);

		let successCount = 0;
		let errorCount = 0;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			try {
				this.showNotice(`Processing ${i + 1}/${files.length}: ${file.name}`, 2000);

				// Read file content
				const wikilinkResolver = this.createWikilinkResolver(file);
				const processor = new MarkdownProcessor(this.settings, wikilinkResolver);
				const content = await this.app.vault.read(file);
				const path = processor.generatePath(file.name, file.parent?.path);
				console.debug('Bulk sync: processing file', file.path, 'Wiki.js path:', path);
				const processed = processor.processMarkdown(content, file.name, path);
				const tags = processor.extractTags(content);

				// Check if page exists
				let existingPage;
				try {
					existingPage = await api.getPageByPath(path);
				} catch (error) {
					existingPage = null;
				}

				// Upload images if enabled
				if (this.settings.bulkUploadImages && processed.images && processed.images.length > 0) {
					const imageProcessor = new ImageTagProcessor(this.app);
					const imageFileMap = imageProcessor.resolveImageFiles(processed.images, file);

					// Create asset folder structure
					let targetFolderId = 0;
					try {
						targetFolderId = await api.ensureAssetFolderPath(path.trim());
					} catch (error) {
						console.warn('Failed to create asset folder structure:', error as any);
					}

					// Upload each image
					for (const image of processed.images) {
						try {
							const imageFile = imageFileMap.get(image.path);
							if (imageFile instanceof TFile) {
								const arrayBuffer = await this.app.vault.readBinary(imageFile);
								await api.uploadAsset(imageFile.name, arrayBuffer, targetFolderId);
							}
						} catch (error) {
							console.warn(`Failed to upload image ${image.name}:`, error as any);
						}
					}
				}

				// Always overwrite existing page (force sync)
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
					successCount++;
				} else {
					errorCount++;
					console.error(`Failed to sync ${file.path}: ${result.message}`);
				}
			} catch (error) {
				errorCount++;
				console.error(`Error syncing ${file.path}:`, error);
			}
		}

		this.showNotice(`Force sync completed: ${successCount} successful, ${errorCount} failed`);

	}

	/**
	 * Sync only new markdown files (skip existing pages)
	 */
	async syncNewOnly(): Promise<void> {
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

		// Get all markdown files in vault
		const files = this.app.vault.getMarkdownFiles();

		if (files.length === 0) {
			this.showNotice('No markdown files found in vault');
			return;
		}

		this.showNotice(`Starting new-only sync of ${files.length} files...`);

		let successCount = 0;
		let errorCount = 0;
		let skippedCount = 0;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			try {
				this.showNotice(`Processing ${i + 1}/${files.length}: ${file.name}`, 2000);

				// Read file content
				const wikilinkResolver = this.createWikilinkResolver(file);
				const processor = new MarkdownProcessor(this.settings, wikilinkResolver);
				const content = await this.app.vault.read(file);
				const path = processor.generatePath(file.name, file.parent?.path);
				console.debug('Bulk sync: processing file', file.path, 'Wiki.js path:', path);
				const processed = processor.processMarkdown(content, file.name, path);
				const tags = processor.extractTags(content);

				// Check if page exists
				let existingPage;
				try {
					existingPage = await api.getPageByPath(path);
				} catch (error) {
					existingPage = null;
				}

				// Skip if page already exists
				if (existingPage) {
					skippedCount++;
					console.debug(`Skipping existing page: ${path}`);
					continue;
				}

				// Upload images if enabled
				if (this.settings.bulkUploadImages && processed.images && processed.images.length > 0) {
					const imageProcessor = new ImageTagProcessor(this.app);
					const imageFileMap = imageProcessor.resolveImageFiles(processed.images, file);

					// Create asset folder structure
					let targetFolderId = 0;
					try {
						targetFolderId = await api.ensureAssetFolderPath(path.trim());
					} catch (error) {
						console.warn('Failed to create asset folder structure:', error as any);
					}

					// Upload each image
					for (const image of processed.images) {
						try {
							const imageFile = imageFileMap.get(image.path);
							if (imageFile instanceof TFile) {
								const arrayBuffer = await this.app.vault.readBinary(imageFile);
								await api.uploadAsset(imageFile.name, arrayBuffer, targetFolderId);
							}
						} catch (error) {
							console.warn(`Failed to upload image ${image.name}:`, error as any);
						}
					}
				}

				// Create new page
				const result = await api.createPage(
					path,
					processed.title,
					processed.content,
					undefined,
					tags
				);

				if (result.success) {
					successCount++;
				} else {
					errorCount++;
					console.error(`Failed to create page ${file.path}: ${result.message}`);
				}
			} catch (error) {
				errorCount++;
				console.error(`Error processing ${file.path}:`, error);
			}
		}

		this.showNotice(`New-only sync completed: ${successCount} successful, ${errorCount} failed, ${skippedCount} skipped`);

	}




	async syncCurrentNoteFromWikiJS(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			this.showNotice('No active file to sync from Wiki.js');
			return;
		}

		if (activeFile.extension !== 'md') {
			this.showNotice('Only markdown files can be synced from Wiki.js');
			return;
		}

		// Validate settings
		if (!this.settings.wikiUrl || !this.settings.apiToken) {
			this.showNotice('Please configure Wiki.js settings first (URL and API Token)');
			return;
		}

		// Test connection
		const api = new WikiJSAPI(this.settings);
		const isConnected = await api.checkConnection();

		if (!isConnected) {
			this.showNotice('Cannot connect to Wiki.js. Please check your settings.');
			return;
		}

		// Generate Wiki.js path from current file
		const processor = new MarkdownProcessor(this.settings, undefined);
		const wikiPath = processor.generatePath(activeFile.name, activeFile.parent?.path);

		// Get page by path
		const page = await api.getPageByPath(wikiPath);
		if (!page) {
			this.showNotice(`No page found at path "${wikiPath}" in Wiki.js`);
			return;
		}

		// Get page content
		const pageId = Number(page.id);
		if (isNaN(pageId)) {
			this.showNotice(`Invalid page ID: ${page.id}`);
			return;
		}

		const pageWithContent = await api.getPageContent(pageId);
		if (!pageWithContent) {
			this.showNotice('Failed to fetch page content from Wiki.js');
			return;
		}

		// Prepare content for Obsidian
		const tags = pageWithContent.tags || [];
		let reversedContent = processor.reverseMarkdown(pageWithContent.content, page.path);
		let content = this.prepareContentForObsidian(reversedContent, tags);

		// Write to file
		await this.app.vault.modify(activeFile, content);
		this.showNotice(`Synced "${activeFile.name}" from Wiki.js`);
	}

	async syncFileFromWikiJS(file: TFile): Promise<void> {
		// Validate settings
		if (!this.settings.wikiUrl || !this.settings.apiToken) {
			this.showNotice('Please configure Wiki.js settings first (URL and API Token)');
			return;
		}

		// Test connection
		const api = new WikiJSAPI(this.settings);
		const isConnected = await api.checkConnection();

		if (!isConnected) {
			this.showNotice('Cannot connect to Wiki.js. Please check your settings.');
			return;
		}

		// Generate Wiki.js path from file
		const processor = new MarkdownProcessor(this.settings, undefined);
		const wikiPath = processor.generatePath(file.name, file.parent?.path);

		// Get page by path
		const page = await api.getPageByPath(wikiPath);
		if (!page) {
			this.showNotice(`No page found at path "${wikiPath}" in Wiki.js`);
			return;
		}

		// Get page content
		const pageId = Number(page.id);
		if (isNaN(pageId)) {
			this.showNotice(`Invalid page ID: ${page.id}`);
			return;
		}

		const pageWithContent = await api.getPageContent(pageId);
		if (!pageWithContent) {
			this.showNotice('Failed to fetch page content from Wiki.js');
			return;
		}

		const tags = pageWithContent.tags || [];
		let reversedContent = processor.reverseMarkdown(pageWithContent.content, page.path);
		let content = this.prepareContentForObsidian(reversedContent, tags);

		// Write to file
		await this.app.vault.modify(file, content);
		this.showNotice(`Synced "${file.name}" from Wiki.js`);
	}

	async syncAllFromWikiJS(): Promise<void> {
		// Validate settings
		if (!this.settings.wikiUrl || !this.settings.apiToken) {
			this.showNotice('Please configure Wiki.js settings first (URL and API Token)');
			return;
		}

		// Test connection
		const api = new WikiJSAPI(this.settings);
		const isConnected = await api.checkConnection();

		if (!isConnected) {
			this.showNotice('Cannot connect to Wiki.js. Please check your settings.');
			return;
		}

		// Get all pages from Wiki.js
		this.showNotice('Fetching page list from Wiki.js...');
		let pageList;
		try {
			const response = await api.getPages();
			pageList = response.pages.list;
		} catch (error) {
			console.error('Failed to fetch page list:', error);
			this.showNotice('Failed to fetch page list from Wiki.js');
			return;
		}

		if (pageList.length === 0) {
			this.showNotice('No pages found in Wiki.js');
			return;
		}

		this.showNotice(`Syncing ${pageList.length} pages from Wiki.js...`);

		let successCount = 0;
		let errorCount = 0;
		let skippedCount = 0;

		for (let i = 0; i < pageList.length; i++) {
			const page = pageList[i];
			this.showNotice(`Processing ${i + 1}/${pageList.length}: ${page.title}`, 2000);

			try {
				console.debug(`syncAllFromWikiJS: processing page "${page.title}" with path "${page.path}"`);
				// Get page content
				const pageId = Number(page.id);
				if (isNaN(pageId)) {
					console.error(`Invalid page ID: ${page.id}`);
					errorCount++;
					continue;
				}

				const pageWithContent = await api.getPageContent(pageId);
				if (!pageWithContent) {
					console.error(`Failed to fetch content for page ${page.id}`);
					errorCount++;
					continue;
				}

				// Prepare content with tags
				const processor = new MarkdownProcessor(this.settings, undefined);
				const reversedContent = processor.reverseMarkdown(pageWithContent.content, page.path);
				const preparedContent = this.prepareContentForObsidian(reversedContent, pageWithContent.tags || []);

				// Try to find existing Obsidian file by Wiki.js path
				const existingFile = this.findObsidianFileByWikiPath(page.path);
				console.debug(`syncAllFromWikiJS: findObsidianFileByWikiPath("${page.path}") returned:`, existingFile?.path || null);

				if (existingFile) {
					// Overwrite existing file
					await this.app.vault.modify(existingFile, preparedContent);
					successCount++;
				} else {
					// No existing file found, create new one
					const { folderPath, fileName } = this.wikiPathToObsidianPath(page.path);

					// Resolve folder path with case-insensitive matching
					const actualFolderPath = await this.resolveFolderPath(folderPath);
					const fullPath = actualFolderPath ? `${actualFolderPath}/${fileName}` : fileName;

					// Check if path conflicts with a folder or existing file
					const conflictingFile = this.app.vault.getAbstractFileByPath(fullPath);
					if (conflictingFile instanceof TFile) {
						// Overwrite existing file at this path
						await this.app.vault.modify(conflictingFile, preparedContent);
						successCount++;
					} else if (conflictingFile instanceof TFolder) {
						// Path conflicts with a folder, skip
						console.error(`Path ${fullPath} is a folder, skipping`);
						skippedCount++;
						continue;
					} else {
						// Create file (folders already created by resolveFolderPath)
						await this.app.vault.create(fullPath, preparedContent);
						successCount++;
					}
				}
			} catch (error) {
				console.error(`Error syncing page ${page.path}:`, error);
				errorCount++;
			}
		}

		this.showNotice(`Sync completed: ${successCount} successful, ${errorCount} failed, ${skippedCount} skipped`);
	}

	async cleanupDeletedNotes(): Promise<void> {
		// Validate settings
		if (!this.settings.wikiUrl || !this.settings.apiToken) {
			this.showNotice('Please configure Wiki.js settings first (URL and API Token)');
			return;
		}

		// Test connection
		const api = new WikiJSAPI(this.settings);
		const isConnected = await api.checkConnection();

		if (!isConnected) {
			this.showNotice('Cannot connect to Wiki.js. Please check your settings.');
			return;
		}

		// Get all pages from Wiki.js
		this.showNotice('Fetching page list from Wiki.js...');
		let pageList;
		try {
			const response = await api.getPages();
			pageList = response.pages.list;
		} catch (error) {
			console.error('Failed to fetch page list:', error);
			this.showNotice('Failed to fetch page list from Wiki.js');
			return;
		}

		if (pageList.length === 0) {
			this.showNotice('No pages found in Wiki.js');
			return;
		}

		this.showNotice(`Checking ${pageList.length} pages for deletions...`);

		let deletedCount = 0;
		let errorCount = 0;
		let skippedCount = 0;

		for (let i = 0; i < pageList.length; i++) {
			const page = pageList[i];
			this.showNotice(`Processing ${i + 1}/${pageList.length}: ${page.title}`, 2000);

			try {
				console.debug(`cleanupDeletedNotes: checking page "${page.title}" with path "${page.path}"`);
				// Check if there's a corresponding Obsidian file
				const existingFile = this.findObsidianFileByWikiPath(page.path);
				console.debug(`cleanupDeletedNotes: findObsidianFileByWikiPath("${page.path}") returned:`, existingFile?.path || null);

				if (!existingFile) {
					// No Obsidian file found, delete the page
					const pageId = Number(page.id);
					if (isNaN(pageId)) {
						console.error(`Invalid page ID: ${page.id}`);
						errorCount++;
						continue;
					}

					console.debug(`cleanupDeletedNotes: deleting orphaned page at ${page.path} (ID: ${pageId})`);
					const deleteResult = await api.deletePage(pageId);
					if (deleteResult.success) {
						console.debug(`cleanupDeletedNotes: successfully deleted page at ${page.path}`);
						deletedCount++;
					} else {
						console.warn(`cleanupDeletedNotes: failed to delete page at ${page.path}: ${deleteResult.message}`);
						errorCount++;
					}
				} else {
					// Obsidian file exists, skip
					skippedCount++;
				}
			} catch (error) {
				console.error(`Error processing page ${page.path}:`, error);
				errorCount++;
			}
		}

		this.showNotice(`Cleanup completed: ${deletedCount} deleted, ${errorCount} errors, ${skippedCount} skipped`);
	}

	private wikiPathToObsidianPath(wikiPath: string): { folderPath: string; fileName: string } {
		// Split wikiPath into segments
		const segments = wikiPath.split('/').filter(s => s.length > 0);
		if (segments.length === 0) {
			return { folderPath: '', fileName: 'untitled.md' };
		}
		const fileName = segments.pop() + '.md';
		const folderPath = segments.join('/');
		return { folderPath, fileName };
	}

	private normalizeWikiPath(path: string): string {
		// Normalize path segments to match generatePath output
		const segments = path.split('/').filter(s => s.length > 0);
		const normalizedSegments = segments.map(seg => MarkdownProcessor.sanitizeSegment(seg));
		return normalizedSegments.join('/');
	}

	private findObsidianFileByWikiPath(wikiPath: string): TFile | null {
		const processor = new MarkdownProcessor(this.settings, undefined);
		const markdownFiles = this.app.vault.getMarkdownFiles();
		const normalizedWikiPath = this.normalizeWikiPath(wikiPath);
		console.debug(`findObsidianFileByWikiPath: searching for wikiPath "${wikiPath}" (normalized: "${normalizedWikiPath}") among ${markdownFiles.length} files`);

		for (const file of markdownFiles) {
			const computedPath = processor.generatePath(file.name, file.parent?.path);
			const normalizedComputedPath = this.normalizeWikiPath(computedPath);
			console.debug(`findObsidianFileByWikiPath: file "${file.path}" -> computed path "${computedPath}" (normalized: "${normalizedComputedPath}")`);
			if (normalizedComputedPath === normalizedWikiPath) {
				console.debug(`findObsidianFileByWikiPath: MATCH! file "${file.path}" matches wikiPath "${wikiPath}"`);
				return file;
			} else if (normalizedComputedPath.replace(/\s+/g, '') === normalizedWikiPath.replace(/\s+/g, '')) {
				// Debug: strings differ only by whitespace
				console.debug(`findObsidianFileByWikiPath: DEBUG - paths differ only by whitespace: "${normalizedComputedPath}" vs "${normalizedWikiPath}"`);
			}
		}
		console.debug(`findObsidianFileByWikiPath: no match found for wikiPath "${wikiPath}"`);
		return null;
	}

	private async resolveFolderPath(folderPath: string): Promise<string> {
		if (!folderPath) {
			return '';
		}

		console.debug(`resolveFolderPath: resolving "${folderPath}"`);
		const segments = folderPath.split('/').filter(s => s.length > 0);
		console.debug(`resolveFolderPath: segments: ${JSON.stringify(segments)}`);

		// Helper to normalize separators (hyphens and underscores)
		const normalizeSeparators = (s: string): string => {
			return s.replace(/_/g, '-').replace(/-+/g, '-');
		};

		// Compute normalized target path segments
		const targetNormalizedSegments = segments.map(seg =>
			normalizeSeparators(MarkdownProcessor.sanitizeSegment(seg))
		);
		const targetNormalizedPath = targetNormalizedSegments.join('/');
		console.debug(`resolveFolderPath: target normalized path: "${targetNormalizedPath}"`);

		// Helper to compute normalized path for a folder
		const computeNormalizedFolderPath = (folder: TFolder): string => {
			const pathSegments: string[] = [];
			let current: TFolder | null = folder;
			while (current) {
				pathSegments.unshift(normalizeSeparators(MarkdownProcessor.sanitizeSegment(current.name)));
				current = current.parent;
			}
			// Remove empty root segment
			return pathSegments.filter(s => s.length > 0).join('/');
		};

		// Get all folders in the vault
		const allFiles = this.app.vault.getAllLoadedFiles();
		const allFolders = allFiles.filter(f => f instanceof TFolder) as TFolder[];
		console.debug(`resolveFolderPath: found ${allFolders.length} total folders in vault`);

		// Find best matching folder (longest normalized path that is a prefix of target)
		let bestExactMatch: { folder: TFolder; normalizedPath: string; } | null = null;
		let bestMatch: { folder: TFolder; normalizedPath: string; } | null = null;
		for (const folder of allFolders) {
			const normalizedFolderPath = computeNormalizedFolderPath(folder);
			console.debug(`resolveFolderPath: folder "${folder.path}" -> normalized: "${normalizedFolderPath}"`);

			if (normalizedFolderPath === targetNormalizedPath) {
				// Exact match candidate
				console.debug(`resolveFolderPath: exact match found: "${folder.path}" -> "${normalizedFolderPath}"`);
				const isBetterExact = !bestExactMatch ||
					// Tie-breaking: prefer folder with uppercase letters (original casing)
					(folder.path.toLowerCase() !== folder.path &&
					 bestExactMatch.folder.path.toLowerCase() === bestExactMatch.folder.path);
				if (isBetterExact) {
					bestExactMatch = { folder, normalizedPath: normalizedFolderPath };
					console.debug(`resolveFolderPath: new best exact match: "${folder.path}"`);
				}
				continue;
			}

			// Check if this folder's normalized path is a prefix of target
			if (targetNormalizedPath.startsWith(normalizedFolderPath + '/')) {
				// Check if it's longer (better) than current best match
				const isBetter = !bestMatch ||
					normalizedFolderPath.length > bestMatch.normalizedPath.length ||
					(normalizedFolderPath.length === bestMatch.normalizedPath.length &&
						// Tie-breaking: prefer folder with uppercase letters (original casing)
						folder.path.toLowerCase() !== folder.path &&
						bestMatch.folder.path.toLowerCase() === bestMatch.folder.path);

				if (isBetter) {
					bestMatch = { folder, normalizedPath: normalizedFolderPath };
					console.debug(`resolveFolderPath: new best match: "${folder.path}" (prefix length: ${normalizedFolderPath.length})`);
				}
			}
		}

		// If we found an exact match, return the best one
		if (bestExactMatch) {
			console.debug(`resolveFolderPath: returning best exact match "${bestExactMatch.folder.path}"`);
			return bestExactMatch.folder.path;
		}

		let currentPath = '';
		if (bestMatch) {
			// Start from best matching folder
			currentPath = bestMatch.folder.path;
			console.debug(`resolveFolderPath: starting from best match folder "${currentPath}"`);

			// Remove matched segments from target
			const matchedSegmentCount = bestMatch.normalizedPath.split('/').length;
			const remainingSegments = segments.slice(matchedSegmentCount);
			console.debug(`resolveFolderPath: remaining segments to create: ${JSON.stringify(remainingSegments)}`);

			// Create remaining folders
			for (const segment of remainingSegments) {
				const parent = currentPath ? this.app.vault.getAbstractFileByPath(currentPath) : null;
				if (parent !== null && !(parent instanceof TFolder)) {
					// Parent exists but is not a folder (e.g., a file)
					// Cannot proceed, return path with remaining segments
					console.debug(`resolveFolderPath: parent "${currentPath}" is not a folder, returning with remaining path`);
					const remainingPath = remainingSegments.slice(remainingSegments.indexOf(segment)).join('/');
					const result = currentPath ? `${currentPath}/${remainingPath}` : remainingPath;
					return result;
				}

				const sanitizedSegment = MarkdownProcessor.sanitizeSegment(segment);
				const normalizedSegment = normalizeSeparators(sanitizedSegment);
				const newFolderPath = currentPath ? `${currentPath}/${normalizedSegment}` : normalizedSegment;

				console.debug(`resolveFolderPath: creating folder "${newFolderPath}" (from segment "${segment}" -> normalized: "${normalizedSegment}")`);
				try {
					await this.app.vault.createFolder(newFolderPath);
					currentPath = newFolderPath;
					console.debug(`resolveFolderPath: created folder, currentPath now "${currentPath}"`);
				} catch (e) {
					// Folder might already exist
					console.debug(`resolveFolderPath: folder creation failed, trying to find "${newFolderPath}"`);
					const found = this.app.vault.getAbstractFileByPath(newFolderPath);
					if (found instanceof TFolder) {
						currentPath = found.path;
						console.debug(`resolveFolderPath: found existing folder, currentPath now "${currentPath}"`);
					} else {
						// Could not create or find, use normalized path
						currentPath = newFolderPath;
						console.debug(`resolveFolderPath: could not create or find folder, using path "${currentPath}"`);
					}
				}
			}
		} else {
			// No matching prefix found, create entire path from root
			console.debug(`resolveFolderPath: no matching prefix found, creating entire path from root`);
			currentPath = '';
			for (const segment of segments) {
				const parent = currentPath ? this.app.vault.getAbstractFileByPath(currentPath) : null;
				if (parent !== null && !(parent instanceof TFolder)) {
					// Parent exists but is not a folder (e.g., a file)
					// Cannot proceed, return path with remaining segments
					console.debug(`resolveFolderPath: parent "${currentPath}" is not a folder, returning with remaining path`);
					const remainingPath = segments.slice(segments.indexOf(segment)).join('/');
					const result = currentPath ? `${currentPath}/${remainingPath}` : remainingPath;
					return result;
				}

				const sanitizedSegment = MarkdownProcessor.sanitizeSegment(segment);
				const normalizedSegment = normalizeSeparators(sanitizedSegment);
				const newFolderPath = currentPath ? `${currentPath}/${normalizedSegment}` : normalizedSegment;

				console.debug(`resolveFolderPath: creating folder "${newFolderPath}" (from segment "${segment}" -> normalized: "${normalizedSegment}")`);
				try {
					await this.app.vault.createFolder(newFolderPath);
					currentPath = newFolderPath;
					console.debug(`resolveFolderPath: created folder, currentPath now "${currentPath}"`);
				} catch (e) {
					// Folder might already exist
					console.debug(`resolveFolderPath: folder creation failed, trying to find "${newFolderPath}"`);
					const found = this.app.vault.getAbstractFileByPath(newFolderPath);
					if (found instanceof TFolder) {
						currentPath = found.path;
						console.debug(`resolveFolderPath: found existing folder, currentPath now "${currentPath}"`);
					} else {
						// Could not create or find, use normalized path
						currentPath = newFolderPath;
						console.debug(`resolveFolderPath: could not create or find folder, using path "${currentPath}"`);
					}
				}
			}
		}

		console.debug(`resolveFolderPath: final path: "${currentPath}"`);
		return currentPath;
	}

	private prepareContentForObsidian(content: string, tags: string[]): string {
		if (tags.length === 0) {
			return content;
		}

		// Check if content already has YAML frontmatter
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (frontmatterMatch) {
			const frontmatter = frontmatterMatch[1];
			// Check if tags line exists
			if (frontmatter.includes('tags:')) {
				return content;
			} else {
				const newFrontmatter = frontmatter + '\ntags: [' + tags.map(tag => `"${tag}"`).join(', ') + ']';
				return content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFrontmatter}\n---`);
			}
		} else {
			const frontmatter = `---\ntags: [${tags.map(tag => `"${tag}"`).join(', ')}]\n---\n\n`;
			return frontmatter + content;
		}
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

		let completed = 0;
		const total = this.files.length;

		for (const file of this.files) {
			this.uploadProgress[file.path] = 'uploading';
			this.updateFileStatusInModal(file.path);

			try {
				const wikilinkResolver = this.plugin.createWikilinkResolver(file);
				const processor = new MarkdownProcessor(this.plugin.settings, wikilinkResolver);
				const content = await this.app.vault.read(file);
				const path = processor.generatePath(file.name, file.parent?.path);
				console.debug('BulkUploadModal: processing file', file.path, 'Wiki.js path:', path);
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
