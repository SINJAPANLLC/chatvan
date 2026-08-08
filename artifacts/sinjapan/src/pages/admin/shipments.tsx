import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useListShipments } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Input } from '@/components/ui/input';

export default function AdminShipments() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [, setLocation] = useLocation();

  const { data: shipments, isLoading } = useListShipments({
    status: statusFilter || undefined
  });

  const statuses = [
    '受付中', 'ヒアリング中', '見積提示', '顧客承認', 
    '手配中', '配車確定', '集荷完了', '配送中', '納品完了', '請求完了', 'キャンセル'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">案件一覧</h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="ID・顧客名で検索..." className="pl-9 bg-card" />
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button 
            variant={statusFilter === '' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setStatusFilter('')}
          >
            すべて
          </Button>
          <Button 
            variant={statusFilter === '顧客承認' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setStatusFilter('顧客承認')}
          >
            未手配
          </Button>
          <Button 
            variant={statusFilter === '手配中' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setStatusFilter('手配中')}
          >
            手配中
          </Button>
          <Button 
            variant={statusFilter === '配送中' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setStatusFilter('配送中')}
          >
            配送中
          </Button>
        </div>
      </div>

      <Card className="border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/30 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">ID</th>
                <th className="px-6 py-4 font-medium">日時</th>
                <th className="px-6 py-4 font-medium">顧客</th>
                <th className="px-6 py-4 font-medium">集荷先 / 納品先</th>
                <th className="px-6 py-4 font-medium">ステータス</th>
                <th className="px-6 py-4 font-medium text-right">料金</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : shipments?.items?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    案件が見つかりません
                  </td>
                </tr>
              ) : (
                shipments?.items.map((shipment) => (
                  <tr 
                    key={shipment.id} 
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/admin/shipments/${shipment.id}`)}
                  >
                    <td className="px-6 py-4 font-medium">#{shipment.id}</td>
                    <td className="px-6 py-4">
                      {format(new Date(shipment.createdAt), 'MM/dd HH:mm')}
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {shipment.user?.companyName || shipment.user?.name || 'ゲスト'}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <div className="truncate w-48 text-muted-foreground">{shipment.pickupAddress || '-'}</div>
                      <div className="truncate w-48 mt-0.5">{shipment.deliveryAddress || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap
                        ${ ['顧客承認', '配車確定', '納品完了'].includes(shipment.status)
                            ? 'bg-foreground text-background border-foreground'
                          : shipment.status === '手配中'
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : shipment.status === '配送中'
                            ? 'bg-blue-100 text-blue-800 border-blue-200'
                          : shipment.status === '請求完了'
                            ? 'bg-green-100 text-green-800 border-green-200'
                          : shipment.status === 'キャンセル'
                            ? 'bg-red-100 text-red-800 border-red-200'
                          : 'bg-muted text-muted-foreground border-border'
                        }
                      `}>
                        {shipment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {shipment.customerPrice ? new Intl.NumberFormat('ja-JP').format(shipment.customerPrice) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
