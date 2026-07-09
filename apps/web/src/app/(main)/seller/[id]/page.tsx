/** @format */

import SellerProfileClient from './_components/SellerProfileClient';

/**
 * Public seller profile — identity + stats header, and listings / reviews /
 * collections tabs. Data + follow/message/report actions live in the client
 * component and its hook.
 */
export default function SellerProfilePage() {
	return <SellerProfileClient />;
}
