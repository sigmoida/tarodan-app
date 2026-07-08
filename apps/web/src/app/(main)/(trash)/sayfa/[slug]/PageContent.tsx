/** @format */

'use client';

import { useEffect, useState } from 'react';
import DOMPurify from 'isomorphic-dompurify';

interface PageContentProps {
	content: string;
}

export function PageContent({ content }: PageContentProps) {
	const [sanitizedContent, setSanitizedContent] = useState('');

	useEffect(() => {
		const sanitized = DOMPurify.sanitize(content, {
			ALLOWED_TAGS: [
				'h1',
				'h2',
				'h3',
				'h4',
				'p',
				'br',
				'strong',
				'em',
				'u',
				'a',
				'ul',
				'ol',
				'li',
				'img',
				'blockquote',
				'span',
				'div',
			],
			ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
		});
		setSanitizedContent(sanitized);
	}, [content]);

	return (
		<div
			className='prose prose-gray max-w-none p-4 prose-headings:font-semibold prose-a:text-primary-600 prose-img:rounded-lg'
			dangerouslySetInnerHTML={{ __html: sanitizedContent }}
		/>
	);
}
