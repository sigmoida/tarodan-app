'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  MapPinIcon,
  PlusIcon,
  CreditCardIcon,
  TruckIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
  TagIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { ordersApi, paymentsApi, listingsApi, addressesApi, api } from '@/lib/api';
import { getProductEffectivePrice, getProductOriginalPriceForDisplay, isProductOnSaleDisplay } from '@/lib/productPrice';
import CityDistrictSelector from '@/components/CityDistrictSelector';
import { useTranslation } from '@/i18n';

interface Address {
  id: string;
  title?: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
  isDefault?: boolean;
}

interface CheckoutItem {
  id: string;
  productId: string;
  title: string;
  price: number;
  /** Üstü çizili eski fiyat (satıcı indirimi varsa) */
  originalPrice?: number;
  imageUrl: string;
  seller: {
    id: string;
    displayName: string;
  };
}

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items: cartItems, offlineItems, subtotal: cartSubtotal, clearCart } = useCartStore();
  const { user, isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Guest checkout is allowed - no redirect to login

  const directProductId = searchParams.get('productId');

  const [step, setStep] = useState(1); // 1: Address, 2: Payment, 3: Confirm
  const [isLoading, setIsLoading] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<'iyzico' | 'paytr'>('iyzico');
  const [directProduct, setDirectProduct] = useState<CheckoutItem | null>(null);

  // Guest checkout fields
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhoneCountryCode, setGuestPhoneCountryCode] = useState('+90');

  // New address form
  const [newAddress, setNewAddress] = useState<Omit<Address, 'id'>>({
    title: '',
    fullName: '',
    phone: '',
    city: '',
    district: '',
    address: '',
    zipCode: '',
  });
  const [newAddressPhoneCountryCode, setNewAddressPhoneCountryCode] = useState('+90');

  // Billing address: same as shipping (default) or different
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [selectedBillingAddressId, setSelectedBillingAddressId] = useState<string | null>(null);
  const [newBillingAddress, setNewBillingAddress] = useState<Omit<Address, 'id'>>({
    title: '',
    fullName: '',
    phone: '',
    city: '',
    district: '',
    address: '',
    zipCode: '',
  });
  const [billingAddressPhoneCountryCode, setBillingAddressPhoneCountryCode] = useState('+90');

  // Common country codes
  const countryCodes = [
    { code: '+90', country: 'TR', name: 'Türkiye' },
    { code: '+1', country: 'US', name: 'ABD/Kanada' },
    { code: '+44', country: 'GB', name: 'İngiltere' },
    { code: '+49', country: 'DE', name: 'Almanya' },
    { code: '+33', country: 'FR', name: 'Fransa' },
    { code: '+39', country: 'IT', name: 'İtalya' },
    { code: '+34', country: 'ES', name: 'İspanya' },
    { code: '+31', country: 'NL', name: 'Hollanda' },
    { code: '+32', country: 'BE', name: 'Belçika' },
    { code: '+41', country: 'CH', name: 'İsviçre' },
    { code: '+43', country: 'AT', name: 'Avusturya' },
    { code: '+46', country: 'SE', name: 'İsveç' },
    { code: '+47', country: 'NO', name: 'Norveç' },
    { code: '+45', country: 'DK', name: 'Danimarka' },
    { code: '+358', country: 'FI', name: 'Finlandiya' },
    { code: '+7', country: 'RU', name: 'Rusya' },
    { code: '+971', country: 'AE', name: 'BAE' },
    { code: '+966', country: 'SA', name: 'Suudi Arabistan' },
    { code: '+20', country: 'EG', name: 'Mısır' },
    { code: '+81', country: 'JP', name: 'Japonya' },
    { code: '+86', country: 'CN', name: 'Çin' },
    { code: '+82', country: 'KR', name: 'Güney Kore' },
    { code: '+61', country: 'AU', name: 'Avustralya' },
    { code: '+64', country: 'NZ', name: 'Yeni Zelanda' },
  ];

  // Shipping cost state
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<string>('aras');

  // Card info state (for UI display - actual payment handled by iyzico/paytr)
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [saveCard, setSaveCard] = useState(false);

  // Coupon removed

  // Phone formatting helper - format based on country code
  const formatPhoneNumber = (value: string, countryCode: string = '+90'): string => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // For Turkey (+90), format as XXX XXX XX XX (10 digits)
    if (countryCode === '+90') {
      const limited = digits.slice(0, 10);
      if (limited.length <= 3) return limited;
      if (limited.length <= 6) return `${limited.slice(0, 3)} ${limited.slice(3)}`;
      if (limited.length <= 8) return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`;
      return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6, 8)} ${limited.slice(8)}`;
    }
    
    // For other countries, just return digits (no formatting)
    return digits;
  };

  const handlePhoneChange = (value: string, countryCode: string = '+90') => {
    const formatted = formatPhoneNumber(value, countryCode);
    return formatted;
  };

  // Get full phone number with country code
  const getFullPhoneNumber = (phone: string, countryCode: string): string => {
    const cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.startsWith(countryCode)) {
      return cleanPhone;
    }
    return countryCode + cleanPhone;
  };

  // Saved cards state
  const [savedCards, setSavedCards] = useState<Array<{
    id: string;
    cardBrand: string;
    lastFour: string;
    expiryMonth: number;
    expiryYear: number;
    isDefault: boolean;
  }>>([]);
  const [selectedSavedCard, setSelectedSavedCard] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(true);

  // Get checkout items: direct buy > authenticated cart > offline/guest cart
  const checkoutItems: CheckoutItem[] = directProduct
    ? [directProduct]
    : cartItems.length > 0
      ? cartItems.map((item: { id: string; productId: string; productTitle: string; effectivePrice: number; originalPrice?: number; productImage: string | null; sellerId: string; sellerName: string }) => ({
        id: item.id,
        productId: item.productId,
        title: item.productTitle,
        price: item.effectivePrice,
        originalPrice: item.originalPrice != null && item.originalPrice > item.effectivePrice ? item.originalPrice : undefined,
        imageUrl: item.productImage || 'https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün',
        seller: { id: item.sellerId, displayName: item.sellerName },
      }))
      : offlineItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        title: item.title,
        price: item.price,
        imageUrl: item.imageUrl || 'https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün',
        seller: { id: item.seller.id, displayName: item.seller.displayName },
      }));
  const subtotal = Number((directProduct ? directProduct.price : cartSubtotal) ?? 0);
  const grandTotal = Math.max(0, subtotal + shippingCost);


  useEffect(() => {
    if (directProductId) {
      fetchDirectProduct();
    }
    if (isAuthenticated) {
      fetchAddresses();
      fetchSavedCards();
    }
  }, [directProductId, isAuthenticated]);

  const fetchSavedCards = async () => {
    try {
      const response = await api.get('/payments/methods');
      const cards = response.data?.methods || response.data || [];
      setSavedCards(cards);
      // Select default card if exists
      const defaultCard = cards.find((c: any) => c.isDefault);
      if (defaultCard) {
        setSelectedSavedCard(defaultCard.id);
        setUseNewCard(false);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch saved cards:', error);
      setSavedCards([]);
    }
  };

  // Pre-populate new address form with user's profile info
  useEffect(() => {
    if (isAuthenticated && user) {
      setNewAddress(prev => ({
        ...prev,
        fullName: prev.fullName || user.displayName || '',
        phone: prev.phone || user.phone || '',
      }));
    }
  }, [isAuthenticated, user]);

  // Calculate shipping cost when address changes
  useEffect(() => {
    const calculateShipping = async () => {
      let city = '';

      if (isAuthenticated && selectedAddressId) {
        const selectedAddr = addresses.find(a => a.id === selectedAddressId);
        city = selectedAddr?.city || '';
      } else if (!isAuthenticated && newAddress.city) {
        city = newAddress.city;
      }

      if (!city || checkoutItems.length === 0) {
        setShippingCost(0);
        return;
      }

      setShippingLoading(true);
      try {
        // For authenticated users, try API first
        if (isAuthenticated) {
          const response = await api.get('/shipping/rates', {
            params: {
              city,
              carrier: selectedCarrier,
              weight: 0.5,
            }
          }).catch(() => null);

          if (response?.data?.rate) {
            setShippingCost(response.data.rate);
            setShippingLoading(false);
            return;
          }
        }

        // Fallback (guest users or API failure): Calculate locally
        const istanbulCities = ['İstanbul', 'istanbul', 'ISTANBUL'];
        const baseRate = istanbulCities.some(c => city.toLowerCase().includes(c.toLowerCase())) ? 34.90 : 49.90;
        const carrierExtra = selectedCarrier === 'yurtici' ? 5 : 0;
        setShippingCost(baseRate + carrierExtra);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') console.error('Failed to calculate shipping:', error);
        setShippingCost(49.90); // Default fallback
      } finally {
        setShippingLoading(false);
      }
    };

    calculateShipping();
  }, [selectedAddressId, addresses, newAddress.city, selectedCarrier, checkoutItems.length, isAuthenticated]);

  const fetchDirectProduct = async () => {
    try {
      const response = await listingsApi.getOne(directProductId!);
      const product = response.data.product || response.data;
      const effectivePrice = getProductEffectivePrice(product);
      const onSale = isProductOnSaleDisplay(product);
      const originalPriceForDisplay = onSale ? getProductOriginalPriceForDisplay(product) : undefined;
      setDirectProduct({
        id: `direct-${product.id}`,
        productId: product.id,
        title: product.title,
        price: effectivePrice,
        originalPrice: originalPriceForDisplay != null && originalPriceForDisplay > effectivePrice ? originalPriceForDisplay : undefined,
        imageUrl: product.images?.[0]?.cardUrl ?? product.images?.[0]?.detailUrl ?? product.images?.[0]?.url ?? (typeof product.images?.[0] === 'string' ? product.images[0] : null) ?? 'https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün',
        seller: {
          id: product.sellerId || product.seller?.id,
          displayName: product.seller?.displayName || (locale === 'en' ? 'Seller' : 'Satıcı'),
        },
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch product:', error);
      toast.error(t('product.loadFailed'));
      router.push('/listings');
    }
  };

  const fetchAddresses = async (selectAddressId?: string) => {
    try {
      const response = await addressesApi.getAll();
      const addressList = response.data?.addresses || response.data?.data || response.data || [];
      const validAddresses = Array.isArray(addressList) ? addressList : [];
      setAddresses(validAddresses);
      
      // If a specific address ID is provided, select it
      if (selectAddressId) {
        const targetAddr = validAddresses.find((a: Address) => a.id === selectAddressId);
        if (targetAddr) {
          setSelectedAddressId(targetAddr.id);
          return;
        }
      }
      
      // Select default address
      const defaultAddr = validAddresses.find((a: Address) => a.isDefault);
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
      } else if (validAddresses.length > 0) {
        // If no default, select the most recently created (last in array, assuming backend returns in creation order)
        setSelectedAddressId(validAddresses[validAddresses.length - 1].id);
      } else {
        // No addresses - automatically show the address form
        setSelectedAddressId(null);
        setShowAddressForm(true);
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to fetch addresses:', error);
        console.error('Error response:', error.response?.data);
        console.error('Error status:', error.response?.status);
      }
      // Only show error toast if it's not a 401 (unauthorized) - that's handled by interceptor
      if (error.response?.status !== 401) {
        // Don't show toast for address fetch errors - user can still add new address
      }
      setAddresses([]);
      // On error, show address form so user can still checkout
      setShowAddressForm(true);
    }
  };

  const handleAddAddress = async () => {
    const title = (newAddress.title ?? '').trim();
    if (!title || !newAddress.fullName || !newAddress.phone || !newAddress.city || !newAddress.district || !newAddress.address) {
      toast.error(locale === 'en' ? 'Please fill all required fields including address title (e.g. Home, Work)' : 'Adres başlığı dahil tüm zorunlu alanları doldurun (örn: Ev, İş)');
      return;
    }

    try {
      // Format phone number with country code
      const formattedPhone = getFullPhoneNumber(newAddress.phone, newAddressPhoneCountryCode);
      
      const response = await addressesApi.create({
        title,
        fullName: newAddress.fullName,
        phone: formattedPhone,
        city: newAddress.city,
        district: newAddress.district,
        address: newAddress.address,
        zipCode: newAddress.zipCode || undefined,
        isDefault: addresses.length === 0, // Make first address default
      });

      // Handle different response structures
      // Backend returns the address object directly in response.data
      // Check if response.data itself is an address object (has id field)
      // Only use response.data.address if it's an object with an id, not a string
      let createdAddress: any = null;
      
      if (response.data) {
        // First, check if response.data is the address object (has id field)
        if (response.data.id && typeof response.data === 'object' && !Array.isArray(response.data)) {
          createdAddress = response.data;
        }
        // Otherwise, check if response.data.address exists and is an object with id
        else if (response.data.address && typeof response.data.address === 'object' && response.data.address.id) {
          createdAddress = response.data.address;
        }
        // Fallback: use response.data if it looks like an address object
        else if (typeof response.data === 'object' && !Array.isArray(response.data) && response.data.id) {
          createdAddress = response.data;
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[Address Creation] API Response:', response.data);
        console.log('[Address Creation] Extracted address:', createdAddress);
        console.log('[Address Creation] Has ID:', !!createdAddress?.id);
      }

      // Validate that we have a valid address with an ID
      if (createdAddress && createdAddress.id && typeof createdAddress.id === 'string') {
        // Close the form first
        setShowAddressForm(false);
        
        // Reset form but keep user's name and phone for next time
        setNewAddress({
          title: '',
          fullName: user?.displayName || '',
          phone: user?.phone || '',
          city: '',
          district: '',
          address: '',
          zipCode: ''
        });

        // Refresh the address list from server to ensure we have the latest data
        // This will also automatically select the new address (or default if it's set as default)
        await fetchAddresses(createdAddress.id);
        
        toast.success(locale === 'en' ? 'Address added' : 'Adres eklendi');
      } else {
        // Response structure doesn't match expected format
        if (process.env.NODE_ENV === 'development') {
          console.error('[Address Creation] Invalid response structure:', {
            responseData: response.data,
            extractedAddress: createdAddress,
            hasId: !!createdAddress?.id
          });
        }
        // Even if response structure is unexpected, try to refresh addresses
        // The address might have been created on the backend
        await fetchAddresses();
        toast.error(locale === 'en' ? 'Address may have been added, but could not verify. Please refresh the page.' : 'Adres eklenmiş olabilir ancak doğrulanamadı. Lütfen sayfayı yenileyin.');
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Address Creation] Error:', error);
        console.error('[Address Creation] Error response:', error.response?.data);
        console.error('[Address Creation] Error status:', error.response?.status);
      }
      
      // Check if it's a validation error (400) - address might still be created in some edge cases
      // For other errors, show the error message
      const errorMessage = error.response?.data?.message || error.message || t('checkout.addressAddError');
      
      // If it's a 400 error, the address creation likely failed due to validation
      // But refresh addresses anyway in case it was a partial success
      if (error.response?.status === 400) {
        await fetchAddresses();
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
      const hasSavedAddress = isAuthenticated && selectedAddressId && addresses.length > 0;
      // Check if form has all required fields including phone
      const hasFormAddress = newAddress.fullName && newAddress.phone && newAddress.city && newAddress.district && newAddress.address;

      if (process.env.NODE_ENV === 'development') {
        console.log('=== CHECKOUT DEBUG ===');
        console.log('isAuthenticated:', isAuthenticated);
        console.log('selectedAddressId:', selectedAddressId);
        console.log('addresses.length:', addresses.length);
        console.log('hasSavedAddress:', hasSavedAddress);
        console.log('newAddress:', JSON.stringify(newAddress, null, 2));
        console.log('hasFormAddress:', hasFormAddress);
        console.log('showAddressForm:', showAddressForm);
      }

      // Get shipping address - prefer saved address for logged-in users, otherwise use form
      let shippingAddress: any;
      let contactEmail: string;
      let contactPhone: string;
      let contactName: string;

      if (hasSavedAddress) {
        // Use saved address
        const selectedAddress = addresses.find(a => a.id === selectedAddressId);
        if (!selectedAddress) {
          toast.error(t('checkout.addressNotFound'));
          setIsLoading(false);
          return;
        }

        // Validate phone is available
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
        // Use form address (guest or logged-in user without saved addresses)
        const email = isAuthenticated ? user?.email : guestEmail;
        const phone = isAuthenticated ? (user?.phone || newAddress.phone) : (guestPhone || newAddress.phone);
        const name = isAuthenticated ? (user?.displayName || newAddress.fullName) : (guestName || newAddress.fullName);

        // Validate required contact info for guest users
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

        // Ensure address has a valid phone number
        const addressPhone = newAddress.phone?.trim() || phone;
        if (!addressPhone) {
          toast.error(t('checkout.enterAddressPhone'));
          setIsLoading(false);
          return;
        }

        // Format phone numbers with country codes
        const formattedAddressPhone = getFullPhoneNumber(addressPhone, newAddressPhoneCountryCode);
        const formattedContactPhone = isAuthenticated 
          ? (user?.phone || formattedAddressPhone)
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
        // No address available - provide specific error message
        if (isAuthenticated) {
          if (addresses.length === 0) {
            toast.error(t('checkout.clickAddNewAddress'));
          } else if (!selectedAddressId) {
            toast.error(t('checkout.selectShippingAddress'));
          } else {
            toast.error(t('checkout.invalidAddressAddNew'));
          }
        } else {
          // Guest user - check which fields are missing
          const missingFields = [];
          if (!newAddress.fullName) missingFields.push(locale === 'en' ? 'Full Name' : 'Ad Soyad');
          if (!newAddress.phone) missingFields.push(locale === 'en' ? 'Phone' : 'Telefon');
          if (!newAddress.city) missingFields.push(locale === 'en' ? 'City' : 'Şehir');
          if (!newAddress.district) missingFields.push(locale === 'en' ? 'District' : 'İlçe');
          if (!newAddress.address) missingFields.push(locale === 'en' ? 'Address' : 'Açık Adres');

          if (missingFields.length > 0) {
            toast.error(locale === 'en' ? `Please fill in: ${missingFields.join(', ')}` : `Lütfen şu alanları doldurun: ${missingFields.join(', ')}`);
          } else {
            toast.error(t('checkout.enterShippingAddress'));
          }
        }
        setIsLoading(false);
        return;
      }

      // Create orders - use different endpoint based on auth status
      for (const item of checkoutItems) {
        let orderResponse;

        try {
          if (isAuthenticated) {
            // Authenticated user: use directBuy endpoint
            // Only send shippingAddressId if it's a valid UUID, otherwise send shippingAddress object
            const validAddressId = hasSavedAddress && selectedAddressId && selectedAddressId.trim() !== ''
              ? selectedAddressId
              : undefined;

            // Build request payload
            const payload: {
              productId: string;
              shippingAddressId?: string;
              shippingAddress?: typeof shippingAddress;
              billingAddressId?: string;
              billingAddress?: { fullName: string; phone: string; city: string; district: string; address: string; zipCode?: string };
            } = {
              productId: item.productId,
            };

            if (validAddressId) {
              payload.shippingAddressId = validAddressId;
            }
            if (!billingSameAsShipping && newBillingAddress.fullName && newBillingAddress.city && newBillingAddress.address) {
              const cleanBillingPhone = newBillingAddress.phone?.replace(/\s/g, '') || '';
              const hasBillingCountryCode = countryCodes.some(cc => cleanBillingPhone.startsWith(cc.code));
              const formattedBillingPhone = hasBillingCountryCode 
                ? cleanBillingPhone 
                : getFullPhoneNumber(cleanBillingPhone, billingAddressPhoneCountryCode);
              payload.billingAddress = {
                fullName: newBillingAddress.fullName.trim(),
                phone: formattedBillingPhone,
                city: newBillingAddress.city.trim(),
                district: newBillingAddress.district.trim(),
                address: newBillingAddress.address.trim(),
                zipCode: newBillingAddress.zipCode?.trim() || undefined,
              };
            } else if (!billingSameAsShipping && selectedBillingAddressId && selectedBillingAddressId !== validAddressId) {
              payload.billingAddressId = selectedBillingAddressId;
            }
            if (!validAddressId) {
              // Use shippingAddress from above, or fallback to newAddress if form was filled (edge case)
              const addr = shippingAddress || (hasFormAddress && newAddress.fullName && newAddress.phone && newAddress.city && newAddress.district && newAddress.address
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
                if (!addr.fullName?.trim()) throw new Error('Teslimat adresi için ad soyad gereklidir');
                if (!addr.phone?.trim()) throw new Error('Teslimat adresi için telefon gereklidir');
                if (!addr.city?.trim()) throw new Error('Teslimat adresi için şehir gereklidir');
                if (!addr.district?.trim()) throw new Error('Teslimat adresi için ilçe gereklidir');
                if (!addr.address?.trim()) throw new Error('Teslimat adresi için açık adres gereklidir');
                // Format phone - if it already has a country code, use it; otherwise add the selected country code
                const cleanPhone = addr.phone.replace(/\s/g, '');
                const hasCountryCode = countryCodes.some(cc => cleanPhone.startsWith(cc.code));
                const formattedPhone = hasCountryCode 
                  ? cleanPhone 
                  : getFullPhoneNumber(cleanPhone, newAddressPhoneCountryCode);
                payload.shippingAddress = {
                  fullName: addr.fullName.trim(),
                  phone: formattedPhone,
                  city: addr.city.trim(),
                  district: addr.district.trim(),
                  address: addr.address.trim(),
                  zipCode: addr.zipCode?.trim() || undefined,
                };
              } else {
                toast.error(locale === 'en' ? 'Please select or enter a shipping address' : 'Lütfen bir teslimat adresi seçin veya girin');
                setIsLoading(false);
                return;
              }
            }

            if (process.env.NODE_ENV === 'development') {
              console.log('DirectBuy payload:', JSON.stringify(payload, null, 2));
            }
            orderResponse = await ordersApi.directBuy(payload);
          } else {
            // Guest user: use guest checkout endpoint
            // Format phone numbers properly with country codes
            const cleanContactPhone = contactPhone?.replace(/\s/g, '') || '';
            const hasContactCountryCode = countryCodes.some(cc => cleanContactPhone.startsWith(cc.code));
            const formattedContactPhone = hasContactCountryCode 
              ? cleanContactPhone 
              : getFullPhoneNumber(cleanContactPhone, guestPhoneCountryCode);

            const cleanAddrPhone = shippingAddress?.phone?.replace(/\s/g, '') || '';
            const hasAddrCountryCode = countryCodes.some(cc => cleanAddrPhone.startsWith(cc.code));
            const formattedAddrPhone = hasAddrCountryCode 
              ? cleanAddrPhone 
              : getFullPhoneNumber(cleanAddrPhone, newAddressPhoneCountryCode);

            const guestPayload: {
              productId: string;
              email: string;
              phone: string;
              guestName: string;
              shippingAddress: { fullName: string; phone: string; city: string; district: string; address: string; zipCode?: string };
              billingAddress?: { fullName: string; phone: string; city: string; district: string; address: string; zipCode?: string };
            } = {
              productId: item.productId,
              email: contactEmail,
              phone: formattedContactPhone,
              guestName: contactName,
              shippingAddress: {
                ...shippingAddress,
                phone: formattedAddrPhone,
              },
            };
            if (!billingSameAsShipping && newBillingAddress.fullName && newBillingAddress.city && newBillingAddress.address) {
              const cleanBillingPhone = newBillingAddress.phone?.replace(/\s/g, '') || '';
              const hasBillingCountryCode = countryCodes.some(cc => cleanBillingPhone.startsWith(cc.code));
              const formattedBillingPhone = hasBillingCountryCode 
                ? cleanBillingPhone 
                : getFullPhoneNumber(cleanBillingPhone, billingAddressPhoneCountryCode);
              guestPayload.billingAddress = {
                fullName: newBillingAddress.fullName.trim(),
                phone: formattedBillingPhone,
                city: newBillingAddress.city.trim(),
                district: newBillingAddress.district.trim(),
                address: newBillingAddress.address.trim(),
                zipCode: newBillingAddress.zipCode?.trim() || undefined,
              };
            }

            orderResponse = await ordersApi.createGuest(guestPayload);
          }
        } catch (orderError: any) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Order creation failed:', orderError);
          }
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
          toast.error(errorMessage);
          throw orderError;
        }

        // Backend directBuy returns orderId; guest checkout returns id; support both
        const orderId =
          orderResponse?.data?.orderId ??
          orderResponse?.data?.id ??
          orderResponse?.data?.order?.id ??
          null;

        if (!orderId) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Checkout: order created but no orderId in response', orderResponse?.data);
          }
          toast.error(locale === 'en' ? 'Order was created but could not start payment. Please go to My Orders to complete payment.' : 'Sipariş oluşturuldu ancak ödeme başlatılamadı. Lütfen Siparişlerim sayfasından ödemeyi tamamlayın.');
          setIsLoading(false);
          router.push('/orders');
          return;
        }

        if (orderId) {
          // For Iyzico, use Direct API with card info from the form
          if (paymentProvider === 'iyzico') {
            try {
              // Validate card info only when using NEW card
              if (useNewCard || savedCards.length === 0) {
                if (!cardName || !cardNumber || !cardExpiry || !cardCvc) {
                  toast.error(locale === 'en' ? 'Please fill in all card information' : 'Lütfen tüm kart bilgilerini doldurun');
                  setIsLoading(false);
                  return;
                }
              }

              let month: string | undefined;
              let year: string | undefined;
              // Parse expiry only when using new card (saved card does not need expiry in payload)
              if (useNewCard || savedCards.length === 0) {
                const expiryNormalized = cardExpiry.replace(/\s/g, '').replace(/-/g, '/');
                const expiryParts = expiryNormalized.includes('/')
                  ? expiryNormalized.split('/')
                  : expiryNormalized.length >= 4
                    ? [expiryNormalized.slice(0, 2), expiryNormalized.slice(2)]
                    : [];
                month = expiryParts[0]?.trim();
                const rawYear = expiryParts[1]?.trim() || '';
                year = rawYear.length === 2 ? '20' + rawYear : rawYear;
                if (!month || !year || month.length !== 2 || Number(month) < 1 || Number(month) > 12) {
                  toast.error(locale === 'en' ? 'Please enter a valid expiry date (MM/YY)' : 'Geçerli bir son kullanma tarihi girin (AA/YY)');
                  setIsLoading(false);
                  return;
                }
              }

              const directPayload: any = {
                orderId,
                saveCard: isAuthenticated && saveCard,
              };

              // Use saved card token or new card details
              if (!useNewCard && selectedSavedCard && savedCards.length > 0) {
                directPayload.cardToken = selectedSavedCard;
              } else {
                if (!month || !year) {
                  toast.error(locale === 'en' ? 'Please enter a valid expiry date (MM/YY)' : 'Geçerli bir son kullanma tarihi girin (AA/YY)');
                  setIsLoading(false);
                  return;
                }
                directPayload.card = {
                  cardHolderName: cardName.trim(),
                  cardNumber: cardNumber.replace(/\s/g, ''),
                  expireMonth: month,
                  expireYear: year,
                  cvc: cardCvc,
                };
              }

              const directResponse = await paymentsApi.processDirect(directPayload);
              const directData = directResponse.data;
              // LOG: Tam yanıtı görüp neden 3DS açılmadığını anlamak için
              console.log('[ÖDEME] API yanıtı (tam):', { ...directData, htmlContentLength: directData?.htmlContent?.length, htmlContentPreview: directData?.htmlContent?.substring?.(0, 80) });

              // API her zaman Base64 gönderiyor – içerik < ile başlamıyorsa decode et
              let htmlContent = directData?.htmlContent;
              if (typeof htmlContent !== 'string') {
                toast.error('Ödeme yanıtı geçersiz.');
                setIsLoading(false);
                return;
              }
              htmlContent = htmlContent.trim();

              // Base64 ise decode et (isBase64 flag'e güvenme; içerik < ile başlamıyorsa decode dene)
              if (!htmlContent.startsWith('<')) {
                try {
                  htmlContent = atob(htmlContent);
                  // Çift encode olmuşsa bir kez daha
                  if (htmlContent && !htmlContent.trim().startsWith('<') && /^[A-Za-z0-9+/=]+$/.test(htmlContent.substring(0, 100).replace(/\s/g, ''))) {
                    htmlContent = atob(htmlContent);
                  }
                } catch (e) {
                  console.error('Base64 decode hatası', e);
                  toast.error('Ödeme sayfası yüklenemedi (Decode hatası)');
                  setIsLoading(false);
                  return;
                }
              }
              if (htmlContent) htmlContent = htmlContent.trim();

              // HTML mi? (<!DOCTYPE veya <html veya <?xml)
              const hasHtml = htmlContent.length > 0 && (htmlContent.toLowerCase().startsWith('<!') || htmlContent.toLowerCase().startsWith('<html') || htmlContent.toLowerCase().startsWith('<?'));
              if (hasHtml) {
                // Clear cart before showing 3D Secure
                if (!directProductId) {
                  await clearCart();
                }
                setIsLoading(false);
                // Open 3D Secure page in current window (bank SMS form)
                document.open();
                document.write(htmlContent);
                document.close();
                return;
              }
              if (!htmlContent || htmlContent.trim().length === 0) {
                console.error('[ÖDEME] HTML yok. API keys:', Object.keys(directData || {}));
                toast.error(directData?.message || (locale === 'en' ? 'Payment page could not be loaded.' : 'Ödeme sayfası yüklenemedi. API HTML dönmedi.'));
                setIsLoading(false);
                return;
              }
              // İçerik var ama HTML değil – gerçek sebebi logla ve göster
              console.error('[ÖDEME] 3DS HTML sayılmadı. Decode sonrası ilk 400 karakter:', htmlContent.substring(0, 400));
              console.error('[ÖDEME] API status:', directData?.status, 'Keys:', Object.keys(directData || {}));
              const errMsg = directData?.message || (locale === 'en' ? '3D Secure response was not valid HTML. See console (F12) for details.' : '3D Secure yanıtı HTML değil. Detay için F12 ile konsolu açın.');
              toast.error(errMsg);
              setIsLoading(false);
              return;
            } catch (paymentError: any) {
              const apiMessage = paymentError?.response?.data?.message;
              const apiError = paymentError?.response?.data;
              console.error('[ÖDEME] Hata (tam):', { message: apiMessage, status: paymentError?.response?.status, data: apiError });
              toast.error(apiMessage || paymentError?.message || (locale === 'en' ? 'Payment failed.' : 'Ödeme başarısız.'));
              setIsLoading(false);
              return;
            }
          } else {
            // PayTR - use existing hosted checkout flow
            try {
              const paymentResponse = await paymentsApi.initiate(orderId, paymentProvider);
              const paymentData = paymentResponse.data;

              // Clear cart before redirecting to payment
              if (!directProductId) {
                await clearCart();
              }

              if (paymentData.paymentUrl) {
                window.location.href = paymentData.paymentUrl;
                return;
              } else if (paymentData.paymentId) {
                const paymentPageUrl = isAuthenticated
                  ? `/payment/${paymentData.paymentId}`
                  : `/payment/${paymentData.paymentId}?guest=true`;
                router.push(paymentPageUrl);
                return;
              } else {
                throw new Error(locale === 'en' ? 'Failed to initiate payment' : 'Ödeme başlatılamadı');
              }
            } catch (paymentError: any) {
              if (process.env.NODE_ENV === 'development') {
                console.error('Payment initiation failed:', paymentError);
              }
              toast.error(
                paymentError.response?.data?.message ||
                (locale === 'en' ? 'Failed to initiate payment. Please try again.' : 'Ödeme başlatılamadı. Lütfen tekrar deneyin.')
              );
              throw paymentError;
            }
          }
        }
      }

      // Save card if requested
      if (isAuthenticated && saveCard && useNewCard && cardNumber && cardExpiry) {
        try {
          const [month, year] = cardExpiry.split('/');
          await api.post('/payments/methods', {
            cardNumber: cardNumber.replace(/\s/g, ''),
            cardHolder: cardName,
            expiryMonth: parseInt(month),
            expiryYear: parseInt('20' + year),
            cvv: cardCvc,
          });
          toast.success(locale === 'en' ? 'Card information saved!' : 'Kart bilgileriniz kaydedildi!');
        } catch (cardError) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Failed to save card:', cardError);
          }
        }
      }

      // Bu satıra sadece sipariş oluşturuldu ama orderId alınamadığında veya ödeme adımı atlanırsa düşmemeli.
      // Ödeme her zaman yukarıdaki döngüde (iyzico 3DS veya PayTR redirect) ile tamamlanır veya return edilir.
      // Eğer buraya düşüldüyse beklenmeyen durum: kullanıcıyı siparişlere yönlendir, ödeme yapılmamış olabilir.
      if (process.env.NODE_ENV === 'development') {
        console.warn('Checkout: reached end of loop without payment redirect – possible missing orderId or payment step');
      }
      toast.error(locale === 'en' ? 'Please complete payment from My Orders.' : 'Lütfen ödemeyi Siparişlerim sayfasından tamamlayın.');
      router.push('/orders');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Checkout failed:', error);
      }
      toast.error(error.response?.data?.message || t('checkout.orderFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Wait for client mount before rendering dynamic content
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (checkoutItems.length === 0 && !directProductId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <TruckIcon className="w-20 h-20 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('cart.empty')}</h2>
          <p className="text-gray-600 mb-6">
            {t('cart.emptyDesc')}
          </p>
          <Link href="/listings" className="btn-primary">
            {t('cart.browseListings')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-sm transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6" />
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{t('checkout.title')}</h1>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {[
            { step: 1, label: t('checkout.step1') },
            { step: 2, label: t('checkout.step2') },
            { step: 3, label: t('checkout.step3') },
          ].map((s, index) => (
            <div key={s.step} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-sm flex items-center justify-center font-semibold transition-colors ${step >= s.step
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-200 text-gray-500'
                  }`}
              >
                {step > s.step ? <CheckCircleIcon className="w-6 h-6" /> : s.step}
              </div>
              <span className={`ml-2 ${step >= s.step ? 'text-gray-900' : 'text-gray-500'}`}>
                {s.label}
              </span>
              {index < 2 && (
                <div className={`w-16 h-1 mx-4 ${step > s.step ? 'bg-primary-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Address */}
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-6"
              >
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <MapPinIcon className="w-6 h-6 text-primary-500" />
                  {t('checkout.shippingAddress')}
                </h2>

                {isAuthenticated ? (
                  <>
                    {/* Saved Addresses */}
                    {addresses.length > 0 && (
                      <div className="space-y-3 mb-4">
                        {addresses.map((addr) => (
                          <label
                            key={addr.id}
                            className={`block p-4 border-2 rounded cursor-pointer transition-all ${selectedAddressId === addr.id
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-gray-300'
                              }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="radio"
                                name="address"
                                value={addr.id}
                                checked={selectedAddressId === addr.id}
                                onChange={() => setSelectedAddressId(addr.id)}
                                className="mt-1"
                              />
                              <div>
                                <p className="font-semibold">{addr.fullName}</p>
                                <p className="text-gray-600 text-sm">{addr.phone}</p>
                                <p className="text-gray-600 text-sm">
                                  {addr.address}, {addr.district}/{addr.city}
                                </p>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Add New Address */}
                    {showAddressForm ? (
                      <div className="border-2 border-dashed border-gray-200 rounded p-4 space-y-4">
                        <input
                          type="text"
                          placeholder={locale === 'en' ? 'Address Title (e.g. Home, Work)' : 'Adres Başlığı (örn: Ev, İş)'}
                          value={newAddress.title || ''}
                          onChange={(e) => setNewAddress({ ...newAddress, title: e.target.value })}
                          className="input"
                        />
                        <div className="grid sm:grid-cols-2 gap-4">
                          <input
                            type="text"
                            placeholder={t('checkout.fullName')}
                            value={newAddress.fullName}
                            onChange={(e) => setNewAddress({ ...newAddress, fullName: e.target.value })}
                            className="input"
                          />
                          <div className="flex">
                            <select
                              value={newAddressPhoneCountryCode}
                              onChange={(e) => setNewAddressPhoneCountryCode(e.target.value)}
                              className="inline-flex items-center px-3 text-gray-600 bg-gray-100 border border-r-0 border-gray-300 rounded-l text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                            >
                              {countryCodes.map((cc) => (
                                <option key={cc.code} value={cc.code}>
                                  {cc.code} {cc.country}
                                </option>
                              ))}
                            </select>
                            <input
                              type="tel"
                              placeholder={newAddressPhoneCountryCode === '+90' ? '5XX XXX XX XX' : 'Telefon'}
                              value={newAddress.phone}
                              onChange={(e) => setNewAddress({ ...newAddress, phone: handlePhoneChange(e.target.value, newAddressPhoneCountryCode) })}
                              maxLength={newAddressPhoneCountryCode === '+90' ? 13 : 20}
                              className="input rounded-l-none"
                            />
                          </div>
                        </div>
                        <CityDistrictSelector
                          city={newAddress.city}
                          district={newAddress.district}
                          onCityChange={(city) => setNewAddress(prev => ({ ...prev, city, district: '' }))}
                          onDistrictChange={(district) => setNewAddress(prev => ({ ...prev, district }))}
                          cityPlaceholder={t('common.selectCity') + ' *'}
                          districtPlaceholder={t('common.selectDistrict') + ' *'}
                        />
                        <textarea
                          placeholder={t('common.openAddress')}
                          rows={3}
                          value={newAddress.address}
                          onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                          className="input"
                        />
                        <div className="flex gap-2">
                          <button onClick={handleAddAddress} className="btn-primary">
                            {t('checkout.addressSaved')}
                          </button>
                          <button
                            onClick={() => setShowAddressForm(false)}
                            className="btn-secondary"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddressForm(true)}
                        className="w-full p-4 border-2 border-dashed border-gray-300 rounded text-gray-500 hover:border-primary-500 hover:text-primary-500 transition-colors flex items-center justify-center gap-2"
                      >
                        <PlusIcon className="w-5 h-5" />
                        {t('checkout.addNewAddress')}
                      </button>
                    )}
                  </>
                ) : (
                  /* Guest Checkout Form */
                  <div className="space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                      <p className="text-sm text-yellow-800">
                        {locale === 'en' ? 'You are shopping without logging in. Enter your email to track your order.' : 'Üye olmadan alışveriş yapıyorsunuz. Siparişinizi takip etmek için e-posta adresinizi girin.'}
                      </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <input
                        type="text"
                        placeholder={t('checkout.guestName') + ' *'}
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className="input"
                        required
                      />
                      <input
                        type="email"
                        placeholder={t('checkout.guestEmail') + ' *'}
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className="input"
                        required
                      />
                    </div>
                    <div className="flex">
                      <select
                        value={guestPhoneCountryCode}
                        onChange={(e) => setGuestPhoneCountryCode(e.target.value)}
                        className="inline-flex items-center px-3 text-gray-600 bg-gray-100 border border-r-0 border-gray-300 rounded-l text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                      >
                        {countryCodes.map((cc) => (
                          <option key={cc.code} value={cc.code}>
                            {cc.code} {cc.country}
                          </option>
                        ))}
                      </select>
                      <input
                        type="tel"
                        placeholder={guestPhoneCountryCode === '+90' ? '5XX XXX XX XX *' : 'Telefon *'}
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(handlePhoneChange(e.target.value, guestPhoneCountryCode))}
                        maxLength={guestPhoneCountryCode === '+90' ? 13 : 20}
                        className="input rounded-l-none flex-1"
                        required
                      />
                    </div>

                    <hr className="my-4" />
                    <h3 className="font-semibold">{t('checkout.shippingAddress')}</h3>

                    <input
                      type="text"
                      placeholder={locale === 'en' ? 'Address Title (e.g. Home, Work)' : 'Adres Başlığı (örn: Ev, İş)'}
                      value={newAddress.title || ''}
                      onChange={(e) => setNewAddress({ ...newAddress, title: e.target.value })}
                      className="input"
                    />
                    <div className="grid sm:grid-cols-2 gap-4">
                      <input
                        type="text"
                        placeholder={t('checkout.fullName') + ' *'}
                        value={newAddress.fullName}
                        onChange={(e) => setNewAddress({ ...newAddress, fullName: e.target.value })}
                        className="input"
                      />
                      <div className="flex">
                        <select
                          value={newAddressPhoneCountryCode}
                          onChange={(e) => setNewAddressPhoneCountryCode(e.target.value)}
                          className="inline-flex items-center px-3 text-gray-600 bg-gray-100 border border-r-0 border-gray-300 rounded-l text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                        >
                          {countryCodes.map((cc) => (
                            <option key={cc.code} value={cc.code}>
                              {cc.code} {cc.country}
                            </option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          placeholder={newAddressPhoneCountryCode === '+90' ? '5XX XXX XX XX' : 'Telefon'}
                          value={newAddress.phone}
                          onChange={(e) => setNewAddress({ ...newAddress, phone: handlePhoneChange(e.target.value, newAddressPhoneCountryCode) })}
                          maxLength={newAddressPhoneCountryCode === '+90' ? 13 : 20}
                          className="input rounded-l-none flex-1"
                        />
                      </div>
                    </div>
                    <CityDistrictSelector
                      city={newAddress.city}
                      district={newAddress.district}
                      onCityChange={(city) => setNewAddress(prev => ({ ...prev, city, district: '' }))}
                      onDistrictChange={(district) => setNewAddress(prev => ({ ...prev, district }))}
                      cityPlaceholder={t('common.selectCity') + ' *'}
                      districtPlaceholder={t('common.selectDistrict') + ' *'}
                    />
                    <textarea
                      placeholder={t('common.openAddress') + ' *'}
                      rows={3}
                      value={newAddress.address}
                      onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                      className="input"
                    />

                    <Link href="/login" className="text-primary-500 hover:underline text-sm">
                      Üye misiniz? Giriş yapın →
                    </Link>
                  </div>
                )}

                {/* Billing address: same as shipping or different */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <ShieldCheckIcon className="w-5 h-5 text-primary-500" />
                    {t('checkout.billingAddress')}
                  </h3>
                  <label className="flex items-center gap-2 cursor-pointer mb-3">
                    <input
                      type="radio"
                      name="billingSame"
                      checked={billingSameAsShipping}
                      onChange={() => {
                        setBillingSameAsShipping(true);
                        setSelectedBillingAddressId(null);
                      }}
                      className="text-primary-500"
                    />
                    <span>{t('checkout.billingSameAsShippingLabel')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="billingSame"
                      checked={!billingSameAsShipping}
                      onChange={() => setBillingSameAsShipping(false)}
                      className="text-primary-500"
                    />
                    <span>{t('checkout.differentBilling')}</span>
                  </label>

                  {!billingSameAsShipping && (
                    <div className="mt-4 p-4 bg-gray-50 rounded space-y-4">
                      <p className="text-sm text-gray-600">{t('checkout.enterBillingAddress')}</p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder={t('checkout.fullName') + ' *'}
                          value={newBillingAddress.fullName}
                          onChange={(e) => setNewBillingAddress(prev => ({ ...prev, fullName: e.target.value }))}
                          className="input"
                        />
                        <div className="flex">
                          <select
                            value={billingAddressPhoneCountryCode}
                            onChange={(e) => setBillingAddressPhoneCountryCode(e.target.value)}
                            className="inline-flex items-center px-3 text-gray-600 bg-gray-100 border border-r-0 border-gray-300 rounded-l text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                          >
                            {countryCodes.map((cc) => (
                              <option key={cc.code} value={cc.code}>
                                {cc.code} {cc.country}
                              </option>
                            ))}
                          </select>
                          <input
                            type="tel"
                            placeholder={billingAddressPhoneCountryCode === '+90' ? '5XX XXX XX XX' : 'Telefon'}
                            value={newBillingAddress.phone}
                            onChange={(e) => setNewBillingAddress(prev => ({ ...prev, phone: handlePhoneChange(e.target.value, billingAddressPhoneCountryCode) }))}
                            maxLength={billingAddressPhoneCountryCode === '+90' ? 13 : 20}
                            className="input rounded-l-none flex-1"
                          />
                        </div>
                      </div>
                      <CityDistrictSelector
                        city={newBillingAddress.city}
                        district={newBillingAddress.district}
                        onCityChange={(city) => setNewBillingAddress(prev => ({ ...prev, city, district: '' }))}
                        onDistrictChange={(district) => setNewBillingAddress(prev => ({ ...prev, district }))}
                        cityPlaceholder={t('common.selectCity')}
                        districtPlaceholder={t('common.selectDistrict')}
                      />
                      <textarea
                        placeholder={t('common.openAddress') + ' *'}
                        rows={2}
                        value={newBillingAddress.address}
                        onChange={(e) => setNewBillingAddress(prev => ({ ...prev, address: e.target.value }))}
                        className="input"
                      />
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    disabled={
                      isAuthenticated
                        ? (!selectedAddressId && !(newAddress.fullName && newAddress.phone && newAddress.city && newAddress.district && newAddress.address)) ||
                        (!billingSameAsShipping && !(newBillingAddress.fullName && newBillingAddress.city && newBillingAddress.address))
                        : !(guestName && guestEmail && guestPhone && newAddress.fullName && newAddress.city && newAddress.district && newAddress.address) ||
                        (!billingSameAsShipping && !(newBillingAddress.fullName && newBillingAddress.city && newBillingAddress.address))
                    }
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Devam Et
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Payment */}
            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-6"
              >
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <CreditCardIcon className="w-6 h-6 text-primary-500" />
                  {locale === 'en' ? 'Payment Method' : 'Ödeme Yöntemi'}
                </h2>

                {/* Carrier Selection */}
                <div className="mb-6">
                  <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <TruckIcon className="w-5 h-5 text-primary-500" />
                    Kargo Firması
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`block p-4 border-2 rounded cursor-pointer transition-all ${selectedCarrier === 'aras'
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="carrier"
                          value="aras"
                          checked={selectedCarrier === 'aras'}
                          onChange={() => setSelectedCarrier('aras')}
                        />
                        <span className="font-medium">Aras Kargo</span>
                      </div>
                    </label>
                    <label
                      className={`block p-4 border-2 rounded cursor-pointer transition-all ${selectedCarrier === 'yurtici'
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="carrier"
                          value="yurtici"
                          checked={selectedCarrier === 'yurtici'}
                          onChange={() => setSelectedCarrier('yurtici')}
                        />
                        <span className="font-medium">Yurtiçi Kargo</span>
                      </div>
                    </label>
                  </div>
                  {shippingLoading && (
                    <p className="text-sm text-gray-500 mt-2">Kargo ücreti hesaplanıyor...</p>
                  )}
                </div>

                <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <CreditCardIcon className="w-5 h-5 text-primary-500" />
                  {locale === 'en' ? 'Payment Method' : 'Ödeme Yöntemi'}
                </h3>
                <div className="space-y-3">
                  <label
                    className={`block p-4 border-2 rounded cursor-pointer transition-all ${paymentProvider === 'iyzico'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        value="iyzico"
                        checked={paymentProvider === 'iyzico'}
                        onChange={() => setPaymentProvider('iyzico')}
                      />
                      <div className="flex-1">
                        <p className="font-semibold">{locale === 'en' ? 'Pay with iyzico' : 'iyzico ile Öde'}</p>
                        <p className="text-gray-600 text-sm">
                          {locale === 'en' ? 'Pay with credit card, debit card or iyzico balance' : 'Kredi kartı, banka kartı veya iyzico bakiyesi ile ödeme'}
                        </p>
                      </div>
                      <div className="text-2xl">💳</div>
                    </div>
                  </label>

                  <label
                    className={`block p-4 border-2 rounded cursor-pointer transition-all ${paymentProvider === 'paytr'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        value="paytr"
                        checked={paymentProvider === 'paytr'}
                        onChange={() => setPaymentProvider('paytr')}
                      />
                      <div className="flex-1">
                        <p className="font-semibold">{locale === 'en' ? 'Pay with PayTR' : 'PayTR ile Öde'}</p>
                        <p className="text-gray-600 text-sm">
                          {locale === 'en' ? 'Secure payment with credit card' : 'Kredi kartı ile güvenli ödeme'}
                        </p>
                      </div>
                      <div className="text-2xl">🏦</div>
                    </div>
                  </label>
                </div>

                {/* Card Information */}
                <div className="mt-6 p-4 bg-white border border-gray-200 rounded">
                  <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <CreditCardIcon className="w-5 h-5 text-primary-500" />
                    {locale === 'en' ? 'Card Information' : 'Kart Bilgileri'}
                  </h3>

                  {/* Saved Cards Section */}
                  {isAuthenticated && savedCards.length > 0 && (
                    <div className="mb-6">
                      <p className="text-sm font-medium text-gray-700 mb-3">{locale === 'en' ? 'My Saved Cards' : 'Kayıtlı Kartlarım'}</p>
                      <div className="space-y-2">
                        {savedCards.map((card) => (
                          <label
                            key={card.id}
                            className={`flex items-center gap-3 p-3 border-2 rounded cursor-pointer transition-all ${!useNewCard && selectedSavedCard === card.id
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-gray-300'
                              }`}
                          >
                            <input
                              type="radio"
                              name="savedCard"
                              checked={!useNewCard && selectedSavedCard === card.id}
                              onChange={() => {
                                setSelectedSavedCard(card.id);
                                setUseNewCard(false);
                              }}
                              className="text-primary-500"
                            />
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">
                                {card.cardBrand} •••• {card.lastFour}
                              </p>
                              <p className="text-sm text-gray-500">
                                {card.expiryMonth.toString().padStart(2, '0')}/{card.expiryYear}
                              </p>
                            </div>
                            {card.isDefault && (
                              <span className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded-sm">
                                Varsayılan
                              </span>
                            )}
                          </label>
                        ))}

                        {/* New Card Option */}
                        <label
                          className={`flex items-center gap-3 p-3 border-2 rounded cursor-pointer transition-all ${useNewCard
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                            }`}
                        >
                          <input
                            type="radio"
                            name="savedCard"
                            checked={useNewCard}
                            onChange={() => setUseNewCard(true)}
                            className="text-primary-500"
                          />
                          <div className="flex items-center gap-2">
                            <PlusIcon className="w-5 h-5 text-gray-500" />
                            <span className="font-medium text-gray-900">Yeni Kart ile Öde</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* New Card Form - Show when no saved cards or new card selected */}
                  {(savedCards.length === 0 || useNewCard) && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {locale === 'en' ? 'Name on Card' : 'Kart Üzerindeki İsim'}
                        </label>
                        <input
                          type="text"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value.toUpperCase())}
                          placeholder="AD SOYAD"
                          className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {locale === 'en' ? 'Card Number' : 'Kart Numarası'}
                        </label>
                        <input
                          type="text"
                          value={cardNumber}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 16);
                            const formatted = value.replace(/(\d{4})(?=\d)/g, '$1 ');
                            setCardNumber(formatted);
                          }}
                          placeholder="0000 0000 0000 0000"
                          className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {locale === 'en' ? 'Expiry Date' : 'Son Kullanma Tarihi'}
                          </label>
                          <input
                            type="text"
                            value={cardExpiry}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                              if (value.length >= 2) {
                                setCardExpiry(value.slice(0, 2) + '/' + value.slice(2));
                              } else {
                                setCardExpiry(value);
                              }
                            }}
                            placeholder="AA/YY"
                            maxLength={5}
                            className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            CVV/CVC
                          </label>
                          <input
                            type="password"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 3))}
                            placeholder="•••"
                            maxLength={3}
                            className="w-full px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                          />
                        </div>
                      </div>

                      {isAuthenticated && (
                        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={saveCard}
                            onChange={(e) => setSaveCard(e.target.checked)}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          Bu kartı gelecekteki alışverişlerim için kaydet
                        </label>
                      )}
                    </div>
                  )}

                  {/* CVV for saved card */}
                  {!useNewCard && selectedSavedCard && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CVV/CVC (Güvenlik için tekrar girin)
                      </label>
                      <input
                        type="password"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 3))}
                        placeholder="•••"
                        maxLength={3}
                        className="w-32 px-4 py-3 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                      />
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                    <ShieldCheckIcon className="w-4 h-4 text-green-500" />
                    256-bit SSL ile şifrelenmiş güvenli ödeme
                  </div>
                </div>

                {/* Invoice Info */}
                <div className="mt-6 p-4 bg-gray-50 rounded">
                  <h3 className="font-medium text-gray-900 mb-2">Fatura Bilgisi</h3>
                  <p className="text-sm text-gray-600">
                    Ödeme tamamlandıktan sonra faturanız e-posta adresinize otomatik olarak gönderilecektir.
                    Kurumsal fatura için profil sayfanızdan vergi bilgilerinizi güncelleyebilirsiniz.
                  </p>
                </div>

                <div className="mt-6 flex justify-between">
                  <button onClick={() => setStep(1)} className="btn-secondary">
                    Geri
                  </button>
                  <button onClick={() => setStep(3)} className="btn-primary">
                    Devam Et
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Confirm */}
            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-6"
              >
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <CheckCircleIcon className="w-6 h-6 text-primary-500" />
                  {locale === 'en' ? 'Order Summary' : 'Sipariş Özeti'}
                </h2>

                {/* Order Items */}
                <div className="space-y-4 mb-6">
                  {checkoutItems.map((item) => (
                    <div key={item.id} className="flex gap-4 p-4 bg-gray-50 rounded">
                      <div className="w-16 h-16 rounded overflow-hidden bg-gray-200">
                        <Image
                          src={item.imageUrl}
                          alt={item.title}
                          width={64}
                          height={64}
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{item.title}</p>
                        <p className="text-sm text-gray-500">Satıcı: {item.seller.displayName}</p>
                      </div>
                      <div className="text-right">
                        {item.originalPrice != null && item.originalPrice > item.price && (
                          <p className="text-sm text-gray-400 line-through">
                            {item.originalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </p>
                        )}
                        <p className="font-bold text-primary-500">
                          {item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delivery Address */}
                {isAuthenticated && selectedAddressId && (
                  <div className="mb-6 p-4 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500 mb-1">{locale === 'en' ? 'Delivery Address' : 'Teslimat Adresi'}</p>
                    {(() => {
                      const addr = addresses.find((a) => a.id === selectedAddressId);
                      return addr ? (
                        <p className="font-medium">
                          {addr.fullName}, {addr.address}, {addr.district}/{addr.city}
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Payment Method */}
                <div className="mb-6 p-4 bg-gray-50 rounded">
                  <p className="text-sm text-gray-500 mb-1">{locale === 'en' ? 'Payment Method' : 'Ödeme Yöntemi'}</p>
                  <p className="font-medium">
                    {paymentProvider === 'iyzico'
                      ? (locale === 'en' ? 'Pay with iyzico' : 'iyzico ile Öde')
                      : (locale === 'en' ? 'Pay with PayTR' : 'PayTR ile Öde')}
                  </p>
                </div>

                {/* Security Notice */}
                <div className="flex items-start gap-3 p-4 bg-green-50 rounded mb-6">
                  <ShieldCheckIcon className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800">Güvenli Alışveriş</p>
                    <p className="text-sm text-green-700">
                      Ödemeniz şifreli olarak iletilir. Ürün elinize ulaşana kadar ödemeniz güvende tutulur.
                    </p>
                  </div>
                </div>

                <div className="flex justify-between">
                  <button onClick={() => setStep(2)} className="btn-secondary">
                    Geri
                  </button>
                  <button
                    onClick={handleCheckout}
                    disabled={isLoading}
                    className="btn-primary flex items-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        İşleniyor...
                      </>
                    ) : (
                      <>
                        <CreditCardIcon className="w-5 h-5" />
                        Onayla ve Öde (₺{grandTotal.toFixed(2)})
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-24">
              <h2 className="text-lg font-semibold mb-4">{locale === 'en' ? 'Order Summary' : 'Sipariş Özeti'}</h2>

              {/* Items Preview */}
              <div className="space-y-3 mb-4">
                {checkoutItems.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="w-12 h-12 rounded overflow-hidden bg-gray-100">
                      <Image
                        src={item.imageUrl}
                        alt={item.title}
                        width={48}
                        height={48}
                        className="object-cover w-full h-full"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.originalPrice != null && item.originalPrice > item.price && (
                        <p className="text-xs text-gray-400 line-through">
                          {item.originalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                        </p>
                      )}
                      <p className="text-sm text-gray-700 font-medium">
                        {item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                      </p>
                    </div>
                  </div>
                ))}
                {checkoutItems.length > 3 && (
                  <p className="text-sm text-gray-500">
                    +{checkoutItems.length - 3} ürün daha
                  </p>
                )}
              </div>

              <hr className="my-4" />

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{locale === 'en' ? 'Subtotal' : 'Ara Toplam'}</span>
                  <span className="font-medium">{(subtotal ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Kargo ({selectedCarrier === 'aras' ? 'Aras' : 'Yurtiçi'})</span>
                  <span className="font-medium">
                    {shippingLoading ? (
                      <span className="text-gray-400">Hesaplanıyor...</span>
                    ) : shippingCost > 0 ? (
                      `${shippingCost.toFixed(2)} TL`
                    ) : (
                      <span className="text-gray-400">Adres seçin</span>
                    )}
                  </span>
                </div>


                <hr />
                <div className="flex justify-between text-lg">
                  <span className="font-semibold">{locale === 'en' ? 'Total' : 'Toplam'}</span>
                  <span className="font-bold text-primary-500">
                    {shippingLoading ? (
                      <span className="text-gray-400">...</span>
                    ) : (
                      `${grandTotal.toFixed(2)} TL`
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
