'use client';

import { useState } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function RichTextEditor({ value, onChange, placeholder, className = '' }: RichTextEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  return (
    <div className={className}>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => setActiveTab('edit')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'edit' ? 'bg-primary-500 text-white' : 'bg-dark-600 text-gray-400 hover:text-gray-200'}`}
        >
          Düzenle
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'preview' ? 'bg-primary-500 text-white' : 'bg-dark-600 text-gray-400 hover:text-gray-200'}`}
        >
          Önizleme
        </button>
      </div>
      {activeTab === 'edit' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={14}
          className="w-full rounded-lg bg-dark-700 text-gray-200 border border-dark-600 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder-gray-500"
          spellCheck={false}
        />
      ) : (
        <div
          className="rounded-lg bg-dark-700 border border-dark-600 px-3 py-2 min-h-[200px] text-sm text-gray-200 prose prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: value || '<span class="text-gray-500">İçerik yok</span>' }}
        />
      )}
      <p className="text-xs text-gray-500 mt-1">
        HTML kullanabilirsiniz: &lt;h1&gt;, &lt;p&gt;, &lt;strong&gt;, &lt;a href=&quot;...&quot;&gt;, &lt;ul&gt;&lt;li&gt;
      </p>
    </div>
  );
}
