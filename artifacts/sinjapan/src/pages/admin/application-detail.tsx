import React, { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { 
  useGetVanApplication, 
  useUpdateVanApplication, 
  useListVehicles, 
  useSendVanProposal,
  useListVanMessages
} from '@workspace/api-client-react';
import { Loader2, ChevronLeft, Save, Send, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

export default function AdminApplicationDetail() {
  const [, params] = useRoute('/admin/applications/:id');
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: application, isLoading, refetch } = useGetVanApplication(id, { query: { enabled: !!id } });
  const { data: messages } = useListVanMessages(id, { query: { enabled: !!id } });
  const { data: vehiclesData } = useListVehicles({ status: '募集中' });
  
  const updateApp = useUpdateVanApplication();
  const sendProposal = useSendVanProposal();

  const [selectedVehicles, setSelectedVehicles] = useState<number[]>([]);
  const [status, setStatus] = useState<string>('');
  
  React.useEffect(() => {
    if (application && !status) {
      setStatus(application.status);
    }
  }, [application, status]);

  if (isLoading || !application) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const vehicles = vehiclesData || [];

  const handleUpdateStatus = async () => {
    if (status === application.status) return;
    try {
      await updateApp.mutateAsync({ id, data: { status: status as any } });
      toast({ title: 'ステータスを更新しました' });
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '更新に失敗しました' });
    }
  };

  const toggleVehicle = (vid: number) => {
    setSelectedVehicles(prev => 
      prev.includes(vid) 
        ? prev.filter(id => id !== vid) 
        : prev.length >= 3 ? prev : [...prev, vid]
    );
  };

  const handleSendProposal = async () => {
    if (selectedVehicles.length === 0) return;
    try {
      await sendProposal.mutateAsync({ id, data: { vehicleIds: selectedVehicles } });
      toast({ title: '提案を送信しました' });
      setSelectedVehicles([]);
      setStatus('提案送信済');
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '送信に失敗しました' });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setLocation('/admin/applications')}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">相談詳細 #{application.id}</h1>
            <p className="text-sm text-muted-foreground mt-1">作成日: {format(new Date(application.createdAt), 'yyyy/MM/dd HH:mm')}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none"
          >
            <option value="相談中">相談中</option>
            <option value="確認中">確認中</option>
            <option value="提案送信済">提案送信済</option>
            <option value="申込受付">申込受付</option>
            <option value="審査中">審査中</option>
            <option value="契約手続き">契約手続き</option>
            <option value="利用中">利用中</option>
            <option value="キャンセル">キャンセル</option>
          </select>
          <button
            onClick={handleUpdateStatus}
            disabled={updateApp.isPending || status === application.status}
            className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center"
          >
            {updateApp.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            保存
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-sm border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold">ヒアリング内容</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 text-sm">
                <div>
                  <dt className="text-muted-foreground mb-1">希望エリア</dt>
                  <dd className="font-medium">{application.area || '未定'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">予算（月額）</dt>
                  <dd className="font-medium">{application.monthlyBudget ? `¥${application.monthlyBudget.toLocaleString()}` : '未定'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">利用開始希望</dt>
                  <dd className="font-medium">{application.startDate ? format(new Date(application.startDate), 'yyyy/MM/dd') : '未定'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">利用期間</dt>
                  <dd className="font-medium">{application.durationMonths ? `${application.durationMonths}ヶ月` : '未定'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground mb-1">利用目的・備考</dt>
                  <dd className="font-medium bg-muted/50 p-3 rounded-md">{application.purpose || '-'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold">車両提案の作成</CardTitle>
              <span className="text-xs text-muted-foreground">最大3台まで選択可 ({selectedVehicles.length}/3)</span>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-6 max-h-64 overflow-y-auto pr-2">
                {vehicles.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">募集中ステータスの車両がありません。</p>
                ) : (
                  vehicles.map(v => {
                    const isSelected = selectedVehicles.includes(v.id);
                    return (
                      <div 
                        key={v.id} 
                        onClick={() => toggleVehicle(v.id)}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? 'border-foreground bg-foreground/5' : 'border-border hover:bg-muted'}`}
                      >
                        <div>
                          <p className="font-medium text-sm">{v.maker} {v.model} ({v.year || '-'}年)</p>
                          <p className="text-xs text-muted-foreground mt-1">{v.prefecture} / 月額 ¥{v.userPrice.toLocaleString()}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-foreground bg-foreground text-background' : 'border-border'}`}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <button
                onClick={handleSendProposal}
                disabled={selectedVehicles.length === 0 || sendProposal.isPending}
                className="w-full py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center"
              >
                {sendProposal.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                提案を送信する
              </button>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-1 space-y-6">
          <Card className="shadow-sm border-border flex flex-col h-[600px]">
            <CardHeader className="pb-3 border-b border-border/50 shrink-0">
              <CardTitle className="text-base font-semibold">チャット履歴</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
              {messages?.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-muted-foreground mb-1 mx-1">
                    {msg.role === 'user' ? 'ユーザー' : 'AI'}
                  </span>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === 'user' ? 'bg-foreground text-background' : 'bg-background border border-border text-foreground'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
