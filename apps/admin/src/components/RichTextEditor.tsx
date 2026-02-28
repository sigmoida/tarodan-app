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
          className={`px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'edit' ? 'bg-primary-500 text-gray-900' : 'bg-gray-100 text-gray-500 hover:text-gray-700'}`}
        >
          Düzenle
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${activeTab === 'preview' ? 'bg-primary-500 text-gray-900' : 'bg-gray-100 text-gray-500 hover:text-gray-700'}`}
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
          className="w-full rounded-lg bg-gray-100 text-gray-700 border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder-gray-500"
          spellCheck={false}
        />
      ) : (
        <div
          className="rounded-lg bg-gray-100 border border-gray-300 px-3 py-2 min-h-[200px] text-sm text-gray-700 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: value || '<span class="text-gray-500">İçerik yok</span>' }}
        />
      )}
      <p className="text-xs text-gray-500 mt-1">
        HTML kullanabilirsiniz: &lt;h1&gt;, &lt;p&gt;, &lt;strong&gt;, &lt;a href=&quot;...&quot;&gt;, &lt;ul&gt;&lt;li&gt;
      </p>
    </div>
  );
}
