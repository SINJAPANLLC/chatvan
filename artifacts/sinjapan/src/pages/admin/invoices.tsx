import React, { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, PauseCircle, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// ── ステータス定義（白黒）───────────────────────────────────────────
const STATUS_META: Record<string, { label: string; cls: string }> = {
  none:      { label: '未申請', cls: 'bg-muted text-muted-foreground border-border' },
  pending:   { label: '審査中', cls: 'bg-foreground text-background border-foreground' },
  approved:  { label: '承認済', cls: 'bg-background text-foreground border-foreground' },
  rejected:  { label: '否決',   cls: 'bg-muted text-muted-foreground border-border line-through' },
  suspended: { label: '停止',   cls: 'bg-muted text-foreground border-foreground' },
};

const TABS = [
  { key: 'all',       label: '全て' },
  { key: 'pending',   label: '審査中' },
  { key: 'approved',  label: '承認済' },
  { key: 'rejected',  label: '否決' },
  { key: 'suspended', label: '停止' },
];

const fmt = (n: number) => `¥ ${new Intl.NumberFormat('ja-JP').format(n)}`;

// ── モックデータ ─────────────────────────────────────────────────────
const MOCK: any[] = [
  {
    id: 9001,
    name: '山田 一郎', email: 'yamada@nippon-butsuryu.co.jp',
    companyName: '日本物流株式会社', corporateNumber: '4010001023948',
    creditStatus: 'pending', creditLimit: 0, creditUsed: 0,
    paymentTerms: 'Net30', billingAddress: '東京都港区芝浦1-1-1',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 9002,
    name: '中村 誠', email: 'nakamura@tokyotrans.co.jp',
    companyName: '東京トランスポート株式会社', corporateNumber: '7010001060842',
    creditStatus: 'approved', creditLimit: 8000000, creditUsed: 3240000,
    paymentTerms: '月末締め翌月末払い', billingAddress: '東京都江東区有明3-7-26',
    createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
  },
  {
    id: 9003,
    name: '小林 達也', email: 'kobayashi@osaka-cargo.jp',
    companyName: '大阪カーゴサービス', corporateNumber: '1200-01-010831',
    creditStatus: 'pending', creditLimit: 0, creditUsed: 0,
    paymentTerms: 'Net30', billingAddress: '大阪府大阪市西区本町2-5-7',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 9004,
    name: '加藤 裕子', email: 'kato@aichi-express.co.jp',
    companyName: '愛知エクスプレス株式会社', corporateNumber: '2180001010369',
    creditStatus: 'approved', creditLimit: 20000000, creditUsed: 18500000,
    paymentTerms: 'Net60', billingAddress: '愛知県名古屋市中区栄3-28-12',
    createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
  },
  {
    id: 9005,
    name: '田辺 洋介', email: 'tanabe@kyushu-logi.jp',
    companyName: '九州ロジスティクス', corporateNumber: '8290001061497',
    creditStatus: 'suspended', creditLimit: 5000000, creditUsed: 0,
    paymentTerms: 'Net30', billingAddress: '福岡県福岡市博多区博多駅前3-2-8',
    createdAt: new Date(Date.now() - 55 * 86400000).toISOString(),
  },
  {
    id: 9006,
    name: '井上 麻衣', email: 'inoue@tohoku-freight.co.jp',
    companyName: '東北フレイト株式会社', corporateNumber: '5400001019756',
    creditStatus: 'rejected', creditLimit: 0, creditUsed: 0,
    paymentTerms: '', billingAddress: '宮城県仙台市青葉区一番町2-3-4',
    createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
  },
];

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('sinjapan_auth_token');
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  }).then(async r => {
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });
}

export default function AdminInvoices() {
  const { toast } = useToast();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [approveForm, setApproveForm] = useState({ creditLimit: '', paymentTerms: 'Net30' });
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [editCreditLimit, setEditCreditLimit] = useState('');
  const [editingCredit, setEditingCredit] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/corporate');
      const merged = data?.length ? data : MOCK;
      setApplications(merged);
      if (selected) setSelected((prev: any) => merged.find((u: any) => u.id === prev.id) ?? prev);
    } catch {
      setApplications(MOCK);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const filtered = applications.filter(a => tab === 'all' || a.creditStatus === tab);
  const counts: Record<string, number> = {};
  for (const a of applications) counts[a.creditStatus] = (counts[a.creditStatus] || 0) + 1;

  const action = async (path: string, body?: object) => {
    setActionLoading(path);
    try {
      await apiFetch(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
      toast({ title: '更新しました' });
      await reload();
    } catch {
      toast({ variant: 'destructive', title: '操作に失敗しました' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async () => {
    if (!selected || !approveForm.creditLimit) return;
    await action(`/api/admin/corporate/${selected.id}/approve`, {
      creditLimit: Number(approveForm.creditLimit),
      paymentTerms: approveForm.paymentTerms,
    });
    setShowApproveForm(false);
  };

  const handleUpdateCredit = async () => {
    if (!selected || !editCreditLimit) return;
    await action(`/api/admin/corporate/${selected.id}/credit-limit`, { creditLimit: Number(editCreditLimit) });
    setEditingCredit(false);
  };

  const openPanel = (app: any) => {
    setSelected(app);
    setShowApproveForm(false);
    setEditingCredit(false);
    setApproveForm({ creditLimit: '', paymentTerms: app.paymentTerms || 'Net30' });
    setEditCreditLimit(String(app.creditLimit || ''));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">請求書払い申請</h1>

      {/* タブ */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === t.key
                ? 'text-foreground border-b-2 border-foreground -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.key !== 'all' && (counts[t.key] ?? 0) > 0 && (
              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* テーブル */}
      <div className="rounded-xl border border-border shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">申請者</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">会社名</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">法人番号</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">ステータス</th>
              <th className="px-5 py-3 text-right font-medium text-muted-foreground">与信枠</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">支払いサイト</th>
              <th className="px-5 py-3 text-left font-medium text-muted-foreground">申請日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {loading ? (
              <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
            ) : !filtered.length ? (
              <tr><td colSpan={7} className="py-16 text-center text-muted-foreground text-sm">申請はありません</td></tr>
            ) : filtered.map(app => {
              const st = STATUS_META[app.creditStatus] ?? STATUS_META.none;
              return (
                <tr
                  key={app.id}
                  onClick={() => openPanel(app)}
                  className={`cursor-pointer hover:bg-muted/30 transition-colors ${selected?.id === app.id ? 'bg-muted/40' : ''}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="font-medium">{app.name}</div>
                    <div className="text-xs text-muted-foreground">{app.email}</div>
                  </td>
                  <td className="px-5 py-3.5 font-medium">{app.companyName || '—'}</td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs font-mono">{app.corporateNumber || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-medium">
                    {app.creditLimit > 0 ? fmt(app.creditLimit) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">{app.paymentTerms || '—'}</td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">
                    {format(new Date(app.createdAt), 'yyyy/MM/dd')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 右パネル — fixedスライドイン */}
      {selected && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setSelected(null)} />
          <div className="fixed top-0 right-0 z-40 h-full w-full sm:w-[400px] bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden">

            {/* ヘッダー */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <div className="font-semibold">{selected.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{selected.email}</div>
                {selected.companyName && <div className="text-xs text-muted-foreground">{selected.companyName}</div>}
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground mt-0.5">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* ステータス・基本情報 */}
              <div className="px-5 py-4 space-y-3 border-b border-border">
                {(() => {
                  const st = STATUS_META[selected.creditStatus] ?? STATUS_META.none;
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">ステータス</span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold border ${st.cls}`}>{st.label}</span>
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">法人番号</span>
                  <span className="text-sm font-mono">{selected.corporateNumber || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">申請日</span>
                  <span className="text-sm">{format(new Date(selected.createdAt), 'yyyy/MM/dd')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">請求先住所</span>
                  <span className="text-sm text-right max-w-[200px]">{selected.billingAddress || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">支払いサイト</span>
                  <span className="text-sm">{selected.paymentTerms || '—'}</span>
                </div>
              </div>

              {/* 与信情報 */}
              <div className="px-5 py-4 space-y-3 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">与信情報</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">与信枠</span>
                  <span className="text-sm font-semibold">{selected.creditLimit > 0 ? fmt(selected.creditLimit) : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">使用額</span>
                  <span className="text-sm">{selected.creditUsed > 0 ? fmt(selected.creditUsed) : '—'}</span>
                </div>
                {selected.creditLimit > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>使用率</span>
                      <span>{Math.round((selected.creditUsed / selected.creditLimit) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-foreground rounded-full"
                        style={{ width: `${Math.min(100, Math.round((selected.creditUsed / selected.creditLimit) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}

                {selected.creditStatus === 'approved' && (
                  editingCredit ? (
                    <div className="space-y-2 pt-1">
                      <Input
                        type="number"
                        value={editCreditLimit}
                        onChange={e => setEditCreditLimit(e.target.value)}
                        placeholder="与信枠（円）"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditingCredit(false)} className="flex-1">キャンセル</Button>
                        <Button size="sm" onClick={handleUpdateCredit} disabled={!!actionLoading} className="flex-1">
                          {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" />更新</>}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => setEditingCredit(true)}>
                      与信枠を変更
                    </Button>
                  )
                )}
              </div>

              {/* アクション */}
              <div className="px-5 py-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">操作</p>

                {selected.creditStatus === 'pending' && (
                  <>
                    {!showApproveForm ? (
                      <Button className="w-full gap-2 bg-foreground text-background hover:bg-foreground/90" onClick={() => setShowApproveForm(true)}>
                        <CheckCircle className="h-4 w-4" />承認する
                      </Button>
                    ) : (
                      <div className="space-y-3 p-4 bg-muted/30 rounded-xl border border-border">
                        <p className="text-sm font-medium">承認設定</p>
                        <div className="space-y-1.5">
                          <Label className="text-xs">与信枠（円） *</Label>
                          <Input type="number" placeholder="例: 1000000" value={approveForm.creditLimit} onChange={e => setApproveForm(p => ({ ...p, creditLimit: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">支払いサイト</Label>
                          <Input placeholder="例: 月末締め翌月末払い" value={approveForm.paymentTerms} onChange={e => setApproveForm(p => ({ ...p, paymentTerms: e.target.value }))} />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" className="flex-1" onClick={() => setShowApproveForm(false)}>キャンセル</Button>
                          <Button size="sm" className="flex-1 bg-foreground text-background hover:bg-foreground/90" onClick={handleApprove} disabled={!approveForm.creditLimit || !!actionLoading}>
                            {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '確定'}
                          </Button>
                        </div>
                      </div>
                    )}
                    <Button variant="outline" className="w-full gap-2" onClick={() => action(`/api/admin/corporate/${selected.id}/reject`)} disabled={!!actionLoading}>
                      <XCircle className="h-4 w-4" />否決する
                    </Button>
                  </>
                )}

                {selected.creditStatus === 'approved' && (
                  <Button variant="outline" className="w-full gap-2" onClick={() => action(`/api/admin/corporate/${selected.id}/suspend`)} disabled={!!actionLoading}>
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                    停止する
                  </Button>
                )}

                {(selected.creditStatus === 'rejected' || selected.creditStatus === 'suspended') && (
                  <Button variant="outline" className="w-full gap-2" onClick={() => action(`/api/admin/corporate/${selected.id}/approve`, { creditLimit: selected.creditLimit || 1000000, paymentTerms: selected.paymentTerms || 'Net30' })} disabled={!!actionLoading}>
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    承認に戻す
                  </Button>
                )}

                {selected.creditStatus === 'none' && (
                  <p className="text-sm text-muted-foreground text-center py-2">未申請のユーザーです</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
