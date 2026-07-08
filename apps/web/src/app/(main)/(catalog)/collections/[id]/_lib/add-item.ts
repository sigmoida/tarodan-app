/** @format */

export const PRODUCT_PLACEHOLDER =
	'https://placehold.co/80x80/374151/9ca3af?text=Ürün';

export const EMPTY_CUSTOM = {
	title: '',
	description: '',
	brand: '',
	model: '',
	year: '' as number | '',
	scale: '',
	manufacturer: '',
	material: '',
};

export type CustomForm = typeof EMPTY_CUSTOM;
