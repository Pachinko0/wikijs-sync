import { WikiJSSettings } from './types';

export class MarkdownProcessor {
	private settings: WikiJSSettings;
	private wikilinkResolver?: (link: string, sourceFileName?: string) => string | undefined;

	constructor(settings: WikiJSSettings, wikilinkResolver?: (link: string, sourceFileName?: string) => string | undefined) {
		this.settings = settings;
		this.wikilinkResolver = wikilinkResolver;
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
			// Only convert path-dependent syntax when pagePath is provided
			if (pagePath !== undefined) {
				processedContent = this.convertObsidianLinks(processedContent, pagePath, fileName);
				processedContent = this.convertObsidianImages(processedContent, pagePath);
			}
			// Always convert tags and callouts (not path-dependent)
			processedContent = this.convertObsidianTags(processedContent);
			processedContent = this.convertObsidianCallouts(processedContent);
			console.debug('Processed pagePath:', pagePath);
		}

		if (this.settings.autoConvertLinks && pagePath !== undefined) {
			processedContent = this.convertInternalLinks(processedContent, pagePath);
		}

		// Clean up any remaining Obsidian-specific elements
		processedContent = this.cleanupObsidianSyntax(processedContent);

		// Debug: log sample of converted content when pagePath is provided
		if (pagePath !== undefined) {
			const sample = processedContent.substring(0, Math.min(200, processedContent.length));
			console.debug('processMarkdown result sample:', sample.replace(/\n/g, '\\n'));
		}

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

	private convertObsidianLinks(content: string, pagePath?: string, fileName?: string): string {
		// Convert [[Link]] to [Link](/locale/path), but ignore image links
		const locale = this.settings.locale || 'en';
		console.debug('convertObsidianLinks: pagePath=', pagePath, 'locale=', locale, 'fileName=', fileName, 'has wikilinkResolver?', !!this.wikilinkResolver);
		if (pagePath === undefined) {
			console.debug('convertObsidianLinks WARNING: pagePath is undefined - link conversion may be skipped');
		}
		return content.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (match, link, pipe, displayText) => {
			// Skip if this is an image link (ends with image extension)
			if (/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico|tiff|tif|avif|heic|heif)$/i.test(link)) {
				return match;
			}
			// Split anchor from page reference (e.g., "Page#heading" or "Page#^block")
			let pageRef = link;
			let anchor = '';
			const hashIndex = link.indexOf('#');
			if (hashIndex !== -1) {
				pageRef = link.substring(0, hashIndex);
				anchor = link.substring(hashIndex); // includes '#'
			}
			const text = displayText || link;
			// Try to use wikilink resolver if available
			let targetPath: string;
			if (this.wikilinkResolver) {
				const resolved = this.wikilinkResolver(pageRef, fileName);
				if (resolved !== undefined) {
					targetPath = resolved;
					console.debug('convertObsidianLinks: resolved via wikilinkResolver:', pageRef, '->', targetPath);
				} else {
					// Fall back to relative resolution
					targetPath = this.resolveWikiLinkToWikiPath(pageRef, pagePath);
					console.debug('convertObsidianLinks: wikilinkResolver returned undefined, using fallback:', targetPath);
				}
			} else {
				console.debug('convertObsidianLinks: NO wikilinkResolver, using fallback');
				targetPath = this.resolveWikiLinkToWikiPath(pageRef, pagePath);
			}
			const url = `/${locale}/${targetPath}${anchor}`;
			console.debug('convertObsidianLinks: link=', link, 'pageRef=', pageRef, 'targetPath=', targetPath, 'url=', url, 'resolver used?', this.wikilinkResolver ? 'yes' : 'no');
			return `[${text}](${url}) <!-- ${match} -->`;
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

	private convertInternalLinks(content: string, pagePath?: string): string {
		// Convert relative links to absolute Wiki.js paths with locale
		const locale = this.settings.locale || 'en';
		return content.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\)/g, (match, text, url) => {
			if (url.startsWith('/')) {
				// Already absolute, but may need locale prefix
				// If URL already starts with locale, keep as is
				// For simplicity, assume absolute paths are correct
				return match;
			}
			// Resolve relative link to Wiki.js path
			const resolvedPath = this.resolveRelativeLink(url, pagePath);
			// If resolvedPath is same as original url (e.g., anchor only), keep original
			if (resolvedPath === url) {
				return match;
			}
			const fullUrl = `/${locale}/${resolvedPath}`;
			return `[${text}](${fullUrl})`;
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
	 * Generate just the folder path from Obsidian folder structure
	 */
	generateFolderPath(folderPath?: string): string {
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

		if (!folderPath || folderPath === '/') {
			return '';
		}

		// Split folder path by slashes, sanitize each segment, drop empty ones
		const cleanFolderPath = folderPath
			.split('/')
			.map(sanitizeSegment)
			.filter(Boolean)
			.join('/');

		return cleanFolderPath || '';
	}

	/**
	 * Resolve a wikilink to a Wiki.js path relative to the source page's path.
	 * @param link The wikilink (e.g., "Note", "folder/Note", "../Note")
	 * @param sourcePagePath The full Wiki.js path of the source page (e.g., "folder/subfolder/page-slug")
	 * @returns The resolved Wiki.js path for the target page (without locale prefix)
	 */
	private resolveWikiLinkToWikiPath(link: string, sourcePagePath?: string): string {
		console.debug('FALLBACK resolveWikiLinkToWikiPath called: link=', link, 'sourcePagePath=', sourcePagePath);
		// Remove .md extension if present
		let cleanLink = link.replace(/\.md$/i, '');
		console.debug('resolveWikiLinkToWikiPath: link=', link, 'cleanLink=', cleanLink, 'sourcePagePath=', sourcePagePath);

		// If no source page path, just sanitize the link as a slug
		if (!sourcePagePath) {
			const result = this.sanitizeSegment(cleanLink);
			console.debug('resolveWikiLinkToWikiPath: no sourcePagePath, returning:', result);
			return result;
		}

		// Split source page path into directory and slug
		const lastSlash = sourcePagePath.lastIndexOf('/');
		const sourceDir = lastSlash === -1 ? '' : sourcePagePath.substring(0, lastSlash);
		console.debug('resolveWikiLinkToWikiPath: sourceDir=', sourceDir, 'lastSlash=', lastSlash);

		// Handle absolute path (starting with '/')
		if (cleanLink.startsWith('/')) {
			// Treat as absolute Wiki.js path (without locale)
			cleanLink = cleanLink.substring(1);
			const segments = cleanLink.split('/').filter(s => s.length > 0);
			const sanitizedSegments = segments.map(seg => this.sanitizeSegment(seg));
			return sanitizedSegments.join('/');
		}

		// Resolve relative path
		const sourceSegments = sourceDir.split('/').filter(Boolean);
		const linkSegments = cleanLink.split('/').filter(s => s.length > 0);
		const resolvedSegments = [...sourceSegments];
		for (const segment of linkSegments) {
			if (segment === '..') {
				if (resolvedSegments.length > 0) {
					resolvedSegments.pop();
				}
			} else if (segment !== '.') {
				resolvedSegments.push(segment);
			}
		}
		// Sanitize each segment
		const sanitizedSegments = resolvedSegments.map(seg => this.sanitizeSegment(seg));
		const result = sanitizedSegments.join('/');
		console.debug('resolveWikiLinkToWikiPath: result=', result, 'sourceSegments=', sourceSegments, 'linkSegments=', linkSegments, 'resolvedSegments=', resolvedSegments);
		return result;
	}

	/**
	 * Sanitize a path segment (reused from generatePath)
	 */
	private sanitizeSegment(segment: string): string {
		return segment
			.toLowerCase()
			// Replace spaces with hyphens
			.replace(/\s+/g, '-')
			// Replace underscores with hyphens for consistency
			.replace(/_/g, '-')
			// Replace periods (reserved for file extensions)
			.replace(/\./g, '-')
			// Remove remaining unsafe URL characters, keep only Unicode letters/numbers, hyphens
			.replace(/[^\p{L}\p{N}-]/gu, '')
			// Collapse multiple consecutive hyphens
			.replace(/-{2,}/g, '-')
			// Remove leading/trailing hyphens
			.replace(/^-+|-+$/g, '');
	}

	/**
	 * Resolve a relative markdown link to a Wiki.js path.
	 * Handles query parameters and anchors.
	 */
	private resolveRelativeLink(url: string, pagePath?: string): string {
		// Split URL into path, query, and anchor
		let path = url;
		let query = '';
		let anchor = '';
		const queryIndex = path.indexOf('?');
		if (queryIndex !== -1) {
			query = path.substring(queryIndex);
			path = path.substring(0, queryIndex);
		}
		const anchorIndex = path.indexOf('#');
		if (anchorIndex !== -1) {
			anchor = path.substring(anchorIndex);
			path = path.substring(0, anchorIndex);
		}
		// Remove .md extension if present
		path = path.replace(/\.md$/i, '');
		// If path is empty after stripping extension (e.g., just '#anchor'), return original
		if (!path) {
			return url;
		}
		// Resolve relative path using pagePath as base directory
		let resolvedPath = '';
		if (pagePath) {
			const lastSlash = pagePath.lastIndexOf('/');
			const baseDir = lastSlash === -1 ? '' : pagePath.substring(0, lastSlash);
			// Handle absolute path (starting with '/')
			if (path.startsWith('/')) {
				// Treat as absolute Wiki.js path (without locale)
				path = path.substring(1);
				const segments = path.split('/').filter(s => s.length > 0);
				const sanitizedSegments = segments.map(seg => this.sanitizeSegment(seg));
				resolvedPath = sanitizedSegments.join('/');
			} else {
				// Relative path resolution with .. and .
				const baseSegments = baseDir.split('/').filter(Boolean);
				const pathSegments = path.split('/').filter(s => s.length > 0);
				const resolvedSegments = [...baseSegments];
				for (const segment of pathSegments) {
					if (segment === '..') {
						if (resolvedSegments.length > 0) {
							resolvedSegments.pop();
						}
					} else if (segment !== '.') {
						resolvedSegments.push(segment);
					}
				}
				const sanitizedSegments = resolvedSegments.map(seg => this.sanitizeSegment(seg));
				resolvedPath = sanitizedSegments.join('/');
			}
		} else {
			// No base path, just sanitize the path (absolute or relative)
			if (path.startsWith('/')) {
				path = path.substring(1);
			}
			const segments = path.split('/').filter(s => s.length > 0);
			const sanitizedSegments = segments.map(seg => this.sanitizeSegment(seg));
			resolvedPath = sanitizedSegments.join('/');
		}
		// Reattach query and anchor
		return resolvedPath + query + anchor;
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

	/**
	 * Convert Wiki.js markdown back to Obsidian markdown (reverse conversion)
	 */
	reverseMarkdown(content: string, pagePath?: string): string {
		let processedContent = content;

		if (!this.settings.preserveObsidianSyntax) {
			// Revert link conversions
			// Restore original wikilinks from HTML comments
			processedContent = processedContent.replace(/\[([^\]]+)\]\([^)]+\)\s*<!--\s*(\[\[[^\]]+\]\])\s*-->/g, (match, text, wikilink) => {
				return wikilink;
			});
			const locale = this.settings.locale || 'en';
			const localePrefix = `/${locale}/`;
			// Match [text](/locale/path#anchor)
			const linkRegex = new RegExp(`\\[([^\\]]+)\\]\\(${localePrefix}([^)]+)\\)`, 'g');
			processedContent = processedContent.replace(linkRegex, (match, text, path) => {
				// Determine if path contains anchor
				let wikiPath = path;
				let anchor = '';
				const hashIndex = path.indexOf('#');
				if (hashIndex !== -1) {
					wikiPath = path.substring(0, hashIndex);
					anchor = path.substring(hashIndex);
				}
				// Convert to wikilink
				if (text === wikiPath) {
					return `[[${wikiPath}${anchor}]]`;
				} else {
					return `[[${wikiPath}${anchor}|${text}]]`;
				}
			});

			// Revert tag backticks
			processedContent = processedContent.replace(/`#([a-zA-Z0-9_/-]+)`/g, '#$1');
		}

		return processedContent;
	}

	static sanitizeSegment(segment: string): string {
		return segment
			.toLowerCase()
			// Replace spaces with hyphens
			.replace(/\s+/g, '-')
			// Replace underscores with hyphens for consistency
			.replace(/_/g, '-')
			// Replace periods (reserved for file extensions)
			.replace(/\./g, '-')
			// Remove remaining unsafe URL characters, keep only Unicode letters/numbers, hyphens
			.replace(/[^\p{L}\p{N}-]/gu, '')
			// Collapse multiple consecutive hyphens
			.replace(/-{2,}/g, '-')
			// Remove leading/trailing hyphens
			.replace(/^-+|-+$/g, '');
	}
	}
