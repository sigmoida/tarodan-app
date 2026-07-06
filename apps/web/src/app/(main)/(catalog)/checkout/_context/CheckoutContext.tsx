/** @format */

'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useStepper } from '@tarodan/ui';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { ordersApi, paymentsApi, addressesApi } from '@/lib/api';
import { getFullPhoneNumber, normalizePhoneForPayload } from '@/lib/phone';
import { useTranslation } from '@/i18n';
import {
	billingAddressSchema,
	guestContactSchema,
	isValid,
	savedAddressSchema,
	shippingAddressSchema,
	shippingAddressWithPhoneSchema,
} from '../_lib/schema';
import type { Address, CheckoutItem } from '../_lib/types';
import { useCheckoutQuote } from '../_hooks/useCheckoutQuote';
import { useShippingCost } from '../_hooks/useShippingCost';
import { useDirectProduct } from '../_hooks/useDirectProduct';
import { useCheckoutAddresses } from '../_hooks/useCheckoutAddresses';

const EMPTY_ADDRESS: Omit<Address, 'id'> = {
	title: '',
	fullName: '',
	phone: '',
	city: '',
	district: '',
	address: '',
	zipCode: '',
};

function useCheckoutValue() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const queryClient = useQueryClient();
	const {
		items: cartItems,
		offlineItems,
		subtotal: cartSubtotal,
		totalDiscount: cartTotalDiscount,
		clearCart,
		appliedCouponCode,
	} = useCartStore();
	const { user, isAuthenticated, token: authToken } = useAuthStore();
	const { t, locale } = useTranslation();

	const [isMounted, setIsMounted] = useState(false);
	useEffect(() => {
		setIsMounted(true);
	}, []);

	const directProductId = searchParams.get('productId');
	const existingOrderId = searchParams.get('orderId');

	// 0: Address, 1: Payment, 2: Confirm — the clickable Stepper drives this.
	const stepper = useStepper(3, 0);
	const step = stepper.current;
	const goToStep = stepper.goTo;
	const nextStep = stepper.next;
	const [isLoading, setIsLoading] = useState(false);
	const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
		null,
	);
	const [showAddressForm, setShowAddressForm] = useState(false);
	const [paymentProvider] = useState<'paytr'>('paytr');

	// Guest checkout fields
	const [guestEmail, setGuestEmail] = useState('');
	const [guestPhone, setGuestPhone] = useState('');
	const [guestName, setGuestName] = useState('');
	const [guestPhoneCountryCode, setGuestPhoneCountryCode] = useState('+90');
	const [guestEmailVerificationCode, setGuestEmailVerificationCode] =
		useState('');
	const [guestOtpSending, setGuestOtpSending] = useState(false);
	const [guestOtpSentForEmail, setGuestOtpSentForEmail] = useState<
		string | null
	>(null);
	const [guestOtpModalOpen, setGuestOtpModalOpen] = useState(false);
	const guestOtpInputRef = useRef<HTMLInputElement>(null);

	// Checkout idempotency: retries for the same cart (double click, retry after a
	// network error) return the SAME group server-side. Generated on first submit.
	const checkoutIdempotencyKeyRef = useRef<string | null>(null);
	const getCheckoutIdempotencyKey = () => {
		if (!checkoutIdempotencyKeyRef.current) {
			checkoutIdempotencyKeyRef.current =
				typeof crypto !== 'undefined' && crypto.randomUUID
					? crypto.randomUUID()
					: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
							const r = (Math.random() * 16) | 0;
							return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
						});
		}
		return checkoutIdempotencyKeyRef.current;
	};

	// New address form
	const [newAddress, setNewAddress] =
		useState<Omit<Address, 'id'>>(EMPTY_ADDRESS);
	const [newAddressPhoneCountryCode, setNewAddressPhoneCountryCode] =
		useState('+90');

	// Billing address: same as shipping (default) or different
	const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
	const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<
		string | null
	>(null);
	const [newBillingAddress, setNewBillingAddress] =
		useState<Omit<Address, 'id'>>(EMPTY_ADDRESS);
	const [billingAddressPhoneCountryCode, setBillingAddressPhoneCountryCode] =
		useState('+90');

	const [selectedCarrier] = useState<string>('surat');

	// ---- Server data (TanStack Query) ----
	const { directProduct, directProductError } = useDirectProduct(
		directProductId,
		locale,
	);
	const { addresses, addressesLoading, addressesError } =
		useCheckoutAddresses(isAuthenticated);

	// Get checkout items: direct buy > authenticated cart > offline/guest cart
	const checkoutItems: CheckoutItem[] = directProduct
		? [directProduct]
		: cartItems.length > 0
			? cartItems.map(
					(item: {
						id: string;
						productId: string;
						productTitle: string;
						effectivePrice: number;
						originalPrice?: number;
						productImage: string | null;
						sellerId: string;
						sellerName: string;
					}) => ({
						id: item.id,
						productId: item.productId,
						title: item.productTitle,
						price: item.effectivePrice,
						originalPrice:
							item.originalPrice != null &&
							item.originalPrice > item.effectivePrice
								? item.originalPrice
								: undefined,
						imageUrl:
							item.productImage ||
							'https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün',
						seller: { id: item.sellerId, displayName: item.sellerName },
					}),
				)
			: offlineItems.map((item) => ({
					id: item.id,
					productId: item.productId,
					title: item.title,
					price: item.price,
					imageUrl:
						item.imageUrl ||
						'https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün',
					seller: { id: item.seller.id, displayName: item.seller.displayName },
				}));
	const subtotal = Number(
		(directProduct ? directProduct.price : cartSubtotal) ?? 0,
	);

	const productIds = checkoutItems.map((i) => i.productId);
	const { quote, quoteLoading } = useCheckoutQuote(productIds);

	const shippingCity =
		isAuthenticated && selectedAddressId
			? addresses.find((a) => a.id === selectedAddressId)?.city || ''
			: !isAuthenticated
				? newAddress.city
				: '';
	const { shippingCost, shippingLoading } = useShippingCost({
		isAuthenticated,
		city: shippingCity,
		carrier: selectedCarrier,
		itemCount: checkoutItems.length,
	});

	const couponDiscount = directProduct ? 0 : (cartTotalDiscount ?? 0);
	const displayTotal = Math.max(
		0,
		(quote?.pricing?.totalAmount ?? subtotal + shippingCost) - couponDiscount,
	);
	const grandTotal = displayTotal;

	// Direct product failed to load → bounce back to listings.
	useEffect(() => {
		if (directProductError) {
			toast.error(t('product.loadFailed'));
			router.push('/listings');
		}
	}, [directProductError, router, t]);

	// Default-select an address once the list first settles (default > last), or
	// open the form when there are none / the fetch failed.
	const didInitAddrRef = useRef(false);
	useEffect(() => {
		if (!isAuthenticated || addressesLoading || didInitAddrRef.current) return;
		didInitAddrRef.current = true;
		if (addressesError) {
			setShowAddressForm(true);
			return;
		}
		const defaultAddr = addresses.find((a) => a.isDefault);
		if (defaultAddr) {
			setSelectedAddressId(defaultAddr.id);
		} else if (addresses.length > 0) {
			setSelectedAddressId(addresses[addresses.length - 1].id);
		} else {
			setSelectedAddressId(null);
			setShowAddressForm(true);
		}
	}, [isAuthenticated, addressesLoading, addressesError, addresses]);

	// orderId ile gelindiyse sipariş detay sayfasına yönlendir
	useEffect(() => {
		if (existingOrderId && isAuthenticated) {
			router.replace(`/profile/orders/${existingOrderId}`);
		}
	}, [existingOrderId, isAuthenticated, router]);

	// Pre-populate new address form with user's profile info
	useEffect(() => {
		if (isAuthenticated && user) {
			setNewAddress((prev) => ({
				...prev,
				fullName: prev.fullName || user.displayName || '',
				phone: prev.phone || user.phone || '',
			}));
		}
	}, [isAuthenticated, user]);

	// Guest OTP: reset the verified state if the email changes after a code was sent
	useEffect(() => {
		const n = guestEmail.trim().toLowerCase();
		if (!guestOtpSentForEmail) return;
		if (!n || n !== guestOtpSentForEmail) {
			setGuestOtpSentForEmail(null);
			setGuestEmailVerificationCode('');
			setGuestOtpModalOpen(false);
		}
	}, [guestEmail, guestOtpSentForEmail]);

	// Guest OTP modal: focus the input + close on Escape
	useEffect(() => {
		if (!guestOtpModalOpen) return;
		const focusTimer = window.setTimeout(
			() => guestOtpInputRef.current?.focus(),
			100,
		);
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setGuestOtpModalOpen(false);
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.clearTimeout(focusTimer);
			window.removeEventListener('keydown', onKey);
		};
	}, [guestOtpModalOpen]);

	const requestGuestCheckoutOtp = useCallback(
		async (em: string): Promise<boolean> => {
			setGuestOtpSending(true);
			try {
				await ordersApi.sendGuestVerificationCode({
					email: em,
					expectedCheckoutCount: Math.max(1, checkoutItems.length),
				});
				setGuestOtpSentForEmail(em);
				return true;
			} catch (e: any) {
				const data = e?.response?.data;
				// E-posta zaten kayıtlı (409) → misafir alışverişe izin verme; net mesaj
				// ver ve checkout'a geri dönecek şekilde giriş sayfasına yönlendir.
				if (
					e?.response?.status === 409 ||
					data?.code === 'EMAIL_ALREADY_REGISTERED'
				) {
					toast.error(
						typeof data?.message === 'string'
							? data.message
							: locale === 'en'
								? 'This email is already registered. Please log in to continue.'
								: 'Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapıp alışverişe devam edin.',
					);
					try {
						sessionStorage.setItem('login_redirect', '/checkout');
					} catch {
						/* sessionStorage erişilemezse query param yine yönlendirir */
					}
					router.push('/login?redirect=/checkout');
					return false;
				}
				const msg =
					data?.message ??
					(Array.isArray(data?.message) ? data.message.join(', ') : null);
				toast.error(
					typeof msg === 'string' ? msg : t('checkout.guestEmailSendCodeFailed'),
				);
				return false;
			} finally {
				setGuestOtpSending(false);
			}
		},
		[checkoutItems.length, t, locale, router],
	);

	// ---- Step-1 validation (zod) ----
	const authAddressOk =
		!!selectedAddressId ||
		isValid(shippingAddressWithPhoneSchema(locale), newAddress);
	const guestContactOk = !!(
		guestName?.trim() &&
		guestEmail?.trim() &&
		guestPhone?.trim()
	);
	const guestAddressOk = isValid(shippingAddressSchema(locale), newAddress);
	const billingOk =
		billingSameAsShipping ||
		isValid(billingAddressSchema(locale), newBillingAddress);
	const addressStepValid = isAuthenticated
		? authAddressOk && billingOk
		: guestContactOk && guestAddressOk && billingOk;

	const handleAddressStepContinue = async () => {
		if (isAuthenticated) {
			if (!authAddressOk) {
				toast.error(
					locale === 'en'
						? 'Please select or enter a complete shipping address'
						: 'Lütfen teslimat adresini seçin veya eksiksiz doldurun',
				);
				return;
			}
			if (!billingOk) {
				toast.error(
					locale === 'en'
						? 'Please complete the billing address'
						: 'Lütfen fatura adresini doldurun',
				);
				return;
			}
			goToStep(1);
			return;
		}

		if (!billingOk) {
			toast.error(
				locale === 'en'
					? 'Please complete the billing address'
					: 'Lütfen fatura adresini doldurun',
			);
			return;
		}
		if (!guestContactOk) {
			toast.error(
				locale === 'en'
					? 'Please fill in your name, email and phone'
					: 'Lütfen ad, e-posta ve telefon girin',
			);
			return;
		}
		if (!guestAddressOk) {
			toast.error(
				locale === 'en'
					? 'Please complete the delivery address'
					: 'Lütfen teslimat adresini eksiksiz doldurun',
			);
			return;
		}

		const em = guestEmail.trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
			toast.error(t('checkout.enterEmail'));
			return;
		}

		// Kod ekranını AÇMADAN önce kodu iste: e-posta zaten kayıtlıysa (409)
		// requestGuestCheckoutOtp false döner + giriş'e yönlendirir → kod ekranı
		// hiç açılmaz. Kod daha önce bu e-posta için gönderildiyse tekrar isteme.
		if (guestOtpSentForEmail === em) {
			setGuestOtpModalOpen(true);
			return;
		}
		const sent = await requestGuestCheckoutOtp(em);
		if (!sent) return;
		toast.success(t('checkout.guestEmailCodeSent'));
		setGuestOtpModalOpen(true);
	};

	const confirmGuestOtpModal = () => {
		const digits = guestEmailVerificationCode.replace(/\D/g, '');
		if (!/^\d{6}$/.test(digits)) {
			toast.error(t('checkout.guestEmailOtpRequired'));
			return;
		}
		setGuestOtpModalOpen(false);
		goToStep(1);
	};

	const invalidateAddresses = () =>
		queryClient.invalidateQueries({ queryKey: ['checkout-addresses'] });

	const handleAddAddress = async () => {
		const parsed = savedAddressSchema(locale).safeParse(newAddress);
		if (!parsed.success) {
			toast.error(
				locale === 'en'
					? 'Please fill all required fields including address title (e.g. Home, Work)'
					: 'Adres başlığı dahil tüm zorunlu alanları doldurun (örn: Ev, İş)',
			);
			return;
		}

		try {
			// Format phone number with country code
			const formattedPhone = getFullPhoneNumber(
				newAddress.phone,
				newAddressPhoneCountryCode,
			);

			const response = await addressesApi.create({
				title: (newAddress.title ?? '').trim(),
				fullName: newAddress.fullName,
				phone: formattedPhone,
				city: newAddress.city,
				district: newAddress.district,
				address: newAddress.address,
				zipCode: newAddress.zipCode || undefined,
				isDefault: addresses.length === 0, // Make first address default
			});

			// Handle different response structures
			let createdAddress: any = null;
			if (response.data) {
				if (
					response.data.id &&
					typeof response.data === 'object' &&
					!Array.isArray(response.data)
				) {
					createdAddress = response.data;
				} else if (
					response.data.address &&
					typeof response.data.address === 'object' &&
					response.data.address.id
				) {
					createdAddress = response.data.address;
				} else if (
					typeof response.data === 'object' &&
					!Array.isArray(response.data) &&
					response.data.id
				) {
					createdAddress = response.data;
				}
			}

			if (
				createdAddress &&
				createdAddress.id &&
				typeof createdAddress.id === 'string'
			) {
				setShowAddressForm(false);
				setNewAddress({
					title: '',
					fullName: user?.displayName || '',
					phone: user?.phone || '',
					city: '',
					district: '',
					address: '',
					zipCode: '',
				});
				// Refresh the address list, then select the newly created address.
				await invalidateAddresses();
				setSelectedAddressId(createdAddress.id);
				toast.success(locale === 'en' ? 'Address added' : 'Adres eklendi');
			} else {
				await invalidateAddresses();
				toast.error(
					locale === 'en'
						? 'Address may have been added, but could not verify. Please refresh the page.'
						: 'Adres eklenmiş olabilir ancak doğrulanamadı. Lütfen sayfayı yenileyin.',
				);
			}
		} catch (error: any) {
			const errorMessage =
				error.response?.data?.message ||
				error.message ||
				t('checkout.addressAddError');
			if (error.response?.status === 400) {
				await invalidateAddresses();
			}
			toast.error(errorMessage);
		}
	};

	const handleCheckout = async () => {
		if (checkoutItems.length === 0) {
			toast.error(t('cart.empty'));
			return;
		}

		setIsLoading(true);

		try {
			// Determine checkout mode
			const hasSavedAddress =
				isAuthenticated && selectedAddressId && addresses.length > 0;
			const hasFormAddress =
				newAddress.fullName &&
				newAddress.phone &&
				newAddress.city &&
				newAddress.district &&
				newAddress.address;

			// Get shipping address - prefer saved address for logged-in users, otherwise use form
			let shippingAddress: any;
			let contactEmail: string;
			let contactPhone: string;
			let contactName: string;

			if (hasSavedAddress) {
				const selectedAddress = addresses.find(
					(a) => a.id === selectedAddressId,
				);
				if (!selectedAddress) {
					toast.error(t('checkout.addressNotFound'));
					setIsLoading(false);
					return;
				}

				const addressPhone = selectedAddress.phone || user?.phone;
				if (!addressPhone) {
					toast.error('Teslimat adresi için telefon numarası gereklidir');
					setIsLoading(false);
					return;
				}

				shippingAddress = {
					fullName: selectedAddress.fullName,
					phone: addressPhone,
					city: selectedAddress.city,
					district: selectedAddress.district,
					address: selectedAddress.address,
					zipCode: selectedAddress.zipCode || undefined,
				};
				contactEmail = user?.email || '';
				contactPhone = addressPhone;
				contactName = selectedAddress.fullName || user?.displayName || '';
			} else if (hasFormAddress) {
				const email = isAuthenticated ? user?.email : guestEmail;
				const phone = isAuthenticated
					? user?.phone || newAddress.phone
					: guestPhone || newAddress.phone;
				const name = isAuthenticated
					? user?.displayName || newAddress.fullName
					: guestName || newAddress.fullName;

				if (!isAuthenticated) {
					if (!guestName?.trim()) {
						toast.error(t('checkout.enterName'));
						setIsLoading(false);
						return;
					}
					if (!guestEmail?.trim()) {
						toast.error(t('checkout.enterEmail'));
						setIsLoading(false);
						return;
					}
					if (!guestPhone?.trim()) {
						toast.error(t('checkout.enterPhone'));
						setIsLoading(false);
						return;
					}
					const otpDigits = guestEmailVerificationCode.replace(/\D/g, '');
					if (!/^\d{6}$/.test(otpDigits)) {
						toast.error(t('checkout.guestEmailOtpRequired'));
						setIsLoading(false);
						return;
					}
				}

				if (!email) {
					toast.error(t('checkout.enterEmail'));
					setIsLoading(false);
					return;
				}
				if (!phone) {
					toast.error(t('checkout.enterPhone'));
					setIsLoading(false);
					return;
				}

				const addressPhone = newAddress.phone?.trim() || phone;
				if (!addressPhone) {
					toast.error(t('checkout.enterAddressPhone'));
					setIsLoading(false);
					return;
				}

				const formattedAddressPhone = getFullPhoneNumber(
					addressPhone,
					newAddressPhoneCountryCode,
				);
				const formattedContactPhone = isAuthenticated
					? user?.phone || formattedAddressPhone
					: getFullPhoneNumber(phone || guestPhone, guestPhoneCountryCode);

				shippingAddress = {
					fullName: newAddress.fullName,
					phone: formattedAddressPhone,
					city: newAddress.city,
					district: newAddress.district,
					address: newAddress.address,
					zipCode: newAddress.zipCode || undefined,
				};
				contactEmail = email;
				contactPhone = formattedContactPhone;
				contactName = name || newAddress.fullName;
			} else {
				if (isAuthenticated) {
					if (addresses.length === 0) {
						toast.error(t('checkout.clickAddNewAddress'));
					} else if (!selectedAddressId) {
						toast.error(t('checkout.selectShippingAddress'));
					} else {
						toast.error(t('checkout.invalidAddressAddNew'));
					}
				} else {
					const missingFields = [];
					if (!newAddress.fullName)
						missingFields.push(locale === 'en' ? 'Full Name' : 'Ad Soyad');
					if (!newAddress.phone)
						missingFields.push(locale === 'en' ? 'Phone' : 'Telefon');
					if (!newAddress.city)
						missingFields.push(locale === 'en' ? 'City' : 'Şehir');
					if (!newAddress.district)
						missingFields.push(locale === 'en' ? 'District' : 'İlçe');
					if (!newAddress.address)
						missingFields.push(locale === 'en' ? 'Address' : 'Açık Adres');

					if (missingFields.length > 0) {
						toast.error(
							locale === 'en'
								? `Please fill in: ${missingFields.join(', ')}`
								: `Lütfen şu alanları doldurun: ${missingFields.join(', ')}`,
						);
					} else {
						toast.error(t('checkout.enterShippingAddress'));
					}
				}
				setIsLoading(false);
				return;
			}

			// Tüm sepet TEK çağrıda, tek CheckoutGroup altında sipariş edilir; tek
			// ödeme grubu kapsar (eski ürün-başına-sipariş döngüsü 2. siparişi ödemesiz bırakıyordu).
			{
				let orderResponse;
				const checkoutGroupItems = checkoutItems.map((ci) => ({
					productId: ci.productId,
				}));

				try {
					if (isAuthenticated) {
						const validAddressId =
							hasSavedAddress &&
							selectedAddressId &&
							selectedAddressId.trim() !== ''
								? selectedAddressId
								: undefined;

						const payload: {
							items: Array<{ productId: string }>;
							idempotencyKey: string;
							shippingAddressId?: string;
							shippingAddress?: typeof shippingAddress;
							billingAddressId?: string;
							billingAddress?: {
								fullName: string;
								phone: string;
								city: string;
								district: string;
								address: string;
								zipCode?: string;
							};
							couponCode?: string;
						} = {
							items: checkoutGroupItems,
							idempotencyKey: getCheckoutIdempotencyKey(),
						};

						if (validAddressId) {
							payload.shippingAddressId = validAddressId;
						}
						if (
							!billingSameAsShipping &&
							newBillingAddress.fullName &&
							newBillingAddress.city &&
							newBillingAddress.address
						) {
							payload.billingAddress = {
								fullName: newBillingAddress.fullName.trim(),
								phone: normalizePhoneForPayload(
									newBillingAddress.phone,
									billingAddressPhoneCountryCode,
								),
								city: newBillingAddress.city.trim(),
								district: newBillingAddress.district.trim(),
								address: newBillingAddress.address.trim(),
								zipCode: newBillingAddress.zipCode?.trim() || undefined,
							};
						} else if (
							!billingSameAsShipping &&
							selectedBillingAddressId &&
							selectedBillingAddressId !== validAddressId
						) {
							payload.billingAddressId = selectedBillingAddressId;
						}
						if (!validAddressId) {
							const addr =
								shippingAddress ||
								(hasFormAddress &&
								newAddress.fullName &&
								newAddress.phone &&
								newAddress.city &&
								newAddress.district &&
								newAddress.address
									? {
											fullName: newAddress.fullName,
											phone: newAddress.phone || user?.phone || '',
											city: newAddress.city,
											district: newAddress.district,
											address: newAddress.address,
											zipCode: newAddress.zipCode,
										}
									: null);
							if (addr) {
								if (!addr.fullName?.trim())
									throw new Error('Teslimat adresi için ad soyad gereklidir');
								if (!addr.phone?.trim())
									throw new Error('Teslimat adresi için telefon gereklidir');
								if (!addr.city?.trim())
									throw new Error('Teslimat adresi için şehir gereklidir');
								if (!addr.district?.trim())
									throw new Error('Teslimat adresi için ilçe gereklidir');
								if (!addr.address?.trim())
									throw new Error('Teslimat adresi için açık adres gereklidir');
								payload.shippingAddress = {
									fullName: addr.fullName.trim(),
									phone: normalizePhoneForPayload(
										addr.phone,
										newAddressPhoneCountryCode,
									),
									city: addr.city.trim(),
									district: addr.district.trim(),
									address: addr.address.trim(),
									zipCode: addr.zipCode?.trim() || undefined,
								};
							} else {
								toast.error(
									locale === 'en'
										? 'Please select or enter a shipping address'
										: 'Lütfen bir teslimat adresi seçin veya girin',
								);
								setIsLoading(false);
								return;
							}
						}

						orderResponse = await ordersApi.checkout(payload);
					} else {
						const formattedContactPhone = normalizePhoneForPayload(
							contactPhone,
							guestPhoneCountryCode,
						);
						const formattedAddrPhone = normalizePhoneForPayload(
							shippingAddress?.phone,
							newAddressPhoneCountryCode,
						);

						const guestPayload: {
							items: Array<{ productId: string }>;
							idempotencyKey: string;
							email: string;
							phone: string;
							guestName: string;
							emailVerificationCode: string;
							shippingAddress: {
								fullName: string;
								phone: string;
								city: string;
								district: string;
								address: string;
								zipCode?: string;
							};
							billingAddress?: {
								fullName: string;
								phone: string;
								city: string;
								district: string;
								address: string;
								zipCode?: string;
							};
						} = {
							items: checkoutGroupItems,
							idempotencyKey: getCheckoutIdempotencyKey(),
							email: contactEmail,
							phone: formattedContactPhone,
							guestName: contactName,
							emailVerificationCode: guestEmailVerificationCode
								.replace(/\D/g, '')
								.slice(0, 6),
							shippingAddress: {
								...shippingAddress,
								phone: formattedAddrPhone,
							},
						};
						if (
							!billingSameAsShipping &&
							newBillingAddress.fullName &&
							newBillingAddress.city &&
							newBillingAddress.address
						) {
							guestPayload.billingAddress = {
								fullName: newBillingAddress.fullName.trim(),
								phone: normalizePhoneForPayload(
									newBillingAddress.phone,
									billingAddressPhoneCountryCode,
								),
								city: newBillingAddress.city.trim(),
								district: newBillingAddress.district.trim(),
								address: newBillingAddress.address.trim(),
								zipCode: newBillingAddress.zipCode?.trim() || undefined,
							};
						}

						orderResponse = await ordersApi.checkoutGuest(guestPayload);
					}
				} catch (orderError: any) {
					let errorMessage = 'Sipariş oluşturulamadı';
					if (orderError.response?.data) {
						const data = orderError.response.data;
						if (Array.isArray(data.message)) {
							errorMessage = data.message.join(', ');
						} else if (typeof data.message === 'string') {
							errorMessage = data.message;
						} else if (data.error) {
							errorMessage = data.error;
						} else if (typeof data === 'string') {
							errorMessage = data;
						}
					} else if (orderError.message) {
						errorMessage = orderError.message;
					}

					const stockoutKeywords = [
						'satışta değil',
						'stokta yok',
						'stokta bulunmamaktadır',
						'başkası tarafından',
						'başka alıcıya satıldı',
					];
					const isStockout =
						(orderError.response?.status === 400 ||
							orderError.response?.status === 409) &&
						stockoutKeywords.some((kw) =>
							errorMessage.toLowerCase().includes(kw.toLowerCase()),
						);

					const stockoutProductId =
						orderError.response?.data?.productId || checkoutItems[0]?.productId;
					if (isStockout && stockoutProductId) {
						router.push(`/products/unavailable/${stockoutProductId}`);
						return;
					}

					toast.error(errorMessage);
					return;
				}

				// Batch checkout: { checkoutGroupId, orders: [{ orderId, ... }] } döner
				const checkoutGroupData =
					orderResponse?.data?.data ?? orderResponse?.data ?? {};
				const checkoutGroupId: string | null =
					checkoutGroupData?.checkoutGroupId ?? null;
				const orderId =
					checkoutGroupData?.orders?.[0]?.orderId ??
					checkoutGroupData?.orderId ??
					null;

				if (!checkoutGroupId || !orderId) {
					toast.error(
						locale === 'en'
							? 'Order was created but could not start payment. Please go to My Orders to complete payment.'
							: 'Sipariş oluşturuldu ancak ödeme başlatılamadı. Lütfen Siparişlerim sayfasından ödemeyi tamamlayın.',
					);
					setIsLoading(false);
					router.push('/profile/orders');
					return;
				}

				if (orderId) {
					// Grup ödemesi: tek ödeme gruptaki tüm siparişleri kapsar
					try {
						const paymentResponse = isAuthenticated
							? await paymentsApi.initiateGroup(checkoutGroupId, paymentProvider)
							: await paymentsApi.initiateGroupGuest(
									checkoutGroupId,
									paymentProvider,
								);
						const paymentData = paymentResponse.data;
						const hasSession = isAuthenticated || !!authToken;

						if (!directProductId) {
							await clearCart();
						}

						// TEK ödeme yüzeyi: misafir + üye aynı site-içi kart formuna gider.
						if (paymentData.paymentId) {
							router.push(
								`/payment/${paymentData.paymentId}${hasSession ? '' : '?guest=true'}`,
							);
							return;
						} else if (paymentData.paymentUrl) {
							window.location.href = paymentData.paymentUrl;
							return;
						} else {
							throw new Error(
								locale === 'en'
									? 'Failed to initiate payment'
									: 'Ödeme başlatılamadı',
							);
						}
					} catch (paymentError: any) {
						const msg = paymentError.response?.data?.message ?? '';
						const stockoutKeywords = [
							'satışta değil',
							'stokta yok',
							'stokta bulunmamaktadır',
							'başkası tarafından',
							'başka alıcıya satıldı',
						];
						const isStockout =
							(paymentError.response?.status === 400 ||
								paymentError.response?.status === 409) &&
							typeof msg === 'string' &&
							stockoutKeywords.some((kw) =>
								msg.toLowerCase().includes(kw.toLowerCase()),
							);
						const stockoutProductId =
							paymentError.response?.data?.productId ||
							checkoutItems[0]?.productId;
						if (isStockout && stockoutProductId) {
							router.push(`/products/unavailable/${stockoutProductId}`);
							return;
						}
						toast.error(
							msg ||
								(locale === 'en'
									? 'Failed to initiate payment. Please try again.'
									: 'Ödeme başlatılamadı. Lütfen tekrar deneyin.'),
						);
						return;
					}
				}
			}

			// Beklenmeyen durum: sipariş oluştu ama ödeme adımına düşülemedi.
			toast.error(
				locale === 'en'
					? 'Please complete payment from My Orders.'
					: 'Lütfen ödemeyi Siparişlerim sayfasından tamamlayın.',
			);
			router.push('/profile/orders');
		} catch (error: any) {
			toast.error(error.response?.data?.message || t('checkout.orderFailed'));
		} finally {
			setIsLoading(false);
		}
	};

	return {
		t,
		locale,
		router,
		isMounted,
		isAuthenticated,
		user,
		directProductId,
		existingOrderId,
		step,
		goToStep,
		nextStep,
		isLoading,
		// items / pricing
		checkoutItems,
		subtotal,
		quote,
		quoteLoading,
		shippingCost,
		shippingLoading,
		couponDiscount,
		grandTotal,
		appliedCouponCode,
		// addresses
		addresses,
		selectedAddressId,
		setSelectedAddressId,
		showAddressForm,
		setShowAddressForm,
		newAddress,
		setNewAddress,
		newAddressPhoneCountryCode,
		setNewAddressPhoneCountryCode,
		// billing
		billingSameAsShipping,
		setBillingSameAsShipping,
		selectedBillingAddressId,
		setSelectedBillingAddressId,
		newBillingAddress,
		setNewBillingAddress,
		billingAddressPhoneCountryCode,
		setBillingAddressPhoneCountryCode,
		// guest
		guestName,
		setGuestName,
		guestEmail,
		setGuestEmail,
		guestPhone,
		setGuestPhone,
		guestPhoneCountryCode,
		setGuestPhoneCountryCode,
		guestEmailVerificationCode,
		setGuestEmailVerificationCode,
		guestOtpSending,
		guestOtpSentForEmail,
		guestOtpModalOpen,
		setGuestOtpModalOpen,
		guestOtpInputRef,
		requestGuestCheckoutOtp,
		confirmGuestOtpModal,
		// actions
		addressStepValid,
		handleAddressStepContinue,
		handleAddAddress,
		handleCheckout,
	};
}

type CheckoutValue = ReturnType<typeof useCheckoutValue>;

const CheckoutContext = createContext<CheckoutValue | null>(null);

export function CheckoutProvider({ children }: { children: ReactNode }) {
	const value = useCheckoutValue();
	return (
		<CheckoutContext.Provider value={value}>
			{children}
		</CheckoutContext.Provider>
	);
}

export function useCheckout() {
	const ctx = useContext(CheckoutContext);
	if (!ctx)
		throw new Error('useCheckout must be used within a CheckoutProvider');
	return ctx;
}
