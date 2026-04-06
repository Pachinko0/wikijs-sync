export interface WikiJSSettings {
	wikiUrl: string;
	apiToken: string;
	autoConvertLinks: boolean;
	preserveObsidianSyntax: boolean;
	locale?: string;
	uploadBehavior?: 'ask' | 'update' | 'create-new';
	bulkUploadBehavior?: 'overwrite' | 'skip' | 'ask';
	bulkUploadImages?: boolean;
	syncNavigation?: boolean;
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

// Navigation types
export interface NavigationItem {
	id: string;
	kind: string;
	label?: string;
	icon?: string;
	targetType?: string;
	target?: string;
}

export interface NavigationItemInput {
	id: string;
	kind: string;
	label?: string;
	icon?: string;
	targetType?: string;
	target?: string;
}

export interface NavigationTreeResponse {
	navigation: {
		tree: NavigationItem[];
	};
}

export interface NavigationUpdateResponse {
	navigation: {
		updateTree: {
			responseResult: {
				succeeded: boolean;
				errorCode: number;
				slug: string;
				message: string;
			};
		};
	};
}