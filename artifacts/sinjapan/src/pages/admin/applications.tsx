import React, { useState, useEffect } from 'react';
import { useListVanApplications } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { Loader2, Filter, Phone, Mail, User, TrendingUp } from 'lucide-react';

const API = (p: string) => `${import.meta.env.BASE_URL}api${p}`;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}` });
import { format } from 'date-fns';

const STATUS_STYLES: Record<string, string> = {
  new:                  'bg-gray-100 text-gray-700 border-gray-200',
  hearing:              'bg-orange-50 text-orange-700 border-orange-200',
  vehicle_search:       'bg-cyan-50 text-cyan-700 border-cyan-200',
  proposal_ready:       'bg-violet-50 text-violet-700 border-violet-200',
  proposed:             'bg-blue-50 text-blue-700 border-blue-200',
  application_received: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  screening:            'bg-purple-50 text-purple-700 border-purple-200',
  approved:             'bg-teal-50 text-teal-700 border-teal-200',
  contracting:          'bg-indigo-50 text-indigo-700 border-indigo-200',
  payment_pending:      'bg-pink-50 text-pink-700 border-pink-200',
  delivery_pending:     'bg-sky-50 text-sky-700 border-sky-200',
  active:               'bg-green-50 text-green-700 border-green-200',
  payment_issue:        'bg-rose-50 text-rose-700 border-rose-200',
  return_pending:       'bg-amber-50 text-amber-700 border-amber-200',
  completed:            'bg-gray-50 text-gray-500 border-gray-200',
  cancelled:            'bg-red-50 text-red-400 border-red-200',
  rejected:             'bg-red-100 text-red-600 border-red-300',
};

const STATUS_LABEL: Record<string, string> = {
  new:                  '新規',
  hearing:              'ヒアリング中',
  vehicle_search:       '車両確認中',
  proposal_ready:       '提案準備完了',
  proposed:             '提案送信済',
  application_received: '申込受付',
  screening:            '審査中',
  approved:             '承認済',
  contracting:          '契約手続き',
  payment_pending:      '決済待ち',
  delivery_pending:     '納車待ち',
  active:               '利用中',
  payment_issue:        '未払い',
  return_pending:       '返却予定',
  completed:            '契約終了',
  cancelled:            'キャンセル',
  rejected:             '否決',
};

const ALL_STATUSES = Object.keys(STATUS_STYLES);

export default function AdminApplications() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  // 一覧・検索が一部の相談だけを対象にしないよう、管理対象をまとめて取得する。
  const { data, isLoading } = useListVanApplications({ limit: 100 });
  const [, setLocation] = useLocation();
  const [stats, setStats] = useState({ total: 0, active: 0, contract: 0, today: 0 });

  useEffect(() => {
    fetch(API('/van/applications/stats'), { headers: authH() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats({ total: d.total, active: d.active, contract: d.contract, today: d.today }); })
      .catch(() => {});
  }, []);

  const applications = data?.applications || [];

  const filtered = applications.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (a.applicantName || '').toLowerCase().includes(q) ||
        (a.phone || '').includes(q) ||
        (a.email || '').toLowerCase().includes(q) ||
        (a.area || '').includes(q) ||
        String(a.id).includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* ヘッダ */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">相談一覧</h1>
          <p className="text-muted-foreground text-sm mt-1">ユーザーからの軽バン相談・申し込みを管理します。</p>
        </div>
      </div>

      {/* サマリカード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '総相談数', value: stats.total, icon: User },
          { label: '対応中',   value: stats.active, icon: TrendingUp },
          { label: '利用中',   value: stats.contract, icon: Filter },
          { label: '本日新着', value: stats.today, icon: Mail },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* フィルタ */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="名前・電話・エリアで検索..."
          className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50"
        />
        <div className="relative sm:w-56">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50 appearance-none"
          >
            <option value="">すべてのステータス</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
          </select>
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* テーブル */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 font-medium w-16">ID</th>
                  <th className="px-4 py-3 font-medium">ステータス</th>
                  <th className="px-4 py-3 font-medium">顧客情報</th>
                  <th className="px-4 py-3 font-medium">エリア</th>
                  <th className="px-4 py-3 font-medium">月額予算</th>
                  <th className="px-4 py-3 font-medium">目的</th>
                  <th className="px-4 py-3 font-medium">期間</th>
                  <th className="px-4 py-3 font-medium">相談日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-muted-foreground text-sm">
                      該当する相談が見つかりませんでした。
                    </td>
                  </tr>
                ) : (
                  filtered.map(app => (
                    <tr
                      key={app.id}
                      onClick={() => setLocation(`/admin/applications/${app.id}`)}
                      className="hover:bg-muted/40 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                        #{app.id}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border whitespace-nowrap ${STATUS_STYLES[app.status] || 'bg-gray-100 text-gray-700'}`}>
                          {STATUS_LABEL[app.status] ?? app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground truncate max-w-[130px]">
                            {app.applicantName || <span className="text-muted-foreground">未入力</span>}
                          </span>
                          {app.phone && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />{app.phone}
                            </span>
                          )}
                          {app.email && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[160px]">
                              <Mail className="h-3 w-3" />{app.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm">{app.area || <span className="text-muted-foreground">-</span>}</td>
                      <td className="px-4 py-3.5 text-sm font-medium">
                        {app.monthlyBudget ? `¥${app.monthlyBudget.toLocaleString()}` : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="truncate max-w-[120px] block text-sm text-muted-foreground">
                          {app.purpose || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm">
                        {app.durationMonths ? `${app.durationMonths}ヶ月` : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(app.createdAt), 'yyyy/MM/dd HH:mm')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
            {filtered.length}件 / 全{data?.total ?? applications.length}件
          </div>
        </div>
      )}
    </div>
  );
}
