import { requestUrl } from 'obsidian';
import { WikiJSSettings, WikiJSCreatePageMutation, WikiJSUpdatePageMutation, WikiJSPageListResponse, UploadResult, WikiJSPage, WikiJSPageWithContent } from './types';

export class WikiJSAPI {
	private settings: WikiJSSettings;

	constructor(settings: WikiJSSettings) {
		this.settings = settings;
	}

	private async makeGraphQLRequest(query: string, variables?: Record<string, unknown>): Promise<unknown> {
		const response = await requestUrl({
			url: `${this.settings.wikiUrl}/graphql`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.settings.apiToken}`
			},
			body: JSON.stringify([{
				operationName: null,
				query,
				variables,
				extensions: {}
			}]),
		});

		const results = response.json;
		const result = Array.isArray(results) ? results[0] : results;

		if (response.status >= 400) {
			throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(result)}`);
		}
		
		if (result.errors) {
			interface GraphQLError {
				message: string;
			}
			throw new Error(`GraphQL error: ${result.errors.map((e: GraphQLError) => e.message).join(', ')}`);
		}

		return result.data;
	}

	async checkConnection(): Promise<boolean> {
		try {
			// users.profile throws AuthRequired when token is invalid or guest (id=2)
			const query = `
				{
					users {
						profile {
							id
							name
						}
					}
				}
			`;
			await this.makeGraphQLRequest(query);
			return true;
		} catch (error) {
			console.error('Connection check failed:', error);
			return false;
		}
	}

	async getPages(): Promise<WikiJSPageListResponse> {
		const query = `
			{
				pages {
					list(orderBy: TITLE) {
						id
						path
						title
						createdAt
						updatedAt
					}
				}
			}
		`;
		return await this.makeGraphQLRequest(query) as WikiJSPageListResponse;
	}

	async getPageByPath(path: string): Promise<WikiJSPage | null> {
		// 去掉路径最前面的 / 并转为小写
		const normalizedPath = (path.startsWith('/') ? path.substring(1) : path).toLowerCase();

		// 使用 pages.list 直接查数据库，而非 pages.search（全文搜索）
		// 搜索索引可能与数据库不同步，导致返回错误的页面 ID，更新到错误的文档
		const query = `
			{
				pages {
					list {
						id
						path
						title
						locale
					}
				}
			}
		`;
		const result = await this.makeGraphQLRequest(query) as {
			pages: {
				list: WikiJSPage[];
			};
		};

		const exactMatch = result.pages.list.find(
			(page) => page.path.toLowerCase() === normalizedPath
		);

		return exactMatch || null;
	}

	async getPageContent(id: number): Promise<WikiJSPageWithContent | null> {
		const query = `
			query ($id: Int!) {
				pages {
					single(id: $id) {
						id
						path
						title
						description
						content
						tags {
							title
						}
					}
				}
			}
		`;
		try {
			const result = await this.makeGraphQLRequest(query, { id }) as {
				pages: {
					single: {
						id: string;
						path: string;
						title: string;
						description?: string;
						content: string;
						tags: Array<{ title: string }>;
					};
				};
			};
			const page = result.pages.single;
			return {
				id: page.id,
				path: page.path,
				title: page.title,
				description: page.description,
				content: page.content,
				tags: page.tags?.map(tag => tag.title) || []
			};
		} catch (error) {
			console.error('Failed to fetch page content:', error);
			return null;
		}
	}

	async createPage(
		path: string,
		title: string,
		content: string,
		description?: string,
		tags?: string[]
	): Promise<UploadResult> {
		const mutation = `
      mutation ($content: String!, $description: String!, $editor: String!, $isPrivate: Boolean!, $isPublished: Boolean!, $locale: String!, $path: String!, $publishEndDate: Date, $publishStartDate: Date, $scriptCss: String, $scriptJs: String, $tags: [String]!, $title: String!) {
        pages {
          create(
            content: $content,
            description: $description,
            editor: $editor,
            isPrivate: $isPrivate,
            isPublished: $isPublished,
            locale: $locale,
            path: $path,
            publishEndDate: $publishEndDate,
            publishStartDate: $publishStartDate,
            scriptCss: $scriptCss,
            scriptJs: $scriptJs,
            tags: $tags,
            title: $title
					) {
						responseResult {
							succeeded
							errorCode
							slug
							message
						}
						page {
							id
							path
							title
						}
					}
				}
			}`.trim();

		try {
			// Normalize path: remove leading slash and convert to lowercase for Wiki.js compatibility
			const normalizedPath = (path.startsWith('/') ? path.substring(1) : path).toLowerCase();

			const variables = {
				content,
				description: description || '',
				editor: 'markdown',
				isPrivate: false,
				isPublished: true,
				locale: this.settings.locale || 'en',
				path: normalizedPath,
				publishEndDate: '',
				publishStartDate: '',
				scriptCss: "",
				scriptJs: "",
				tags: (tags || []).filter(tag => tag && tag.trim()),
				title
			};

			const result = await this.makeGraphQLRequest(mutation, variables) as WikiJSCreatePageMutation;
			const locale = this.settings.locale || 'en';

			if (result.pages.create.responseResult.succeeded) {
				return {
					success: true,
					message: 'Page created successfully',
					pageId: result.pages.create.page.id,
					pageUrl: `${this.settings.wikiUrl}/${locale}/${normalizedPath}`
				};
			} else {
				return {
					success: false,
					message: result.pages.create.responseResult.message || 'Unknown error occurred'
				};
			}
		} catch (error) {
			return {
				success: false,
				message: `Error creating page: ${error.message}`
			};
		}
	}

	async updatePage(
		id: number,
		path: string,
		title: string,
		content: string,
		description?: string,
		tags?: string[]
	): Promise<UploadResult> {
		// 去掉路径最前面的 / 并转为小写
		const normalizedPath = (path.startsWith('/') ? path.substring(1) : path).toLowerCase();
		const mutation = `
			mutation($id: Int!, $path: String!, $title: String!, $content: String!, $description: String, $tags: [String!]) {
				pages {
					update(
						id: $id
						path: $path
						title: $title
						content: $content
						description: $description
						tags: $tags
						isPublished: true
						isPrivate: false
						publishStartDate: ""
						publishEndDate: ""
						scriptCss: ""
						scriptJs: ""
					) {
						responseResult {
							succeeded
							errorCode
							slug
							message
						}
						page {
							id
							path
							title
						}
					}
				}
			}
		`;

		try {
			const variables = {
				id,
				path: normalizedPath,
				title,
				// content: content.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'),
				content,
				description: description || '',
				tags: tags || []
			};

			const result = await this.makeGraphQLRequest(mutation, variables) as WikiJSUpdatePageMutation;
			const locale = this.settings.locale || 'en';

			if (result.pages.update.responseResult.succeeded) {
				return {
					success: true,
					message: 'Page updated successfully',
					pageId: result.pages.update.page.id,
					pageUrl: `${this.settings.wikiUrl}/${locale}/${normalizedPath}`
				};
			} else {
				return {
					success: false,
					message: result.pages.update.responseResult.message || 'Unknown error occurred'
				};
			}
		} catch (error) {
			return {
				success: false,
				message: `Error updating page: ${error.message}`
			};
		}
	}

	/**
	 * 获取资源文件夹列表
	 * @param parentFolderId 父文件夹 ID（0 表示根目录）
	 * @returns 文件夹列表
	 */
	async getAssetFolders(parentFolderId: number = 0): Promise<Array<{ id: number; slug: string; name: string }>> {
		const query = `
			query ($parentFolderId: Int!) {
				assets {
					folders(parentFolderId: $parentFolderId) {
						id
						slug
						name
					}
				}
			}
		`;

		try {
			const result = await this.makeGraphQLRequest(query, { parentFolderId }) as {
				assets: {
					folders: Array<{ id: number; slug: string; name: string }>;
				};
			};
			return result.assets.folders || [];
		} catch (error) {
			console.error('Get folders error:', error);
			return [];
		}
	}

	/**
	 * 查找指定名称的文件夹 ID
	 * @param parentFolderId 父文件夹 ID
	 * @param folderName 文件夹名称
	 * @returns 文件夹 ID，如果不存在返回 null
	 */
	async findFolderIdByName(parentFolderId: number, folderName: string): Promise<number | null> {
		const folders = await this.getAssetFolders(parentFolderId);
		// console.log('folderName', folderName);
		const lowerName = folderName.toLowerCase();
		// console.log('lowerName', lowerName);
		// console.log('slug', folders.map(f => f.slug));
		// console.log('name', folders.map(f => f.name));
		// Wiki.js 将 slug 自动转为小写，用大小写不敏感比较避免找不到已存在的文件夹
		const folder = folders.find(f =>
			f.slug.toLowerCase() === lowerName || f.name.toLowerCase() === lowerName
		);
		return folder ? folder.id : null;
	}

	/**
	 * 创建资源文件夹
	 * @param parentFolderId 父文件夹 ID（0 表示根目录）
	 * @param slug 文件夹名称
	 * @returns 创建结果，包含新创建的文件夹 ID
	 */
	async createAssetFolder(parentFolderId: number, slug: string): Promise<{ succeeded: boolean; folderId?: number; message?: string }> {
		const mutation = `
			mutation ($parentFolderId: Int!, $slug: String!) {
				assets {
					createFolder(parentFolderId: $parentFolderId, slug: $slug) {
						responseResult {
							succeeded
							errorCode
							slug
							message
						}
					}
				}
			}
		`;

		try {
			const result = await this.makeGraphQLRequest(mutation, { parentFolderId, slug }) as {
				assets: {
					createFolder: {
						responseResult: {
							succeeded: boolean;
							errorCode: number;
							slug: string;
							message: string;
						};
					};
				};
			};
			
			if (result.assets.createFolder.responseResult.succeeded) {
				console.debug(`Asset folder created: ${slug}`);
				
				// 创建成功后，查询获取新文件夹的 ID
				const folderId = await this.findFolderIdByName(parentFolderId, slug);
				
				return { 
					succeeded: true,
					folderId: folderId || undefined
				};
			} else {
				return {
					succeeded: false,
					message: result.assets.createFolder.responseResult.message || 'Unknown error'
				};
			}
		} catch (error) {
			const err = error as Error;
			console.error('Create folder error:', err);
			return {
				succeeded: false,
				message: err.message
			};
		}
	}

	/**
	 * 根据路径创建文件夹结构
	 * @param path 完整路径（如 "folder1/folder2/folder3"），将使用所有部分创建文件夹
	 * @returns 最终文件夹 ID
	 */
	async ensureAssetFolderPath(path: string): Promise<number> {
		// 从路径中提取所有文件夹部分，保留完整路径
		// Wiki.js 对 slug 强制小写，提前统一处理避免大小写导致的层级丢失
		const folderParts = path.split('/').filter(p => p.trim()).map(p => p.toLowerCase());
		if (folderParts.length === 0) {
			return 0; // 根目录
		}

		let currentFolderId = 0;
		
		// 逐级创建文件夹，使用完整路径的所有部分
		for (const folderName of folderParts) {
			// 首先检查文件夹是否已存在
			let folderId = await this.findFolderIdByName(currentFolderId, folderName);
			
			if (folderId) {
				// 文件夹已存在，使用现有 ID
				console.debug(`Folder already exists: ${folderName} (ID: ${folderId})`);
				currentFolderId = folderId;
			} else {
				// 文件夹不存在，创建新文件夹
				const result = await this.createAssetFolder(currentFolderId, folderName);
				
				if (result.succeeded && result.folderId) {
					console.debug(`Created folder: ${folderName} (ID: ${result.folderId})`);
					currentFolderId = result.folderId;
				} else {
					// 创建失败，可能是并发问题，再次尝试查询
					folderId = await this.findFolderIdByName(currentFolderId, folderName);
					if (folderId) {
						console.debug(`Folder found after retry: ${folderName} (ID: ${folderId})`);
						currentFolderId = folderId;
					} else {
						console.error(`Failed to create or find folder: ${folderName}`);
						// 如果创建失败且找不到，继续使用当前父文件夹 ID
						// 这样至少可以保证后续文件夹在正确的层级
					}
				}
			}
		}

		return currentFolderId;
	}

	async uploadAsset(
		fileName: string,
		fileContent: ArrayBuffer,
		folderId: number = 0
	): Promise<string> {
		try {
			// 创建 FormData
			const formData = new FormData();
			
			// 添加文件夹元数据
			formData.append('mediaUpload', JSON.stringify({ folderId }));
			
			// 根据文件扩展名确定 MIME 类型
			const getContentType = (name: string): string => {
				const ext = name.toLowerCase().split('.').pop() || '';
				const mimeTypes: { [key: string]: string } = {
					'jpg': 'image/jpeg',
					'jpeg': 'image/jpeg',
					'png': 'image/png',
					'gif': 'image/gif',
					'webp': 'image/webp',
					'svg': 'image/svg+xml',
					'bmp': 'image/bmp',
					'ico': 'image/x-icon',
					'tiff': 'image/tiff',
					'tif': 'image/tiff',
					'avif': 'image/avif',
					'heic': 'image/heic',
					'heif': 'image/heif'
				};
				return mimeTypes[ext] || 'application/octet-stream';
			};
			
			// 确保文件名包含扩展名
			const sanitizedFileName = fileName.trim();
			if (!sanitizedFileName) {
				throw new Error('File name cannot be empty');
			}
			
			// 添加文件数据
			const contentType = getContentType(sanitizedFileName);
			const blob = new Blob([fileContent], { type: contentType });
			formData.append('mediaUpload', blob, sanitizedFileName);

		console.debug(`Uploading asset: ${sanitizedFileName} to folder ${folderId}`);
		console.debug(`  - Size: ${blob.size} bytes`);
		console.debug(`  - MIME type: ${blob.type}`);
		console.debug(`  - File extension: ${sanitizedFileName.split('.').pop()}`);

		// 发送请求 - 使用原生 fetch API，因为 requestUrl 不支持 FormData
		// 在 Electron/Obsidian 环境中，fetch API 是可用的
		const response = await fetch(`${this.settings.wikiUrl}/u`, {
			method: 'POST',
			headers: {
				'Accept': '*/*',
				'Authorization': `Bearer ${this.settings.apiToken}`,
				// 注意：不要设置 Content-Type，让浏览器自动设置正确的 boundary
			},
			body: formData
		});

		
		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Upload failed: ${response.status} - ${errorText}`);
			throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
		}

		// const result = await response.json();
		// console.log('Upload response:', result);
			
		// if (!result.succeeded) {
		// 	throw new Error(result.message || 'Upload failed');
		// }

		// 图片上传成功，输出文件名
		console.debug(`✅ Asset uploaded successfully: ${sanitizedFileName}`);
		
		// 返回文件名（用于后续在 markdown 中替换引用）
		return sanitizedFileName;

		} catch (error) {
			console.error('Asset upload error:', error);
			throw new Error(`Error uploading asset: ${error.message}`);
		}
	}


}

