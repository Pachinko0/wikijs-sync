export interface WikiJSSettings {
	wikiUrl: string;
	apiToken: string;
	autoConvertLinks: boolean;
	preserveObsidianSyntax: boolean;
	locale?: string;
	uploadBehavior?: 'ask' | 'update' | 'create-new';
	bulkUploadBehavior?: 'overwrite' | 'skip' | 'ask';
	bulkUploadImages?: boolean;
	autoSyncEnabled?: boolean;
	autoSyncDelay?: number; // in seconds
	autoSyncImages?: boolean;
}

export interface WikiJSPageResponse {
	id: number;
	path: string;
	title: string;
	createdAt: string;
	updatedAt: string;
}

export interface WikiJSPage {
	id: string;
	path: string;
	title: string;
	description?: string;
}

export interface WikiJSPageWithContent extends WikiJSPage {
	content: string;
	tags?: string[];
}

export interface WikiJSCreatePageMutation {
	pages: {
		create: {
			responseResult: {
				succeeded: boolean;
				errorCode: number;
				slug: string;
				message: string;
			};
			page: WikiJSPageResponse;
		};
	};
}

export interface WikiJSUpdatePageMutation {
	pages: {
		update: {
			responseResult: {
				succeeded: boolean;
				errorCode: number;
				slug: string;
				message: string;
			};
			page: WikiJSPageResponse;
		};
	};
}

export interface WikiJSPageListResponse {
	pages: {
		list: WikiJSPageResponse[];
	};
}

export interface UploadResult {
	success: boolean;
	message: string;
	pageId?: number;
	pageUrl?: string;
}

