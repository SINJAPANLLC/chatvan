import React, { useState } from 'react';
import { useListVanApplications } from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { Loader2, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminApplications() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data, isLoading } = useListVanApplications();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const applications = data?.applications || [];
  const filteredApps = statusFilter ? applications.filter(a => a.status === statusFilter) : applications;

  const statusColors: Record<string, string> = {
    '相談中': 'bg-gray-100 text-gray-800 border-gray-200',
    '確認中': 'bg-red-50 text-red-800 border-red-200',
    '提案送信済': 'bg-blue-50 text-blue-800 border-blue-200',
    '申込受付': 'bg-yellow-50 text-yellow-800 border-yellow-200',
    '契約手続き': 'bg-purple-50 text-purple-800 border-purple-200',
    '利用中': 'bg-green-50 text-green-800 border-green-200',
    'キャンセル': 'bg-gray-100 text-gray-500 border-gray-200',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">相談一覧</h1>
          <p className="text-muted-foreground text-sm mt-1">ユーザーからの軽バン相談・申し込み状況を管理します。</p>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:border-foreground/50 appearance-none"
            >
              <option value="">すべてのステータス</option>
              {Object.keys(statusColors).map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">ID</th>
                <th className="px-6 py-3 font-medium">ステータス</th>
                <th className="px-6 py-3 font-medium">希望エリア</th>
                <th className="px-6 py-3 font-medium">予算(月額)</th>
                <th className="px-6 py-3 font-medium">利用期間</th>
                <th className="px-6 py-3 font-medium">申込者</th>
                <th className="px-6 py-3 font-medium">日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                    相談が見つかりませんでした。
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => (
                  <tr 
                    key={app.id} 
                    onClick={() => setLocation(`/admin/applications/${app.id}`)}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-foreground">#{app.id}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${statusColors[app.status] || 'bg-gray-100 text-gray-800'}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 truncate max-w-[120px]">{app.area || '-'}</td>
                    <td className="px-6 py-4">{app.monthlyBudget ? `¥${app.monthlyBudget.toLocaleString()}` : '-'}</td>
                    <td className="px-6 py-4">{app.durationMonths ? `${app.durationMonths}ヶ月` : '-'}</td>
                    <td className="px-6 py-4">{app.applicantName || '匿名'}</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {format(new Date(app.createdAt), 'yyyy/MM/dd HH:mm')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
