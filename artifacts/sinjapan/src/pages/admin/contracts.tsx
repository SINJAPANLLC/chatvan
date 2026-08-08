import React from 'react';
import { useListVanContracts, useUpdateVanContract } from '@workspace/api-client-react';
import { Loader2, FileText, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function AdminContracts() {
  const { data: contracts, isLoading, refetch } = useListVanContracts();
  const updateMut = useUpdateVanContract();
  const { toast } = useToast();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await updateMut.mutateAsync({ id, data: { status: status as any } });
      toast({ title: 'ステータスを更新しました' });
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '更新に失敗しました' });
    }
  };

  const statusColors: Record<string, string> = {
    '契約手続き中': 'bg-yellow-50 text-yellow-700',
    '利用開始待ち': 'bg-blue-50 text-blue-700',
    '利用中': 'bg-green-50 text-green-700',
    '返却予定': 'bg-orange-50 text-orange-700',
    '契約終了': 'bg-gray-100 text-gray-700',
    '解約': 'bg-red-50 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">契約管理</h1>
        <p className="text-muted-foreground text-sm mt-1">進行中および過去のすべての車両契約を管理します。</p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="px-6 py-3 font-medium">契約ID</th>
              <th className="px-6 py-3 font-medium">ユーザー</th>
              <th className="px-6 py-3 font-medium">車両</th>
              <th className="px-6 py-3 font-medium">月額料金</th>
              <th className="px-6 py-3 font-medium">利用開始・支払日</th>
              <th className="px-6 py-3 font-medium">ステータス</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contracts?.map(c => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-6 py-4 font-medium text-foreground">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    #{c.id}
                  </div>
                </td>
                <td className="px-6 py-4 truncate max-w-[120px]">User #{c.userId}</td>
                <td className="px-6 py-4">
                  {c.vehicle ? `${c.vehicle.maker} ${c.vehicle.model}` : '車両なし'}
                </td>
                <td className="px-6 py-4">¥{c.monthlyPrice.toLocaleString()}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5 text-xs mb-0.5">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    開始: {c.startDate ? format(new Date(c.startDate), 'yyyy/MM/dd') : '未定'}
                  </div>
                  <div className="text-xs text-muted-foreground ml-4">
                    支払: 毎月{c.paymentDay}日
                  </div>
                </td>
                <td className="px-6 py-4">
                  <select
                    value={c.status}
                    onChange={(e) => handleUpdateStatus(c.id, e.target.value)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded border border-transparent outline-none focus:border-foreground/30 cursor-pointer ${statusColors[c.status] || 'bg-gray-100'}`}
                  >
                    <option value="契約手続き中">契約手続き中</option>
                    <option value="利用開始待ち">利用開始待ち</option>
                    <option value="利用中">利用中</option>
                    <option value="返却予定">返却予定</option>
                    <option value="契約終了">契約終了</option>
                    <option value="解約">解約</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
