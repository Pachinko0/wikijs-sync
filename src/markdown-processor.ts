import { WikiJSSettings } from './types';

export class MarkdownProcessor {
	private settings: WikiJSSettings;

	constructor(settings: WikiJSSettings) {
		this.settings = settings;
	}

	/**
	 * Convert Obsidian markdown to Wiki.js compatible markdown
	 */
	processMarkdown(content: string, fileName: string, pagePath?: string): { content: string; title: string; images: Array<{ name: string; path: string }> } {
		let processedContent = content;

		// Extract title from file name or first heading
		let title = this.extractTitle(content, fileName);

		// Extract images from original content before any modifications
		const images = this.extractImages(content);
		
		// Debug log: Print extracted images
		console.debug('Extracted images:', JSON.stringify(images, null, 2));

		if (!this.settings.preserveObsidianSyntax) {
			// Convert Obsidian-specific syntax
			processedContent = this.convertObsidianLinks(processedContent);
			console.debug('Processed pagePath:', pagePath);
			processedContent = this.convertObsidianImages(processedContent, pagePath);
			processedContent = this.convertObsidianTags(processedContent);
			processedContent = this.convertObsidianCallouts(processedContent);
		}

		if (this.settings.autoConvertLinks) {
			processedContent = this.convertInternalLinks(processedContent);
		}

		// Clean up any remaining Obsidian-specific elements
		processedContent = this.cleanupObsidianSyntax(processedContent);

		return {
			content: processedContent.trim(),
			title,
			images
		};
	}

	private extractTitle(content: string, fileName: string): string {
		// Try to find the first heading
		const headingMatch = content.match(/^#\s+(.+)$/m);
		if (headingMatch) {
			return headingMatch[1].trim();
		}

		// If no heading found, use filename without extension
		return fileName.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
	}

	private convertObsidianLinks(content: string): string {
		// Convert [[Link]] to [Link](Link), but ignore image links
		return content.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (match, link, pipe, displayText) => {
			// Skip if this is an image link (ends with image extension)
			if (/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico|tiff|tif|avif|heic|heif)$/i.test(link)) {
				return match;
			}
			const text = displayText || link;
			const url = link.replace(/\s+/g, '-').toLowerCase();
			return `[${text}](/${url})`;
		});
	}

	private convertObsidianImages(content: string, pagePath?: string): string {
		// Convert Obsidian image format ![[image.png]] to Wiki.js format ![image.png](/path/image.png)
		return content.replace(/!\[\[([^\]|]+?)(\|([^\]]+))?\]\]/g, (match, imageName, pipe, displayText) => {
			// 只处理图片文件（有图片扩展名的）
			if (!/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico|tiff|tif|avif|heic|heif)$/i.test(imageName)) {
				return match;
			}

		// 提取纯文件名（去除路径）
		let fileName = imageName.split('/').pop()?.trim() || imageName.trim();
		
		// Wiki.js 会对文件名进行以下转换，这里需要做同样的处理：
		// 1. 将空格转换为下划线（连续空格合并为一个下划线）
		fileName = fileName.replace(/\s+/g, '_');
		// 2. 将大写字母转换为小写字母
		fileName = fileName.toLowerCase();
			
			// 构建图片在 Wiki.js 中的路径
		// 如果提供了页面路径，则将图片放在相同的完整路径下
			let imageUrl = '';
			if (pagePath) {
			// 去除前导斜杠，并转为小写
			// Wiki.js 对资源文件夹 slug 强制小写，路径需与实际存储保持一致
			let cleanPath = (pagePath.startsWith('/') ? pagePath.substring(1) : pagePath).toLowerCase();
				
			// 保留完整路径，包括页面名称
			// 例如：notes/coco/my-page -> /_assets/notes/coco/my-page/image.png
				imageUrl = cleanPath ? `/${cleanPath}/${fileName}` : `/${fileName}`;
			} else {
				// 如果没有页面路径，放在根目录
				imageUrl = `/${fileName}`;
			}

			// 使用显示文本（如果有）或完整文件名作为 alt text
			const altText = displayText || fileName;
			
			return `![${altText}](${imageUrl})`;
		});
	}

	private convertObsidianTags(content: string): string {
		// Convert #tag to proper markdown
		return content.replace(/(^|\s)#([a-zA-Z0-9_/-]+)/g, '$1`#$2`');
	}

	private convertObsidianCallouts(content: string): string {
		// Convert Obsidian callouts to blockquotes
		const calloutRegex = /^>\s*\[!(\w+)\]([^\n]*)\n((?:^>.*$\n?)*)/gm;
		
		return content.replace(calloutRegex, (match, type, title, body) => {
			const cleanBody = body.replace(/^>\s?/gm, '');
			const titleText = title.trim() || type.charAt(0).toUpperCase() + type.slice(1);
			
			return `> **${titleText}**\n>\n${cleanBody.split('\n').map((line: string) => `> ${line}`).join('\n')}\n`;
		});
	}

	private convertInternalLinks(content: string): string {
		// Convert relative links to absolute Wiki.js paths
		return content.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\)/g, (match, text, url) => {
			if (url.startsWith('/')) {
				return match; // Already absolute
			}
			return `[${text}](/${url})`;
		});
	}

	private cleanupObsidianSyntax(content: string): string {
		// Remove YAML frontmatter
		content = content.replace(/^---\n[\s\S]*?\n---\n/, '');
		
		// Remove empty callout blocks
		content = content.replace(/^>\s*\[![^\]]*\]\s*$/gm, '');
		
		// Clean up multiple consecutive newlines
		content = content.replace(/\n{3,}/g, '\n\n');
		
		return content;
	}

	/**
	 * Generate a Wiki.js compatible path from the file name
	 */
	generatePath(fileName: string, folderPath?: string): string {
		const sanitizeSegment = (segment: string): string => {
			return segment
				.toLowerCase()
				// Replace spaces with hyphens
				.replace(/\s+/g, '-')
				// Replace periods (reserved for file extensions)
				.replace(/\./g, '-')
				// Remove remaining unsafe URL characters, keep only Unicode letters/numbers, hyphens, underscores
				.replace(/[^\p{L}\p{N}\-_]/gu, '')
				// Collapse multiple consecutive hyphens
				.replace(/-{2,}/g, '-')
				// Remove leading/trailing hyphens
				.replace(/^-+|-+$/g, '');
		};

		// Remove .md extension and sanitize file name
		const slug = sanitizeSegment(fileName.replace(/\.md$/, ''));

		if (!folderPath || folderPath === '/') {
			return slug;
		}

		// Split folder path by slashes, sanitize each segment, drop empty ones
		const cleanFolderPath = folderPath
			.split('/')
			.map(sanitizeSegment)
			.filter(Boolean)
			.join('/');

		return cleanFolderPath ? `${cleanFolderPath}/${slug}` : slug;
	}

	/**
	 * Extract tags from content (YAML frontmatter or inline tags)
	 */
	extractTags(content: string): string[] {
		const tags: string[] = [];
		
		// Extract from YAML frontmatter
		const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (yamlMatch) {
			const yamlContent = yamlMatch[1];
			const tagsMatch = yamlContent.match(/^tags:\s*\[(.*?)\]$/m) || 
							 yamlContent.match(/^tags:\s*(.+)$/m);
			
			if (tagsMatch) {
				const tagString = tagsMatch[1];
				if (tagString.includes('[')) {
					// Array format: [tag1, tag2, tag3]
					const arrayTags = tagString.match(/["']?([^,"']+)["']?/g);
					if (arrayTags) {
						tags.push(...arrayTags.map(tag => tag.replace(/["']/g, '').trim()));
					}
				} else {
					// Simple format: tag1, tag2, tag3
					tags.push(...tagString.split(',').map(tag => tag.trim()));
				}
			}
		}
		
		// Extract inline hashtags
		const hashtagMatches = content.match(/(^|\s)#([a-zA-Z0-9_/-]+)/g);
					if (hashtagMatches) {
				hashtagMatches.forEach(match => {
					const tag = match.trim().substring(1); // Remove #
					if (tags.indexOf(tag) === -1) {
						tags.push(tag);
					}
				});
			}
		
		return tags.filter(tag => tag.length > 0);
	}

	/**
	 * Extract images from markdown content
	 */
	private extractImages(content: string): Array<{ name: string; path: string }> {
		const images: Array<{ name: string; path: string }> = [];
		const imageSet = new Set<string>(); // 用于去重

		// 匹配所有可能的图片格式
		const patterns = [
			// 标准 Markdown
			/!\[([^\]]*)\]\(([^)]+)\)/g,
			// Obsidian 格式
			/!\[\[([^\]|]+)(\.[^\]]*)\]\]/g,
			// Obsidian 带标题格式
			/!\[\[([^\]|]+)\|([^\]]+)\]\]/g,
			// HTML <img> 标签
			/<img[^>]+src=["']([^"']+)["'][^>]*>/g
		];

		for (const pattern of patterns) {
			let match;
			while ((match = pattern.exec(content)) !== null) {
			// 获取图片路径（根据不同格式，路径可能在不同的捕获组中）
			let path = match[1];
			if (pattern.source.includes('!\\[\\[')) {
				// Obsidian 格式，路径在第一个捕获组
				// 第一个 Obsidian 模式将扩展名分到 match[2]，需要拼接完整文件名
				// 避免文件名与文档名相同时，解析到 .md 文件而非图片文件
				path = match[2] && match[2].startsWith('.') ? match[1] + match[2] : match[1];
			} else if (pattern.source.includes('img')) {
					// HTML 格式，路径在第一个捕获组
					path = match[1];
				} else {
					// 标准 Markdown 格式，路径在第二个捕获组
					path = match[2];
				}

				// 跳过外部链接
				if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
					continue;
				}

				// 处理路径
				path = this.normalizeImagePath(path);
				
				// 去重处理
				if (imageSet.has(path)) {
					continue;
				}
				imageSet.add(path);

				// 获取文件名
				const fileName = path.split('/').pop() || path;
				
				images.push({
					name: fileName,
					path: path
				});
			}
		}

		return images;
	}

	/**
	 * 规范化图片路径
	 */
	private normalizeImagePath(path: string): string {
		// 移除路径中的空格和特殊字符
		path = path.trim();
		
		// 处理 Windows 路径分隔符
		path = path.replace(/\\/g, '/');
		
		// 移除开头的斜杠
		path = path.startsWith('/') ? path.substring(1) : path;
		
		// 处理相对路径 (./ 或 ../)
		path = path.replace(/^\.\//, '');
		
		// 移除查询参数和哈希
		path = path.split('?')[0].split('#')[0];
		
		return path;
	}
	}
