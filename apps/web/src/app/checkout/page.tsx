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
  const { items: cartItems, subtotal: cartSubtotal, clearCart } = useCartStore();
  const { user, isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();
  
  // Direct buy mode (from URL param)
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
  
  // Coupon code state
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    name: string;
    discountAmount: number;
    type: string;
    value: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Phone formatting helper
  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    // Limit to 10 digits
    const limited = digits.slice(0, 10);
    // Format as XXX XXX XX XX
    if (limited.length <= 3) return limited;
    if (limited.length <= 6) return `${limited.slice(0, 3)} ${limited.slice(3)}`;
    if (limited.length <= 8) return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`;
    return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6, 8)} ${limited.slice(8)}`;
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    return formatted;
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

  // Get checkout items (either from cart or direct buy). Cart API returns effectivePrice, originalPrice, productTitle; normalize to CheckoutItem.
  const checkoutItems: CheckoutItem[] = directProduct
    ? [directProduct]
    : cartItems.map((item: { id: string; productId: string; productTitle: string; effectivePrice: number; originalPrice?: number; productImage: string | null; sellerId: string; sellerName: string }) => ({
        id: item.id,
        productId: item.productId,
        title: item.productTitle,
        price: item.effectivePrice,
        originalPrice: item.originalPrice != null && item.originalPrice > item.effectivePrice ? item.originalPrice : undefined,
        imageUrl: item.productImage || 'https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün',
        seller: { id: item.sellerId, displayName: item.sellerName },
      }));
  const subtotal = Number((directProduct ? directProduct.price : cartSubtotal) ?? 0);
  const discountAmount = appliedCoupon?.discountAmount || 0;
  const grandTotal = Math.max(0, subtotal - discountAmount + shippingCost);

  // Apply coupon code
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError(locale === 'en' ? 'Please enter a coupon code' : 'Lütfen kupon kodu girin');
      return;
    }
    
    setCouponLoading(true);
    setCouponError(null);
    
    try {
      const response = await api.post('/discounts/validate', {
        code: couponCode.trim(),
        cartItems: directProduct
          ? [{ productId: directProduct.productId, quantity: 1 }]
          : cartItems.map((item: { productId: string; quantity: number }) => ({ productId: item.productId, quantity: item.quantity })),
      });
      
      if (response.data.isValid && response.data.discount) {
        setAppliedCoupon({
          code: response.data.discount.code,
          name: response.data.discount.name,
          discountAmount: response.data.discount.estimatedDiscount,
          type: response.data.discount.type,
          value: response.data.discount.value,
        });
        setCouponCode('');
        toast.success(locale === 'en' ? 'Coupon applied!' : 'Kupon uygulandı!');
      } else {
        setCouponError(response.data.error || (locale === 'en' ? 'Invalid coupon' : 'Geçersiz kupon'));
      }
    } catch (error: any) {
      setCouponError(error.response?.data?.message || (locale === 'en' ? 'Failed to apply coupon' : 'Kupon uygulanamadı'));
    } finally {
      setCouponLoading(false);
    }
  };
  
  // Remove applied coupon
  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
  };

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
      console.error('Failed to fetch saved cards:', error);
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
        console.error('Failed to calculate shipping:', error);
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
        imageUrl: product.images?.[0]?.url || product.images?.[0] || 'https://placehold.co/96x96/f3f4f6/9ca3af?text=Ürün',
        seller: {
          id: product.sellerId || product.seller?.id,
          displayName: product.seller?.displayName || (locale === 'en' ? 'Seller' : 'Satıcı'),
        },
      });
    } catch (error) {
      console.error('Failed to fetch product:', error);
      toast.error(t('product.loadFailed'));
      router.push('/listings');
    }
  };

  const fetchAddresses = async () => {
    try {
      const response = await addressesApi.getAll();
      const addressList = response.data?.addresses || response.data?.data || response.data || [];
      const validAddresses = Array.isArray(addressList) ? addressList : [];
      setAddresses(validAddresses);
      // Select default address
      const defaultAddr = validAddresses.find((a: Address) => a.isDefault);
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
      } else if (validAddresses.length > 0) {
        setSelectedAddressId(validAddresses[0].id);
      } else {
        // No addresses - automatically show the address form
        setShowAddressForm(true);
      }
    } catch (error) {
      console.error('Failed to fetch addresses:', error);
      setAddresses([]);
      // On error, show address form so user can still checkout
      setShowAddressForm(true);
    }
  };

  const handleAddAddress = async () => {
    if (!newAddress.fullName || !newAddress.phone || !newAddress.city || !newAddress.district || !newAddress.address) {
      toast.error(t('common.fillAllFields'));
      return;
    }

    try {
      const response = await addressesApi.create({
        title: newAddress.title || (locale === 'en' ? 'Home' : 'Ev'),
        fullName: newAddress.fullName,
        phone: newAddress.phone,
        city: newAddress.city,
        district: newAddress.district,
        address: newAddress.address,
        zipCode: newAddress.zipCode || undefined,
        isDefault: addresses.length === 0, // Make first address default
      });

      const createdAddress = response.data?.address || response.data;
      if (createdAddress && createdAddress.id) {
        setAddresses([...addresses, createdAddress]);
        setSelectedAddressId(createdAddress.id);
        setShowAddressForm(false);
        // Reset but keep user's name and phone for next time
        setNewAddress({ 
          fullName: user?.displayName || '', 
          phone: user?.phone || '', 
          city: '', 
          district: '', 
          address: '', 
          zipCode: '' 
        });
        toast.success(locale === 'en' ? 'Address added' : 'Adres eklendi');
      } else {
        toast.error(locale === 'en' ? 'Failed to add address' : 'Adres eklenemedi');
      }
    } catch (error: any) {
      console.error('Failed to add address:', error);
      toast.error(error.response?.data?.message || t('checkout.addressAddError'));
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
      
      console.log('=== CHECKOUT DEBUG ===');
      console.log('isAuthenticated:', isAuthenticated);
      console.log('selectedAddressId:', selectedAddressId);
      console.log('addresses.length:', addresses.length);
      console.log('hasSavedAddress:', hasSavedAddress);
      console.log('newAddress:', JSON.stringify(newAddress, null, 2));
      console.log('hasFormAddress:', hasFormAddress);
      console.log('showAddressForm:', showAddressForm);
      
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
        
        shippingAddress = {
          fullName: newAddress.fullName,
          phone: addressPhone,
          city: newAddress.city,
          district: newAddress.district,
          address: newAddress.address,
          zipCode: newAddress.zipCode || undefined,
        };
        contactEmail = email;
        contactPhone = phone;
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
              couponCode?: string;
            } = {
              productId: item.productId,
              ...(appliedCoupon && { couponCode: appliedCoupon.code }),
            };
            
            if (validAddressId) {
              payload.shippingAddressId = validAddressId;
            } else if (shippingAddress) {
              // Validate all required fields are not empty
              if (!shippingAddress.fullName?.trim()) {
                throw new Error('Teslimat adresi için ad soyad gereklidir');
              }
              if (!shippingAddress.phone?.trim()) {
                throw new Error('Teslimat adresi için telefon gereklidir');
              }
              if (!shippingAddress.city?.trim()) {
                throw new Error('Teslimat adresi için şehir gereklidir');
              }
              if (!shippingAddress.district?.trim()) {
                throw new Error('Teslimat adresi için ilçe gereklidir');
              }
              if (!shippingAddress.address?.trim()) {
                throw new Error('Teslimat adresi için açık adres gereklidir');
              }
              // Remove spaces from phone number for API
              const cleanPhone = shippingAddress.phone.replace(/\s/g, '');
              // Add +90 prefix if not present
              const formattedPhone = cleanPhone.startsWith('+90') ? cleanPhone : 
                                     cleanPhone.startsWith('0') ? '+9' + cleanPhone : '+90' + cleanPhone;
              
              payload.shippingAddress = {
                fullName: shippingAddress.fullName.trim(),
                phone: formattedPhone,
                city: shippingAddress.city.trim(),
                district: shippingAddress.district.trim(),
                address: shippingAddress.address.trim(),
                zipCode: shippingAddress.zipCode?.trim() || undefined,
              };
            } else {
              throw new Error(locale === 'en' ? 'Shipping address not found' : 'Teslimat adresi bulunamadı');
            }
            
            console.log('DirectBuy payload:', JSON.stringify(payload, null, 2));
            orderResponse = await ordersApi.directBuy(payload);
          } else {
            // Guest user: use guest checkout endpoint
            // Format phone numbers properly
            const cleanContactPhone = contactPhone?.replace(/\s/g, '') || '';
            const formattedContactPhone = cleanContactPhone.startsWith('+90') ? cleanContactPhone : 
                                          cleanContactPhone.startsWith('0') ? '+9' + cleanContactPhone : '+90' + cleanContactPhone;
            
            const cleanAddrPhone = shippingAddress?.phone?.replace(/\s/g, '') || '';
            const formattedAddrPhone = cleanAddrPhone.startsWith('+90') ? cleanAddrPhone : 
                                       cleanAddrPhone.startsWith('0') ? '+9' + cleanAddrPhone : '+90' + cleanAddrPhone;
            
            const guestPayload = {
              productId: item.productId,
              email: contactEmail,
              phone: formattedContactPhone,
              guestName: contactName,
              shippingAddress: {
                ...shippingAddress,
                phone: formattedAddrPhone,
              },
            };
            
            console.log('Guest checkout payload:', JSON.stringify(guestPayload, null, 2));
            orderResponse = await ordersApi.createGuest(guestPayload);
          }
        } catch (orderError: any) {
          console.error('Order creation failed:', orderError);
          console.error('Full error response:', orderError.response?.data);
          console.error('Request config:', orderError.config);
          
          // Extract error message from various possible locations
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
          
          console.error('Extracted error message:', errorMessage);
          toast.error(errorMessage);
          throw orderError;
        }

        const orderId = orderResponse.data.id || orderResponse.data.orderId || orderResponse.data.order?.id;
        
        if (orderId) {
          // Initiate payment for the order (same endpoint works for both auth and guest)
          try {
            const paymentResponse = await paymentsApi.initiate(orderId, paymentProvider);
            const paymentData = paymentResponse.data;

            // Clear cart before redirecting to payment
            if (!directProductId) {
              await clearCart();
            }

            // Redirect to payment page
            if (paymentData.paymentUrl) {
              // For Iyzico, redirect directly to payment URL
              if (paymentProvider === 'iyzico' && paymentData.paymentUrl.startsWith('http')) {
                window.location.href = paymentData.paymentUrl;
                return;
              }
              // For PayTR or other cases, go to payment page
              const paymentPageUrl = isAuthenticated 
                ? `/payment/${paymentData.paymentId}`
                : `/payment/${paymentData.paymentId}?guest=true`;
              router.push(paymentPageUrl);
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
            console.error('Payment initiation failed:', paymentError);
            toast.error(
              paymentError.response?.data?.message || 
              (locale === 'en' ? 'Failed to initiate payment. Please try again.' : 'Ödeme başlatılamadı. Lütfen tekrar deneyin.')
            );
            throw paymentError;
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
          console.error('Failed to save card:', cardError);
          // Don't block checkout for card save failure
        }
      }

      toast.success(t('checkout.orderSuccess'));
      if (!directProductId) {
        await clearCart();
      }
      
      // Redirect based on auth status
      if (isAuthenticated) {
        router.push('/orders');
      } else {
        router.push(`/checkout/success?email=${encodeURIComponent(contactEmail)}`);
      }
    } catch (error: any) {
      console.error('Checkout failed:', error);
      toast.error(error.response?.data?.message || t('checkout.orderFailed'));
    } finally {
      setIsLoading(false);
    }
  };

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
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
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
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                  step >= s.step
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
                            className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${
                              selectedAddressId === addr.id
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
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 space-y-4">
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
                            <span className="inline-flex items-center px-3 text-gray-600 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg">
                              +90
                            </span>
                            <input
                              type="tel"
                              placeholder="5XX XXX XX XX"
                              value={newAddress.phone}
                              onChange={(e) => setNewAddress({ ...newAddress, phone: handlePhoneChange(e.target.value) })}
                              maxLength={13}
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
                        className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-primary-500 hover:text-primary-500 transition-colors flex items-center justify-center gap-2"
                      >
                        <PlusIcon className="w-5 h-5" />
                        {t('checkout.addNewAddress')}
                      </button>
                    )}
                  </>
                ) : (
                  /* Guest Checkout Form */
                  <div className="space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
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
                      <span className="inline-flex items-center px-3 text-gray-600 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg">
                        +90
                      </span>
                      <input
                        type="tel"
                        placeholder="5XX XXX XX XX *"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(handlePhoneChange(e.target.value))}
                        maxLength={13}
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
                        <span className="inline-flex items-center px-3 text-gray-600 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-sm">
                          +90
                        </span>
                        <input
                          type="tel"
                          placeholder="5XX XXX XX XX"
                          value={newAddress.phone}
                          onChange={(e) => setNewAddress({ ...newAddress, phone: handlePhoneChange(e.target.value) })}
                          maxLength={13}
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

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    disabled={
                      isAuthenticated 
                        ? !selectedAddressId && !(newAddress.fullName && newAddress.phone && newAddress.city && newAddress.district && newAddress.address)
                        : !(guestName && guestEmail && guestPhone && newAddress.fullName && newAddress.city && newAddress.district && newAddress.address)
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
                      className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        selectedCarrier === 'aras'
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
                      className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        selectedCarrier === 'yurtici'
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
                    className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      paymentProvider === 'iyzico'
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
                    className={`block p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      paymentProvider === 'paytr'
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
                <div className="mt-6 p-4 bg-white border border-gray-200 rounded-xl">
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
                            className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                              !useNewCard && selectedSavedCard === card.id
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
                              <span className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded-full">
                                Varsayılan
                              </span>
                            )}
                          </label>
                        ))}
                        
                        {/* New Card Option */}
                        <label
                          className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                            useNewCard
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
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
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
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
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
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
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
                        className="w-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                      />
                    </div>
                  )}
                  
                  <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                    <ShieldCheckIcon className="w-4 h-4 text-green-500" />
                    256-bit SSL ile şifrelenmiş güvenli ödeme
                  </div>
                </div>

                {/* Invoice Info */}
                <div className="mt-6 p-4 bg-gray-50 rounded-xl">
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
                    <div key={item.id} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
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
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
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
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">{locale === 'en' ? 'Payment Method' : 'Ödeme Yöntemi'}</p>
                  <p className="font-medium">
                    {paymentProvider === 'iyzico' 
                      ? (locale === 'en' ? 'Pay with iyzico' : 'iyzico ile Öde') 
                      : (locale === 'en' ? 'Pay with PayTR' : 'PayTR ile Öde')}
                  </p>
                </div>

                {/* Security Notice */}
                <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg mb-6">
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
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
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

              {/* Coupon Code Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <TagIcon className="w-4 h-4 inline-block mr-1" />
                  {locale === 'en' ? 'Coupon Code' : 'Kupon Kodu'}
                </label>
                
                {appliedCoupon ? (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div>
                      <p className="font-medium text-green-800">{appliedCoupon.code}</p>
                      <p className="text-xs text-green-600">{appliedCoupon.name}</p>
                      <p className="text-sm font-semibold text-green-700">
                        -{appliedCoupon.discountAmount.toFixed(2)} TL
                      </p>
                    </div>
                    <button
                      onClick={handleRemoveCoupon}
                      className="p-1 hover:bg-green-100 rounded-full transition-colors"
                      title={locale === 'en' ? 'Remove coupon' : 'Kuponu kaldır'}
                    >
                      <XMarkIcon className="w-5 h-5 text-green-700" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        setCouponError(null);
                      }}
                      placeholder={locale === 'en' ? 'Enter code' : 'Kod girin'}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {couponLoading ? '...' : (locale === 'en' ? 'Apply' : 'Uygula')}
                    </button>
                  </div>
                )}
                
                {couponError && (
                  <p className="mt-2 text-xs text-red-600">{couponError}</p>
                )}
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{locale === 'en' ? 'Subtotal' : 'Ara Toplam'}</span>
                  <span className="font-medium">{(subtotal ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                </div>
                
                {/* Discount Breakdown */}
                {appliedCoupon && (
                  <div className="flex justify-between text-green-600">
                    <span>{locale === 'en' ? 'Discount' : 'İndirim'} ({appliedCoupon.code})</span>
                    <span className="font-medium">-{appliedCoupon.discountAmount.toFixed(2)} TL</span>
                  </div>
                )}
                
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
                
                {/* Total Savings */}
                {discountAmount > 0 && (
                  <div className="p-2 bg-green-50 rounded-lg">
                    <p className="text-xs text-green-700 font-medium text-center">
                      {locale === 'en' ? 'You save' : 'Kazancınız'}: {discountAmount.toFixed(2)} TL 🎉
                    </p>
                  </div>
                )}
                
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
