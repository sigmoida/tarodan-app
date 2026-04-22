'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { supportApi } from '@/lib/api';
import { useTranslation } from '@/i18n';import { Button, Input, Textarea } from '@tarodan/ui';


export default function ContactPage() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    // Validation
    if (formData.message.length < 10) {
      toast.error(t('contact.messageTooShort'));
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await supportApi.guestContact({
        name: formData.name,
        email: formData.email,
        subject: formData.subject || undefined,
        message: formData.message,
      });
      
      toast.success(response.data.message || t('contact.success'));
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || t('common.operationFailed');
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-2">{t('contact.title')}</h1>
        <p className="text-muted mb-8">{t('contact.subtitle')}</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-heading mb-3">{t('information.contactInfo.title')}</h2>
            <dl className="space-y-2 text-sm text-body">
              <div>
                <dt className="text-muted">{t('information.contactInfo.email')}</dt>
                <dd><a href={`mailto:${t('information.contactInfo.emailValue')}`} className="text-primary-600 hover:underline">{t('information.contactInfo.emailValue')}</a></dd>
              </div>
              <div>
                <dt className="text-muted">{t('information.contactInfo.phone')}</dt>
                <dd>{t('information.contactInfo.phoneValue')}</dd>
              </div>
              <div>
                <dt className="text-muted">{t('information.contactInfo.address')}</dt>
                <dd>{t('information.contactInfo.addressValue')}</dd>
              </div>
            </dl>
          </div>
          <div className="lg:col-span-2 bg-surface-elevated rounded-xl shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-body mb-2">
                {t('contact.name')}
              </label>
              <Input type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="px-4 py-3"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-2">
                {t('contact.email')}
              </label>
              <Input type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="px-4 py-3"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-2">
                {t('contact.subject')}
              </label>
              <Input type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="px-4 py-3"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-2">
                {t('contact.message')}
              </label>
              <Textarea value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="px-4 py-3"
                rows={6}
                required />
            </div>
            <Button variant="secondary" type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-primary-500 text-inverted rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed">
              {isSubmitting ? t('contact.sending') : t('contact.send')}
            </Button>
          </form>
          </div>
        </div>
      </main>
    </div>
  );
}
