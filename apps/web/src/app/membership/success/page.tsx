'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/solid';

export default function MembershipSuccessPage() {

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 max-w-lg w-full text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <CheckCircleIcon className="w-16 h-16 text-green-500" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-4 flex items-center justify-center gap-2">
            <SparklesIcon className="w-8 h-8 text-yellow-500" />
            Tebrikler!
            <SparklesIcon className="w-8 h-8 text-yellow-500" />
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Üyeliğiniz başarıyla yükseltildi!
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-gray-50 rounded-xl p-6 mb-8"
        >
          <h2 className="font-semibold text-gray-900 mb-4">Artık şunları yapabilirsiniz:</h2>
          <ul className="text-left space-y-3 text-gray-600">
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
              Takas teklifleri gönderin ve alın
            </li>
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
              Koleksiyonlar oluşturun ve paylaşın
            </li>
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
              Daha fazla ilan yayınlayın
            </li>
            <li className="flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
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
            className="block w-full py-3 bg-primary-500 text-white font-semibold rounded-xl hover:bg-primary-600 transition-colors"
          >
            Yeni İlan Oluştur
          </Link>
          <Link
            href="/collections"
            className="block w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
          >
            Koleksiyon Oluştur
          </Link>
          <Link
            href="/profile"
            className="block w-full py-3 text-gray-500 font-medium hover:text-gray-700 transition-colors"
          >
            Profile Git →
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
