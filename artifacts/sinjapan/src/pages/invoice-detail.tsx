import React, { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { Printer, FileText } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react/custom-fetch';

export default function InvoiceDetail() {
  const [, params] = useRoute('/invoices/:id');
  const id = params?.id;
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    customFetch<any>(`/api/invoices/${id}`).then(setInvoice).finally(() => setLoading(false));
  }, [id]);

  const fmt = (n: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(n);

  if (loading || !invoice) return <div className="flex-1 flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex-1 p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <h1 className="text-xl font-bold">請求書 {invoice.invoiceNumber}</h1>
          </div>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full border border-border hover:bg-muted transition-colors">
            <Printer className="h-4 w-4" />印刷 / PDF
          </button>
        </div>

        <div className="rounded-xl border border-border overflow-hidden print:border-0">
          <div className="px-8 py-6 border-b border-border">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">請求書</h2>
                <p className="text-muted-foreground text-sm mt-1">Invoice</p>
              </div>
              <div className="text-right text-sm space-y-1">
                <p className="font-semibold">{invoice.invoiceNumber}</p>
                <p className="text-muted-foreground">発行日: {invoice.createdAt?.slice(0, 10)}</p>
                {invoice.dueDate && <p className="text-muted-foreground">支払期限: {invoice.dueDate}</p>}
              </div>
            </div>
          </div>

          <div className="px-8 py-5 border-b border-border">
            <p className="text-xs text-muted-foreground mb-1">対象期間</p>
            <p className="font-medium">{invoice.periodStart} 〜 {invoice.periodEnd}</p>
          </div>

          <div className="px-8 py-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-semibold pb-2 text-muted-foreground">内容</th>
                  <th className="text-right font-semibold pb-2 text-muted-foreground">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {invoice.items?.map((item: any) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4 text-muted-foreground">{item.description}</td>
                    <td className="py-3 text-right font-medium">{fmt(Number(item.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-8 py-5 border-t border-border bg-muted/20 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">小計</span><span>{fmt(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">消費税（10%）</span><span>{fmt(invoice.tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-2 border-t border-border">
              <span>合計金額</span><span className="text-xl">{fmt(invoice.totalAmount)}</span>
            </div>
          </div>

          <div className="px-8 py-5 border-t border-border text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">Chat VAN 運営事務局</p>
            <p className="font-semibold text-foreground mt-3">振込先</p>
            <p className="mt-1">相愛信用組合 2318　　本店 003</p>
            <p>普通　0170074　ド）シン　ジャパン</p>
            <p className="mt-2">ご不明点はサポートまでお問い合わせください</p>
          </div>
        </div>
      </div>

      <style>{`@media print { header, aside, nav, footer, button { display: none !important; } }`}</style>
    </div>
  );
}
