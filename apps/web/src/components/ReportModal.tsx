'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, FlagIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

export type ReportEntityType = 'product' | 'user' | 'collection' | 'message';

export type ReportReason = 
  | 'spam'
  | 'inappropriate_content'
  | 'harassment'
  | 'fake_product'
  | 'scam'
  | 'other';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: ReportEntityType;
  entityId: string;
  entityName?: string;
  locale?: string;
}

const REPORT_REASONS: { value: ReportReason; labelTr: string; labelEn: string }[] = [
  { value: 'spam', labelTr: 'Spam / İstenmeyen İçerik', labelEn: 'Spam' },
  { value: 'inappropriate_content', labelTr: 'Uygunsuz İçerik', labelEn: 'Inappropriate' },
  { value: 'harassment', labelTr: 'Taciz / Kötüye Kullanım', labelEn: 'Harassment' },
  { value: 'fake_product', labelTr: 'Sahte / Yanıltıcı Ürün', labelEn: 'Fake Product' },
  { value: 'scam', labelTr: 'Dolandırıcılık', labelEn: 'Scam' },
  { value: 'other', labelTr: 'Diğer', labelEn: 'Other' },
];

export default function ReportModal({ 
  isOpen, 
  onClose, 
  entityType, 
  entityId, 
  entityName,
  locale = 'tr' 
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | ''>('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getTitle = () => {
    switch (entityType) {
      case 'product':
        return locale === 'en' ? 'Report Listing' : 'İlanı Raporla';
      case 'user':
        return locale === 'en' ? 'Report User' : 'Kullanıcıyı Raporla';
      case 'collection':
        return locale === 'en' ? 'Report Collection' : 'Koleksiyonu Raporla';
      case 'message':
        return locale === 'en' ? 'Report Message' : 'Mesajı Raporla';
      default:
        return locale === 'en' ? 'Report' : 'Raporla';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedReason) {
      toast.error(locale === 'en' ? 'Please select a reason' : 'Lütfen bir neden seçin');
      return;
    }

    setIsSubmitting(true);
    try {
      // Build payload with correct field names for backend
      const payload: { type: string; targetId: string; reason: string; description?: string } = {
        type: entityType,       // Backend expects 'type' not 'entityType'
        targetId: entityId,     // Backend expects 'targetId' not 'entityId'
        reason: selectedReason,
      };
      
      // Only include description if it's at least 10 characters (backend validation)
      if (description.trim().length >= 10) {
        payload.description = description.trim();
      }

      await api.post('/user-reports', payload);
      
      toast.success(
        locale === 'en' 
          ? 'Report submitted. Our team will review it.' 
          : 'Rapor gönderildi. Ekibimiz inceleyecektir.'
      );
      onClose();
      setSelectedReason('');
      setDescription('');
    } catch (error: any) {
      console.error('Report submission failed:', error);
      const errorMsg = error.response?.data?.message;
      // Handle array of validation errors
      const displayMsg = Array.isArray(errorMsg) ? errorMsg[0] : errorMsg;
      toast.error(
        displayMsg || 
        (locale === 'en' ? 'Failed to submit report' : 'Rapor gönderilemedi')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50"
          />
          
          {/* Modal - Compact size with max-height and scroll */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-hidden flex flex-col"
          >
            {/* Header - Compact */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-2">
                <FlagIcon className="w-5 h-5 text-red-600" />
                <h2 className="text-lg font-semibold text-gray-900">{getTitle()}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content - Scrollable */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
              {entityName && (
                <div className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">{locale === 'en' ? 'Reporting:' : 'Raporlanan:'}</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{entityName}</p>
                </div>
              )}

              {/* Reason Selection - Compact */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'Reason' : 'Neden'} <span className="text-red-500">*</span>
                </label>
                <div className="space-y-1.5">
                  {REPORT_REASONS.map((reason) => (
                    <label
                      key={reason.value}
                      className={`flex items-center p-2.5 rounded-lg border cursor-pointer transition-all text-sm ${
                        selectedReason === reason.value
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reportReason"
                        value={reason.value}
                        checked={selectedReason === reason.value}
                        onChange={(e) => setSelectedReason(e.target.value as ReportReason)}
                        className="w-3.5 h-3.5 text-red-600 border-gray-300 focus:ring-red-500"
                      />
                      <span className="ml-2 text-gray-700">
                        {locale === 'en' ? reason.labelEn : reason.labelTr}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Description - Compact */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {locale === 'en' ? 'Details (optional, min 10 chars)' : 'Detaylar (isteğe bağlı, min 10 karakter)'}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={locale === 'en' ? 'More details...' : 'Daha fazla detay...'}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-0.5 text-right">{description.length}/500</p>
              </div>

              {/* Actions - Compact */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  {locale === 'en' ? 'Cancel' : 'İptal'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedReason}
                  className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? '...' : (locale === 'en' ? 'Report' : 'Raporu Gönder')}
                </button>
              </div>

              {/* Info - Compact */}
              <p className="text-xs text-gray-400 text-center">
                {locale === 'en' 
                  ? 'Reports are reviewed within 24-48 hours.'
                  : 'Raporlar 24-48 saat içinde incelenir.'
                }
              </p>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
