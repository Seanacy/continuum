'use client';
import React, { useState, useEffect } from 'react';

interface Business {
  id: string;
  name: string;
  websiteUrl?: string;
  businessType?: string;
  productsServices?: string;
  targetAudience?: string;
  socialLinks?: { platform: string; url: string }[];
  location?: string;
  brandVoice?: string;
  scrapedData?: any;
}

interface BusinessManagerProps {
  onClose: () => void;
  onSelectBusiness?: (business: Business) => void;
  mode?: 'auto' | 'guided';
  specs?: string;
  characterName?: string;
}

export default function BusinessManager({ onClose, onSelectBusiness, mode, specs, characterName }: BusinessManagerProps) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBiz, setEditingBiz] = useState<Business | null>(null);
  const [scrapeLinks, setScrapeLinks] = useState('');
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [productsServices, setProductsServices] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [location, setLocation] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>([]);
  const [autoLoading, setAutoLoading] = useState(mode === 'auto');

  useEffect(() => { fetchBusinesses(); }, []);

  // Auto mode: AI generates business profile and saves
  useEffect(() => {
    if (mode !== 'auto') return;
    const run = async () => {
      try {
        const res = await fetch('/api/characters/ai-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: 'generate-business',
            characterName: characterName || '',
            specs: specs || '',
          }),
        });
        const data = await res.json();
        if (data.name) {
          // Save directly via API
          const saveRes = await fetch('/api/businesses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          const saved = await saveRes.json();
          if (saved.id) {
            fetchBusinesses();
            if (onSelectBusiness) onSelectBusiness(saved);
          }
        }
      } catch (e) { console.error('Auto business failed:', e); }
      setAutoLoading(false);
    };
    run();
  }, [mode]);

  async function fetchBusinesses() {
    try {
      const res = await fetch('/api/businesses');
      const data = await res.json();
      setBusinesses(data.businesses || []);
    } catch { } finally { setLoading(false); }
  }

  function resetForm() {
    setName(''); setWebsiteUrl(''); setBusinessType('');
    setProductsServices(''); setTargetAudience('');
    setLocation(''); setBrandVoice(''); setSocialLinks([]);
    setScrapeLinks(''); setEditingBiz(null);
  }

  function openAddForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(biz: Business) {
    setEditingBiz(biz);
    setName(biz.name || '');
    setWebsiteUrl(biz.websiteUrl || '');
    setBusinessType(biz.businessType || '');
    setProductsServices(biz.productsServices || '');
    setTargetAudience(biz.targetAudience || '');
    setLocation(biz.location || '');
    setBrandVoice(biz.brandVoice || '');
    setSocialLinks(biz.socialLinks || []);
    setShowForm(true);
  }

  async function handleScrape() {
    if (!scrapeLinks.trim()) return;
    setScraping(true);
    try {
      const res = await fetch('/api/businesses/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: scrapeLinks }),
      });
      const data = await res.json();
      if (data.extracted) {
        const e = data.extracted;
        if (e.name) setName(e.name);
        if (e.websiteUrl) setWebsiteUrl(e.websiteUrl);
        if (e.businessType) setBusinessType(e.businessType);
        if (e.productsServices) setProductsServices(e.productsServices);
        if (e.targetAudience) setTargetAudience(e.targetAudience);
        if (e.location) setLocation(e.location);
        if (e.brandVoice) setBrandVoice(e.brandVoice);
        if (e.socialLinks) setSocialLinks(e.socialLinks);
      }
    } catch { } finally { setScraping(false); }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name, websiteUrl, businessType, productsServices, targetAudience, socialLinks, location, brandVoice };
      if (editingBiz) {
        await fetch('/api/businesses', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingBiz.id, ...payload }),
        });
      } else {
        await fetch('/api/businesses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      resetForm();
      fetchBusinesses();
    } catch { } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this business?')) return;
    await fetch(`/api/businesses?id=${id}`, { method: 'DELETE' });
    fetchBusinesses();
  }

  // Auto-loading screen
  if (autoLoading) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-4xl animate-bounce">🏢</div>
          <p className="text-white font-bold text-lg">AI is building your business profile...</p>
          <p className="text-continuum-muted text-sm">Generating details and saving automatically</p>
        </div>
      </div>
    );
  }

    // Card list view
  if (!showForm) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-zinc-900 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800">
            <h2 className="text-lg font-semibold text-white">My Businesses</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl">&times;</button>
          </div>
          <div className="p-4 space-y-3">
            {loading && <p className="text-zinc-500 text-center py-8">Loading...</p>}
            {!loading && businesses.length === 0 && (
              <p className="text-zinc-500 text-center py-8">No businesses yet. Add your first one!</p>
            )}
            {businesses.map((biz) => (
              <div key={biz.id} className="bg-zinc-800 rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{biz.name}</h3>
                    {biz.businessType && <p className="text-sm text-zinc-400">{biz.businessType}</p>}
                    {biz.location && <p className="text-xs text-zinc-500">{biz.location}</p>}
                  </div>
                  <div className="flex gap-2">
                    {onSelectBusiness && (
                      <button onClick={() => { onSelectBusiness(biz); onClose(); }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg">
                        Select
                      </button>
                    )}
                    <button onClick={() => openEditForm(biz)}
                      className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(biz.id)}
                      className="px-3 py-1 bg-red-900/50 hover:bg-red-800 text-red-300 text-sm rounded-lg">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-zinc-800">
            <button onClick={openAddForm}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl">
              + Add Business
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Add/Edit form view
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">
            {editingBiz ? 'Edit Business' : 'Add Business'}
          </h2>
          <button onClick={() => { setShowForm(false); resetForm(); }} className="text-zinc-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          {/* AI Scrape Section */}
          <div className="bg-zinc-800/50 rounded-xl p-3 space-y-2">
            <label className="text-sm font-medium text-blue-400">Paste links for AI auto-fill</label>
            <textarea
              value={scrapeLinks}
              onChange={(e) => setScrapeLinks(e.target.value)}
              placeholder="Paste your website, Instagram, TikTok, or any links here..."
              className="w-full bg-zinc-800 text-white rounded-lg p-3 text-sm resize-none h-20 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button onClick={handleScrape} disabled={scraping || !scrapeLinks.trim()}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
              {scraping ? 'Analyzing links...' : 'Auto-fill with AI'}
            </button>
          </div>

          {/* Manual fields */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Business Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Glow by Keisha" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Website URL</label>
              <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://glowbykeisha.com" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Business Type</label>
              <input value={businessType} onChange={(e) => setBusinessType(e.target.value)}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Nail Tech, Restaurant, Clothing Brand..." />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Products & Services</label>
              <textarea value={productsServices} onChange={(e) => setProductsServices(e.target.value)}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="What do you sell or offer?" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Target Audience</label>
              <textarea value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Who are your ideal customers?" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Location / City</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Atlanta, GA" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Brand Voice / Tone</label>
              <input value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Casual and fun, Professional, Bold and edgy..." />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl">
            {saving ? 'Saving...' : editingBiz ? 'Update Business' : 'Save Business'}
          </button>
        </div>
      </div>
    </div>
  );
}
