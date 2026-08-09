import React from 'react';
import { useListVanContracts, useGetMe } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Car, JapaneseYen, Calendar, CreditCard, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { format } from 'date-fns';

export default function MyPage() {
  const { data: user, isLoading: isUserLoading } = useGetMe();
  const [, setLocation] = useLocation();

  const { data: contracts, isLoading: isContractsLoading } = useListVanContracts({}, {
    query: { enabled: !!user }
  });

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      setLocation('/login');
    }
  }, [user, isUserLoading, setLocation]);

  if (isUserLoading || isContractsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const activeContracts = contracts?.filter(c => c.status !== '契約終了' && c.status !== '解約') || [];
  const formatPrice = (val: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">マイページ</h1>
        <p className="text-muted-foreground">ようこそ、{user.name}さん</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center">
          <Car className="h-5 w-5 mr-2" />
          現在の契約車両
        </h2>

        {activeContracts.length === 0 ? (
          <Card className="bg-muted border-dashed border-2 p-8 text-center">
            <p className="text-muted-foreground mb-4">現在ご利用中の車両はありません。</p>
            <Link href="/">
              <button className="px-6 py-2 bg-foreground text-background text-sm font-medium rounded-full hover:opacity-90 transition-opacity">
                新しい軽バンを探す
              </button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {activeContracts.map((contract) => (
              <Card key={contract.id} className="overflow-hidden border-border shadow-sm">
                <div className="flex flex-col sm:flex-row">
                  <div className="sm:w-1/3 bg-muted p-6 flex flex-col justify-center items-center border-b sm:border-b-0 sm:border-r border-border/50">
                    <Car className="h-12 w-12 text-muted-foreground/50 mb-2" />
                    <span className="font-bold text-lg text-center">
                      {contract.vehicle?.maker} {contract.vehicle?.model}
                    </span>
                    <span className="inline-block mt-2 px-2.5 py-0.5 bg-background border border-border text-xs font-semibold rounded-full text-foreground">
                      {contract.status}
                    </span>
                  </div>
                  <div className="sm:w-2/3 p-6 flex flex-col justify-center">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1 flex items-center"><JapaneseYen className="h-3.5 w-3.5 mr-1"/>月額料金</p>
                        <p className="font-semibold text-lg">{formatPrice(contract.monthlyPrice)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1 flex items-center"><Calendar className="h-3.5 w-3.5 mr-1"/>利用開始日</p>
                        <p className="font-medium">{contract.startDate ? format(new Date(contract.startDate), 'yyyy年MM月dd日') : '未定'}</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-muted-foreground mb-1 flex items-center"><CreditCard className="h-3.5 w-3.5 mr-1"/>次回お支払い日</p>
                        <p className="font-medium">毎月 {contract.paymentDay}日</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">アカウントメニュー</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/">
            <Card className="hover:bg-muted transition-colors cursor-pointer border-border shadow-sm group">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="h-10 w-10 bg-background border border-border rounded-full flex items-center justify-center mr-4 group-hover:bg-foreground group-hover:text-background transition-colors">
                    <Car className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">Chat VANに相談</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">新しい車両を探す</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          
          <Link href="/settings">
            <Card className="hover:bg-muted transition-colors cursor-pointer border-border shadow-sm group">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="h-10 w-10 bg-background border border-border rounded-full flex items-center justify-center mr-4 group-hover:bg-foreground group-hover:text-background transition-colors">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">お支払い・登録情報</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">カード情報・パスワード変更</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>
    </div>
  );
}
