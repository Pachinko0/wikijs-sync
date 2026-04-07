import { App, Modal, Setting, TFile, Notice } from 'obsidian';
import NoteToWikiJSPlugin from '../main';
import { MarkdownProcessor } from './markdown-processor';
import { WikiJSAPI } from './wikijs-api';
import { ImageTagProcessor } from './image-tag-processor';
import { WikiJSPage } from './types';

export class UploadModal extends Modal {
	plugin: NoteToWikiJSPlugin;
	file: TFile;
	private processor: MarkdownProcessor;
	private api: WikiJSAPI;
	private imageProcessor: ImageTagProcessor;
	
	// Form fields
	private pathInput: string;
	private titleInput: string;
	private tagsInput: string;
	private descriptionInput: string;
	private content: string;
	private images: Array<{ name: string; path: string }>;
	private uploadButton: HTMLButtonElement;
	private initializationPromise: Promise<void>;
	private slug: string;

	constructor(app: App, plugin: NoteToWikiJSPlugin, file: TFile) {
		super(app);
		this.plugin = plugin;
		this.file = file;
		// Create a temporary processor for path generation in resolver
		const tempProcessor = new MarkdownProcessor(plugin.settings);

		// Create wikilink resolver function
		const wikilinkResolver = (link: string, sourceFileName?: string): string | undefined => {
			try {
				// Remove .md extension if present (Obsidian links can have or not have it)
				const cleanLink = link.replace(/\.md$/i, '');
				// Use metadataCache to resolve the link (Obsidian's standard method)
				const targetFile = app.metadataCache.getFirstLinkpathDest(cleanLink, this.file.path);
				if (targetFile instanceof TFile) {
					// Compute the Wiki.js path for the target file
					const targetFolderPath = tempProcessor.generateFolderPath(targetFile.parent?.path);
					const targetSlug = tempProcessor.generatePath(targetFile.name, '');
					const targetPath = targetFolderPath ? `${targetFolderPath}/${targetSlug}` : targetSlug;
					console.debug('wikilinkResolver: resolved', link, 'to', targetPath, 'file:', targetFile.path);
					return targetPath;
				}
			} catch (error) {
				console.debug('wikilinkResolver failed for', link, ':', error);
			}
			return undefined;
		};

		this.processor = new MarkdownProcessor(plugin.settings, wikilinkResolver);
		this.api = new WikiJSAPI(plugin.settings);
		this.imageProcessor = new ImageTagProcessor(app);

		// Initialize all form fields synchronously with default values
		// For notes in folders: use folder path only (e.g., "zones/ideas" for Zones/Ideas/Beach.md)
		// For root notes: use filename (e.g., "meeting-notes" for Meeting Notes.md)
		const folderPath = this.processor.generateFolderPath(this.file.parent?.path);
		this.pathInput = folderPath || this.processor.generatePath(this.file.name, '');
		this.slug = this.processor.generatePath(this.file.name, '');
		this.titleInput = this.file.name.replace(/\.md$/, ''); // Default title from filename
		this.tagsInput = '';
		this.descriptionInput = '';
		this.content = '';
		this.images = [];

		// Refine fields asynchronously (extract title from content, tags, etc.)
		this.initializationPromise = this.initializeFields().catch((error) => {
			console.error('Failed to initialize upload modal:', error);
			new Notice(`Failed to read file: ${error.message}`);
			this.close();
			throw error; // Re-throw so onOpen() can handle it
		});
	}

	/**
	 * Get the full Wiki.js path including the page slug.
	 * If the path input is just a folder, appends the slug.
	 */
	private get fullWikiPath(): string {
		const input = this.pathInput.trim();
		if (!input) {
			console.debug('fullWikiPath: empty input, returning slug:', this.slug);
			return this.slug;
		}
		// Remove trailing slashes
		const cleanInput = input.replace(/\/+$/, '');

		// Check if input already ends with the slug (exact match or with preceding slash)
		if (cleanInput === this.slug || cleanInput.endsWith('/' + this.slug)) {
			console.debug('fullWikiPath: input already contains slug, returning:', cleanInput);
			return cleanInput;
		}
		// Assume input is a folder path, append slug
		const result = cleanInput + '/' + this.slug;
		console.debug('fullWikiPath: appending slug, result:', result, 'slug:', this.slug, 'input:', input);
		return result;
	}

	/**
	 * Get the folder portion of the full Wiki.js path (without the page slug).
	 */
	private get wikiFolderPath(): string {
		const fullPath = this.fullWikiPath;
		const lastSlash = fullPath.lastIndexOf('/');
		if (lastSlash === -1) {
			return '';
		}
		return fullPath.substring(0, lastSlash);
	}

	private async initializeFields() {
		const content = await this.app.vault.read(this.file);

		// 初始处理 markdown 内容（不传入 pagePath，因为用户可能会修改路径）
		const processed = this.processor.processMarkdown(content, this.file.name);

		this.titleInput = processed.title;
		this.content = content; // 保存原始内容，在上传时根据最终路径重新处理
		this.images = processed.images;
		this.tagsInput = this.processor.extractTags(content).join(', ');
		this.descriptionInput = '';
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Show loading indicator while initializing
		contentEl.createEl('h2', { text: 'Upload to wiki.js' });
		const loadingDiv = contentEl.createDiv('loading-indicator');
		loadingDiv.createEl('p', { text: 'Loading note content...' });

		try {
			// Wait for initialization to complete
			await this.initializationPromise;
		} catch (error) {
			// Initialization failed, modal will be closed by the catch handler in constructor
			return;
		}

		// Clear loading and build the form
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Upload to wiki.js' });

		// File info
		const fileInfoDiv = contentEl.createDiv('file-info');
		fileInfoDiv.createEl('p', { text: `File: ${this.file.name}` });
		fileInfoDiv.createEl('p', { text: `Size: ${this.formatFileSize(this.file.stat.size)}` });

		// Path setting
		new Setting(contentEl)
			.setName('Wiki.js path')
			.setDesc('The path where this page will be created in wiki.js')
			.addText(text => text
				.setValue(this.pathInput)
				.onChange(value => this.pathInput = value));

		// Title setting
		new Setting(contentEl)
			.setName('Page title')
			.setDesc('The title of the page in wiki.js')
			.addText(text => text
				.setValue(this.titleInput)
				.onChange(value => this.titleInput = value));

		// Description setting
		new Setting(contentEl)
			.setName('Description')
			.setDesc('Optional description for the page')
			.addTextArea(text => text
				.setValue(this.descriptionInput)
				.onChange(value => this.descriptionInput = value));

		// Tags setting
		new Setting(contentEl)
			.setName('Tags')
			.setDesc('Tags for the page (comma-separated)')
			.addText(text => text
				.setValue(this.tagsInput)
				.onChange(value => this.tagsInput = value));

		// Buttons
		const buttonDiv = contentEl.createDiv('modal-button-container');

		const cancelButton = buttonDiv.createEl('button', { text: 'Cancel' });
		cancelButton.onclick = () => this.close();

		this.uploadButton = buttonDiv.createEl('button', {
			text: 'Upload',
			cls: 'mod-cta'
		});
		this.uploadButton.onclick = () => this.performUpload();

		// Style the modal
		contentEl.addClass('wikijs-upload-modal');
	}

	private async uploadImages(images: Array<{ name: string; path: string }>): Promise<Map<string, string>> {
		const imageMap = new Map<string, string>();
		
		// 在上传图片前，先根据页面路径创建文件夹结构，并获取精确的文件夹 ID
		let targetFolderId = 0;
		try {
			targetFolderId = await this.api.ensureAssetFolderPath(this.wikiFolderPath);
			console.debug(`Asset folder prepared, folderId: ${targetFolderId}`);
		} catch (error) {
			console.warn('Failed to create asset folder structure:', error);
			// 继续执行，使用根目录
			targetFolderId = 0;
		}
		
		// 使用 ImageTagProcessor 批量解析图片文件
		const imageFileMap = this.imageProcessor.resolveImageFiles(images, this.file);
		
		for (const image of images) {
			try {
				console.debug('Processing image:', image.name, 'Original path:', image.path);
				
				const file = imageFileMap.get(image.path);
				
				if (file instanceof TFile) {
					console.debug('Found file:', file.path, 'File name:', file.name);
					const arrayBuffer = await this.app.vault.readBinary(file);
					
					// 上传图片到 Wiki.js，使用实际文件的完整文件名（包含扩展名）
					await this.api.uploadAsset(file.name, arrayBuffer, targetFolderId);
					
					// 上传成功，显示提示
					new Notice(`✅ ${file.name} uploaded successfully`);
					console.debug(`✅ Successfully uploaded: ${file.name}`);
				} else {
					console.error(`File not found: ${image.name} (path: ${image.path})`);
					new Notice(`Image file not found: ${image.name}`);
				}
			} catch (error) {
				console.error(`Failed to upload image ${image.name}:`, error);
				new Notice(`Failed to upload image ${image.name}: ${error.message}`);
			}
		}
		
		// 返回空的映射，因为不需要替换路径
		return imageMap;
	}

	private replaceImagePaths(content: string, imageMap: Map<string, string>): string {
		let newContent = content;
		for (const [oldPath, newPath] of imageMap) {
			// 替换图片路径，处理可能的相对路径和绝对路径
			const escapedOldPath = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedOldPath}\\)`, 'g');
			newContent = newContent.replace(regex, `![$1](${newPath})`);
		}
		return newContent;
	}

	private async performUpload() {
		// Validate inputs
		if (!this.pathInput.trim()) {
			new Notice('Path cannot be empty');
			return;
		}

		if (!this.titleInput.trim()) {
			new Notice('Title cannot be empty');
			return;
		}

		this.uploadButton.textContent = 'Uploading...';
		this.uploadButton.disabled = true;

		try {
		// Check if page already exists before uploading images
			const existingPage = await this.checkIfPageExists();
		console.debug('Existing page:', existingPage);
			if (existingPage) {
				const shouldUpdate = await this.confirmUpdate(existingPage);
				if (!shouldUpdate) {
					this.uploadButton.textContent = 'Upload';
					this.uploadButton.disabled = false;
					return;
				}
		}

		// 使用用户最终确认的路径重新处理 markdown 内容
		// 这样可以确保图片路径使用正确的 Wiki.js 路径
		console.debug('Processing markdown with final path:', this.fullWikiPath);
		const finalProcessed = this.processor.processMarkdown(this.content, this.file.name, this.fullWikiPath);
		const processedContent = finalProcessed.content;

		// 首先上传所有图片
		if (this.images && this.images.length > 0) {
			new Notice(`Uploading ${this.images.length} images...`);
			await this.uploadImages(this.images);
			// 不替换图片路径，保持原样
		}
		
		let result;
		if (existingPage) {
				const pageId = Number(existingPage.id);
				if (isNaN(pageId)) {
					new Notice(`Invalid page ID: ${existingPage.id}`);
					this.uploadButton.textContent = 'Upload';
					this.uploadButton.disabled = false;
					return;
				}

				// DRY-RUN: 验证页面匹配是否正确，不执行真实更新
				// 确认无误后注释掉此块，取消下方 updatePage 的注释
				// const DRY_RUN = true;
				// if (DRY_RUN) {
				// 	console.warn('[DRY-RUN] Would update page:');
				// 	console.warn(`  ID:    ${pageId}`);
				// 	console.warn(`  Title: ${existingPage.title}`);
				// 	console.warn(`  Path:  ${existingPage.path}`);
				// 	console.warn(`  → New title: ${this.titleInput.trim()}`);
				// 	console.warn(`  → New path:  ${this.fullWikiPath}`);
				// 	new Notice(`[DRY-RUN] Would update: "${existingPage.title}" (ID: ${pageId}, path: ${existingPage.path})`);
				// 	this.uploadButton.textContent = 'Upload';
				// 	this.uploadButton.disabled = false;
				// 	return;
				// }

				result = await this.api.updatePage(
					pageId,
					this.fullWikiPath,
					this.titleInput.trim(),
					processedContent,
					this.descriptionInput.trim() || undefined,
					this.parseTags()
				);
			} else {
				result = await this.api.createPage(
					this.fullWikiPath,
					this.titleInput.trim(),
					processedContent,
					this.descriptionInput.trim() || undefined,
					this.parseTags()
				);
			}

			if (result.success) {
				new Notice(`Successfully ${existingPage ? 'updated' : 'created'} page: ${result.pageUrl}`);
				this.close();
			} else {
				new Notice(`Failed to ${existingPage ? 'update' : 'create'} page: ${result.message}`);
			}

		} catch (error) {
			new Notice(`Error uploading page: ${error.message}`);
		} finally {
			this.uploadButton.textContent = 'Upload';
			this.uploadButton.disabled = false;
		}
	}

	private async checkIfPageExists(): Promise<WikiJSPage | null> {
		try {
			console.debug('Checking if page exists at path:', this.fullWikiPath);
			const page = await this.api.getPageByPath(this.fullWikiPath);
			return page; // 如果页面不存在，getPageByPath 会返回 null
		} catch {
			// Page doesn't exist
			return null;
		}
	}

	private async confirmUpdate(existingPage: WikiJSPage): Promise<boolean> {
		// Check upload behavior setting
		const behavior = this.plugin.settings.uploadBehavior || 'ask';
		
		if (behavior === 'update') {
			// Always update without asking
			return true;
		}
		
		// Default behavior: ask user
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText('Page already exists');
			
			const content = modal.contentEl;
			content.createEl('p', {
				text: `A page already exists at path "${this.fullWikiPath}". What would you like to do?`
			});
			
			content.createEl('p', { 
				text: `Existing page: "${existingPage.title}"`,
				cls: 'setting-item-description'
			});

			const buttonDiv = content.createDiv('modal-button-container');
			
			const cancelButton = buttonDiv.createEl('button', { text: 'Cancel' });
			cancelButton.onclick = () => {
				modal.close();
				resolve(false);
			};

			const updateButton = buttonDiv.createEl('button', { 
				text: 'Update existing',
				cls: 'mod-warning'
			});
			updateButton.onclick = () => {
				modal.close();
				resolve(true);
			};

			modal.open();
		});
	}

	private parseTags(): string[] {
		return this.tagsInput
			.split(',')
			.map(tag => tag.trim())
			.filter(tag => tag.length > 0);
	}

	private formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
