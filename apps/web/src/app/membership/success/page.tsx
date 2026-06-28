'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/solid';

function MembershipSuccessContent() {
  const searchParams = useSearchParams();
  // kind: upgrade | downgrade | change — checkout/payment akışından gelir.
  const kind = searchParams.get('kind');
  const headline =
    kind === 'upgrade'
      ? 'Üyeliğiniz başarıyla yükseltildi!'
      : 'Üyeliğiniz başarıyla değiştirildi!';

  return (
    <div className="min-h-screen bg-surface-elevated flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-surface-elevated rounded-3xl shadow-2xl p-8 md:p-12 max-w-lg w-full text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-24 h-24 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <CheckCircleIcon className="w-16 h-16 text-success-500" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h1 className="text-3xl font-bold text-heading mb-4 flex items-center justify-center gap-2">
            <SparklesIcon className="w-8 h-8 text-warning-500" />
            Tebrikler!
            <SparklesIcon className="w-8 h-8 text-warning-500" />
          </h1>
          <p className="text-xl text-muted mb-8">
            {headline}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-surface rounded-xl p-6 mb-8"
        >
          <h2 className="font-semibold text-heading mb-4">Artık şunları yapabilirsiniz:</h2>
          <ul className="text-left space-y-3 text-muted">
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-success-500 flex-shrink-0" />
              Takas teklifleri gönderin ve alın
            </li>
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-success-500 flex-shrink-0" />
              Koleksiyonlar oluşturun ve paylaşın
            </li>
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-success-500 flex-shrink-0" />
              Daha fazla ilan yayınlayın
            </li>
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-success-500 flex-shrink-0" />
              Öncelikli destek alın
            </li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="space-y-3"
        >
          <Link
            href="/listings/new"
            className="block w-full py-3 bg-primary-500 text-inverted font-semibold rounded-xl hover:bg-primary-600 transition-colors"
          >
            Yeni İlan Oluştur
          </Link>
          <Link
            href="/collections"
            className="block w-full py-3 bg-surface-alt text-body font-semibold rounded-xl hover:bg-border-subtle transition-colors"
          >
            Koleksiyon Oluştur
          </Link>
          <Link
            href="/profile"
            className="block w-full py-3 text-muted font-medium hover:text-body transition-colors"
          >
            Profile Git →
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function MembershipSuccessPage() {
  return (
    <Suspense fallback={null}>
      <MembershipSuccessContent />
    </Suspense>
  );
}
