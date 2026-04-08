import { App, PluginSettingTab, Setting } from 'obsidian';
import NoteToWikiJSPlugin from '../main';
import { WikiJSAPI } from './wikijs-api';
import { WikiJSSettings } from './types';

export const DEFAULT_SETTINGS: WikiJSSettings = {
	wikiUrl: '',
	apiToken: '',
	autoConvertLinks: true,
	preserveObsidianSyntax: false,
	locale: 'en',
	bulkUploadBehavior: 'overwrite',
	bulkUploadImages: true,
	autoSyncEnabled: false,
	autoSyncDelay: 5, // seconds
	autoSyncImages: false,
	autoSyncDelete: false, // delete pages when files are deleted in Obsidian
};

export class WikiJSSettingTab extends PluginSettingTab {
	plugin: NoteToWikiJSPlugin;

	constructor(app: App, plugin: NoteToWikiJSPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// new Setting(containerEl)
		// 	.setName('General')
		// 	.setHeading();

		new Setting(containerEl)
			.setName('Wiki.js URL')
			.setDesc('The base URL of your Wiki.js instance (e.g., https://wiki.example.com)')
			.addText(text => text
				.setPlaceholder('https://wiki.example.com')
				.setValue(this.plugin.settings.wikiUrl)
				.onChange(async (value) => {
					this.plugin.settings.wikiUrl = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API key')
			.addText(text => text
				.setPlaceholder('Enter your API token')
				.setValue(this.plugin.settings.apiToken)
				.onChange(async (value) => {
					this.plugin.settings.apiToken = value.trim();
					await this.plugin.saveSettings();
				}));

		// Connection test button
		new Setting(containerEl)
			.setName('Test connection')
			.setDesc('Test the connection to your wiki.js instance')
			.addButton(button => button
				.setButtonText('Test connection')
				.setCta()
				.onClick(async () => {
					button.setButtonText('Testing...');
					button.setDisabled(true);
					
					try {
						if (!this.plugin.settings.wikiUrl || !this.plugin.settings.apiToken) {
							throw new Error('Please fill in both Wiki.js URL and API token');
						}

						const api = new WikiJSAPI(this.plugin.settings);
						const isConnected = await api.checkConnection();
						
						if (isConnected) {
							button.setButtonText('✅ connected');
							this.plugin.showNotice('Successfully connected to Wiki.js!', 3000);
						} else {
							button.setButtonText('❌ failed');
							this.plugin.showNotice('Failed to connect to Wiki.js. Please check your settings.', 5000);
						}
					} catch (error) {
						button.setButtonText('❌ error');
						this.plugin.showNotice(`Connection error: ${error.message}`, 5000);
					}
					
					setTimeout(() => {
						button.setButtonText('Test connection');
						button.setDisabled(false);
					}, 3000);
				}));

		new Setting(containerEl)
			.setName('Auto convert links')
			.setDesc('Automatically convert relative links to absolute wiki.js paths')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoConvertLinks)
				.onChange(async (value) => {
					this.plugin.settings.autoConvertLinks = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Preserve Obsidian syntax')
			.setDesc('Keep Obsidian-specific syntax (like [[links]] and callouts) unchanged')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.preserveObsidianSyntax)
				.onChange(async (value) => {
					this.plugin.settings.preserveObsidianSyntax = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Locale')
			.setDesc('Locale code for new pages (e.g., en, zh, fr). Default: en')
			.addText(text => text
				.setPlaceholder('en')
				.setValue(this.plugin.settings.locale || 'en')
				.onChange(async (value) => {
					this.plugin.settings.locale = value.trim() || 'en';
					await this.plugin.saveSettings();
				}));

		// Advanced settings section
		new Setting(containerEl)
			.setName('Advanced')
			.setHeading();

		new Setting(containerEl)
			.setName('Upload behavior')
			.setDesc('Choose what happens when uploading a note that already exists in wiki.js')
			.addDropdown(dropdown => dropdown
				.addOption('ask', 'Ask each time')
				.addOption('update', 'Always update existing page')
				.setValue(this.plugin.settings.uploadBehavior || 'ask')
				.onChange(async (value) => {
					this.plugin.settings.uploadBehavior = value as 'ask' | 'update' | 'create-new';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Bulk upload behavior')
			.setDesc('Choose what happens when uploading multiple notes and a page already exists in wiki.js')
			.addDropdown(dropdown => dropdown
				.addOption('overwrite', 'Overwrite existing pages')
				.addOption('skip', 'Skip existing pages')
				.addOption('ask', 'Ask for each page')
				.setValue(this.plugin.settings.bulkUploadBehavior || 'overwrite')
				.onChange(async (value) => {
					this.plugin.settings.bulkUploadBehavior = value as 'overwrite' | 'skip' | 'ask';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Upload images in bulk upload')
			.setDesc('When enabled, images referenced in notes will be uploaded to Wiki.js assets')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.bulkUploadImages ?? true)
				.onChange(async (value) => {
					this.plugin.settings.bulkUploadImages = value;
					await this.plugin.saveSettings();
				}));


		// Auto-sync settings
		new Setting(containerEl)
			.setName('Auto-sync vault')
			.setDesc('Automatically sync modified notes to Wiki.js')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSyncEnabled ?? false)
				.onChange(async (value) => {
					this.plugin.settings.autoSyncEnabled = value;
					await this.plugin.saveSettings();
					// Re-initialize auto-sync when setting changes
					this.plugin.initializeAutoSync();
				}));

		new Setting(containerEl)
			.setName('Auto-sync delay')
			.setDesc('Delay in seconds before syncing a modified note (prevents too frequent updates)')
			.addText(text => text
				.setPlaceholder('5')
				.setValue(this.plugin.settings.autoSyncDelay?.toString() || '5')
				.onChange(async (value) => {
					const delay = parseInt(value.trim());
					if (!isNaN(delay) && delay > 0) {
						this.plugin.settings.autoSyncDelay = delay;
						await this.plugin.saveSettings();
						// Re-initialize auto-sync with new delay
						this.plugin.initializeAutoSync();
					}
				}));

		new Setting(containerEl)
			.setName('Auto-sync images')
			.setDesc('When enabled, images referenced in notes will also be uploaded during auto-sync')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSyncImages ?? false)
				.onChange(async (value) => {
					this.plugin.settings.autoSyncImages = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-sync deletions')
			.setDesc('When enabled, deleting or moving notes in Obsidian will delete corresponding pages in Wiki.js')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSyncDelete ?? false)
				.onChange(async (value) => {
					this.plugin.settings.autoSyncDelete = value;
					await this.plugin.saveSettings();
				}));

		// Usage instructions
		new Setting(containerEl)
			.setName('Usage')
			.setHeading();
		
		const usageDiv = containerEl.createDiv();
		usageDiv.createEl('p', { text: 'To upload a note to wiki.js:' });
		
		const ol = usageDiv.createEl('ol');
		ol.createEl('li', { text: 'Open the note you want to upload' });
		ol.createEl('li', { text: 'Use the command palette (Ctrl/Cmd + P) and search for "Upload current note"' });
		ol.createEl('li', { text: 'Or right-click the file in the file explorer and select "Upload to wiki.js"' });
		
		const noteP = usageDiv.createEl('p');
		noteP.createEl('strong', { text: 'Note: ' });
		noteP.appendText('The plugin will automatically convert Obsidian-specific syntax to be compatible with Wiki.js unless you enable "Preserve Obsidian syntax".');

		const autoSyncNote = usageDiv.createEl('p');
		autoSyncNote.createEl('strong', { text: 'Auto-sync: ' });
		autoSyncNote.appendText('When enabled, modified notes will be automatically synced to Wiki.js after a configurable delay. Enable in Advanced settings.');
	}
}
