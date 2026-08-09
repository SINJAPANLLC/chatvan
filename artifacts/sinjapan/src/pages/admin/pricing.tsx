import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, RotateCcw, Info, DollarSign, Bot } from 'lucide-react';

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); });
}

// ── 定数 ──────────────────────────────────────────────────────────────────────
const VEHICLES = ['軽貨物', '1t', '2t', '4t', '10t', '大型'] as const;
const TIERS = ['local', 'short', 'mid', 'long', 'xlong'] as const;
const TIER_LABELS: Record<string, string> = {
  local: '近距離\n<30km',
  short: '短距離\n<100km',
  mid:   '中距離\n<300km',
  long:  '長距離\n<600km',
  xlong: '超長距離\n600km+',
};
const BODY_TYPES = ['平ボディ', 'ウイング', 'バン', '冷凍冷蔵', '幌'] as const;
const WORK_FEES = ['手積み', '手降ろし', 'ラッシング', '養生', '搬入', '搬出'] as const;

type PricingConfig = {
  margin: number;
  minPrice: number;
  basePrice: Record<string, Record<string, number>>;
  bodyRate: Record<string, number>;
  workFee: Record<string, number>;
  highwayFee: Record<string, number>;
};

const DEFAULT: PricingConfig = {
  margin: 0.15,
  minPrice: 8000,
  basePrice: {
    '軽貨物': { local: 7500,  short: 13000, mid: 16000, long: 22000, xlong: 32000 },
    '1t':     { local: 8000,  short: 18000, mid: 26000, long: 36000, xlong: 50000 },
    '2t':     { local: 12000, short: 28000, mid: 40000, long: 55000, xlong: 75000 },
    '4t':     { local: 20000, short: 45000, mid: 62000, long: 75000, xlong: 105000 },
    '10t':    { local: 35000, short: 80000, mid: 105000, long: 140000, xlong: 190000 },
    '大型':   { local: 50000, short: 120000, mid: 160000, long: 210000, xlong: 280000 },
  },
  bodyRate: { '平ボディ': 1.00, 'ウイング': 1.10, 'バン': 1.05, '冷凍冷蔵': 1.35, '幌': 1.05 },
  workFee:  { '手積み': 5000, '手降ろし': 5000, 'ラッシング': 3000, '養生': 5000, '搬入': 5000, '搬出': 5000 },
  highwayFee: { local: 0, short: 1500, mid: 4000, long: 8000, xlong: 14000 },
};

// ── NumberInput ───────────────────────────────────────────────────────────────
function NumInput({ value, onChange, prefix, suffix, step = 1000 }:
  { value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; step?: number }) {
  return (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-2.5 text-xs text-muted-foreground pointer-events-none">{prefix}</span>}
      <Input
        type="number"
        value={value}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
        className={`text-right text-sm h-8 ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-7' : ''}`}
      />
      {suffix && <span className="absolute right-2.5 text-xs text-muted-foreground pointer-events-none">{suffix}</span>}
    </div>
  );
}

// ── Tab: 料金設定 ─────────────────────────────────────────────────────────────
function PricingTab() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<PricingConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/pricing-config')
      .then(d => { const v = { ...DEFAULT, ...d }; setCfg(v); setOriginal(JSON.stringify(v)); })
      .catch(() => { setCfg(DEFAULT); setOriginal(JSON.stringify(DEFAULT)); })
      .finally(() => setLoading(false));
  }, []);

  const isDirty = JSON.stringify(cfg) !== original;

  const setBase = (v: string, t: string, val: number) =>
    setCfg(c => ({ ...c, basePrice: { ...c.basePrice, [v]: { ...c.basePrice[v], [t]: val } } }));
  const setBody = (b: string, val: number) =>
    setCfg(c => ({ ...c, bodyRate: { ...c.bodyRate, [b]: val } }));
  const setWork = (w: string, val: number) =>
    setCfg(c => ({ ...c, workFee: { ...c.workFee, [w]: val } }));
  const setHwy = (t: string, val: number) =>
    setCfg(c => ({ ...c, highwayFee: { ...c.highwayFee, [t]: val } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/admin/pricing-config', { method: 'POST', body: JSON.stringify(cfg) });
      setOriginal(JSON.stringify(cfg));
      toast({ title: '料金設定を保存しました' });
    } catch {
      toast({ title: '保存に失敗しました', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // シミュレーション（2t・中距離・平ボディ）
  const simBase = cfg.basePrice['2t']['mid'];
  const simCarrier = Math.ceil(simBase * 1.0 * 1.0 / 100) * 100;
  const simCustomer = Math.max(cfg.minPrice, Math.ceil(simCarrier / (1 - cfg.margin) / 100) * 100);
  const simProfit = simCustomer - simCarrier;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">料金設定</h2>
          <p className="text-sm text-muted-foreground">実際の見積計算に使われる料金テーブルを管理します</p>
        </div>
        <div className="flex gap-2">
          {isDirty && <Button variant="outline" size="sm" onClick={() => { const v = JSON.parse(original); setCfg(v); }}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />元に戻す
          </Button>}
          <Button size="sm" onClick={handleSave} disabled={saving || !isDirty} className="bg-black text-white hover:bg-black/90">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}保存
          </Button>
        </div>
      </div>

      {/* 基本設定 */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="bg-muted/30 px-4 py-2.5 border-b border-border">
          <p className="text-sm font-semibold">基本設定</p>
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">マージン率（利益率）</p>
            <NumInput value={Math.round(cfg.margin * 100)} onChange={v => setCfg(c => ({ ...c, margin: v / 100 }))} suffix="%" step={1} />
            <p className="text-xs text-muted-foreground mt-1">顧客価格 = 庸車コスト ÷ (1 - マージン率)</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">最低請求額（税抜）</p>
            <NumInput value={cfg.minPrice} onChange={v => setCfg(c => ({ ...c, minPrice: v }))} prefix="¥" />
            <p className="text-xs text-muted-foreground mt-1">計算結果がこの金額を下回る場合はこの金額を適用</p>
          </div>
        </div>

        {/* シミュレーション */}
        <div className="mx-4 mb-4 bg-muted/40 rounded-lg px-4 py-3 text-xs grid grid-cols-3 gap-4">
          <div>
            <p className="text-muted-foreground">2t・中距離シミュレーション</p>
          </div>
          <div className="flex gap-4">
            <div><p className="text-muted-foreground">庸車コスト</p><p className="font-semibold">¥{simCarrier.toLocaleString()}</p></div>
            <div><p className="text-muted-foreground">顧客価格</p><p className="font-semibold text-foreground">¥{simCustomer.toLocaleString()}</p></div>
            <div><p className="text-muted-foreground">粗利</p><p className="font-semibold text-green-600">¥{simProfit.toLocaleString()}</p></div>
          </div>
          <div />
        </div>
      </div>

      {/* 車両×距離帯 基本料金 */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="bg-muted/30 px-4 py-2.5 border-b border-border">
          <p className="text-sm font-semibold">庸車相場（円/台）— 車両 × 距離帯</p>
          <p className="text-xs text-muted-foreground mt-0.5">運送会社への支払い目安。顧客価格はここにマージン率を加算して計算されます</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b border-border">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-24">車両</th>
                {TIERS.map(t => (
                  <th key={t} className="px-3 py-2.5 text-center font-medium text-muted-foreground whitespace-pre-line text-xs">{TIER_LABELS[t]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {VEHICLES.map(v => (
                <tr key={v} className="hover:bg-muted/10">
                  <td className="px-4 py-2 font-medium text-sm">{v}</td>
                  {TIERS.map(t => (
                    <td key={t} className="px-3 py-2 w-36">
                      <NumInput value={cfg.basePrice[v]?.[t] ?? 0} onChange={val => setBase(v, t, val)} prefix="¥" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ボディタイプ割増率 */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="bg-muted/30 px-4 py-2.5 border-b border-border">
          <p className="text-sm font-semibold">ボディタイプ割増率</p>
          <p className="text-xs text-muted-foreground mt-0.5">基本料にこの倍率を掛けます（1.00 = 割増なし）</p>
        </div>
        <div className="p-4 grid grid-cols-5 gap-3">
          {BODY_TYPES.map(b => (
            <div key={b}>
              <p className="text-xs font-medium mb-1.5">{b}</p>
              <NumInput value={cfg.bodyRate[b] ?? 1.0} onChange={val => setBody(b, val)} suffix="倍" step={0.05} />
            </div>
          ))}
        </div>
      </div>

      {/* 付帯作業料 & 高速代 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/30 px-4 py-2.5 border-b border-border">
            <p className="text-sm font-semibold">付帯作業料（円/台）</p>
          </div>
          <div className="p-4 space-y-2.5">
            {WORK_FEES.map(w => (
              <div key={w} className="flex items-center gap-3">
                <span className="text-sm w-24 shrink-0">{w}</span>
                <NumInput value={cfg.workFee[w] ?? 0} onChange={val => setWork(w, val)} prefix="¥" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/30 px-4 py-2.5 border-b border-border">
            <p className="text-sm font-semibold">高速代見込み（円/台）</p>
          </div>
          <div className="p-4 space-y-2.5">
            {TIERS.map(t => (
              <div key={t} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-28 shrink-0 whitespace-pre-line">{TIER_LABELS[t]}</span>
                <NumInput value={cfg.highwayFee[t] ?? 0} onChange={val => setHwy(t, val)} prefix="¥" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {isDirty && <p className="text-xs text-amber-600 font-medium">● 未保存の変更があります</p>}
    </div>
  );
}

// ── Tab: AIプロンプト ─────────────────────────────────────────────────────────
function PromptTab() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiFetch('/api/admin/ai-prompt')
      .then((d: { prompt: string }) => { setPrompt(d.prompt ?? ''); setOriginal(d.prompt ?? ''); })
      .catch(() => toast({ variant: 'destructive', title: '読み込みに失敗しました' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [prompt]);

  const isDirty = prompt !== original;

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/admin/ai-prompt', { method: 'PUT', body: JSON.stringify({ prompt }) });
      setOriginal(prompt);
      toast({ title: 'プロンプトを保存しました' });
    } catch {
      toast({ variant: 'destructive', title: '保存に失敗しました' });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">AIプロンプト設定</h2>
          <p className="text-sm text-muted-foreground">Chat VANのAIアシスタントへの指示内容を編集できます</p>
        </div>
        <div className="flex gap-2">
          {isDirty && <Button variant="outline" size="sm" onClick={() => setPrompt(original)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />元に戻す
          </Button>}
          <Button size="sm" onClick={handleSave} disabled={saving || !isDirty} className="bg-black text-white hover:bg-black/90">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}保存
          </Button>
        </div>
      </div>

      <div className="flex gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
          <p className="font-medium text-foreground">使えるプレースホルダー</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span><code className="bg-background border border-border rounded px-1 font-mono">{'{DATE}'}</code> 今日の日付（例: 2026-08-06）</span>
            <span><code className="bg-background border border-border rounded px-1 font-mono">{'{WEEKDAY}'}</code> 曜日（例: 水）</span>
            <span><code className="bg-background border border-border rounded px-1 font-mono">{'{TOMORROW}'}</code> 明日の日付</span>
            <span><code className="bg-background border border-border rounded px-1 font-mono">{'{MIN_PRICE}'}</code> 最低料金（自動反映）</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            className="w-full min-h-[500px] rounded-xl border border-border bg-card px-5 py-4 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-shadow"
            placeholder="システムプロンプトを入力..."
            spellCheck={false}
          />
          <div className="absolute bottom-3 right-4 text-xs text-muted-foreground tabular-nums select-none pointer-events-none">
            {prompt.length.toLocaleString()} 文字
          </div>
        </div>
      )}
      {isDirty && <p className="text-xs text-amber-600 font-medium">● 未保存の変更があります</p>}
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────────
export default function AdminPricing() {
  const [tab, setTab] = useState<'pricing' | 'prompt'>('pricing');

  const tabs = [
    { id: 'pricing', label: '料金設定', icon: DollarSign },
    { id: 'prompt',  label: 'AIプロンプト', icon: Bot },
  ] as const;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* タブ */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pricing' ? <PricingTab /> : <PromptTab />}
    </div>
  );
}
