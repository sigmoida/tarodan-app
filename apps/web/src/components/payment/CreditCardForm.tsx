'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCardIcon, LockClosedIcon, PlusIcon, TrashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { paymentsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

interface CreditCardFormProps {
    orderId: string;
    amount: number;
    onSuccess: (htmlContent?: string) => void;
    onCancel: () => void;
}

export default function CreditCardForm({ orderId, amount, onSuccess, onCancel }: CreditCardFormProps) {
    const { isAuthenticated, user } = useAuthStore();
    const [loading, setLoading] = useState(false);
    const [savedCards, setSavedCards] = useState<any[]>([]);
    const [selectedCardToken, setSelectedCardToken] = useState<string>('new');
    const [showNewCard, setShowNewCard] = useState(true);

    // Form State
    const [cardHolderName, setCardHolderName] = useState('');
    const [cardNumber, setCardNumber] = useState('');
    const [expireDate, setExpireDate] = useState('');
    const [cvc, setCvc] = useState('');
    const [saveCard, setSaveCard] = useState(false);
    const [cardAlias, setCardAlias] = useState('');

    useEffect(() => {
        if (isAuthenticated) {
            loadSavedCards();
        }
    }, [isAuthenticated]);

    const loadSavedCards = async () => {
        try {
            const res = await paymentsApi.getPaymentMethods();
            if (res.data && Array.isArray(res.data)) {
                setSavedCards(res.data);
                if (res.data.length > 0) {
                    setSelectedCardToken(res.data[0].cardToken);
                    setShowNewCard(false);
                }
            }
        } catch (error) {
            console.error('Failed to load saved cards', error);
        }
    };

    const formatCardNumber = (value: string) => {
        const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
        const matches = v.match(/\d{4,16}/g);
        const match = matches && matches[0] || '';
        const parts = [];
        for (let i = 0, len = match.length; i < len; i += 4) {
            parts.push(match.substring(i, i + 4));
        }
        if (parts.length) {
            return parts.join(' ');
        } else {
            return v;
        }
    };

    const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setCardNumber(formatCardNumber(val));
    };

    const handleExpireDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length >= 2) {
            val = val.substring(0, 2) + '/' + val.substring(2, 4);
        }
        setExpireDate(val.substring(0, 5));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            let payload: any = { orderId };

            if (showNewCard || selectedCardToken === 'new') {
                const [month, year] = expireDate.split('/');
                payload.card = {
                    cardHolderName,
                    cardNumber: cardNumber.replace(/\s/g, ''),
                    expireMonth: month,
                    expireYear: '20' + year,
                    cvc,
                    cardAlias: saveCard ? cardAlias : undefined,
                };
                payload.saveCard = saveCard;
            } else {
                payload.cardToken = selectedCardToken;
            }

            const res = await paymentsApi.processDirect(payload);

            if (res.data.status === 'success') {
                onSuccess(res.data.htmlContent);
            } else {
                toast.error('Ödeme başlatılamadı');
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCard = async (token: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Kartı silmek istediğinize emin misiniz?')) return;
        try {
            await paymentsApi.deletePaymentMethod(token);
            toast.success('Kart silindi');
            loadSavedCards();
            if (selectedCardToken === token) {
                setSelectedCardToken('new');
                setShowNewCard(true);
            }
        } catch (error) {
            toast.error('Kart silinemedi');
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-6 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <CreditCardIcon className="w-6 h-6 text-primary-600" />
                    Kredi / Banka Kartı ile Ödeme
                </h3>
                <div className="flex gap-2">
                    <span className="text-sm font-semibold text-gray-500 tracking-wide">PayTR</span>
                </div>
            </div>

            <div className="p-6">
                {/* Saved Cards Selection */}
                {savedCards.length > 0 && (
                    <div className="mb-8">
                        <h4 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wider">Kayıtlı Kartlarım</h4>
                        <div className="space-y-3">
                            {savedCards.map((card) => (
                                <div
                                    key={card.cardToken}
                                    onClick={() => {
                                        setSelectedCardToken(card.cardToken);
                                        setShowNewCard(false);
                                    }}
                                    className={`relative flex items-center p-4 border rounded-xl cursor-pointer transition-all ${selectedCardToken === card.cardToken
                                        ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500 ring-offset-1'
                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center mr-4 ${selectedCardToken === card.cardToken ? 'border-primary-600 bg-primary-600' : 'border-gray-300'
                                        }`}>
                                        {selectedCardToken === card.cardToken && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </div>

                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="font-semibold text-gray-800">{card.cardAlias}</span>
                                            <span className="text-xs px-2 py-0.5 bg-gray-200 rounded text-gray-600 font-mono">{card.cardFamily}</span>
                                        </div>
                                        <p className="text-sm text-gray-500 font-mono mt-1">
                                            **** **** **** {card.lastFourDigits}
                                        </p>
                                    </div>

                                    <button
                                        onClick={(e) => handleDeleteCard(card.cardToken, e)}
                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}

                            <div
                                onClick={() => {
                                    setSelectedCardToken('new');
                                    setShowNewCard(true);
                                }}
                                className={`flex items-center p-4 border border-dashed rounded-xl cursor-pointer transition-all ${selectedCardToken === 'new'
                                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                                    : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
                                    }`}
                            >
                                <PlusIcon className="w-5 h-5 mr-3" />
                                <span className="font-medium">Başka bir kart kullan</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* New Card Form */}
                <AnimatePresence mode="wait">
                    {showNewCard && (
                        <motion.form
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            onSubmit={handleSubmit}
                            className="space-y-5"
                        >
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Kart Üzerindeki İsim</label>
                                <input
                                    type="text"
                                    required
                                    value={cardHolderName}
                                    onChange={(e) => setCardHolderName(e.target.value.toUpperCase())}
                                    placeholder="AD SOYAD"
                                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Kart Numarası</label>
                                <div className="relative">
                                    <input
                                        type="tel"
                                        required
                                        maxLength={19}
                                        value={cardNumber}
                                        onChange={handleCardNumberChange}
                                        placeholder="0000 0000 0000 0000"
                                        className="w-full px-4 py-3 pl-12 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow outline-none font-mono"
                                    />
                                    <CreditCardIcon className="w-6 h-6 text-gray-400 absolute left-3 top-3" />
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="w-1/2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Son Kullanma Tarihi</label>
                                    <input
                                        type="tel"
                                        required
                                        maxLength={5}
                                        value={expireDate}
                                        onChange={handleExpireDateChange}
                                        placeholder="MM/YY"
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow outline-none font-mono text-center"
                                    />
                                </div>
                                <div className="w-1/2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">CVC / CVV</label>
                                    <div className="relative">
                                        <input
                                            type="tel"
                                            required
                                            maxLength={4}
                                            value={cvc}
                                            onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                                            placeholder="123"
                                            className="w-full px-4 py-3 pr-10 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow outline-none font-mono text-center"
                                        />
                                        <LockClosedIcon className="w-5 h-5 text-gray-400 absolute right-3 top-3.5" />
                                    </div>
                                </div>
                            </div>

                            {isAuthenticated && (
                                <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        id="saveCard"
                                        checked={saveCard}
                                        onChange={(e) => setSaveCard(e.target.checked)}
                                        className="mt-1 w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                                    />
                                    <div className="flex-1">
                                        <label htmlFor="saveCard" className="text-sm font-medium text-gray-900 cursor-pointer">
                                            Kartımı sonraki alışverişler için kaydet
                                        </label>
                                        {saveCard && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                className="mt-2"
                                            >
                                                <input
                                                    type="text"
                                                    value={cardAlias}
                                                    onChange={(e) => setCardAlias(e.target.value)}
                                                    placeholder="Kart Adı (Örn: İş Bankası)"
                                                    className="w-full px-3 py-2 text-sm rounded border border-blue-200 focus:outline-none focus:border-blue-400"
                                                />
                                            </motion.div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </motion.form>
                    )}
                </AnimatePresence>

                <div className="mt-8">
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary-500/30 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                        {loading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                İşlem Yapılıyor...
                            </>
                        ) : (
                            <>
                                <LockClosedIcon className="w-5 h-5" />
                                {amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL Öde
                            </>
                        )}
                    </button>

                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
                        <ShieldCheckIcon className="w-4 h-4 text-green-500" />
                        <span>256-Bit SSL Güvenli Ödeme • 3D Secure Korumalı</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
